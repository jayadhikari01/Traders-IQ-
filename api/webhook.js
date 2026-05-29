import admin from 'firebase-admin';

// Firebase Admin Setup (Original logic preserved)
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: "traders-iq-app-f5169",
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL, 
            privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
        })
    });
}

const db = admin.firestore();

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed'); 

    try {
        // Raw body capture for consistency
        const chunks = [];
        for await (const chunk of req) {
            chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk); 
        }
        const rawBody = Buffer.concat(chunks); 
        const event = JSON.parse(rawBody.toString());

        console.log("PayPal Webhook Received Event:", event.event_type);

        // 1. DYNAMIC PAYMENT SUCCESS (Orders V2 API Event)
        if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
            const resource = event.resource;
            
            // Create Order wale code se jo custom_id pass kiya tha, use extract karna
            const customIdRaw = resource.custom_id;

            if (!customIdRaw) {
                console.error("No Custom Data found in PayPal checkout event");
                return res.status(200).send('Event received but no custom_id found');
            }

            let userId = "";
            let planName = "Monthly Pro"; // Default fallback plan

            try {
                // custom_id JSON format mein hoga string hoke
                const customData = JSON.parse(customIdRaw);
                userId = customData.userId;
                planName = customData.plan; // 'Annual Elite' ya 'Monthly Pro'
            } catch (e) {
                // Agar bina JSON ke direct sirf UserId aayi ho (Backup safety)
                userId = customIdRaw;
                planName = "Monthly Pro";
            }

            if (!userId) {
                console.error("No UserID found in custom data");
                return res.status(200).send('No UserID found');
            }

            // 📅 Expiry Date Calculation (User ke checkout plan selection ke mutabik)
            const expiryDate = new Date();
            if (planName === 'Annual Elite') {
                expiryDate.setDate(expiryDate.getDate() + 366); // 1 Saal ka access (+366 Days)
            } else {
                expiryDate.setDate(expiryDate.getDate() + 31);  // 1 Mahine ka access (+31 Days)
            }

            // Database mein status update karna aur active access dena
            await db.collection('users').doc(userId).set({
                isPro: true,
                status: "active",
                plan: planName,
                validUntil: admin.firestore.Timestamp.fromDate(expiryDate), // Dashboard validation sync
                updatedAt: admin.firestore.FieldValue.serverTimestamp() 
            }, { merge: true }); 

            console.log(`Success: User ${userId} upgraded to ${planName} via Discounted Checkout. Expires on: ${expiryDate}`);
            return res.status(200).send('User Activated');
        }

        // 2. DYNAMIC DISPUTE / REVERSED LOGIC (Agar user refund leta hai ya payment fail hoti hai)
        if (event.event_type === 'PAYMENT.CAPTURE.REVERSED' || event.event_type === 'PAYMENT.CAPTURE.DENIED') {
            const resource = event.resource;
            const customIdRaw = resource.custom_id;

            if (customIdRaw) {
                let userId = "";
                try {
                    const customData = JSON.parse(customIdRaw);
                    userId = customData.userId;
                } catch(e) {
                    userId = customIdRaw;
                }

                if (userId) {
                    await db.collection('users').doc(userId).update({
                        isPro: false,
                        status: "inactive",
                        reason: "Payment Reversed or Denied",
                        validUntil: admin.firestore.Timestamp.fromDate(new Date()), // Access immediately end
                        updatedAt: admin.firestore.FieldValue.serverTimestamp() 
                    });
                    console.log(`Ended: User ${userId} access blocked due to Payment Reversal.`);
                }
            }
            return res.status(200).send('Reversal Handled');
        }

        return res.status(200).send('Event Handled'); 

    } catch (error) {
        console.error('PayPal Webhook Error:', error.message); 
        return res.status(500).send('Internal Server Error');
    }
}

// Body parser must be false for raw data stream
export const config = { api: { bodyParser: false } };
                                                         

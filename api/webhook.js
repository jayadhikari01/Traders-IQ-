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

        // PayPal data extraction
        const resource = event.resource;
        const userId = resource.custom_id; 
        const subscriptionId = resource.id;
        const planId = resource.plan_id;

        if (!userId) {
            console.error("No Custom UserID found in PayPal event");
            return res.status(200).send('Event received but no UserID found');
        }

        // 1. SUBSCRIPTION ACTIVATED OR PAYMENT SUCCESS
        if (event.event_type === 'BILLING.SUBSCRIPTION.ACTIVATED' || event.event_type === 'PAYMENT.SALE.COMPLETED') {
            
            let planName = 'Basic Tier';
            const expiryDate = new Date();

            // 🎯 DONO PLAN IDs KO ALAG-ALAG CHECK KIYA HAI:
            if (planId === 'P-5TB70082U49301520NIMWI4A') { 
                // 1. ANNUAL PLAN (Annual Elite)
                planName = 'Annual Elite';
                expiryDate.setDate(expiryDate.getDate() + 366); // 1 Saal ka access (+366 Days)
                
            } else if (planId === 'P-24N10899NV367014XNIMWCYI') { 
                // 2. MONTHLY PLAN (Monthly Pro)
                planName = 'Monthly Pro';
                expiryDate.setDate(expiryDate.getDate() + 31);  // 1 Mahine ka access (+31 Days)
            } else {
                // Agar koi default ya alag plan ho
                planName = 'Monthly Pro';
                expiryDate.setDate(expiryDate.getDate() + 31);
            }

            await db.collection('users').doc(userId).set({
                isPro: true,
                status: "active",
                plan: planName,
                subscriptionId: subscriptionId,
                validUntil: admin.firestore.Timestamp.fromDate(expiryDate), // Dashboard verification ke liye
                updatedAt: admin.firestore.FieldValue.serverTimestamp() 
            }, { merge: true }); 

            console.log(`Success: User ${userId} upgraded to ${planName}. Expires on: ${expiryDate}`);
            return res.status(200).send('User Activated');
        }

        // 2. SUBSCRIPTION CANCELLED OR EXPIRED
        if (event.event_type === 'BILLING.SUBSCRIPTION.CANCELLED' || event.event_type === 'BILLING.SUBSCRIPTION.EXPIRED') {
            await db.collection('users').doc(userId).update({
                isPro: false,
                status: "inactive",
                reason: event.event_type === 'BILLING.SUBSCRIPTION.EXPIRED' ? "Expired" : "Cancelled",
                validUntil: admin.firestore.Timestamp.fromDate(new Date()), // Turant access block karne ke liye
                updatedAt: admin.firestore.FieldValue.serverTimestamp() 
            });

            console.log(`Ended: User ${userId} subscription status set to inactive (${event.event_type})`);
            return res.status(200).send('User Deactivated');
        }

        // 3. PAYMENT FAILED LOGIC
        if (event.event_type === 'BILLING.SUBSCRIPTION.PAYMENT.FAILED') {
            await db.collection('users').doc(userId).update({
                isPro: false, 
                status: "inactive", 
                lastError: "Subscription Payment Failed / Card Declined", 
                validUntil: admin.firestore.Timestamp.fromDate(new Date()), // Payment fail hote hi lock
                updatedAt: admin.firestore.FieldValue.serverTimestamp() 
            });

            console.log(`Failed: User ${userId} subscription payment failed`);
            return res.status(200).send('Payment Failure Handled');
        }

        return res.status(200).send('Event Handled'); 

    } catch (error) {
        console.error('PayPal Webhook Error:', error.message); 
        return res.status(500).send('Internal Server Error');
    }
}

// Body parser must be false for raw data stream
export const config = { api: { bodyParser: false } };
        

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
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed'); //

    try {
        // Raw body capture for consistency
        const chunks = [];
        for await (const chunk of req) {
            chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk); //
        }
        const rawBody = Buffer.concat(chunks); //
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
            const planName = planId === 'P-5TB70082U49301520NIMWI4A' ? 'Annual Elite' : 'Monthly Pro';

            await db.collection('users').doc(userId).set({
                isPro: true,
                status: "active",
                plan: planName,
                subscriptionId: subscriptionId,
                updatedAt: admin.firestore.FieldValue.serverTimestamp() //
            }, { merge: true }); //

            console.log(`Success: User ${userId} upgraded via PayPal Subscription`);
            return res.status(200).send('User Activated');
        }

        // 2. SUBSCRIPTION CANCELLED OR EXPIRED (Access Hatane Ke Liye)
        if (event.event_type === 'BILLING.SUBSCRIPTION.CANCELLED' || event.event_type === 'BILLING.SUBSCRIPTION.EXPIRED') {
            await db.collection('users').doc(userId).update({
                isPro: false,
                status: "inactive",
                reason: event.event_type === 'BILLING.SUBSCRIPTION.EXPIRED' ? "Expired" : "Cancelled",
                updatedAt: admin.firestore.FieldValue.serverTimestamp() //
            });

            console.log(`Ended: User ${userId} subscription status set to inactive (${event.event_type})`);
            return res.status(200).send('User Deactivated');
        }

        // 3. PAYMENT FAILED LOGIC (Subscription Payment Fail/Decline Hone Par)
        if (event.event_type === 'BILLING.SUBSCRIPTION.PAYMENT.FAILED') {
            await db.collection('users').doc(userId).update({
                isPro: false, // Access block karne ke liye false kiya hai
                status: "inactive", //
                lastError: "Subscription Payment Failed / Card Declined", //
                updatedAt: admin.firestore.FieldValue.serverTimestamp() //
            });

            console.log(`Failed: User ${userId} subscription payment failed`);
            return res.status(200).send('Payment Failure Handled');
        }

        return res.status(200).send('Event Handled'); //

    } catch (error) {
        console.error('PayPal Webhook Error:', error.message); //
        return res.status(500).send('Internal Server Error');
    }
}

// Body parser must be false for raw data stream
export const config = { api: { bodyParser: false } }; //

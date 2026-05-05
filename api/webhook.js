import admin from 'firebase-admin';
import crypto from 'crypto';

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
        // Cashfree raw body and signature setup
        const chunks = [];
        for await (const chunk of req) {
            chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        }
        const rawBody = Buffer.concat(chunks);

        // 1. Cashfree Signature Verification
        // Vercel mein 'CASHFREE_WEBHOOK_SECRET' variable add karein
        const secret = process.env.CASHFREE_WEBHOOK_SECRET; 
        const ts = req.headers['x-webhook-timestamp'];
        const signature = req.headers['x-webhook-signature'];
        
        const payloadToVerify = ts + rawBody.toString();
        const hmac = crypto.createHmac('sha256', secret);
        const digest = hmac.update(payloadToVerify).digest('base64');

        if (!signature || signature !== digest) {
            console.error('Security Check Failed: Invalid Cashfree Signature');
            return res.status(401).send('Invalid Signature');
        }

        const payload = JSON.parse(rawBody.toString());
        const eventType = payload.type; // Cashfree uses 'type' instead of 'event'
        
        // 2. Extract Data (Cashfree Payload Structure)
        // Note: Payment Links use kar rahe hain toh data.customer_details se UID milegi
        const paymentData = payload.data.payment;
        const customerDetails = payload.data.customer_details;
        
        const userId = customerDetails ? customerDetails.customer_id : null; 
        const planName = payload.data.order ? payload.data.order.order_note : 'Elite Access';

        // 3. Payment Success Logic
        if (eventType === 'PAYMENT_SUCCESS_WEBHOOK' || eventType === 'ORDER_PAID') {
            if (userId) {
                await db.collection('users').doc(userId).set({
                    isPro: true,
                    status: "active",
                    plan: planName,
                    paymentId: paymentData.cf_payment_id,
                    orderId: payload.data.order.order_id,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });

                console.log(`Success: User ${userId} upgraded via Cashfree Webhook`);
                return res.status(200).send('User Updated');
            }
        }

        // 4. Handle Failure
        if (eventType === 'PAYMENT_FAILED_WEBHOOK') {
            if (userId) {
                await db.collection('users').doc(userId).update({
                    isPro: false,
                    status: "inactive",
                    lastError: "Payment Failed",
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }
        }

        return res.status(200).send('Event Handled');

    } catch (error) {
        console.error('Webhook Error:', error.message);
        return res.status(500).send('Internal Error');
    }
}

export const config = { api: { bodyParser: false } };


import admin from 'firebase-admin';
import crypto from 'crypto';

// Firebase Admin Setup (Same as before)
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
        // Raw body capture logic for signature verification
        const chunks = [];
        for await (const chunk of req) {
            chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        }
        const rawBody = Buffer.concat(chunks);

        // 1. CASHFREE SIGNATURE VERIFICATION
        // Vercel mein 'CASHFREE_WEBHOOK_SECRET' variable mein dashboard wali Secret Key daalein
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
        const eventType = payload.type; 
        const data = payload.data;
        
        // 2. DATA EXTRACTION
        // Payment Links mein customer_id user ki Firebase UID hoti hai
        const userId = data.customer_details ? data.customer_details.customer_id : null; 
        const planName = data.order ? data.order.order_note : 'Elite Access';
        const paymentId = data.payment ? data.payment.cf_payment_id : 'N/A';
        const orderId = data.order ? data.order.order_id : 'N/A';

        // 3. PAYMENT SUCCESS LOGIC (ORDER_PAID)
        if (eventType === 'ORDER_PAID' || eventType === 'PAYMENT_SUCCESS_WEBHOOK') {
            if (userId) {
                await db.collection('users').doc(userId).set({
                    isPro: true,
                    status: "active",
                    plan: planName,
                    paymentId: paymentId,
                    orderId: orderId,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });

                console.log(`Success: User ${userId} upgraded via Cashfree Webhook`);
                return res.status(200).send('User Updated');
            }
        }

        // 4. PAYMENT FAILURE LOGIC
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

// Raw body verification ke liye bodyParser false hona zaroori hai
export const config = { api: { bodyParser: false } };
            

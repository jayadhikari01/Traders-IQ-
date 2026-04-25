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
        const chunks = [];
        for await (const chunk of req) {
            chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        }
        const rawBody = Buffer.concat(chunks);

        // 1. Signature Verification (Safe)
        const secret = process.env.RAZORPAY_WEBHOOK_SECRET; 
        const signature = req.headers['x-razorpay-signature'];
        const hmac = crypto.createHmac('sha256', secret);
        const digest = hmac.update(rawBody).digest('hex');

        if (!signature || signature !== digest) {
            console.error('Security Check Failed: Invalid Signature');
            return res.status(401).send('Invalid Signature');
        }

        const payload = JSON.parse(rawBody.toString());
        const eventName = payload.event;
        const paymentEntity = payload.payload.payment.entity;
        
        // 2. Extract Data from Notes
        // Dhyaan dein: order.js mein 'planName' (case-sensitive) bheja ja raha hai
        const userId = paymentEntity.notes ? paymentEntity.notes.user_id : null;
        const planName = paymentEntity.notes ? paymentEntity.notes.plan : 'Elite Access';

        // 3. Payment Success Logic
        if (eventName === 'payment.captured' || eventName === 'order.paid') {
            if (userId) {
                await db.collection('users').doc(userId).set({
                    isPro: true,
                    status: "active",
                    plan: planName,
                    paymentId: paymentEntity.id,
                    orderId: paymentEntity.order_id, // Extra security ke liye order ID bhi save karein
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });

                console.log(`Success: User ${userId} upgraded via Webhook`);
                return res.status(200).send('User Updated');
            }
        }

        // 4. Handle Failure
        if (eventName === 'payment.failed') {
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
            

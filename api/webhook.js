import admin from 'firebase-admin';
import crypto from 'crypto';

// 1. Firebase Admin Initialization (Vercel Environment Variables)
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
    // Razorpay Webhooks humesha POST request bhejte hain
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    try {
        // 2. Raw Body reading (Signature verify karne ke liye zaroori hai)
        const chunks = [];
        for await (const chunk of req) {
            chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        }
        const rawBody = Buffer.concat(chunks);

        // 3. Security: Razorpay Signature Verification
        // Vercel mein 'RAZORPAY_WEBHOOK_SECRET' naam se variable hona chahiye
        const secret = process.env.RAZORPAY_WEBHOOK_SECRET; 
        const signature = req.headers['x-razorpay-signature'];
        
        const hmac = crypto.createHmac('sha256', secret);
        const digest = hmac.update(rawBody).digest('hex');

        if (!signature || signature !== digest) {
            console.error('Security Check Failed: Invalid Razorpay Signature');
            return res.status(401).send('Invalid Signature');
        }

        // 4. Parse Razorpay Payload
        const payload = JSON.parse(rawBody.toString());
        const eventName = payload.event;
        
        // Razorpay mein userId 'notes' ke andar milega
        const paymentEntity = payload.payload.payment.entity;
        const userId = paymentEntity.notes ? paymentEntity.notes.user_id : null;

        console.log(`Event Received: ${eventName} for User: ${userId}`);

        // 5. Update Firestore Logic (Pro Status Upgrade)
        if (eventName === 'payment.captured' || eventName === 'order.paid') {
            if (userId) {
                await db.collection('users').doc(userId).set({
                    isPro: true,
                    status: "active",
                    plan: paymentEntity.notes.plan_name || 'Premium',
                    paymentId: paymentEntity.id,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });

                console.log(`Success: User ${userId} upgraded to PRO via Razorpay`);
                return res.status(200).send('User Pro Status Updated');
            } else {
                console.error('Error: No user_id found in Razorpay notes');
                return res.status(400).send('No User ID provided');
            }
        }

        // 6. Handle Payment Failure or Expired Status
        if (eventName === 'payment.failed' || eventName === 'subscription.halted') {
            if (userId) {
                await db.collection('users').doc(userId).update({
                    isPro: false,
                    status: "inactive",
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                return res.status(200).send('User Pro Status Removed');
            }
        }

        // Baki events ke liye standard response
        return res.status(200).send('Webhook Received');

    } catch (error) {
        console.error('Critical Webhook Error:', error.message);
        return res.status(500).send('Internal Server Error');
    }
}

// Body parser ko false rakhna zaroori hai raw body read karne ke liye
export const config = {
    api: {
        bodyParser: false,
    },
};
                

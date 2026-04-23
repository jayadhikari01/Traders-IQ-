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
    if (req.method !== 'POST') {
        return res.status(405).send('Use POST for Razorpay Webhooks.');
    }

    try {
        const chunks = [];
        for await (const chunk of req) {
            chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        }
        const rawBody = Buffer.concat(chunks);

        // Razorpay Verification
        const secret = process.env.RAZORPAY_WEBHOOK_SECRET; 
        const signature = req.headers['x-razorpay-signature'];
        const hmac = crypto.createHmac('sha256', secret);
        const digest = hmac.update(rawBody).digest('hex');

        if (!signature || signature !== digest) {
            console.error('Security Check Failed');
            return res.status(401).send('Invalid Signature');
        }

        const payload = JSON.parse(rawBody.toString());
        const event = payload.event;
        
        // Razorpay mein userId 'notes' se aayega (Jo aap checkout ke waqt bhejenge)
        const userId = payload.payload.payment.entity.notes.user_id;

        console.log(`Processing ${event} for User: ${userId}`);

        // Update Firestore for Success
        if (event === 'payment.captured' || event === 'order.paid') {
            if (userId) {
                await db.collection('users').doc(userId).set({
                    isPro: true,
                    plan: payload.payload.payment.entity.notes.plan_name || 'Premium',
                    paymentId: payload.payload.payment.entity.id,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });

                return res.status(200).send('User Upgraded to PRO');
            } else {
                return res.status(400).send('No User ID in notes');
            }
        }

        // Handle Payment Failure/Refund (Optional)
        if (event === 'payment.failed' || event === 'refund.processed') {
            if (userId) {
                await db.collection('users').doc(userId).update({
                    isPro: false,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                return res.status(200).send('Pro Status Removed');
            }
        }

        return res.status(200).send('Webhook Processed');

    } catch (error) {
        console.error('Webhook Error:', error.message);
        return res.status(500).send('Error');
    }
}

export const config = {
    api: { bodyParser: false },
};
            

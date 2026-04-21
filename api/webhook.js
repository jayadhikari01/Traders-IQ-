import admin from 'firebase-admin';
import crypto from 'crypto';

// 1. Firebase Admin Initialization (Vercel Environment Variables se data uthayega)
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
    // Only allow POST (Lemon Squeezy sends POST)
    if (req.method !== 'POST') {
        return res.status(405).send('Server is LIVE. Please use POST for webhooks.');
    }

    try {
        // 2. Security: Verify Lemon Squeezy Signature (Ab Secret Vercel se aayega)
        const chunks = [];
        for await (const chunk of req) {
            chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        }
        const rawBody = Buffer.concat(chunks);

        // Aapka secret ab variable se aayega
        const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET; 
        const signature = req.headers['x-signature'];
        const hmac = crypto.createHmac('sha256', secret);
        const digest = hmac.update(rawBody).digest('hex');

        if (!signature || signature !== digest) {
            console.error('Security Check Failed: Invalid Signature');
            return res.status(401).send('Invalid Signature');
        }

        // 3. Parse Data
        const payload = JSON.parse(rawBody.toString());
        const eventName = payload.meta.event_name;
        
        // Extract userId from custom_data (Very Important)
        const userId = payload.meta.custom_data ? payload.meta.custom_data.user_id : null;

        console.log(`Processing ${eventName} for User ID: ${userId}`);

        // 4. Update Firestore Logic
        if (eventName === 'order_created' || eventName === 'subscription_created') {
            if (userId) {
                // Update the user document to PRO status
                await db.collection('users').doc(userId).set({
                    isPro: true,
                    plan: payload.data.attributes.variant_name || 'Premium',
                    subscriptionId: payload.data.id,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });

                console.log(`User ${userId} successfully upgraded to PRO`);
                return res.status(200).send('User Pro Status Updated');
            } else {
                console.error('Error: No UserID found in custom_data');
                return res.status(400).send('No User ID provided');
            }
        }

        // Handle Subscription Cancellation
        if (eventName === 'subscription_expired' || eventName === 'subscription_cancelled') {
            if (userId) {
                await db.collection('users').doc(userId).update({
                    isPro: false,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                return res.status(200).send('User Pro Status Removed');
            }
        }

        return res.status(200).send('Webhook Received');

    } catch (error) {
        console.error('Critical Webhook Error:', error.message);
        return res.status(500).send('Internal Error: ' + error.message);
    }
}

// 5. Vercel Config: Disable body-parser to allow raw body reading
export const config = {
    api: {
        bodyParser: false,
    },
};

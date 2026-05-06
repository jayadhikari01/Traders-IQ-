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
        // 1. CUSTOM SECURITY CHECK (Replacement for Cashfree Secret)
        const { auth } = req.query;
        if (auth !== 'TradersIQ_2026_Secure') {
            console.error('Security Check Failed: Invalid Custom Auth Key');
            return res.status(401).send('Unauthorized Access');
        }

        // Raw body capture for consistency
        const chunks = [];
        for await (const chunk of req) {
            chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        }
        const rawBody = Buffer.concat(chunks);
        const payload = JSON.parse(rawBody.toString());
        
        const eventType = payload.type; 
        const data = payload.data;
        
        // 2. DATA EXTRACTION (Preserved original extraction)
        const userId = data.customer_details ? data.customer_details.customer_id : null; 
        const planName = data.order ? data.order.order_note : 'Elite Access';
        const paymentId = data.payment ? data.payment.cf_payment_id : 'N/A';
        const orderId = data.order ? data.order.order_id : 'N/A';

        // 3. PAYMENT SUCCESS LOGIC (Preserved original update logic)
        if (eventType === 'ORDER_PAID' || eventType === 'PAYMENT_SUCCESS_WEBHOOK' || payload.event_type === 'PAYMENT_SUCCESS_WEBHOOK') {
            if (userId) {
                await db.collection('users').doc(userId).set({
                    isPro: true,
                    status: "active",
                    plan: planName,
                    paymentId: paymentId,
                    orderId: orderId,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });

                console.log(`Success: User ${userId} upgraded via Secure Custom Webhook`);
                return res.status(200).send('User Updated');
            }
        }

        // 4. PAYMENT FAILURE LOGIC (Preserved)
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

// Body parser must be false for raw data stream
export const config = { api: { bodyParser: false } };
            

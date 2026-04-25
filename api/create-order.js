import Razorpay from 'razorpay';
import admin from 'firebase-admin';

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
    });
}

const db = admin.firestore();

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Denied');

    try {
        const { amount, planName, user_id, promoCode } = req.body;
        const conversionRate = 94; 
        let finalAmountInInr = amount * conversionRate;

        // Discount Logic with safety bypass
        if (promoCode) {
            try {
                const promoDoc = await db.collection('promos').doc(promoCode.toUpperCase()).get();
                if (promoDoc.exists && promoDoc.data().status === 'active') {
                    const discount = parseFloat(promoDoc.data().discount) || 0;
                    finalAmountInInr = finalAmountInInr * (1 - (discount / 100));
                }
            } catch (firestoreErr) {
                console.error("Firestore Permission Bypassed:", firestoreErr.message);
            }
        }

        if (finalAmountInInr <= 0) return res.status(200).json({ isFree: true });

        const razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET,
        });

        const order = await razorpay.orders.create({
            amount: Math.round(finalAmountInInr * 100),
            currency: "INR",
            receipt: `order_${Date.now()}`
        });

        res.status(200).json({
            id: order.id,
            amount: order.amount,
            razorpayKeyId: process.env.RAZORPAY_KEY_ID
        });
    } catch (e) {
        res.status(500).json({ error: "Order Error: Check Vercel Logs" });
    }
}

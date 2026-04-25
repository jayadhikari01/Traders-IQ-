import Razorpay from 'razorpay';
import admin from 'firebase-admin';

if (!admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            }),
        });
    } catch (e) { console.error("Firebase Admin Error:", e.message); }
}

const db = admin.apps.length ? admin.firestore() : null;

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Key check
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
        return res.status(500).json({ error: "Server Configuration Error (Keys Missing)" });
    }

    try {
        const { amount, planName, user_id, promoCode } = req.body;
        const conversionRate = 94;
        let finalAmountInInr = amount * conversionRate;

        // 1. Discount calculation
        if (promoCode && db) {
            const promoDoc = await db.collection('promos').doc(promoCode.toUpperCase()).get();
            if (promoDoc.exists && promoDoc.data().status === 'active') {
                const discount = parseFloat(promoDoc.data().discount) || 0;
                finalAmountInInr = finalAmountInInr * (1 - (discount / 100));
            }
        }

        // 2. Free access check
        if (finalAmountInInr <= 0) {
            return res.status(200).json({ isFree: true });
        }

        // 3. Razorpay Order Creation
        const razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET,
        });

        const order = await razorpay.orders.create({
            amount: Math.round(finalAmountInInr * 100),
            currency: "INR",
            receipt: `traderiq_${Date.now()}`,
            notes: { user_id, planName, promo: promoCode || "NONE" }
        });

        res.status(200).json({
            id: order.id,
            amount: order.amount,
            razorpayKeyId: process.env.RAZORPAY_KEY_ID
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

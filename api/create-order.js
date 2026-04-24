import Razorpay from 'razorpay';
import admin from 'firebase-admin';

// Error handling ke sath initialize karein taaki backend crash na ho
try {
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            }),
        });
    }
} catch (e) {
    console.error("Firebase Admin initialization failed, continuing without it.");
}

const db = admin.apps.length ? admin.firestore() : null;

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    try {
        const { amount, planName, user_id, promoCode } = req.body;
        const conversionRate = 94;
        let finalAmountInInr = amount * conversionRate;

        // Promo logic sirf tab chalega jab DB connect ho payega
        if (promoCode && db) {
            try {
                const promoRef = db.collection('promos').doc(promoCode.toUpperCase());
                const promoDoc = await promoRef.get();
                if (promoDoc.exists && promoDoc.data().status === 'active') {
                    const discountPercent = promoDoc.data().discount || 0;
                    finalAmountInInr = finalAmountInInr * (1 - (discountPercent / 100));
                }
            } catch (pErr) {
                console.error("Promo check failed, charging full amount.");
            }
        }

        const options = {
            amount: Math.round(finalAmountInInr * 100),
            currency: "INR",
            receipt: `order_${Date.now()}`,
            notes: { user_id, planName, promo: promoCode || "NONE" }
        };

        const order = await razorpay.orders.create(options);
        res.status(200).json({
            id: order.id,
            amount: order.amount,
            razorpayKeyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID 
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

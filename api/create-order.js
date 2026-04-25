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
    } catch (e) {
        console.error("Firebase Admin Error:", e.message);
    }
}

const db = admin.apps.length ? admin.firestore() : null;

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { amount, planName, user_id, promoCode } = req.body;
        const conversionRate = 94; 
        let finalAmountInInr = amount * conversionRate;

        // SERVER-SIDE PROMO CALCULATION
        if (promoCode && db) {
            const promoDoc = await db.collection('promos').doc(promoCode.toUpperCase()).get();
            if (promoDoc.exists && promoDoc.data().status === 'active') {
                const discountPercentage = promoDoc.data().discount || 0;
                // Amount se discount minus karna
                finalAmountInInr = finalAmountInInr * (1 - (discountPercentage / 100));
                
                // Case: 100% OFF (Direct Success)
                if (discountPercentage >= 100 || finalAmountInInr <= 0) {
                    return res.status(200).json({ isFree: true });
                }
            }
        }

        const razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET,
        });

        // Ab Math.round discounted amount par chalega
        const order = await razorpay.orders.create({
            amount: Math.round(finalAmountInInr * 100), 
            currency: "INR",
            receipt: `traderiq_${Date.now()}`,
            notes: { user_id, planName, promo: promoCode || "NONE" }
        });

        res.status(200).json({ ...order, razorpayKeyId: process.env.RAZORPAY_KEY_ID });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

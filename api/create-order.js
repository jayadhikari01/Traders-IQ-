import Razorpay from 'razorpay';
import admin from 'firebase-admin';

// Backend initialize logic
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
    // Sirf POST request allow karein
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Agar keys missing hain toh error do
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
        return res.status(500).json({ error: "Razorpay keys are missing in Vercel settings." });
    }

    const razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    try {
        const { amount, planName, user_id, promoCode } = req.body;
        
        if (!user_id) return res.status(400).json({ error: "User ID is required" });

        const conversionRate = 94; // Aapka fixed rate
        let finalAmountInInr = amount * conversionRate;

        // Promo Code Logic
        if (promoCode && db) {
            try {
                const promoDoc = await db.collection('promos').doc(promoCode.toUpperCase()).get();
                if (promoDoc.exists && promoDoc.data().status === 'active') {
                    const discount = promoDoc.data().discount || 0;
                    finalAmountInInr = finalAmountInInr * (1 - (discount / 100));
                }
            } catch (pErr) {
                console.warn("Promo check failed, using base price.");
            }
        }

        const options = {
            amount: Math.round(finalAmountInInr * 100), // Paise mein convert karein
            currency: "INR",
            receipt: `traderiq_${Date.now()}`,
            notes: { user_id, planName, promo: promoCode || "NONE" }
        };

        const order = await razorpay.orders.create(options);
        
        // Response bhejein
        res.status(200).json({
            id: order.id,
            amount: order.amount,
            razorpayKeyId: process.env.RAZORPAY_KEY_ID // Frontend ko key bhejna zaroori hai
        });

    } catch (error) {
        console.error("Razorpay Order Error:", error.message);
        res.status(500).json({ error: "Razorpay Error: " + error.message });
    }
    }

import Razorpay from 'razorpay';
import admin from 'firebase-admin';

// Firebase Admin initialization logic
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            // Private key ki newline characters ko handle karne ke liye replace zaroori hai
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
    });
}

const db = admin.firestore();

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Razorpay instance with Vercel variables
    const razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    try {
        const { amount, planName, user_id, promoCode } = req.body;
        
        if (!user_id) return res.status(400).json({ error: "User ID is required" });

        const conversionRate = 94;
        let finalAmountInInr = amount * conversionRate;

        // --- DYNAMIC PROMO CHECK FROM FIRESTORE ---
        if (promoCode) {
            // Hum direct Firestore ke 'promos' collection mein check kar rahe hain
            const promoRef = db.collection('promos').doc(promoCode.toUpperCase());
            const promoDoc = await promoRef.get();

            if (promoDoc.exists && promoDoc.data().status === 'active') {
                const discountPercent = promoDoc.data().discount || 0;
                // Discount calculate karke price kam karna
                finalAmountInInr = finalAmountInInr * (1 - (discountPercent / 100));
            }
        }

        // Razorpay expects amount in Paise (Integer)
        const amountInPaise = Math.round(finalAmountInInr) * 100;

        const options = {
            amount: amountInPaise,
            currency: "INR",
            receipt: `tradersiq_${Date.now()}`,
            notes: {
                user_id: user_id,
                plan_name: planName,
                promo_used: promoCode || "NONE"
            }
        };

        const order = await razorpay.orders.create(options);

        res.status(200).json({
            id: order.id,
            amount: order.amount,
            razorpayKeyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID // Frontend ke liye public key
        });

    } catch (error) {
        console.error("Order Creation Error:", error);
        res.status(500).json({ error: error.message });
    }
}

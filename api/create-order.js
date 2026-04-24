import Razorpay from 'razorpay';
import admin from 'firebase-admin';

// Firebase Admin initialization logic - Vercel Environment Variables ka use
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
    // Sirf POST request allow karni hai
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Razorpay instance setup
    const razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    try {
        const { amount, planName, user_id, promoCode } = req.body;
        
        // Validation: User ID hona zaroori hai
        if (!user_id) return res.status(400).json({ error: "User ID is required" });

        const conversionRate = 94; // Aapka conversion rate
        let finalAmountInInr = amount * conversionRate;

        // --- DYNAMIC PROMO CHECK FROM FIRESTORE ---
        // Ye logic Firestore ke 'promos' collection se code check karega
        if (promoCode) {
            const promoRef = db.collection('promos').doc(promoCode.toUpperCase());
            const promoDoc = await promoRef.get();

            if (promoDoc.exists && promoDoc.data().status === 'active') {
                const discountPercent = promoDoc.data().discount || 0;
                // Discount apply karna
                finalAmountInInr = finalAmountInInr * (1 - (discountPercent / 100));
            }
        }

        // Razorpay amount humesha Paise (Paise = INR * 100) mein leta hai
        const amountInPaise = Math.round(finalAmountInInr) * 100;

        const options = {
            amount: amountInPaise,
            currency: "INR",
            receipt: `tradersiq_${Date.now()}`,
            notes: {
                user_id: user_id,
                plan_name: planName,
                promo_used: promoCode || "NONE",
                original_usd: amount
            }
        };

        // Razorpay Order Create karna
        const order = await razorpay.orders.create(options);

        // Frontend ko response bhejna
        res.status(200).json({
            id: order.id,
            amount: order.amount,
            razorpayKeyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID 
        });

    } catch (error) {
        console.error("Order Creation Error:", error);
        res.status(500).json({ error: error.message });
    }
    }

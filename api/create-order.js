import Razorpay from 'razorpay';
import admin from 'firebase-admin';

// Backend crash hone se bachane ke liye safe initialization
try {
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                // JSON format aur Vercel environment variables dono ko handle karne ke liye update
                privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
            }),
        });
    }
} catch (e) {
    console.error("Firebase Admin initialization failed:", e.message);
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
        
        // Validation: Agar user_id missing hai toh error throw karein
        if (!user_id) {
            return res.status(400).json({ error: "User identity not found. Please re-login." });
        }

        const conversionRate = 94;
        let finalAmountInInr = amount * conversionRate;

        // Promo logic: Database se discount uthane ke liye
        if (promoCode && db) {
            try {
                const promoRef = db.collection('promos').doc(promoCode.toUpperCase());
                const promoDoc = await promoRef.get();
                
                if (promoDoc.exists && promoDoc.data().status === 'active') {
                    // Database mein 'discount' field ka number hona zaroori hai
                    const discountPercent = promoDoc.data().discount || 0;
                    finalAmountInInr = finalAmountInInr * (1 - (discountPercent / 100));
                }
            } catch (pErr) {
                console.error("Promo check failed, charging full amount:", pErr.message);
            }
        }

        const options = {
            amount: Math.round(finalAmountInInr * 100), // Paise mein convert karne ke liye
            currency: "INR",
            receipt: `order_${Date.now()}`,
            notes: { 
                user_id: user_id, 
                plan_name: planName, 
                promo: promoCode || "NONE" 
            }
        };

        const order = await razorpay.orders.create(options);
        
        res.status(200).json({
            id: order.id,
            amount: order.amount,
            razorpayKeyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID 
        });

    } catch (error) {
        console.error("Order Creation Error:", error.message);
        res.status(500).json({ error: "Backend Error: " + error.message });
    }
}

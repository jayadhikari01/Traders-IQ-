import Razorpay from 'razorpay';
import admin from 'firebase-admin';

// 1. Firebase Admin Initialization (Crucial for Promo Check)
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: "traders-iq-app-f5169",
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL, 
            privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
        })
    });
}

// 2. Server-side Prices (The Truth)
const ORIGINAL_PRICES = {
    "Monthly Pro": 9.99,
    "Annual Elite": 89.99
};

// 3. Export Default Handler (Fixed to match your Webhook format)
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    try {
        // Razorpay Setup inside handler
        const razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET
        });

        const { amount, planName, user_id, promoCode } = req.body;

        // Validation: Check if plan exists
        if (!ORIGINAL_PRICES[planName]) {
            console.error("Invalid Plan Name received:", planName);
            return res.status(400).json({ error: "Invalid Plan Name" });
        }

        let finalAmount = ORIGINAL_PRICES[planName];

        // 4. Secure Promo Verification
        if (promoCode) {
            try {
                const db = admin.firestore();
                const promoSnap = await db.collection('promos').doc(promoCode.toUpperCase()).get();

                if (promoSnap.exists && promoSnap.data().status === 'active') {
                    const promoData = promoSnap.data();
                    if (promoData.discount) {
                        const discountPercent = parseFloat(promoData.discount) / 100;
                        finalAmount = finalAmount * (1 - discountPercent);
                        console.log(`Promo Applied: ${promoCode}, New Price: ${finalAmount}`);
                    }
                } else {
                    console.log("Invalid Promo Code attempted:", promoCode);
                }
            } catch (firestoreError) {
                console.error("Firestore Promo Fetch Error:", firestoreError);
            }
        }

        // 5. Currency Conversion (USD to INR)
        const amountInPaise = Math.round(finalAmount * 84 * 100); 

        if (amountInPaise <= 0) {
            return res.status(200).json({ isFree: true, amount: 0 });
        }

        // 6. Razorpay Order Options
        const options = {
            amount: amountInPaise,
            currency: "INR",
            receipt: `rcpt_${Date.now()}`,
            notes: {
                user_id: user_id,
                plan: planName, 
                promo: promoCode || "NONE"
            }
        };

        const order = await razorpay.orders.create(options);
        
        // Return Success Response
        res.status(200).json({
            ...order,
            razorpayKeyId: process.env.RAZORPAY_KEY_ID
        });

    } catch (error) {
        console.error("Order Creation Error:", error);
        res.status(500).json({ error: "Server Error: Payment could not be initiated" });
    }
}
    

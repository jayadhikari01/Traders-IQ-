const Razorpay = require('razorpay');
const admin = require('firebase-admin');

// 1. Razorpay Setup
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

// 2. Server-side Prices (The Truth)
const ORIGINAL_PRICES = {
    "Monthly Pro": 9.99,
    "Annual Elite": 89.99
};

exports.createOrder = async (req, res) => {
    try {
        const { amount, planName, user_id, promoCode } = req.body;

        // Validation: Check if plan exists
        if (!ORIGINAL_PRICES[planName]) {
            console.error("Invalid Plan Name received:", planName);
            return res.status(400).json({ error: "Invalid Plan Name" });
        }

        let finalAmount = ORIGINAL_PRICES[planName];

        // 3. Secure Promo Verification
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
                    console.log("Invalid or Expired Promo Code attempted:", promoCode);
                    // Optional: return res.status(400).json({ error: "Invalid Promo" });
                }
            } catch (firestoreError) {
                console.error("Firestore Promo Fetch Error:", firestoreError);
                // Agar firestore fail ho, toh hum original price pe continue karenge taaki payment na ruke
            }
        }

        // 4. Currency Conversion (USD to INR)
        // Note: Razorpay INR mein paise (cents) leta hai. 
        // 84 multiplier example hai, ise apne rate ke hisaab se set karein.
        const amountInPaise = Math.round(finalAmount * 84 * 100); 

        if (amountInPaise <= 0) {
            return res.json({ isFree: true, amount: 0 });
        }

        // 5. Razorpay Order Options
        const options = {
            amount: amountInPaise,
            currency: "INR",
            receipt: `rcpt_${Date.now()}`,
            notes: {
                user_id: user_id,
                plan: planName, // Webhook isi 'plan' key ko use karega
                promo: promoCode || "NONE"
            }
        };

        const order = await razorpay.orders.create(options);
        
        res.json({
            ...order,
            razorpayKeyId: process.env.RAZORPAY_KEY_ID
        });

    } catch (error) {
        console.error("Order Creation Error:", error);
        res.status(500).json({ error: "Server Error: Payment could not be initiated" });
    }
};

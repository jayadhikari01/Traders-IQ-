const Razorpay = require('razorpay');
const admin = require('firebase-admin');

// Initialize Razorpay
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Original Prices (Server-side truth)
const ORIGINAL_PRICES = {
    "Monthly Pro": 9.99,
    "Annual Elite": 89.99
};

exports.createOrder = async (req, res) => {
    try {
        const { amount, planName, user_id, promoCode } = req.body;

        // 1. Validation: Plan check
        if (!ORIGINAL_PRICES[planName]) {
            return res.status(400).json({ error: "Invalid Plan" });
        }

        // 2. Initial price from server-side truth
        let finalAmount = ORIGINAL_PRICES[planName];

        // 3. Security Check: Promo Code Verification
        if (promoCode) {
            const db = admin.firestore();
            const promoSnap = await db.collection('promos').doc(promoCode.toUpperCase()).get();

            if (promoSnap.exists && promoSnap.data().status === 'active') {
                const promoData = promoSnap.data();
                if (promoData.discount) {
                    const discountPercent = parseFloat(promoData.discount) / 100;
                    finalAmount = finalAmount * (1 - discountPercent);
                }
            } else {
                // Agar code invalid hai par user ne bheja hai, toh use reject kar sakte hain
                return res.status(400).json({ error: "Invalid or Expired Promo Code" });
            }
        }

        // 4. Final Security Match: Front-end vs Back-end
        // Hum front-end se aaye 'amount' par bharosa nahi karenge, server wala 'finalAmount' use karenge.
        const amountInPaise = Math.round(finalAmount * 84 * 100); // USD to INR conversion example (84 multiplier)

        // 5. Check if it's 100% free (100% Discount)
        if (amountInPaise <= 0) {
            return res.json({ isFree: true, amount: 0 });
        }

        // 6. Create Razorpay Order
        const options = {
            amount: amountInPaise,
            currency: "INR",
            receipt: `receipt_${Date.now()}`,
            notes: {
                user_id: user_id,
                plan: planName,
                applied_promo: promoCode || "NONE"
            }
        };

        const order = await razorpay.orders.create(options);
        
        // Response with Razorpay Key ID for front-end
        res.json({
            ...order,
            razorpayKeyId: process.env.RAZORPAY_KEY_ID
        });

    } catch (error) {
        console.error("Order Creation Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

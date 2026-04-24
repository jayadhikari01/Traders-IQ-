import Razorpay from 'razorpay';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // 1. Check if keys exist in Environment Variables
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
        return res.status(500).json({ error: "Razorpay keys are missing in Vercel settings" });
    }

    const razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    try {
        const { amount, planName, user_id, promoCode } = req.body;

        if (!user_id) return res.status(400).json({ error: "User ID is missing" });

        // Conversion at 94
        const conversionRate = 94; 
        const amountInPaise = Math.round(amount * conversionRate * 100);

        const options = {
            amount: amountInPaise,
            currency: "INR",
            receipt: `tradersiq_${Date.now()}`,
            notes: {
                user_id: user_id,
                plan_name: planName,
                promo: promoCode || "none"
            }
        };

        const order = await razorpay.orders.create(options);

        res.status(200).json({
            id: order.id,
            amount: order.amount,
            razorpayKeyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID
        });
    } catch (error) {
        console.error("Order Error:", error);
        res.status(500).json({ error: error.message || "Failed to create order" });
    }
}

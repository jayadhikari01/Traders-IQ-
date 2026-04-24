import Razorpay from 'razorpay';

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { amount, planName, user_id, promoCode } = req.body;

        if (!user_id) throw new Error("User ID is required");

        // USD ($) to INR (₹) conversion at 94
        const conversionRate = 94; 
        const amountInPaise = Math.round(amount * conversionRate * 100);

        const options = {
            amount: amountInPaise,
            currency: "INR",
            receipt: `rcpt_${Date.now()}`,
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
        console.error("Order Error:", error.message);
        res.status(500).json({ error: error.message });
    }
}

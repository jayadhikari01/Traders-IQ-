import Razorpay from 'razorpay';

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    try {
        const { amount, planName, user_id, promoCode } = req.body;

        // USD to INR Conversion (Updated to 94)
        // Razorpay amount 'Paise' mein leta hai (* 100)
        const conversionRate = 94; 
        const amountInPaise = Math.round(amount * conversionRate * 100);

        const options = {
            amount: amountInPaise,
            currency: "INR",
            receipt: `tradersiq_rcpt_${Date.now()}`,
            notes: {
                user_id: user_id,
                plan_name: planName,
                promo_applied: promoCode || "none"
            }
        };

        const order = await razorpay.orders.create(options);

        res.status(200).json({
            id: order.id,
            amount: order.amount,
            currency: order.currency,
            razorpayKeyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID
        });

    } catch (error) {
        console.error("Razorpay Order Creation Error:", error);
        res.status(500).json({ 
            error: "Failed to create order",
            details: error.message 
        });
    }
}

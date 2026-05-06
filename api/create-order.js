import axios from 'axios'; // Require ki jagah Import use karein

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { userId, amount, plan } = req.body;

    // Security: Check if data exists
    if (!userId || !amount) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    const expiryDays = (plan && plan.toLowerCase() === 'monthly') ? 30 : 365;

    try {
        const response = await axios.post('https://api.cashfree.com/pg/links', {
            customer_details: {
                customer_id: userId,
                customer_phone: "9999999999", 
            },
            link_id: `link_${Date.now()}`,
            link_amount: parseFloat(amount), // Ensure amount is a number
            link_currency: "INR",
            link_purpose: `Traders IQ ${plan} Access`,
            link_meta: {
                return_url: `https://tradersiq.xyz/success.html?order_id={order_id}`,
            }
        }, {
            headers: {
                'x-client-id': process.env.CASHFREE_APP_ID,
                'x-client-secret': process.env.CASHFREE_SECRET_KEY,
                'x-api-version': '2023-08-01' // Keep this or use 2025-01-01 to match webhook
            }
        });

        res.status(200).json(response.data);
    } catch (error) {
        // Detailed logging for Vercel
        console.error("Cashfree API Error Details:", error.response ? error.response.data : error.message);
        res.status(500).json({ 
            error: "Failed to create link", 
            details: error.response ? error.response.data.message : error.message 
        });
    }
}

const axios = require('axios'); // Is baar Require hi rehne dete hain par niche syntax thoda badal diya hai

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { userId, amount, plan } = req.body;

    try {
        const response = await axios.post('https://api.cashfree.com/pg/links', {
            customer_details: {
                customer_id: userId || "Guest_User",
                customer_phone: "9999999999", 
            },
            link_id: `link_${Date.now()}`,
            link_amount: parseFloat(amount),
            link_currency: "INR",
            link_purpose: `Traders IQ ${plan || 'Pro'} Access`,
            link_meta: {
                return_url: `https://tradersiq.xyz/success.html?order_id={order_id}`,
            }
        }, {
            headers: {
                'x-client-id': process.env.CASHFREE_APP_ID,
                'x-client-secret': process.env.CASHFREE_SECRET_KEY,
                'x-api-version': '2023-08-01'
            }
        });

        return res.status(200).json(response.data);
    } catch (error) {
        // Ye line aapko Vercel Logs mein exact error batayegi
        console.error("CASHFREE ERROR:", error.response ? error.response.data : error.message);
        return res.status(500).json({ 
            error: "Order creation failed", 
            message: error.response ? error.response.data.message : error.message 
        });
    }
}

import axios from 'axios'; // 'require' ki jagah 'import' kyunki package.json mein type: module hai

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { userId, amount, plan } = req.body;

    // Plan ke hisab se subscription duration set kar rahe hain
    const expiryDays = (plan && plan.toLowerCase() === 'monthly') ? 30 : 365;

    try {
        const response = await axios.post('https://api.cashfree.com/pg/links', {
            customer_details: {
                customer_id: userId || "Guest_User",
                customer_phone: "9999999999", 
            },
            link_id: `link_${Date.now()}`,
            link_amount: parseFloat(amount), // Amount ko number format mein ensure karna
            link_currency: "INR",
            link_purpose: `Traders IQ ${plan} Access`,
            link_meta: {
                return_url: `https://tradersiq.xyz/success.html?order_id={order_id}`,
            },
            link_notes: {
                Note: plan, 
                ExpiryDays: expiryDays.toString()
            }
        }, {
            headers: {
                'x-client-id': process.env.CASHFREE_APP_ID,
                'x-client-secret': process.env.CASHFREE_SECRET_KEY,
                'x-api-version': '2023-08-01'
            }
        });

        res.status(200).json(response.data);
    } catch (error) {
        // Detailed logging taaki Vercel 500 error ka pata chale
        console.error("Cashfree API Error:", error.response ? error.response.data : error.message);
        res.status(500).json({ 
            error: "Failed to create link", 
            details: error.response ? error.response.data : error.message 
        });
    }
}

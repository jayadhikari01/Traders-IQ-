import axios from 'axios';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { userId, amount, plan } = req.body;

    try {
        // --- USD to INR Conversion (Updated Rate: 95) ---
        const exchangeRate = 95; 
        const amountInUSD = parseFloat(amount);
        const amountInINR = Math.round(amountInUSD * exchangeRate); // e.g., 0.10 * 95 = 9.5 -> ₹10 (Round off)

        // Safety check for Cashfree minimum limit
        const finalAmount = amountInINR < 1 ? 1 : amountInINR;

        const response = await axios.post('https://api.cashfree.com/pg/links', {
            customer_details: {
                customer_id: userId || "Guest_User",
                customer_phone: "9999999999", 
            },
            link_id: `link_${Date.now()}`,
            link_amount: finalAmount, 
            link_currency: "INR",
            link_purpose: `Traders IQ ${plan} Access`,
            link_meta: {
                return_url: `https://tradersiq.xyz/success.html?order_id={order_id}`,
            }
        }, {
            headers: {
                'x-client-id': process.env.CASHFREE_APP_ID,
                'x-client-secret': process.env.CASHFREE_SECRET_KEY,
                'x-api-version': '2025-01-01' // Matches your dashboard version
            }
        });

        res.status(200).json(response.data);
    } catch (error) {
        console.error("Cashfree API Error:", error.response ? error.response.data : error.message);
        res.status(500).json({ 
            error: "Failed to create payment link",
            details: error.response?.data?.message || error.message 
        });
    }
                      }

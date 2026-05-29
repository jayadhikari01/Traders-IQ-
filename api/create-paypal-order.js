import axios from 'axios';

// PayPal Access Token lene ke liye function
async function getPayPalAccessToken() {
    const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_SECRET}`).toString('base64');
    
    // Check environment (Production vs Sandbox)
    const url = process.env.NODE_ENV === 'production' 
        ? 'https://api-m.paypal.com/v1/oauth2/token' 
        : 'https://api-m.sandbox.paypal.com/v1/oauth2/token';

    const response = await axios.post(url, 'grant_type=client_credentials', {
        headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    });
    return response.data.access_token;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    // Frontend se details receive karna
    const { userId, plan, originalAmount, discountAmount } = req.body;

    try {
        const accessToken = await getPayPalAccessToken();

        // Final Amount Calculate Karna (Safe Backend Calculation)
        const baseAmount = parseFloat(originalAmount || 0);
        const discount = parseFloat(discountAmount || 0);
        let finalAmount = baseAmount - discount;

        // Security Check: Amount 0 se kam nahi honi chahiye
        if (finalAmount <= 0) {
            return res.status(400).json({ error: "Invalid amount after discount" });
        }

        // ToFixed(2) zaroori hai kyunki PayPal sirf 2 decimal places accept karta hai (e.g., "15.50")
        const formattedAmount = finalAmount.toFixed(2);

        const paypalUrl = process.env.NODE_ENV === 'production'
            ? 'https://api-m.paypal.com/v2/checkout/orders'
            : 'https://api-m.sandbox.paypal.com/v2/checkout/orders';

        // 🎯 PayPal Order Payload Setup
        const orderData = {
            intent: "CAPTURE",
            purchase_units: [
                {
                    amount: {
                        currency_code: "USD",
                        value: formattedAmount, // Yeh hai aapki discounted final price
                        breakdown: {
                            item_total: {
                                currency_code: "USD",
                                value: baseAmount.toFixed(2)
                            },
                            discount: {
                                currency_code: "USD",
                                value: discount.toFixed(2)
                            }
                        }
                    },
                    description: `Traders IQ ${plan || 'Pro'} - Dynamic Checkout`,
                    // 🌟 Sabse important: custom_id mein userId aur plan dono bhej rahe hain taaki Webhook pe access mil sake
                    custom_id: JSON.stringify({ userId: userId, plan: plan })
                }
            ],
            application_context: {
                return_url: "https://tradersiq.xyz/success.html",
                cancel_url: "https://tradersiq.xyz/payment.html",
                user_action: "PAY_NOW",
                shipping_preference: "NO_SHIPPING"
            }
        };

        const response = await axios.post(paypalUrl, orderData, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        // Response pure frontend ko return karna (Isme Order ID hogi)
        res.status(200).json(response.data);

    } catch (error) {
        console.error("PayPal Order Error:", error.response ? error.response.data : error.message);
        res.status(500).json({ 
            error: "Failed to create dynamic PayPal order",
            details: error.response?.data?.message || error.message 
        });
    }
}
    

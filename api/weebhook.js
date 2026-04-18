export default async function handler(req, res) {
  if (req.method === 'POST') {
    // Ye line bas check karne ke liye hai ki data aa raha hai
    console.log("Data from Lemon Squeezy:", req.body);
    
    return res.status(200).json({ status: 'Webhook Received' });
  } else {
    res.status(405).json({ message: 'Method Not Allowed' });
  }
}

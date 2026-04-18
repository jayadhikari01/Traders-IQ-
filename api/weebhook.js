// api/webhook.js
const admin = require('firebase-admin');
const crypto = require('crypto');

// Firebase Admin initialization (Ismein apni service account details dalo)
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: "traders-iq-app-f5169",
            clientEmail: "YOUR_SERVICE_ACCOUNT_EMAIL",
            privateKey: "YOUR_PRIVATE_KEY".replace(/\\n/g, '\n')
        })
    });
}

const db = admin.firestore();

module.exports = async (req, res) => {
    const secret = "YOUR_WEBHOOK_SECRET"; // Jo secret dashboard mein dala tha
    const hmac = crypto.createHmac('sha256', secret);
    const digest = Buffer.from(hmac.update(req.body).digest('hex'), 'utf8');
    const signature = Buffer.from(req.get('X-Signature') || '', 'utf8');

    // Security check: Verify request actually came from Lemon Squeezy
    if (!crypto.timingSafeEqual(digest, signature)) {
        return res.status(401).send('Invalid signature');
    }

    const data = JSON.parse(req.body);
    const userId = data.meta.custom_data.user_id; // Humne payment.html se user_id bheja tha

    if (data.data.attributes.status === 'paid') {
        try {
            // Update User to Pro in Firestore
            await db.collection('users').doc(userId).update({
                isPro: true,
                plan: data.data.attributes.variant_name,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`User ${userId} upgraded to Pro!`);
            res.status(200).send('Webhook processed');
        } catch (error) {
            console.error('Firestore Error:', error);
            res.status(500).send('Database Error');
        }
    } else {
        res.status(200).send('Event ignored');
    }
};
      

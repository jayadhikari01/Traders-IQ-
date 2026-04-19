const admin = require('firebase-admin');
const crypto = require('crypto');

// 1. Firebase Admin Setup
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: "traders-iq-app-f5169",
            clientEmail: "firebase-adminsdk-fbsvc@traders-iq-app-f5169.iam.gserviceaccount.com",
            privateKey: "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCht/vFBK1KbbzR\n9INTeNttdfqchyrHe9pdhT84x76+yu1yUz+Jo1f8TkMybM5gujitQvpbpXogk0kI\ns8VtG6+wmP/mFQu2o9w5tus+9Tu9aQgqB3Pv3okRVErY/6bCzByctCZ7lwRfr2YN\nLYuJjF2cvqVkMVTILvVfCbgo+g7AXAxcXp1hrBTCDb0ZGu+Qrl8V4q1tgOw9CBZ5\nHjtFc9fV8aPpp/h6nOGOscfX17cWOlm0McTxK7nlXyPuDNQLhV8d0xxlP/NLe/UK\njQZYrvMHYFuDCj0BK8eNFwllhGiatYMxXAD0QwY3Ki6RUZAbo/Aw0Am25PSrgoI6\nNB96xowfAgMBAAECggEAOzGhffWeypoNXdp+wWyBAPmIwIe3UGpUvRubTxjKCIM1\n072GCcbY21j4PrpV9lDjkwPrqOUSpV7UAlPvJWdXcTAnptu4PGORJiz+wb443jVW\nUDAHL1tI16d/eBtnunDE3lUQqvdVmgKVO6iapT/UOh4MYvatnlKV7PIdTx5sjNrv\nata2gjWE3YkTezj1hP3CiUZaFbTKwvQU+/Xj6owT/8A1lZpYfqoIX+BAntNGftoX\nN0IFwRvT4DLS142MMy2unial6nKHtn6ylxz04PLx8fFF/HS/vuSHyL0oq1RziqSb\nmLflxIXkeJ+vHDtB76GKMHUWNJbXvOScV5rsrihNEQKBgQDVRInhIi30kcn5+VNz\nePi4azb9R8agOF5Rrp6fB0igVyyT0gpgQsJ6oafqyEw1JJKmESLbKRROR2pMlwbz\nE1QXivKc+BlXzY313uWlzUKW14/iBaOZhV8eEXmVDFiABz2l7U2dtV/N/gESG9VH\nBKrINKhIhcs1nwfFQGskPWOE8QKBgQDCH0MzWI4YYwqppF8Ug0nvZP2O4gAmQOV3\nojKlkhYfnnD/Z1GL5GTpIh+644vbOQQwHppYYJBMv6Uk1Zok+9J5QgvJgOZGtFBj\nwQrPwDwF/fQWSbGS3bniFqUFke2Xjgz6giUJ5wD2QWiBHxPWyRXlr8OEqjgsYkr4\nAnwty+XiDwKBgQC48zZrotudxK0XdwzTEG8KaBiJMKzll9zcE4aGPafTPaZwD3Bm\nKJ9GAFmCN/A3Ch+Pmz7SN17fv/lEsJkbRoDf5eUfEd3QknfxaTtZPZfo/spN5jwJ\n0Gs7xUXeZ5V8eksRUanFAl0yZHyDOtYMP9TnyRrDwhwHxYHUo1gHVqGu0QKBgBvW\nS9azHj1VBpRpI9FXOmUAAHRa6FaT+9P6CHVBy7ZhDCcz87ex2t6rrA0q0EVxma4k\n1VFTF55J5S6xCte+3OHSnMoal+sPtG95oUlFcdYSIsyHaNV8wkkvoh54XK/dCPNr\nclBHNhYaLxhFEp08XM2BNPJzTnbe6Y1DHfebQ631AoGAPx5vlE+8GccISOWBB+14\nwgAhFg7MXsXfkmyM6qohXcE5SBLpXTLbvTkCSnlnWIoM3BuoW1g4+sxk/pUDTxb6\n4fGMR5jPsUaEa/nevsjxbv4ZtANFmA0Ala7zurEMgSejJyXjLyPRbEOY92nDsWm7\nI84nWO4wBEbAKhQ/OwEWCjU=\n-----END PRIVATE KEY-----\n".replace(/\\n/g, '\n')
        })
    });
}

const db = admin.firestore();

// Vercel config
export const config = {
    api: { bodyParser: false },
};

async function getRawBody(readable) {
    const chunks = [];
    for await (const chunk of readable) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks);
}

module.exports = async (req, res) => {
    // Sirf POST requests allow honge (Lemon Squeezy POST bhejta hai)
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    try {
        const rawBody = await getRawBody(req);
        const secret = "TradersIQ_Secret_99"; 
        const signature = req.headers['x-signature'];

        const hmac = crypto.createHmac('sha256', secret);
        const digest = hmac.update(rawBody).digest('hex');

        // Security check
        if (!signature || signature !== digest) {
            console.error('Signature Mismatch!');
            return res.status(401).send('Invalid signature');
        }

        const payload = JSON.parse(rawBody.toString());
        const eventName = payload.meta.event_name;
        const userId = payload.meta.custom_data ? payload.meta.custom_data.user_id : null;

        console.log(`Event: ${eventName} for User: ${userId}`);

        // Update logic
        if (eventName === 'order_created' || eventName === 'subscription_created') {
            if (userId) {
                await db.collection('users').doc(userId).update({
                    isPro: true,
                    plan: payload.data.attributes.variant_name || 'Premium',
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                return res.status(200).send('Success');
            }
        }
        res.status(200).send('Event Received');
    } catch (error) {
        console.error('Webhook Error:', error);
        res.status(500).send(`Error: ${error.message}`);
    }
};
        

const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const app = express();

app.use(cors());
app.use(express.json());

// Firebase Initialization
const serviceAccount = {
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore(); // Realtime DB ki jagah Firestore use ho raha hai

// API Routes (Updated for Firestore)
app.post('/api/verify-admin', async (req, res) => {
    // Yahan tum basic verification kar sakte ho
    res.json({ authorized: true });
});

app.get('/api/get-users', async (req, res) => {
    try {
        const snapshot = await db.collection('users').get();
        const users = {};
        snapshot.forEach(doc => {
            users[doc.id] = doc.data();
        });
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch users" });
    }
});

app.post('/api/create-promo', async (req, res) => {
    const { name, discount, owner } = req.body;
    try {
        await db.collection('promos').doc(name).set({ discount, owner, status: "active" });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/update-user', async (req, res) => {
    const { userId, newPlan } = req.body;
    try {
        await db.collection('users').doc(userId).update({ plan: newPlan });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/get-promos', async (req, res) => {
    try {
        const snapshot = await db.collection('promos').get();
        const promos = {};
        snapshot.forEach(doc => {
            promos[doc.id] = doc.data();
        });
        res.json(promos);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch promos" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
          

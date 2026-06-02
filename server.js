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

const db = admin.firestore(); 
const MASTER_ADMIN_UID = process.env.MASTER_ADMIN_UID;

// API Routes
app.post('/api/verify-admin', async (req, res) => {
    const { loggedInUid } = req.body;
    if (MASTER_ADMIN_UID && loggedInUid === MASTER_ADMIN_UID) {
        res.json({ authorized: true });
    } else {
        res.status(403).json({ authorized: false, message: "Unauthorized access!" });
    }
});

app.get('/api/get-users', async (req, res) => {
    try {
        const snapshot = await db.collection('users').get();
        const users = {};
        snapshot.forEach(doc => {
            const userData = doc.data();
            // Sirf wahi filter karo jo explicitly 'deleted' mark hain
            if (userData.deleted !== true) {
                users[doc.id] = userData;
            }
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

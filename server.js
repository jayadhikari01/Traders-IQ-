const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const app = express();

app.use(cors()); // Ye zaroori hai taaki terminal.html tumhare server se baat kar sake
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
  credential: admin.credential.cert(serviceAccount),
  databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`
});

const db = admin.database();

// API Routes
app.post('/api/verify-admin', async (req, res) => {
    const { loggedInUid } = req.body;
    // Yahan tum apna admin UID check kar sakte ho
    res.json({ authorized: true });
});

app.get('/api/get-users', async (req, res) => {
    const snapshot = await db.ref('users').once('value');
    res.json(snapshot.val() || {});
});

app.post('/api/create-promo', async (req, res) => {
    const { name, discount, owner } = req.body;
    await db.ref('promos/' + name).set({ discount, owner });
    res.json({ success: true });
});

app.post('/api/update-user', async (req, res) => {
    const { userId, newPlan } = req.body;
    await db.ref('users/' + userId).update({ plan: newPlan });
    res.json({ success: true });
});

app.get('/api/get-promos', async (req, res) => {
    const snapshot = await db.ref('promos').once('value');
    res.json(snapshot.val() || {});
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
      

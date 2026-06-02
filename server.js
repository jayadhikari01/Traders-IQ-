const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const app = express();

app.use(cors());
app.use(express.json());

// Firebase setup (Vercel/Render ke Environment Variables se key uthayein)
admin.initializeApp({
  credential: admin.credential.applicationDefault()
});

app.post('/api/verify-admin', (req, res) => {
  // Yahan tumhara logic ayega
  res.json({ authorized: true });
});

app.listen(process.env.PORT || 3000, () => console.log("Server running..."));

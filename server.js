const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();

// Enable CORS so your Netlify/GitHub Pages frontend can talk to this server
app.use(cors());
app.use(express.json());

// Initialize Firebase using Environment Variables stored securely on Render
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.apps.length ? admin.firestore() : null;

// In-memory active game sessions
const activeSessions = {};

// Health Check Route
app.get('/', (req, res) => {
  res.send('CogniShift Backend is live!');
});

// 1. START ROUND 1
app.post('/api/start-r1', (req, res) => {
  const digits = req.body.digits || 2;
  let targetSeq = "";
  for (let i = 0; i < digits; i++) {
    targetSeq += (i === 0) ? Math.floor(Math.random() * 9 + 1) : Math.floor(Math.random() * 10);
  }

  const sessionId = Math.random().toString(36).substring(2);
  activeSessions[sessionId] = { targetSeq, digits };

  res.json({ sessionId, sequence: targetSeq });
});

// 2. VERIFY ROUND 1 ANSWER
app.post('/api/verify-r1', (req, res) => {
  const { sessionId, userInput } = req.body;
  const session = activeSessions[sessionId];

  if (!session) return res.status(400).json({ error: "Invalid Session" });

  const targetRev = session.targetSeq.split('').reverse().join('');
  const isCorrect = (userInput === targetRev);

  delete activeSessions[sessionId];

  res.json({ success: isCorrect });
});

// 3. SECURE RANK & TOP LEADER FETCH
app.get('/api/leaderboard-stats', async (req, res) => {
  const playerScore = parseInt(req.query.score) || 0;

  if (!db) {
    return res.json({ topLeaderName: "N/A", topLeaderScore: 0, playerRank: 1, totalPlayers: 1 });
  }

  try {
    const topSnap = await db.collection('users').orderBy('highScore', 'desc').limit(1).get();
    let topLeaderName = "N/A", topLeaderScore = 0;
    if (!topSnap.empty) {
      const topData = topSnap.docs[0].data();
      topLeaderName = topData.username || "Anonymous";
      topLeaderScore = topData.highScore || 0;
    }

    const higherSnap = await db.collection('users').where('highScore', '>', playerScore).get();
    const totalSnap = await db.collection('users').get();

    res.json({
      topLeaderName,
      topLeaderScore,
      playerRank: higherSnap.size + 1,
      totalPlayers: totalSnap.size || 1
    });
  } catch (err) {
    res.status(500).json({ error: "Database query failed" });
  }
});

// Start Server on Render's designated port
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
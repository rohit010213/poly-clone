require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const WebSocket = require('ws');

const traderRoutes = require('./routes/traders');
const tradesRoutes = require('./routes/trades');
const walletRoutes = require('./routes/wallet');
const { startPoller } = require('./services/poller');
const { initWS } = require('./services/websocket');

const app = express();
const server = createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());
app.use(morgan('dev'));

// Rate limit
const limiter = rateLimit({ windowMs: 60 * 1000, max: 100 });
app.use('/api/', limiter);

// Routes
app.use('/api/traders', traderRoutes);
app.use('/api/trades', tradesRoutes);
app.use('/api/wallet', walletRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Init WebSocket broadcasts
initWS(wss);

// Start background poller
startPoller(wss);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`\n🟢 PolyClone Backend running on port ${PORT}`);
  console.log(`📡 WebSocket ready`);
  console.log(`🔍 Polling every ${process.env.POLL_INTERVAL || 30}s\n`);
});

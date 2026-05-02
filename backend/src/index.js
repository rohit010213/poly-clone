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
const { initWallet, checkGeoblock } = require('./services/executor');

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

app.get('/api/generate-key', async (req, res) => {
  try {
    const { ClobClient, Chain } = await import('@polymarket/clob-client-v2');
    const { createWalletClient, http } = await import('viem');
    const { privateKeyToAccount } = await import('viem/accounts');

    const pk = process.env.PRIVATE_KEY;
    const account = privateKeyToAccount(pk.startsWith('0x') ? pk : '0x' + pk);
    const signer = createWalletClient({
      account,
      transport: http(process.env.POLYGON_RPC || 'https://polygon-rpc.com'),
    });

    const client = new ClobClient({
      host: 'https://clob.polymarket.com',
      chain: Chain.POLYGON,
      signer,
      signatureType: parseInt(process.env.POLY_SIGNATURE_TYPE || '2'),
      funderAddress: process.env.POLY_FUNDER_ADDRESS,
    });

    console.log('Calling createOrDeriveApiKey...');
    const creds = await client.createOrDeriveApiKey();
    console.log('Raw creds:', JSON.stringify(creds));
    console.log('Creds keys:', Object.keys(creds || {}));
    console.log('key value:', creds.key);
    console.log('secret value:', creds.secret);
    console.log('passphrase value:', creds.passphrase);

    res.json({
      POLY_API_KEY: creds.key,
      POLY_API_SECRET: creds.secret,
      POLY_API_PASSPHRASE: creds.passphrase,
      _raw: creds,
    });
  } catch (err) {
    console.error('GENERATE KEY ERROR:', err);
    res.json({ error: err.message, stack: err.stack });
  }
});

// Init WebSocket broadcasts
initWS(wss);

const PORT = process.env.PORT || 4000;

// ── Boot sequence — wallet init pehle, phir server start ──
async function boot() {
  console.log('\n🔧 Initializing wallet + SDK...');

  const walletOk = await initWallet();
  if (!walletOk) {
    console.error('❌ Wallet init failed — check PRIVATE_KEY in .env');
  } else {
    console.log('✅ Wallet + ClobClient ready');
  }

  // Geoblock check
  const geo = await checkGeoblock();
  if (geo?.blocked) {
    console.error('⚠️  GEOBLOCK: Trading restricted from this region!');
  }

  // Start poller AFTER wallet is ready
  startPoller(wss);

  server.listen(PORT, () => {
    console.log(`\n🟢 PolyClone Backend running on port ${PORT}`);
    console.log(`📡 WebSocket ready`);
    console.log(`🔍 Polling every ${process.env.POLL_INTERVAL || 30}s\n`);
  });
}

boot().catch(err => {
  console.error('❌ Boot failed:', err.message);
  process.exit(1);
});
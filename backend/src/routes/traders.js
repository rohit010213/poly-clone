const express = require('express');
const router = express.Router();
const { addTrader, removeTrader, getTrackedTraders, getTrader } = require('../services/store');
const { getTraderPositions, getTraderHistory, getTraderPnL } = require('../services/polymarket');
const { runPoll } = require('../services/poller');

// GET /api/traders — list all tracked traders
router.get('/', (req, res) => {
  res.json({ traders: getTrackedTraders() });
});

// POST /api/traders — add a trader
router.post('/', async (req, res) => {
  const { address, label } = req.body;
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return res.status(400).json({ error: 'Invalid Ethereum address' });
  }

  addTrader(address, label);

  // Immediately fetch their data
  const [positions, history, pnl] = await Promise.allSettled([
    getTraderPositions(address),
    getTraderHistory(address),
    getTraderPnL(address),
  ]);

  res.json({
    trader: getTrader(address),
    positions: positions.value || [],
    history: history.value || [],
    pnl: pnl.value || null,
  });
});

// DELETE /api/traders/:address — remove a trader
router.delete('/:address', (req, res) => {
  removeTrader(req.params.address);
  res.json({ ok: true });
});

// PUT /api/traders/:address/settings
router.put('/:address/settings', (req, res) => {
  const { updateTraderSettings } = require('../services/store');
  const trader = updateTraderSettings(req.params.address, req.body);
  if (!trader) return res.status(404).json({ error: 'Trader not found' });
  res.json({ trader });
});

// GET /api/traders/:address/positions
router.get('/:address/positions', async (req, res) => {
  const positions = await getTraderPositions(req.params.address);
  res.json({ positions });
});

// GET /api/traders/:address/history
router.get('/:address/history', async (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const history = await getTraderHistory(req.params.address, limit);
  res.json({ history });
});

// GET /api/traders/:address/pnl
router.get('/:address/pnl', async (req, res) => {
  const pnl = await getTraderPnL(req.params.address);
  res.json({ pnl });
});

// POST /api/traders/poll — manually trigger a poll
router.post('/poll', async (req, res) => {
  runPoll(null);
  res.json({ ok: true, message: 'Poll triggered' });
});

module.exports = router;

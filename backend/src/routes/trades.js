const express = require('express');
const router = express.Router();
const { executeCopyTrade } = require('../services/executor');
const { logCopyTrade, getCopyTradeLog, getSettings, updateSettings } = require('../services/store');
const { getBestPrice, getOrderBook } = require('../services/polymarket');

// GET /api/trades/log — get copy trade history
router.get('/log', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json({ trades: getCopyTradeLog(limit) });
});

// POST /api/trades/copy — manually copy a trade
router.post('/copy', async (req, res) => {
  const { tokenId, outcome, market, traderAddress, usdcAmount } = req.body;

  if (!tokenId) return res.status(400).json({ error: 'tokenId required' });
  const amount = parseFloat(usdcAmount) || parseFloat(getSettings().maxTradeUSDC);

  // Get current best price
  const price = await getBestPrice(tokenId, 'BUY');
  if (!price) return res.status(400).json({ error: 'Could not fetch price for this market' });

  const result = await executeCopyTrade({
    tokenId,
    side: 0, // BUY
    price,
    usdcAmount: amount,
  });

  const entry = {
    type: 'manual',
    traderAddress: traderAddress || 'manual',
    market: market || 'Unknown',
    tokenId,
    outcome: outcome || 'Unknown',
    price,
    usdcAmount: amount,
    side: 'BUY',
    success: result.success,
    error: result.error || null,
    orderId: result.data?.orderID || null,
  };

  logCopyTrade(entry);
  res.json(entry);
});

// POST /api/trades/close — manually close/sell a position
router.post('/close', async (req, res) => {
  const { tokenId, outcome, market, usdcAmount } = req.body;
  if (!tokenId) return res.status(400).json({ error: 'tokenId required' });

  const price = await getBestPrice(tokenId, 'SELL');
  if (!price) return res.status(400).json({ error: 'Could not fetch sell price' });

  const result = await executeCopyTrade({
    tokenId,
    side: 1, // SELL
    price,
    usdcAmount: parseFloat(usdcAmount),
  });

  const entry = {
    type: 'manual-close',
    market: market || 'Unknown',
    tokenId,
    outcome,
    price,
    usdcAmount,
    side: 'SELL',
    success: result.success,
    error: result.error || null,
  };

  logCopyTrade(entry);
  res.json(entry);
});

// GET /api/trades/settings
router.get('/settings', (req, res) => {
  res.json(getSettings());
});

// PUT /api/trades/settings
router.put('/settings', (req, res) => {
  const allowed = ['autoCopyEnabled', 'maxTradeUSDC', 'minConfidence', 'copyPartialClose'];
  const update = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) update[key] = req.body[key];
  }
  const settings = updateSettings(update);
  res.json(settings);
});

// GET /api/trades/orderbook/:tokenId
router.get('/orderbook/:tokenId', async (req, res) => {
  const book = await getOrderBook(req.params.tokenId);
  res.json({ orderbook: book });
});

module.exports = router;

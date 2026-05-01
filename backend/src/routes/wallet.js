const express = require('express');
const router = express.Router();
const { getWalletBalance } = require('../services/executor');

// GET /api/wallet/balance
router.get('/balance', async (req, res) => {
  const balance = await getWalletBalance();
  if (!balance) return res.status(503).json({ error: 'Wallet not configured' });
  res.json(balance);
});

module.exports = router;

const axios = require('axios');
const https = require('https');

const CLOB_BASE = process.env.CLOB_API_URL || 'https://clob.polymarket.com';
const GAMMA_BASE = process.env.GAMMA_API_URL || 'https://gamma-api.polymarket.com';

const agent = new https.Agent({  
  rejectUnauthorized: false
});

const clobClient = axios.create({
  baseURL: CLOB_BASE,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
  httpsAgent: agent
});

const gammaClient = axios.create({
  baseURL: GAMMA_BASE,
  timeout: 10000,
  httpsAgent: agent
});

/**
 * Get all open positions for a wallet address
 */
async function getTraderPositions(address) {
  try {
    const res = await axios.get(`https://data-api.polymarket.com/positions`, {
      params: { 
        user: address, 
        sizeThreshold: '0.1',
        sortBy: 'CURRENT',
        sortDirection: 'DESC',
        limit: 50,
        offset: 0
      },
      httpsAgent: agent
    });
    // Map data-api fields to what poller expects
    return (res.data || []).map(p => ({
      ...p,
      asset_id: p.asset || p.conditionId,
    }));
  } catch (err) {
    const msg = err.response?.data?.error || err.message;
    console.error(`[DATA-API] getTraderPositions error (${address}):`, msg);
    return [];
  }
}

/**
 * Get trade history for a wallet address
 */
async function getTraderHistory(address, limit = 50) {
  try {
    const res = await clobClient.get(`/trades`, {
      params: { maker_address: address, limit }
    });
    return res.data?.data || [];
  } catch (err) {
    console.error(`[CLOB] getTraderHistory error:`, err.message);
    return [];
  }
}

/**
 * Get market info by condition ID
 */
async function getMarket(conditionId) {
  try {
    const res = await gammaClient.get(`/markets/${conditionId}`);
    return res.data;
  } catch (err) {
    console.error(`[CLOB] getMarket error:`, err.message);
    return null;
  }
}

/**
 * Get current orderbook for a token
 */
async function getOrderBook(tokenId) {
  try {
    const res = await clobClient.get(`/book`, {
      params: { token_id: tokenId }
    });
    return res.data;
  } catch (err) {
    console.error(`[CLOB] getOrderBook error:`, err.message);
    return null;
  }
}

/**
 * Get best ask price for a token
 */
async function getBestPrice(tokenId, side = 'BUY') {
  try {
    const res = await clobClient.get(`/price`, {
      params: { token_id: tokenId, side }
    });
    return parseFloat(res.data?.price || 0);
  } catch (err) {
    console.error(`[CLOB] getBestPrice error:`, err.message);
    return null;
  }
}

/**
 * Get trader PnL summary from gamma
 */
async function getTraderPnL(address) {
  try {
    const res = await gammaClient.get(`/portfolio`, {
      params: { user: address }
    });
    return res.data;
  } catch (err) {
    console.error(`[CLOB] getTraderPnL error:`, err.message);
    return null;
  }
}

/**
 * Search markets
 */
async function searchMarkets(query) {
  try {
    const res = await gammaClient.get(`/markets`, {
      params: { query, active: true, limit: 20 }
    });
    return res.data?.data || [];
  } catch (err) {
    console.error(`[CLOB] searchMarkets error:`, err.message);
    return [];
  }
}

module.exports = {
  getTraderPositions,
  getTraderHistory,
  getMarket,
  getOrderBook,
  getBestPrice,
  getTraderPnL,
  searchMarkets,
};

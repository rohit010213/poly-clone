import axios from 'axios';

const API = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
  timeout: 15000,
});

// ---- Traders ----
export const addTrader = (address, label) =>
  API.post('/api/traders', { address, label }).then(r => r.data);

export const removeTrader = (address) =>
  API.delete(`/api/traders/${address}`).then(r => r.data);

export const getTrackedTraders = () =>
  API.get('/api/traders').then(r => r.data.traders);

// ---- Traders (Direct Data API Access to bypass ISP blocks) ----
const DATA_API_URL = 'https://data-api.polymarket.com';

export const getTraderPositions = (address) =>
  axios.get(`${DATA_API_URL}/positions`, { 
    params: { user: address, sizeThreshold: '0.1', sortBy: 'CURRENT', sortDirection: 'DESC' } 
  }).then(r => r.data || []);

export const getTraderHistory = (address, limit = 50) =>
  axios.get(`${DATA_API_URL}/trades`, { params: { user: address, limit } }).then(r => r.data || []);

export const getTraderPnL = (address) =>
  axios.get(`${DATA_API_URL}/profile`, { params: { user: address } }).then(r => {
    const d = r.data;
    if (!d) return null;
    return {
      pnl: d.pnl || 0,
      volume: d.volume || 0,
      rank: d.rank || 0,
      userName: d.name || address.slice(0, 8)
    };
  }).catch(() => null);

export const getTraderPerformance = (address) =>
  axios.get(`${DATA_API_URL}/performance`, { params: { user: address } })
    .then(r => r.data || [])
    .catch(() => []); // Fallback to empty if 404 or blocked

export const updateTraderSettings = (address, settings) =>
  API.put(`/api/traders/${address}/settings`, settings).then(r => r.data.trader);

// ---- Trades ----
export const manualCopyTrade = ({ tokenId, outcome, market, traderAddress, usdcAmount }) =>
  API.post('/api/trades/copy', { tokenId, outcome, market, traderAddress, usdcAmount }).then(r => r.data);

export const closePosition = ({ tokenId, outcome, market, usdcAmount }) =>
  API.post('/api/trades/close', { tokenId, outcome, market, usdcAmount }).then(r => r.data);

export const getCopyTradeLog = (limit = 50) =>
  API.get('/api/trades/log', { params: { limit } }).then(r => r.data.trades);

export const getSettings = () =>
  API.get('/api/trades/settings').then(r => r.data);

export const updateSettings = (settings) =>
  API.put('/api/trades/settings', settings).then(r => r.data);

// ---- Wallet ----
export const getWalletBalance = () =>
  API.get('/api/wallet/balance').then(r => r.data);

export default API;

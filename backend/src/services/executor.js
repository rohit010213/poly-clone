// executor.js — Uses official @polymarket/clob-client-v2 SDK
// npm install @polymarket/clob-client-v2 viem

const { ethers } = require('ethers');
const axios = require('axios');

const CLOB_BASE = process.env.CLOB_API_URL || 'https://clob.polymarket.com';
const PUSD_ADDRESS = '0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB';
const CTF_CONTRACT = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';

let provider, ethersWallet, clobClient;

// SDK refs (ESM — dynamic import)
let ClobClient, Side, OrderType, Chain;
let createWalletClient, http, privateKeyToAccount;

// ─────────────────────────────────────────
// LOAD ESM SDK
// ─────────────────────────────────────────

async function loadSDK() {
  if (ClobClient) return;
  const sdk = await import('@polymarket/clob-client-v2');
  ClobClient = sdk.ClobClient;
  Side = sdk.Side;
  OrderType = sdk.OrderType;
  Chain = sdk.Chain;

  const viem = await import('viem');
  const accs = await import('viem/accounts');
  createWalletClient = viem.createWalletClient;
  http = viem.http;
  privateKeyToAccount = accs.privateKeyToAccount;
}

// ─────────────────────────────────────────
// WALLET + SDK INIT
// ─────────────────────────────────────────

async function initWallet() {
  if (!process.env.PRIVATE_KEY) {
    console.warn('[EXECUTOR] No PRIVATE_KEY — auto-execute disabled');
    return false;
  }

  await loadSDK();

  provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC || 'https://polygon-rpc.com', 137);
  ethersWallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  console.log(`[EXECUTOR] Wallet: ${ethersWallet.address}`);

  const pk = process.env.PRIVATE_KEY.startsWith('0x') ? process.env.PRIVATE_KEY : '0x' + process.env.PRIVATE_KEY;
  const account = privateKeyToAccount(pk);
  const signer = createWalletClient({ account, transport: http() });

  const sdkConfig = {
    host: CLOB_BASE,
    chain: Chain.POLYGON,
    signer,
    signatureType: parseInt(process.env.POLY_SIGNATURE_TYPE || '0'),
  };

  if (process.env.POLY_FUNDER_ADDRESS) {
    sdkConfig.funderAddress = process.env.POLY_FUNDER_ADDRESS;
  }

  const apiKey = process.env.POLY_API_KEY;
  const secret = process.env.POLY_API_SECRET;
  const pass = process.env.POLY_API_PASSPHRASE;

  if (apiKey && secret && pass) {
    sdkConfig.creds = { key: apiKey, secret, passphrase: pass };
    console.log('[EXECUTOR] API credentials loaded ✓');
  } else {
    console.warn('[EXECUTOR] No API creds — run generateApiKey() once first');
  }

  clobClient = new ClobClient(sdkConfig);
  console.log('[EXECUTOR] ClobClient ready');
  return true;
}

// ─────────────────────────────────────────
// GENERATE / DERIVE API KEY
// ─────────────────────────────────────────

async function generateApiKey() {
  if (!clobClient) throw new Error('ClobClient not initialized');
  const creds = await clobClient.createOrDeriveApiKey();
  console.log('\n===== SAVE THESE IN YOUR .env =====');
  console.log('POLY_API_KEY=' + creds.key);
  console.log('POLY_API_SECRET=' + creds.secret);
  console.log('POLY_API_PASSPHRASE=' + creds.passphrase);
  console.log('====================================\n');
  return creds;
}

async function deriveApiKey() { return generateApiKey(); }

// ─────────────────────────────────────────
// TICK SIZE
// ─────────────────────────────────────────

async function getTickSize(tokenId) {
  try {
    const res = await axios.get(`${CLOB_BASE}/tick-size?token_id=${tokenId}`, { timeout: 8000 });
    return res.data?.minimum_tick_size || '0.01';
  } catch {
    return '0.01';
  }
}

// ─────────────────────────────────────────
// BEST PRICE FROM ORDERBOOK
// ─────────────────────────────────────────

async function getBestPrice(tokenId, side = 'BUY') {
  try {
    const res = await axios.get(`${CLOB_BASE}/book?token_id=${tokenId}`, { timeout: 8000 });
    const book = res.data;
    if (side === 'BUY') {
      const asks = book.asks || [];
      return asks.length ? parseFloat(asks[0].price) : null;
    }
    const bids = book.bids || [];
    return bids.length ? parseFloat(bids[0].price) : null;
  } catch (err) {
    console.error('[EXECUTOR] getBestPrice error:', err.message);
    return null;
  }
}

// ─────────────────────────────────────────
// MAIN COPY TRADE
// ─────────────────────────────────────────

async function executeCopyTrade({ tokenId, side, price, usdcAmount, shares: manualShares, negRisk = false }) {
  if (!clobClient) return { success: false, error: 'ClobClient not initialized' };

  const maxSize = parseFloat(process.env.MAX_AUTO_TRADE_USDC || 100);
  const safeUsdc = side === 0 ? Math.min(usdcAmount, maxSize) : usdcAmount;
  const size = manualShares || parseFloat((safeUsdc / price).toFixed(2));
  const sdkSide = side === 0 ? Side.BUY : Side.SELL;

  console.log(`[EXECUTOR] ${sdkSide} tokenId=${tokenId.slice(0, 20)}... price=${price} size=${size} usdc=${safeUsdc}`);

  try {
    const tickSize = await getTickSize(tokenId);
    console.log(`[EXECUTOR] tickSize=${tickSize}`);

    const resp = await clobClient.createAndPostOrder(
      { tokenID: tokenId, price, size, side: sdkSide, negRisk },
      { tickSize, negRisk },
      OrderType.GTC
    );

    console.log(`[EXECUTOR] ✅ Order submitted:`, JSON.stringify(resp));
    return { success: true, data: resp };
  } catch (err) {
    const msg = err?.message || String(err);
    console.error('[EXECUTOR] ❌ Failed:', msg);
    return { success: false, error: msg };
  }
}

// ─────────────────────────────────────────
// CANCEL
// ─────────────────────────────────────────

async function cancelOrder(orderId) {
  try { return { success: true, data: await clobClient.cancelOrder({ orderID: orderId }) }; }
  catch (err) { return { success: false, error: err.message }; }
}

async function cancelAllOrders() {
  try { return { success: true, data: await clobClient.cancelAll() }; }
  catch (err) { return { success: false, error: err.message }; }
}

async function getOpenOrders(tokenId = null) {
  try {
    const params = tokenId ? { asset_id: tokenId } : {};
    return { success: true, orders: await clobClient.getOrders(params) };
  } catch (err) { return { success: false, error: err.message }; }
}

// ─────────────────────────────────────────
// GEOBLOCK CHECK
// ─────────────────────────────────────────

async function checkGeoblock() {
  try {
    const res = await axios.get('https://polymarket.com/api/geoblock', { timeout: 8000 });
    const { blocked, ip, country } = res.data;
    console.log(`[GEOBLOCK] IP: ${ip} | Country: ${country} | Blocked: ${blocked}`);
    return res.data;
  } catch (err) {
    console.error('[GEOBLOCK] Check failed:', err.message);
    return null;
  }
}

// ─────────────────────────────────────────
// BALANCE
// ─────────────────────────────────────────

async function getWalletBalance() {
  if (!ethersWallet) return null;
  try {
    const pusd = new ethers.Contract(PUSD_ADDRESS, ['function balanceOf(address) view returns (uint256)'], provider);
    const bal = await pusd.balanceOf(ethersWallet.address);
    return { address: ethersWallet.address, pusd: (Number(bal) / 1e6).toFixed(2) };
  } catch { return { address: ethersWallet?.address, pusd: '0.00' }; }
}

async function getContractBalance(tokenId) {
  if (!ethersWallet) return 0;
  try {
    const ctf = new ethers.Contract(CTF_CONTRACT, ['function balanceOf(address, uint256) view returns (uint256)'], provider);
    return Number(await ctf.balanceOf(ethersWallet.address, BigInt(tokenId))) / 1e6;
  } catch { return 0; }
}

// ─────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────

initWallet()
  .then(async () => {
    const geo = await checkGeoblock();
    if (geo?.blocked) console.error('[GEOBLOCK] ⚠️ BLOCKED — change Railway region to US!');
    else if (geo) console.log('[GEOBLOCK] ✅ Not blocked — trading enabled');
  })
  .catch(err => console.error('[EXECUTOR] Boot error:', err.message));

module.exports = {
  initWallet, executeCopyTrade, getWalletBalance, getContractBalance,
  getBestPrice, cancelOrder, cancelAllOrders, getOpenOrders,
  generateApiKey, deriveApiKey, checkGeoblock,
};
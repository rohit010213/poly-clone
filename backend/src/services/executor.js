// executor.js — Polymarket CLOB V2 (fully corrected)
const { ethers } = require('ethers');
const axios = require('axios');
const crypto = require('crypto');

const CLOB_BASE = process.env.CLOB_API_URL || 'https://clob.polymarket.com';

// ─── V2 CONTRACT ADDRESSES ────────────────────────────────────────────────────
const CTF_EXCHANGE_V2 = ethers.getAddress('0xE111180000d2663C0091e4f400237545B87B996B');
const CTF_NEG_RISK_EXCHANGE_V2 = ethers.getAddress('0xe2222d279d744050d28e00520010520000310F59');
const CTF_CONTRACT = ethers.getAddress('0x4D97DCd97eC945f40cF65F87097ACe5EA0476045');
const PUSD_ADDRESS = ethers.getAddress('0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB');

const ZERO_BYTES32 = ethers.ZeroHash;

let provider, wallet;

// ─────────────────────────────────────────
// INIT
// ─────────────────────────────────────────

function initWallet() {
  if (!process.env.PRIVATE_KEY) {
    console.warn('[EXECUTOR] No PRIVATE_KEY set — auto-execute disabled');
    return false;
  }
  provider = new ethers.JsonRpcProvider(
    process.env.POLYGON_RPC || 'https://polygon-rpc.com',
    137
  );
  wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  console.log(`[EXECUTOR] Wallet loaded: ${wallet.address}`);
  return true;
}

// ─────────────────────────────────────────
// L2 AUTH HEADERS — HMAC-SHA256
// ✅ Headers use underscore (POLY_ADDRESS, not POLY-ADDRESS)
// ✅ Secret is base64 decoded before use as HMAC key
// ─────────────────────────────────────────

async function buildClobAuthHeaders(method, path, body = '') {
  const apiKey = process.env.POLY_API_KEY;
  const secret = process.env.POLY_API_SECRET;
  const passphrase = process.env.POLY_API_PASSPHRASE;

  if (!apiKey || !secret || !passphrase) {
    throw new Error('[EXECUTOR] Missing POLY_API_KEY / POLY_API_SECRET / POLY_API_PASSPHRASE in .env');
  }
  if (!wallet) throw new Error('[EXECUTOR] Wallet not initialized');

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const message = timestamp + method.toUpperCase() + path + (body || '');

  // ✅ base64 decode the secret — this is the correct key format
  const signature = crypto
    .createHmac('sha256', Buffer.from(secret, 'base64'))
    .update(message)
    .digest('base64');

  return {
    'Content-Type': 'application/json',
    'POLY_ADDRESS': wallet.address,   // ✅ underscore, not hyphen
    'POLY_SIGNATURE': signature,
    'POLY_TIMESTAMP': timestamp,
    'POLY_API_KEY': apiKey,
    'POLY_PASSPHRASE': passphrase,
  };
}

// ─────────────────────────────────────────
// ONE-TIME: GENERATE API KEY (EIP-712 L1)
// ─────────────────────────────────────────

async function generateApiKey() {
  if (!wallet) throw new Error('Wallet not initialized');

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = 0;

  const domain = { name: 'ClobAuthDomain', version: '1', chainId: 137 };
  const types = {
    ClobAuth: [
      { name: 'address', type: 'address' },
      { name: 'timestamp', type: 'string' },
      { name: 'nonce', type: 'uint256' },
      { name: 'message', type: 'string' },
    ],
  };
  const value = {
    address: wallet.address,
    timestamp,
    nonce,
    message: 'This message attests that I control the given wallet',
  };

  const signature = await wallet.signTypedData(domain, types, value);

  try {
    const res = await axios.post(
      `${CLOB_BASE}/auth/api-key`,
      {},
      {
        headers: {
          'Content-Type': 'application/json',
          'POLY_ADDRESS': wallet.address,
          'POLY_SIGNATURE': signature,
          'POLY_TIMESTAMP': timestamp,
          'POLY_NONCE': nonce.toString(),
        },
      }
    );

    console.log('\n===== SAVE THESE IN YOUR .env =====');
    console.log('POLY_API_KEY=' + res.data.apiKey);
    console.log('POLY_API_SECRET=' + res.data.secret);
    console.log('POLY_API_PASSPHRASE=' + res.data.passphrase);
    console.log('====================================\n');

    return res.data;
  } catch (err) {
    const msg = err.response?.data?.error || err.message;
    console.error('[EXECUTOR] generateApiKey failed:', msg);
    throw new Error(msg);
  }
}

// ─────────────────────────────────────────
// DERIVE EXISTING API KEY
// ─────────────────────────────────────────

async function deriveApiKey() {
  if (!wallet) throw new Error('Wallet not initialized');

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = 0;

  const domain = { name: 'ClobAuthDomain', version: '1', chainId: 137 };
  const types = {
    ClobAuth: [
      { name: 'address', type: 'address' },
      { name: 'timestamp', type: 'string' },
      { name: 'nonce', type: 'uint256' },
      { name: 'message', type: 'string' },
    ],
  };
  const value = {
    address: wallet.address,
    timestamp,
    nonce,
    message: 'This message attests that I control the given wallet',
  };

  const signature = await wallet.signTypedData(domain, types, value);

  try {
    const res = await axios.get(`${CLOB_BASE}/auth/derive-api-key`, {
      headers: {
        'Content-Type': 'application/json',
        'POLY_ADDRESS': wallet.address,
        'POLY_SIGNATURE': signature,
        'POLY_TIMESTAMP': timestamp,
        'POLY_NONCE': nonce.toString(),
      },
    });

    console.log('\n===== DERIVED CREDENTIALS =====');
    console.log('POLY_API_KEY=' + res.data.apiKey);
    console.log('POLY_API_SECRET=' + res.data.secret);
    console.log('POLY_API_PASSPHRASE=' + res.data.passphrase);
    console.log('================================\n');

    return res.data;
  } catch (err) {
    const msg = err.response?.data?.error || err.message;
    console.error('[EXECUTOR] deriveApiKey failed:', msg);
    throw new Error(msg);
  }
}

// ─────────────────────────────────────────
// BUILD SIGNED EIP-712 ORDER — V2
// ─────────────────────────────────────────

async function buildSignedOrder({
  tokenId,
  side,           // 0 = BUY, 1 = SELL (internal)
  price,
  usdcAmount,
  shares: manualShares,
  negRisk = false,
}) {
  if (!wallet) throw new Error('Wallet not initialized');

  const shares = manualShares || Math.floor(usdcAmount / price);
  const salt = Math.floor(Math.random() * 1e12);
  const timestamp = BigInt(Date.now()); // ✅ milliseconds in V2

  const verifyingContract = negRisk ? CTF_NEG_RISK_EXCHANGE_V2 : CTF_EXCHANGE_V2;

  const domain = {
    name: 'Polymarket CTF Exchange', // ✅ V2 name
    version: '2',                       // ✅ V2 version
    chainId: 137,
    verifyingContract,
  };

  // ✅ V2 struct — taker / expiration / nonce / feeRateBps removed
  const types = {
    Order: [
      { name: 'salt', type: 'uint256' },
      { name: 'maker', type: 'address' },
      { name: 'signer', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
      { name: 'makerAmount', type: 'uint256' },
      { name: 'takerAmount', type: 'uint256' },
      { name: 'side', type: 'uint8' },
      { name: 'signatureType', type: 'uint8' },
      { name: 'timestamp', type: 'uint256' },
      { name: 'metadata', type: 'bytes32' },
      { name: 'builder', type: 'bytes32' },
    ],
  };

  // BUY  (0): maker puts up USDC, taker gives shares
  // SELL (1): maker puts up shares, taker gives USDC
  const makerAmount = side === 0
    ? BigInt(Math.floor(usdcAmount * 1e6))
    : BigInt(Math.floor(shares * 1e6));

  const takerAmount = side === 0
    ? BigInt(Math.floor(shares * 1e6))
    : BigInt(Math.floor(usdcAmount * 1e6));

  const orderData = {
    salt: BigInt(salt),
    maker: wallet.address,
    signer: wallet.address,
    tokenId: BigInt(tokenId),
    makerAmount,
    takerAmount,
    side,              // uint8 for EIP-712 signing
    signatureType: 0,  // 0 = EOA
    timestamp,
    metadata: ZERO_BYTES32,
    builder: ZERO_BYTES32,
  };

  const signature = await wallet.signTypedData(domain, types, orderData);

  // ✅ Wire body: side is STRING "BUY"/"SELL" — NOT uint8
  // ✅ order is wrapped inside { order: {...}, orderType: "GTC" }
  const orderBody = {
    salt: salt.toString(),
    maker: wallet.address,
    signer: wallet.address,
    tokenId: tokenId.toString(),
    makerAmount: makerAmount.toString(),
    takerAmount: takerAmount.toString(),
    side: side === 0 ? 'BUY' : 'SELL', // ✅ string, not int
    signatureType: 0,
    timestamp: timestamp.toString(),
    metadata: ZERO_BYTES32,
    builder: ZERO_BYTES32,
    signature,
  };

  return orderBody;
}

// ─────────────────────────────────────────
// SUBMIT ORDER
// ✅ V2: body = { order: {...}, orderType: "GTC" }
// ─────────────────────────────────────────

async function submitOrder(signedOrder, orderType = 'GTC') {
  const path = '/order';
  // ✅ wrap order properly
  const payload = { order: signedOrder, orderType };
  const body = JSON.stringify(payload);

  try {
    const headers = await buildClobAuthHeaders('POST', path, body);
    const res = await axios.post(`${CLOB_BASE}${path}`, body, { headers });
    return { success: true, data: res.data };
  } catch (err) {
    const msg = err.response?.data?.error || err.message;
    console.error('[EXECUTOR] submitOrder failed:', msg);
    return { success: false, error: msg };
  }
}

// ─────────────────────────────────────────
// CANCEL SINGLE ORDER
// ─────────────────────────────────────────

async function cancelOrder(orderId) {
  const path = `/order/${orderId}`;
  try {
    const headers = await buildClobAuthHeaders('DELETE', path);
    const res = await axios.delete(`${CLOB_BASE}${path}`, { headers });
    return { success: true, data: res.data };
  } catch (err) {
    const msg = err.response?.data?.error || err.message;
    console.error('[EXECUTOR] cancelOrder failed:', msg);
    return { success: false, error: msg };
  }
}

// ─────────────────────────────────────────
// CANCEL ALL ORDERS
// ─────────────────────────────────────────

async function cancelAllOrders() {
  const path = '/orders';
  try {
    const headers = await buildClobAuthHeaders('DELETE', path);
    const res = await axios.delete(`${CLOB_BASE}${path}`, { headers });
    return { success: true, data: res.data };
  } catch (err) {
    const msg = err.response?.data?.error || err.message;
    console.error('[EXECUTOR] cancelAllOrders failed:', msg);
    return { success: false, error: msg };
  }
}

// ─────────────────────────────────────────
// GET OPEN ORDERS
// ─────────────────────────────────────────

async function getOpenOrders(tokenId = null) {
  const path = tokenId ? `/orders?token_id=${tokenId}` : '/orders';
  try {
    const headers = await buildClobAuthHeaders('GET', path);
    const res = await axios.get(`${CLOB_BASE}${path}`, { headers });
    return { success: true, orders: res.data };
  } catch (err) {
    const msg = err.response?.data?.error || err.message;
    console.error('[EXECUTOR] getOpenOrders failed:', msg);
    return { success: false, error: msg };
  }
}

// ─────────────────────────────────────────
// GET BEST PRICE FROM ORDERBOOK
// ✅ V2 uses token_id (underscore), not tokenID
// ─────────────────────────────────────────

async function getBestPrice(tokenId, side = 'BUY') {
  try {
    // ✅ correct param name: token_id
    const res = await axios.get(`${CLOB_BASE}/book?token_id=${tokenId}`);
    const book = res.data;

    if (side === 'BUY') {
      const asks = book.asks || [];
      if (!asks.length) return null;
      return parseFloat(asks[0].price);
    } else {
      const bids = book.bids || [];
      if (!bids.length) return null;
      return parseFloat(bids[0].price);
    }
  } catch (err) {
    console.error('[CLOB] getBestPrice error:', err.response?.status, err.message);
    return null;
  }
}

// ─────────────────────────────────────────
// MAIN COPY TRADE EXECUTOR
// ─────────────────────────────────────────

async function executeCopyTrade({
  tokenId,
  side,
  price,
  usdcAmount,
  shares: manualShares,
  negRisk = false,
}) {
  if (!wallet) {
    return { success: false, error: 'Wallet not configured. Set PRIVATE_KEY in .env' };
  }

  const shares = manualShares || Math.floor(usdcAmount / price);
  const finalUsdc = manualShares ? manualShares * price : usdcAmount;
  const maxSize = parseFloat(process.env.MAX_AUTO_TRADE_USDC || 100);
  const safeUsdc = side === 0 ? Math.min(finalUsdc, maxSize) : finalUsdc;

  console.log(
    `[EXECUTOR] Executing: tokenId=${tokenId} ` +
    `side=${side === 0 ? 'BUY' : 'SELL'} ` +
    `price=${price} shares=${shares} usdc=${safeUsdc} negRisk=${negRisk}`
  );

  try {
    const signedOrder = await buildSignedOrder({
      tokenId,
      side,
      price,
      usdcAmount: safeUsdc,
      shares: manualShares,
      negRisk,
    });

    const result = await submitOrder(signedOrder, 'GTC');

    if (result.success) {
      console.log(`[EXECUTOR] ✅ Order submitted:`, result.data);
    } else {
      console.error(`[EXECUTOR] ❌ Order failed:`, result.error);
    }

    return result;
  } catch (err) {
    console.error('[EXECUTOR] executeCopyTrade error:', err.message);
    return { success: false, error: err.message };
  }
}

// ─────────────────────────────────────────
// WALLET pUSD BALANCE
// ─────────────────────────────────────────

async function getWalletBalance() {
  if (!wallet) return null;
  try {
    const abi = ['function balanceOf(address) view returns (uint256)'];
    const pusd = new ethers.Contract(PUSD_ADDRESS, abi, provider);
    const bal = await pusd.balanceOf(wallet.address);
    return {
      address: wallet.address,
      pusd: (Number(bal) / 1e6).toFixed(2),
    };
  } catch (err) {
    console.error('[EXECUTOR] getWalletBalance error:', err.message);
    return { address: wallet.address, pusd: '0.00' };
  }
}

// ─────────────────────────────────────────
// SHARE BALANCE FOR A TOKEN
// ─────────────────────────────────────────

async function getContractBalance(tokenId) {
  if (!wallet) return 0;
  try {
    const abi = ['function balanceOf(address, uint256) view returns (uint256)'];
    const ctf = new ethers.Contract(CTF_CONTRACT, abi, provider);
    const bal = await ctf.balanceOf(wallet.address, BigInt(tokenId));
    return Number(bal) / 1e6;
  } catch (err) {
    console.error('[EXECUTOR] getContractBalance error:', err.message);
    return 0;
  }
}

// ─────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────

initWallet();

module.exports = {
  executeCopyTrade,
  getWalletBalance,
  getContractBalance,
  getBestPrice,
  cancelOrder,
  cancelAllOrders,
  getOpenOrders,
  generateApiKey,
  deriveApiKey,
  initWallet,
};
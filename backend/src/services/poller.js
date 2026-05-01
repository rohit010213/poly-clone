const cron = require('node-cron');
const { getTrackedTraders, savePositionSnapshot, diffPositions, logCopyTrade, getSettings } = require('./store');
const { getTraderPositions, getMarket, getBestPrice } = require('./polymarket');
const { executeCopyTrade } = require('./executor');
const { broadcast } = require('./websocket');

let isPolling = false;

async function pollTrader(trader, wss) {
  try {
    const positions = await getTraderPositions(trader.address);
    const { newPositions, closedPositions, changedPositions } = diffPositions(trader.address, positions);

    // Broadcast live position update
    broadcast(wss, {
      type: 'POSITIONS_UPDATE',
      address: trader.address,
      positions,
      newPositions,
      closedPositions,
      changedPositions,
    });

    const settings = getSettings();

    // Auto-copy new positions
    if (trader.copySettings?.enabled && newPositions.length > 0) {
      for (const pos of newPositions) {
        await autoCopyPosition(pos, trader, wss);
      }
    }

    // Auto-copy partial closes (sell proportionally)
    if (trader.copySettings?.enabled && settings.copyPartialClose && changedPositions.length > 0) {
      for (const { prev, curr } of changedPositions) {
        const prevSize = parseFloat(prev.size);
        const currSize = parseFloat(curr.size);
        if (currSize < prevSize) {
          // Trader reduced position — we sell the same proportion
          await autoCopyPartialClose(curr, prev, trader, wss);
        }
      }
    }

    // Auto-copy full closes (sell everything)
    if (trader.copySettings?.enabled && closedPositions.length > 0) {
      for (const pos of closedPositions) {
        await autoCopyFullClose(pos, trader, wss);
      }
    }

    savePositionSnapshot(trader.address, positions);
  } catch (err) {
    console.error(`[POLLER] Error polling ${trader.address}:`, err.message);
  }
}

async function autoCopyPosition(position, trader, wss) {
  const settings = trader.copySettings || {};
  if (!settings.enabled) return;

  const tokenId = position.asset_id;
  const outcomeIndex = position.outcome === 'Yes' ? 0 : 1;

  const price = await getBestPrice(tokenId, 'BUY');
  if (!price) return;

  const globalSettings = getSettings();
  const minPrice = parseFloat(process.env.MIN_PRICE || '0.01');
  const maxPrice = parseFloat(process.env.MAX_PRICE || '0.99');

  if (price < minPrice || price > maxPrice) {
    console.log(`[AUTO-COPY] Skipping — price ${price} outside range [${minPrice}, ${maxPrice}]`);
    return;
  }

  const traderTradeUsdc = parseFloat(position.size) * price;

  let usdcAmount = 0;
  if (settings.mode === 'percentage') {
    const { getWalletBalance } = require('./executor');
    const bal = await getWalletBalance();
    const myBal = parseFloat(bal?.usdc || 0);
    usdcAmount = myBal * (parseFloat(settings.value) / 100);
  } else {
    usdcAmount = parseFloat(settings.value);
  }

  if (usdcAmount <= 0) {
    console.log(`[AUTO-COPY] Skipped: calculated trade amount is <= 0`);
    return;
  }

  console.log(`[AUTO-COPY] New position detected from ${trader.address}: ${position.title || tokenId}`);

  const result = await executeCopyTrade({
    tokenId,
    side: 0, // BUY
    price,
    usdcAmount,
  });

  const logEntry = {
    type: 'auto',
    traderAddress: trader.address,
    market: position.title || 'Unknown Market',
    tokenId,
    outcome: position.outcome,
    price,
    usdcAmount,
    side: 'BUY',
    success: result.success,
    error: result.error || null,
    orderId: result.data?.orderID || null,
  };

  logCopyTrade(logEntry);
  broadcast(wss, { type: 'COPY_TRADE_EXECUTED', ...logEntry });

  console.log(`[AUTO-COPY] ${result.success ? '✅ Success' : '❌ Failed'}: ${JSON.stringify(result)}`);
}

async function autoCopyPartialClose(curr, prev, trader, wss) {
  const settings = trader.copySettings || {};
  const prevSize = parseFloat(prev.size);
  const currSize = parseFloat(curr.size);
  const closedRatio = (prevSize - currSize) / prevSize;

  const tokenId = curr.asset_id;
  const price = await getBestPrice(tokenId, 'SELL');
  if (!price) return;

  // Rough estimation: we use the configured value as the proxy for max size
  // Ideally, we'd look up our own actual position size from Polymarket.
  let baseUsdc = 0;
  if (settings.mode === 'percentage') {
    const { getWalletBalance } = require('./executor');
    const bal = await getWalletBalance();
    baseUsdc = parseFloat(bal?.usdc || 0) * (parseFloat(settings.value) / 100);
  } else {
    baseUsdc = parseFloat(settings.value);
  }

  const usdcToSell = baseUsdc * closedRatio;

  if (usdcToSell <= 0) return;

  console.log(`[AUTO-COPY] Partial close detected: ${closedRatio.toFixed(2)} ratio`);

  const result = await executeCopyTrade({
    tokenId,
    side: 1, // SELL
    price,
    usdcAmount: usdcToSell,
  });

  const logEntry = {
    type: 'auto-partial-close',
    traderAddress: trader.address,
    market: curr.title || 'Unknown Market',
    tokenId,
    outcome: curr.outcome,
    price,
    usdcAmount: usdcToSell,
    side: 'SELL',
    closedRatio,
    success: result.success,
    error: result.error || null,
  };

  logCopyTrade(logEntry);
  broadcast(wss, { type: 'COPY_TRADE_EXECUTED', ...logEntry });
}

async function autoCopyFullClose(pos, trader, wss) {
  const settings = trader.copySettings || {};
  const tokenId = pos.asset_id || pos.conditionId;
  const price = await getBestPrice(tokenId, 'SELL');
  if (!price) return;

  console.log(`[AUTO-COPY] Full close detected for ${pos.title || tokenId}`);

  // Fetch our actual balance for this token to sell everything
  const { getContractBalance } = require('./executor');
  const myShares = await getContractBalance(tokenId);
  
  if (parseFloat(myShares) <= 0) {
    console.log(`[AUTO-COPY] No shares to sell for ${tokenId}`);
    return;
  }

  const result = await executeCopyTrade({
    tokenId,
    side: 1, // SELL
    price,
    usdcAmount: 0,
    shares: myShares,
  });

  const logEntry = {
    type: 'auto-full-close',
    traderAddress: trader.address,
    market: pos.title || 'Unknown Market',
    tokenId,
    side: 'SELL',
    success: result.success,
    error: result.error || null,
  };

  logCopyTrade(logEntry);
  broadcast(wss, { type: 'COPY_TRADE_EXECUTED', ...logEntry });
}

function startPoller(wss) {
  const intervalSec = parseInt(process.env.POLL_INTERVAL || '30');
  const cronExpr = `*/${intervalSec} * * * * *`;

  // Use node-cron if interval >= 60, else use setInterval for sub-minute
  if (intervalSec >= 60) {
    const mins = Math.floor(intervalSec / 60);
    cron.schedule(`*/${mins} * * * *`, () => runPoll(wss));
  } else {
    setInterval(() => runPoll(wss), intervalSec * 1000);
  }

  console.log(`[POLLER] Started — interval: ${intervalSec}s`);
}

async function runPoll(wss) {
  if (isPolling) return;
  isPolling = true;
  const traders = getTrackedTraders();
  if (traders.length === 0) { isPolling = false; return; }

  console.log(`[POLLER] Polling ${traders.length} trader(s)...`);
  await Promise.allSettled(traders.map(t => pollTrader(t, wss)));
  isPolling = false;
}

module.exports = { startPoller, runPoll };

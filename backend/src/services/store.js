const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) { fs.mkdirSync(DATA_DIR); }

const store = {
  trackedTraders: new Map(),
  lastPositions: new Map(),
  copyTradeLog: [],
  settings: {
    autoCopyEnabled: false,
    maxTradeUSDC: 50,
    minConfidence: 0.55,
    copyPartialClose: true,
    trackedAddresses: [],
  },
};

function save() {
  try {
    const data = {
      trackedTraders: Array.from(store.trackedTraders.entries()),
      copyTradeLog: store.copyTradeLog,
      settings: store.settings,
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('[STORE] Failed to save:', e.message);
  }
}

function load() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      store.trackedTraders = new Map(data.trackedTraders || []);
      store.copyTradeLog = data.copyTradeLog || [];
      store.settings = { ...store.settings, ...(data.settings || {}) };
      console.log(`[STORE] Loaded ${store.trackedTraders.size} traders from disk`);
    }
  } catch (e) {
    console.error('[STORE] Failed to load:', e.message);
  }
}

load();

// ---- Traders ----
function addTrader(address, label = '') {
  store.trackedTraders.set(address.toLowerCase(), {
    address: address.toLowerCase(),
    label: label || address.slice(0, 8),
    addedAt: new Date().toISOString(),
    active: true,
    copySettings: {
      enabled: false,
      mode: 'fixed', // 'fixed' or 'percentage'
      value: 50,     // 50 USDC or 50%
    }
  });
  save();
}

function updateTraderSettings(address, settings) {
  const trader = getTrader(address);
  if (trader) {
    trader.copySettings = { ...trader.copySettings, ...settings };
    save();
  }
  return trader;
}

function removeTrader(address) {
  store.trackedTraders.delete(address.toLowerCase());
  store.lastPositions.delete(address.toLowerCase());
  save();
}

function getTrackedTraders() {
  return Array.from(store.trackedTraders.values());
}

function getTrader(address) {
  return store.trackedTraders.get(address.toLowerCase()) || null;
}

// ---- Position Snapshots ----
function savePositionSnapshot(address, positions) {
  store.lastPositions.set(address.toLowerCase(), {
    positions,
    savedAt: Date.now(),
  });
}

function getPositionSnapshot(address) {
  return store.lastPositions.get(address.toLowerCase()) || null;
}

/**
 * Diff current positions vs last snapshot to detect new/closed trades
 */
function diffPositions(address, currentPositions) {
  const snap = getPositionSnapshot(address);
  if (!snap) return { newPositions: [], closedPositions: [], changedPositions: [] };

  const prevMap = new Map(snap.positions.map(p => [p.asset_id || p.conditionId, p]));
  const currMap = new Map(currentPositions.map(p => [p.asset_id || p.conditionId, p]));

  const newPositions = [];
  const changedPositions = [];
  const closedPositions = [];

  for (const [id, curr] of currMap) {
    if (!prevMap.has(id)) {
      newPositions.push(curr);
    } else {
      const prev = prevMap.get(id);
      if (parseFloat(curr.size) !== parseFloat(prev.size)) {
        changedPositions.push({ prev, curr });
      }
    }
  }

  for (const [id, prev] of prevMap) {
    if (!currMap.has(id)) closedPositions.push(prev);
  }

  return { newPositions, closedPositions, changedPositions };
}

// ---- Copy Trade Log ----
function logCopyTrade(entry) {
  store.copyTradeLog.unshift({
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    ...entry,
  });
  // keep last 500
  if (store.copyTradeLog.length > 500) store.copyTradeLog.length = 500;
  save();
}

function getCopyTradeLog(limit = 50) {
  return store.copyTradeLog.slice(0, limit);
}

// ---- Settings ----
function getSettings() {
  return { ...store.settings };
}

function updateSettings(partial) {
  Object.assign(store.settings, partial);
  save();
  return store.settings;
}

module.exports = {
  addTrader,
  removeTrader,
  getTrackedTraders,
  getTrader,
  savePositionSnapshot,
  getPositionSnapshot,
  diffPositions,
  logCopyTrade,
  getCopyTradeLog,
  getSettings,
  updateSettings,
  updateTraderSettings,
};

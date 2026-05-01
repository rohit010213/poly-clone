'use client';
import { useState, useEffect, useCallback } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { ethers } from 'ethers';
import {
  addTrader, removeTrader, getTrackedTraders,
  getTraderPositions, getTraderHistory, getTraderPnL, getTraderPerformance,
  manualCopyTrade, closePosition, getCopyTradeLog,
  getSettings, updateSettings, getWalletBalance, updateTraderSettings
} from '../lib/api';
import { usePolySocket } from '../hooks/usePolySocket';
import TraderSidebar from '../components/TraderSidebar';
import StatsBar from '../components/StatsBar';
import PositionsTable from '../components/PositionsTable';
import HistoryTable from '../components/HistoryTable';
import AnalyticsPanel from '../components/AnalyticsPanel';
import CopyModal from '../components/CopyModal';
import PnLChart from '../components/PnLChart';
import styles from './page.module.css';

export default function Dashboard() {
  const [walletAddress, setWalletAddress] = useState(null);
  const [walletBalance, setWalletBalance] = useState(null);
  const [traders, setTraders] = useState([]);
  const [activeTrader, setActiveTrader] = useState(null);
  const [positions, setPositions] = useState([]);
  const [history, setHistory] = useState([]);
  const [pnl, setPnl] = useState(null);
  const [performance, setPerformance] = useState([]);
  const [copyLog, setCopyLog] = useState([]);
  const [settings, setSettings] = useState({});
  const [tab, setTab] = useState('open');
  const [copyModalData, setCopyModalData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [liveEvents, setLiveEvents] = useState([]);

  // My PnL States
  const [myPositions, setMyPositions] = useState([]);
  const [myHistory, setMyHistory] = useState([]);
  const [myPnl, setMyPnl] = useState(null);
  const [myPerformance, setMyPerformance] = useState([]);
  const [myPnlFilter, setMyPnlFilter] = useState('30D');

  // WebSocket live updates
  const handleWsMessage = useCallback((msg) => {
    if (msg.type === 'POSITIONS_UPDATE' && msg.address === activeTrader?.address) {
      setPositions(msg.positions || []);
      if (msg.newPositions?.length > 0) {
        toast.success(`🔔 New trade detected from ${activeTrader?.label}!`);
        setLiveEvents(prev => [
          { id: Date.now(), type: 'new', positions: msg.newPositions },
          ...prev.slice(0, 9)
        ]);
      }
    }
    if (msg.type === 'COPY_TRADE_EXECUTED') {
      if (msg.success) {
        toast.success(`✅ Copy trade executed: ${msg.market?.slice(0, 40)}`);
      } else {
        toast.error(`❌ Copy trade failed: ${msg.error}`);
      }
      loadCopyLog();
    }
  }, [activeTrader]);

  usePolySocket(handleWsMessage);

  // Load initial data
  useEffect(() => {
    loadTraders();
    loadSettings();
    loadCopyLog();
  }, []);

  async function connectWallet() {
    if (!window.ethereum) {
      toast.error('MetaMask not found! Please install it.');
      return;
    }
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send('eth_requestAccounts', []);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      setWalletAddress(address);
      toast.success(`Wallet connected: ${address.slice(0, 6)}...${address.slice(-4)}`);
      try {
        const bal = await getWalletBalance();
        setWalletBalance(bal);
        
        // Fetch My Data for Dashboard
        getTraderPositions(address).then(setMyPositions).catch(()=>{});
        getTraderHistory(address, 500).then(setMyHistory).catch(()=>{});
        getTraderPnL(address).then(setMyPnl).catch(()=>{});
        getTraderPerformance(address).then(setMyPerformance).catch(()=>{});
      } catch (e) {}
    } catch (err) {
      toast.error('Wallet connection rejected');
    }
  }

  async function loadTraders() {
    try {
      const list = await getTrackedTraders();
      setTraders(list);
    } catch (e) {}
  }

  async function loadSettings() {
    try {
      const s = await getSettings();
      setSettings(s);
    } catch (e) {}
  }

  async function loadCopyLog() {
    try {
      const log = await getCopyTradeLog(20);
      setCopyLog(log);
    } catch (e) {}
  }

  async function handleAddTrader(address, label) {
    setLoading(true);
    try {
      const result = await addTrader(address, label);
      setTraders(prev => [...prev, result.trader]);
      selectTrader(result.trader, result.positions, result.history, result.pnl);
      toast.success('Trader added!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add trader');
    }
    setLoading(false);
  }

  async function handleRemoveTrader(address) {
    await removeTrader(address);
    setTraders(prev => prev.filter(t => t.address !== address));
    if (activeTrader?.address === address) {
      setActiveTrader(null);
      setPositions([]);
      setHistory([]);
      setPnl(null);
    }
    toast.success('Trader removed');
  }

  async function handleUpdateTraderSettings(address, settings) {
    try {
      const updated = await updateTraderSettings(address, settings);
      setTraders(prev => prev.map(t => t.address === address ? updated : t));
      if (activeTrader?.address === address) {
        setActiveTrader(updated);
      }
      toast.success('Copy settings saved!');
    } catch (err) {
      toast.error('Failed to update settings');
    }
  }

  async function selectTrader(trader, pos, hist, pnlData) {
    setActiveTrader(trader);
    if (!trader) return;

    if (pos) { setPositions(pos); } else {
      const p = await getTraderPositions(trader.address);
      setPositions(p);
    }
    if (hist) { setHistory(hist); } else {
      const h = await getTraderHistory(trader.address);
      setHistory(h);
    }
    if (pnlData !== undefined) { setPnl(pnlData); } else {
      getTraderPnL(trader.address).then(setPnl).catch(()=>{});
    }
    // Fetch performance for chart
    getTraderPerformance(trader.address).then(setPerformance).catch(()=>{});
  }

  async function handleCopyTrade(position, amount) {
    try {
      const result = await manualCopyTrade({
        tokenId: position.asset_id,
        outcome: position.outcome,
        market: position.title,
        traderAddress: activeTrader?.address,
        usdcAmount: amount,
      });
      if (result.success) {
        toast.success('Trade executed on Polymarket!');
      } else {
        toast.error(`Trade failed: ${result.error}`);
      }
      setCopyModalData(null);
      loadCopyLog();
    } catch (err) {
      toast.error('Execution error — check backend logs');
    }
  }

  async function handleClosePosition(position, amount) {
    try {
      const result = await closePosition({
        tokenId: position.asset_id,
        outcome: position.outcome,
        market: position.title,
        usdcAmount: amount,
      });
      if (result.success) toast.success('Position closed!');
      else toast.error(`Close failed: ${result.error}`);
      loadCopyLog();
    } catch (err) {
      toast.error('Close error');
    }
  }

  async function handleSettingsChange(key, value) {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    try {
      await updateSettings({ [key]: value });
    } catch (e) {}
  }

  return (
    <div className={styles.app}>
      <Toaster position="bottom-right" toastOptions={{
        style: { background: '#111122', color: '#e2e8f0', border: '1px solid #2a2a3e', fontFamily: 'Courier New' }
      }} />

      {/* Header */}
      <header className={styles.header}>
        <div>
          <div className={styles.logo}>POLY<span>CLONE</span></div>
          <div className={styles.tagline}>COPY TRADING // PREDICTION MARKETS</div>
        </div>
        <div className={styles.headerRight}>
          {walletBalance && (
            <div className={styles.balancePill}>
              💰 ${walletBalance.usdc} pUSD
            </div>
          )}
          <button className={`${styles.connectBtn} ${walletAddress ? styles.connected : ''}`} onClick={connectWallet}>
            {walletAddress
              ? `[ ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)} ]`
              : '[ CONNECT WALLET ]'}
          </button>
        </div>
      </header>

      <div className={styles.main}>
        {/* Sidebar */}
        <TraderSidebar
          traders={traders}
          activeTrader={activeTrader}
          onAdd={handleAddTrader}
          onRemove={handleRemoveTrader}
          onSelect={(t) => selectTrader(t)}
          onUpdateSettings={handleUpdateTraderSettings}
          loading={loading}
          copyLog={copyLog}
        />

        {/* Content */}
        <div className={styles.content}>
          {!activeTrader ? (
            !walletAddress ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>◈</div>
                <div>CONNECT WALLET TO SEE YOUR POSITIONS</div>
              </div>
            ) : (
              <div style={{ padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h2 style={{ fontSize: '14px', letterSpacing: '1px', color: '#00ff88' }}>MY OPEN POSITIONS</h2>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>Wallet: {walletAddress.slice(0, 8)}...</div>
                </div>
                <PositionsTable 
                  positions={myPositions} 
                  walletConnected={true} 
                  liveEvents={[]} 
                  onCopy={() => {}} 
                  onClose={() => {}} 
                />
              </div>
            )
          ) : (
            <div style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h2 style={{ fontSize: '14px', letterSpacing: '1px' }}>{activeTrader.label.toUpperCase()} - LIVE TRADES</h2>
                <div style={{ fontSize: '11px', color: '#00ff88', background: 'rgba(0,255,136,0.1)', padding: '4px 10px', borderRadius: '4px' }}>
                  {activeTrader.copySettings?.enabled ? 'BOT RUNNING' : 'BOT STOPPED'}
                </div>
              </div>

              {/* Bot Settings (Minimized) */}
              <div style={{ background: '#111122', border: '1px solid #2a2a3e', padding: '15px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '9px', color: '#6b7280', marginBottom: '5px' }}>COPY MODE</div>
                    <select 
                      value={activeTrader.copySettings?.mode} 
                      onChange={e => handleUpdateTraderSettings(activeTrader.address, { mode: e.target.value })}
                      style={{ background: '#0d0d1a', border: '1px solid #2a2a3e', color: '#fff', padding: '5px', fontSize: '12px', width: '100%' }}
                    >
                      <option value="fixed">Fixed Amount ($)</option>
                      <option value="percentage">Percentage (%)</option>
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '9px', color: '#6b7280', marginBottom: '5px' }}>AMOUNT</div>
                    <input 
                      type="number"
                      value={activeTrader.copySettings?.value}
                      onChange={e => handleUpdateTraderSettings(activeTrader.address, { value: parseFloat(e.target.value) })}
                      style={{ background: '#0d0d1a', border: '1px solid #2a2a3e', color: '#fff', padding: '5px', fontSize: '12px', width: '100%' }}
                    />
                  </div>
                  <button 
                    onClick={() => handleUpdateTraderSettings(activeTrader.address, { enabled: !activeTrader.copySettings?.enabled })}
                    style={{ 
                      padding: '10px 20px', 
                      background: activeTrader.copySettings?.enabled ? '#ff4466' : '#00ff88', 
                      color: '#000', 
                      fontWeight: 'bold',
                      border: 'none',
                      cursor: 'pointer',
                      marginTop: '15px'
                    }}
                  >
                    {activeTrader.copySettings?.enabled ? 'STOP BOT' : 'START BOT'}
                  </button>
                </div>
              </div>

              <PositionsTable
                positions={positions}
                walletConnected={!!walletAddress}
                onCopy={(pos) => setCopyModalData(pos)}
                onClose={() => {}}
                liveEvents={liveEvents}
              />
            </div>
          )}
        </div>
      </div>

      {/* Copy Trade Modal */}
      {copyModalData && (
        <CopyModal
          position={copyModalData}
          settings={settings}
          walletConnected={!!walletAddress}
          onExecute={handleCopyTrade}
          onClose={() => setCopyModalData(null)}
        />
      )}
    </div>
  );
}

'use client';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { useState } from 'react';

// ── StatsBar ──────────────────────────────────────────────────
export function StatsBar({ pnl, walletConnected }) {
  const pnlVal = parseFloat(pnl?.pnl || 0);
  const volumeVal = parseFloat(pnl?.volume || 0);
  const winRate = pnl?.winRate ? `${(pnl.winRate * 100).toFixed(1)}%` : '—';
  const volume = volumeVal > 0 ? `$${(volumeVal / 1000).toFixed(1)}K` : '—';
  const myPnlDisplay = pnlVal >= 0 ? `+$${pnlVal.toFixed(2)}` : `-$${Math.abs(pnlVal).toFixed(2)}`;
  const displayPnl = walletConnected ? myPnlDisplay : 'Connect wallet';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: '1px solid #2a2a3e', background: '#0d0d1a' }}>
      {[
        { label: 'TRADER PNL', value: myPnlDisplay, color: pnlVal >= 0 ? '#00ff88' : '#ff4466', sub: 'all time' },
        { label: 'RANK', value: pnl?.rank || '—', color: '#ffcc44', sub: 'global' },
        { label: 'VOLUME', value: volume, color: '#4488ff', sub: 'total traded' },
        { label: 'MY PNL', value: displayPnl, color: '#00ff88', sub: walletConnected ? 'live balance' : '' },
      ].map(s => (
        <div key={s.label} style={{ padding: '12px 16px', borderRight: '1px solid #2a2a3e' }}>
          <div style={{ fontSize: '9px', letterSpacing: '2px', color: '#6b7280', marginBottom: '5px' }}>{s.label}</div>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: s.color }}>{s.value}</div>
          <div style={{ fontSize: '9px', color: '#6b7280', marginTop: '3px' }}>{s.sub}</div>
        </div>
      ))}
    </div>
  );
}

// ── PnLChart ──────────────────────────────────────────────────
export function PnLChart({ history }) {
  const data = [];
  
  if (history && history.length > 0) {
    // 1. Performance Timeseries format
    if (history[0].pnl !== undefined || history[0].equity !== undefined) {
      history.forEach((point, i) => {
        data.push({
          i: i,
          pnl: parseFloat((point.pnl || point.equity || 0).toFixed(2)),
          time: point.timestamp ? new Date(point.timestamp * 1000).toLocaleDateString() : i
        });
      });
    } 
    // 2. Trades/History format (build cumulative)
    else {
      let cum = 0;
      // Reverse history if it's descending (latest first)
      const sorted = [...history].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      sorted.forEach((trade, i) => {
        // Data API trades often have 'cashPnl' or similar
        const profit = parseFloat(trade.pnl || trade.cashPnl || trade.profit_or_loss || 0);
        cum += profit;
        data.push({ 
          i: i + 1, 
          pnl: parseFloat(cum.toFixed(2)),
          time: trade.timestamp ? new Date(trade.timestamp).toLocaleDateString() : i
        });
      });
    }
  } else {
    // Demo curve
    [0,12,28,18,45,38,62,55,71,85,78,95].forEach((v, i) => data.push({ i, pnl: v }));
  }

  return (
    <div style={{ height: '110px', background: '#111122', borderBottom: '1px solid #2a2a3e', padding: '10px 16px 0' }}>
      <div style={{ fontSize: '9px', letterSpacing: '2px', color: '#6b7280', marginBottom: '4px' }}>
        <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#00ff88', marginRight: '6px', animation: 'pulse 1.5s infinite' }}></span>
        CUMULATIVE PNL
      </div>
      <ResponsiveContainer width="100%" height={75}>
        <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#00ff88" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#00ff88" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="i" hide />
          <YAxis hide />
          <Tooltip
            contentStyle={{ background: '#111122', border: '1px solid #2a2a3e', fontFamily: 'Courier New', fontSize: '10px' }}
            formatter={(v) => [`$${v}`, 'PnL']}
          />
          <Area type="monotone" dataKey="pnl" stroke="#00ff88" strokeWidth={1.5} fill="url(#pnlGrad)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── PositionsTable ────────────────────────────────────────────
export function PositionsTable({ positions, walletConnected, onCopy, onClose, liveEvents }) {
  const cols = '2.5fr 70px 80px 80px 80px 80px 140px';

  return (
    <div>
      {liveEvents.length > 0 && (
        <div style={{ background: 'rgba(0,255,136,0.05)', border: '1px solid rgba(0,255,136,0.2)', padding: '8px 16px', fontSize: '10px', color: '#00ff88', letterSpacing: '1px' }}>
          🔔 {liveEvents[0].positions?.length} new position(s) detected!
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: cols, padding: '8px 16px', fontSize: '8px', letterSpacing: '2px', color: '#6b7280', borderBottom: '1px solid rgba(255,255,255,0.05)', background: '#111122', position: 'sticky', top: 0 }}>
        <div>MARKET</div><div>SIDE</div><div>PRICE</div><div>SHARES</div><div>VALUE</div><div>PNL</div><div>ACTION</div>
      </div>
      {positions.length === 0 && (
        <div style={{ padding: '30px', textAlign: 'center', color: '#6b7280', fontSize: '11px', letterSpacing: '1px' }}>
          No open positions for this trader
        </div>
      )}
      {positions.map((pos, i) => {
        const isYes = pos.outcome === 'Up' || pos.outcome === 'Yes' || pos.side === 'YES' || pos.side === 'BUY';
        const price = parseFloat(pos.curPrice || pos.price || pos.avgPrice || 0);
        const shares = parseFloat(pos.size || pos.shares || 0);
        const value = parseFloat(pos.currentValue || (price * shares) || 0).toFixed(2);
        const pnlVal = parseFloat(pos.cashPnl || pos.pnl || pos.profit_or_loss || 0);
        const pnlPos = pnlVal >= 0;
        const pnlPercent = parseFloat(pos.percentPnl || 0);

        return (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: cols,
            padding: '10px 16px', borderBottom: '1px solid #2a2a3e',
            fontSize: '11px', alignItems: 'center',
            transition: 'background 0.15s', cursor: 'pointer',
          }}
            onMouseEnter={e => e.currentTarget.style.background = '#1a1a2e'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: '11px', color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {pos.title || pos.market || pos.conditionId?.slice(0, 20) || 'Unknown Market'}
              </div>
              <div style={{ fontSize: '9px', color: '#6b7280', marginTop: '2px' }}>
                {pos.conditionId?.slice(0, 16)}...
              </div>
            </div>
            <div>
              <span style={{ fontSize: '9px', padding: '2px 8px', border: `1px solid ${isYes ? 'rgba(0,255,136,0.3)' : 'rgba(255,68,102,0.3)'}`, color: isYes ? '#00ff88' : '#ff4466', background: isYes ? 'rgba(0,255,136,0.07)' : 'rgba(255,68,102,0.07)' }}>
                {pos.outcome || (isYes ? 'YES' : 'NO')}
              </span>
            </div>
            <div style={{ fontSize: '12px' }}>{(price * 100).toFixed(0)}¢</div>
            <div style={{ fontSize: '12px' }}>{shares.toLocaleString()}</div>
            <div style={{ fontSize: '12px' }}>${value}</div>
            <div style={{ fontSize: '12px', color: pnlPos ? '#00ff88' : '#ff4466' }}>
              {pnlPos ? '+' : ''}${pnlVal.toFixed(2)} ({pnlPercent > 0 ? '+' : ''}{pnlPercent}%)
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={() => onCopy(pos)} style={actionBtnStyle('#00ff88')}>COPY ↗</button>
              <button onClick={() => onClose(pos)} style={actionBtnStyle('#ff4466')}>CLOSE</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── HistoryTable ──────────────────────────────────────────────
export function HistoryTable({ history }) {
  const cols = '2fr 70px 70px 70px 90px 80px 80px';

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: cols, padding: '8px 16px', fontSize: '8px', letterSpacing: '2px', color: '#6b7280', borderBottom: '1px solid rgba(255,255,255,0.05)', background: '#111122' }}>
        <div>MARKET</div><div>SIDE</div><div>ENTRY</div><div>EXIT</div><div>PROFIT</div><div>RESULT</div><div>DATE</div>
      </div>
      {history.length === 0 && (
        <div style={{ padding: '30px', textAlign: 'center', color: '#6b7280', fontSize: '11px' }}>No trade history</div>
      )}
      {history.map((h, i) => {
        const win = h.outcome === 'Won' || parseFloat(h.pnl || h.cashPnl || h.profit_or_loss || 0) > 0;
        const entry = parseFloat(h.entry_price || h.price || h.avgPrice || 0);
        const exit = parseFloat(h.exit_price || 0);
        const profit = parseFloat(h.pnl || h.cashPnl || h.profit_or_loss || 0);
        const date = h.timestamp ? new Date(h.timestamp * 1000).toLocaleDateString() : '—';

        return (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: cols, padding: '10px 16px', borderBottom: '1px solid #2a2a3e', fontSize: '11px', alignItems: 'center' }}>
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#a0aec0' }}>
              {h.title || h.market || 'Unknown'}
            </div>
            <div>
              <span style={{ fontSize: '9px', padding: '2px 6px', color: h.side === 'BUY' ? '#00ff88' : '#ff4466', border: `1px solid ${h.side === 'BUY' ? 'rgba(0,255,136,0.3)' : 'rgba(255,68,102,0.3)'}` }}>
                {h.side} {h.outcome}
              </span>
            </div>
            <div>{entry > 0 ? `${(entry * 100).toFixed(0)}¢` : '—'}</div>
            <div>{exit > 0 ? `${(exit * 100).toFixed(0)}¢` : '—'}</div>
            <div style={{ color: profit >= 0 ? '#00ff88' : '#ff4466' }}>
              {profit >= 0 ? '+' : ''}${profit.toFixed(2)}
            </div>
            <div>
              <span style={{ fontSize: '9px', padding: '2px 6px', color: win ? '#00ff88' : '#ff4466', border: `1px solid ${win ? 'rgba(0,255,136,0.3)' : 'rgba(255,68,102,0.3)'}` }}>
                {win ? 'WIN' : 'LOSS'}
              </span>
            </div>
            <div style={{ color: '#6b7280', fontSize: '10px' }}>{date}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── AnalyticsPanel ────────────────────────────────────────────
export function AnalyticsPanel({ pnl, positions, history, settings, onSettingsChange }) {
  return (
    <div style={{ padding: '20px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
      {/* Stats */}
      <div style={cardStyle}>
        <div style={cardTitle}>PERFORMANCE</div>
        {[
          ['Total trades', pnl?.totalTrades || history.length || '—'],
          ['Win rate', pnl?.winRate ? `${(pnl.winRate * 100).toFixed(1)}%` : '—'],
          ['Avg profit', pnl?.avgProfit ? `$${pnl.avgProfit.toFixed(2)}` : '—'],
          ['Best trade', pnl?.bestTrade ? `+$${pnl.bestTrade.toFixed(2)}` : '—'],
          ['Open positions', positions.length],
        ].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #2a2a3e', fontSize: '11px' }}>
            <span style={{ color: '#6b7280', fontSize: '10px' }}>{k}</span>
            <span style={{ color: '#e2e8f0' }}>{v}</span>
          </div>
        ))}
      </div>

      {/* Auto Copy Settings */}
      <div style={cardStyle}>
        <div style={cardTitle}>AUTO COPY SETTINGS</div>
        <div style={{ background: 'rgba(68,136,255,0.05)', border: '1px solid rgba(68,136,255,0.2)', padding: '12px', marginBottom: '12px' }}>
          <ToggleRow
            label="Auto-copy all new trades"
            checked={settings.autoCopyEnabled}
            onChange={v => onSettingsChange('autoCopyEnabled', v)}
          />
          <ToggleRow
            label="Copy partial closes"
            checked={settings.copyPartialClose}
            onChange={v => onSettingsChange('copyPartialClose', v)}
          />
        </div>
        <div style={{ fontSize: '10px', marginBottom: '8px' }}>
          <label style={{ color: '#6b7280', display: 'block', marginBottom: '4px', letterSpacing: '1px' }}>MAX TRADE SIZE (pUSD)</label>
          <input
            type="number"
            value={settings.maxTradeUSDC || 50}
            onChange={e => onSettingsChange('maxTradeUSDC', parseFloat(e.target.value))}
            style={{ width: '100%', background: '#1a1a2e', border: '1px solid #2a2a3e', color: '#e2e8f0', padding: '7px', fontFamily: 'Courier New', fontSize: '12px', outline: 'none' }}
          />
        </div>
        <div style={{ fontSize: '10px' }}>
          <label style={{ color: '#6b7280', display: 'block', marginBottom: '4px', letterSpacing: '1px' }}>MIN CONFIDENCE (0–1)</label>
          <input
            type="number" step="0.05" min="0" max="1"
            value={settings.minConfidence || 0.55}
            onChange={e => onSettingsChange('minConfidence', parseFloat(e.target.value))}
            style={{ width: '100%', background: '#1a1a2e', border: '1px solid #2a2a3e', color: '#e2e8f0', padding: '7px', fontFamily: 'Courier New', fontSize: '12px', outline: 'none' }}
          />
        </div>
      </div>
    </div>
  );
}

function ToggleRow({ label, checked, onChange }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', fontSize: '10px', color: '#a0aec0' }}>
      <span>{label}</span>
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: '36px', height: '18px', borderRadius: '9px',
          background: checked ? 'rgba(68,136,255,0.4)' : '#2a2a3e',
          cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0,
        }}
      >
        <div style={{
          position: 'absolute', top: '3px',
          left: checked ? '19px' : '3px',
          width: '12px', height: '12px', borderRadius: '50%',
          background: checked ? '#4488ff' : '#6b7280',
          transition: 'left 0.2s',
        }} />
      </div>
    </div>
  );
}

// ── CopyModal ─────────────────────────────────────────────────
export function CopyModal({ position, settings, walletConnected, onExecute, onClose }) {
  const [amount, setAmount] = useState(settings.maxTradeUSDC || 50);
  const price = parseFloat(position.price || position.avg_price || 0);
  const potentialShares = price > 0 ? Math.floor(amount / price) : 0;
  const maxPayout = price > 0 ? (amount / price).toFixed(2) : '—';
  const isYes = position.outcome === 'Yes';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#0d0d1a', border: '1px solid #2a2a3e', width: '480px', maxWidth: '95vw', fontFamily: 'Courier New' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #2a2a3e', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', letterSpacing: '2px', color: '#00ff88' }}>◈ COPY TRADE</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '18px' }}>✕</button>
        </div>
        <div style={{ padding: '18px' }}>
          <div style={{ fontSize: '13px', color: '#e2e8f0', marginBottom: '14px', lineHeight: 1.5 }}>
            {position.title || position.market || 'Unknown Market'}
          </div>
          {[
            ['OUTCOME', <span style={{ padding: '2px 8px', color: isYes ? '#00ff88' : '#ff4466', border: `1px solid ${isYes ? 'rgba(0,255,136,0.3)' : 'rgba(255,68,102,0.3)'}` }}>{isYes ? 'YES' : 'NO'}</span>],
            ['CURRENT PRICE', `${(price * 100).toFixed(0)}¢`],
            ['SHARES YOU\'LL GET', potentialShares],
            ['POTENTIAL PAYOUT', `$${(amount / price).toFixed(2)} (${(1 / price).toFixed(2)}x)`],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #2a2a3e', fontSize: '11px' }}>
              <span style={{ color: '#6b7280' }}>{k}</span>
              <span style={{ color: '#e2e8f0' }}>{v}</span>
            </div>
          ))}

          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(parseFloat(e.target.value))}
              placeholder="pUSD amount"
              style={{ flex: 1, background: '#1a1a2e', border: '1px solid #2a2a3e', color: '#e2e8f0', padding: '10px', fontFamily: 'Courier New', fontSize: '13px', outline: 'none' }}
            />
            <button
              onClick={() => walletConnected ? onExecute(position, amount) : alert('Connect wallet first!')}
              style={{ background: '#00ff88', border: 'none', color: '#000', padding: '10px 20px', fontFamily: 'Courier New', fontSize: '11px', letterSpacing: '1px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              {walletConnected ? 'EXECUTE ↗' : 'CONNECT FIRST'}
            </button>
          </div>

          <div style={{ fontSize: '9px', color: '#6b7280', marginTop: '10px', letterSpacing: '1px' }}>
            Order will be signed by your backend wallet and submitted to Polymarket CLOB.
          </div>
        </div>
      </div>
    </div>
  );
}

// Helpers
const cardStyle = {
  background: '#111122', border: '1px solid #2a2a3e', padding: '14px',
};
const cardTitle = {
  fontSize: '9px', letterSpacing: '2px', color: '#6b7280', marginBottom: '12px',
};
const actionBtnStyle = (color) => ({
  background: 'transparent', border: `1px solid ${color}44`,
  color, padding: '4px 8px',
  fontFamily: 'Courier New, monospace', fontSize: '9px',
  cursor: 'pointer', letterSpacing: '1px',
  transition: 'all 0.15s',
});

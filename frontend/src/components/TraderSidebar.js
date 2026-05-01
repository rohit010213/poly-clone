'use client';
import { useState } from 'react';

const COLORS = ['#00ff88', '#4488ff', '#ffcc44', '#ff4466', '#aa44ff'];

export default function TraderSidebar({ traders, activeTrader, onAdd, onRemove, onSelect, onUpdateSettings, loading, copyLog }) {
  const [addrInput, setAddrInput] = useState('');
  const [labelInput, setLabelInput] = useState('');

  function handleAdd() {
    if (!addrInput.trim()) return;
    onAdd(addrInput.trim(), labelInput.trim());
    setAddrInput('');
    setLabelInput('');
  }

  return (
    <div style={{
      width: '260px', minWidth: '260px',
      borderRight: '1px solid #2a2a3e',
      background: '#0d0d1a',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden'
    }}>
      {/* My Dashboard Link */}
      <button 
        onClick={() => onSelect(null)} 
        style={{
          padding: '16px', background: !activeTrader ? '#1a1a2e' : 'transparent',
          border: 'none', borderBottom: '1px solid #2a2a3e', color: !activeTrader ? '#00ff88' : '#e2e8f0',
          textAlign: 'left', fontSize: '11px', letterSpacing: '2px', cursor: 'pointer', fontWeight: 'bold'
        }}
      >
        🏠 MY DASHBOARD
      </button>

      {/* Add Trader */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #2a2a3e' }}>
        <div style={{ fontSize: '9px', letterSpacing: '3px', color: '#6b7280', marginBottom: '10px' }}>TRACK TRADER</div>
        <input
          value={addrInput}
          onChange={e => setAddrInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="0x... wallet address"
          style={inputStyle}
        />
        <input
          value={labelInput}
          onChange={e => setLabelInput(e.target.value)}
          placeholder="Label (optional)"
          style={{ ...inputStyle, marginTop: '6px' }}
        />
        <button onClick={handleAdd} disabled={loading} style={addBtnStyle}>
          {loading ? 'ADDING...' : '+ ADD TRADER'}
        </button>
      </div>

      {/* Running Bots */}
      <div style={{ fontSize: '9px', letterSpacing: '3px', color: '#6b7280', padding: '10px 16px 6px' }}>
        RUNNING BOTS ({traders.filter(t => t.copySettings?.enabled).length})
      </div>
      <div style={{ maxHeight: '120px', overflowY: 'auto' }}>
        {traders.filter(t => t.copySettings?.enabled).map((trader) => {
          return (
            <div key={`bot-${trader.address}`} onClick={() => onSelect(trader)} style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 16px',
              fontSize: '10px', color: '#00ff88', cursor: 'pointer', borderBottom: '1px solid #2a2a3e'
            }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00ff88', boxShadow: '0 0 5px #00ff88' }} />
              {trader.label}
            </div>
          )
        })}
      </div>

      {/* Trader List */}
      <div style={{ fontSize: '9px', letterSpacing: '3px', color: '#6b7280', padding: '10px 16px 6px' }}>
        WATCHLIST ({traders.length})
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {traders.length === 0 && (
          <div style={{ padding: '20px 16px', fontSize: '10px', color: '#4b5563', letterSpacing: '1px', textAlign: 'center' }}>
            No traders yet.<br />Add one above.
          </div>
        )}
        {traders.map((trader, i) => {
          const color = COLORS[i % COLORS.length];
          const isActive = activeTrader?.address === trader.address;
          return (
            <div key={trader.address}
              onClick={() => onSelect(trader)}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 16px',
                cursor: 'pointer',
                borderBottom: '1px solid #2a2a3e',
                borderLeft: isActive ? `2px solid ${color}` : '2px solid transparent',
                background: isActive ? '#1a1a2e' : 'transparent',
                transition: 'all 0.15s',
              }}
            >
              <div style={{
                width: '32px', height: '32px', borderRadius: '50%',
                background: `${color}22`, color, border: `1px solid ${color}44`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '11px', fontWeight: 'bold', flexShrink: 0,
              }}>
                {trader.label?.slice(0, 2).toUpperCase() || '??'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '11px', color: '#e2e8f0' }}>{trader.label}</div>
                <div style={{ fontSize: '9px', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {trader.address}
                </div>
              </div>
              <button
                onClick={e => { e.stopPropagation(); onRemove(trader.address); }}
                style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '14px', padding: '2px 4px' }}
              >×</button>
            </div>
          );
        })}
      </div>

      {/* Trader Copy Settings (Active Trader) */}
      {activeTrader && (
        <div style={{ borderTop: '1px solid #2a2a3e', padding: '14px 16px', background: '#111122' }}>
          <div style={{ fontSize: '9px', letterSpacing: '2px', color: '#00ff88', marginBottom: '10px' }}>
            ◈ COPY SETTINGS: {activeTrader.label.toUpperCase()}
          </div>
          
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <button 
              onClick={() => onUpdateSettings(activeTrader.address, { enabled: !activeTrader.copySettings?.enabled })}
              style={{
                flex: 1, padding: '8px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer', border: 'none',
                background: activeTrader.copySettings?.enabled ? '#ff4466' : '#00ff88',
                color: activeTrader.copySettings?.enabled ? '#fff' : '#000'
              }}
            >
              {activeTrader.copySettings?.enabled ? 'STOP COPY' : 'START COPY'}
            </button>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <select 
              value={activeTrader.copySettings?.mode || 'fixed'}
              onChange={e => onUpdateSettings(activeTrader.address, { mode: e.target.value })}
              style={{ flex: 1, background: '#1a1a2e', border: '1px solid #2a2a3e', color: '#e2e8f0', padding: '6px', fontSize: '10px', outline: 'none' }}
            >
              <option value="fixed">Fixed ($)</option>
              <option value="percentage">Proportional (%)</option>
            </select>
            
            {(activeTrader.copySettings?.mode !== 'percentage') && (
              <input 
                type="number" 
                value={activeTrader.copySettings?.value || 50}
                onChange={e => onUpdateSettings(activeTrader.address, { value: parseFloat(e.target.value) })}
                style={{ flex: 1, background: '#1a1a2e', border: '1px solid #2a2a3e', color: '#e2e8f0', padding: '6px', fontSize: '10px', outline: 'none' }}
                placeholder="Fixed $"
              />
            )}
          </div>
          
          {activeTrader.copySettings?.mode === 'percentage' && (
             <div style={{ fontSize: '9px', color: '#4488ff', marginBottom: '8px' }}>
               Copies target's position size proportionally to your balance.
             </div>
          )}
        </div>
      )}

      {/* Recent Copy Trades */}
      {copyLog.length > 0 && (
        <div style={{ borderTop: '1px solid #2a2a3e', padding: '10px 16px' }}>
          <div style={{ fontSize: '9px', letterSpacing: '2px', color: '#6b7280', marginBottom: '8px' }}>RECENT COPIES</div>
          {copyLog.slice(0, 4).map(entry => (
            <div key={entry.id} style={{
              fontSize: '9px', padding: '4px 0',
              borderBottom: '1px solid #1a1a2e',
              display: 'flex', justifyContent: 'space-between',
              color: entry.success ? '#00ff88' : '#ff4466',
            }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px', color: '#a0aec0' }}>
                {entry.market?.slice(0, 25)}
              </span>
              <span>${entry.usdcAmount?.toFixed(0)} pUSD</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const inputStyle = {
  width: '100%',
  background: '#1a1a2e',
  border: '1px solid #2a2a3e',
  color: '#e2e8f0',
  padding: '7px 10px',
  fontFamily: 'Courier New, monospace',
  fontSize: '10px',
  outline: 'none',
};

const addBtnStyle = {
  width: '100%',
  marginTop: '8px',
  background: '#4488ff',
  border: 'none',
  color: '#fff',
  padding: '8px',
  fontFamily: 'Courier New, monospace',
  fontSize: '10px',
  letterSpacing: '1px',
  cursor: 'pointer',
};

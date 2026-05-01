# PolyClone — Polymarket Copy Trading Tool

Copy any trader's positions on Polymarket automatically or manually.
Full stack: Node.js backend + Next.js frontend + Polymarket CLOB API + EIP-712 order signing.

---

## Architecture

```
polyclone/
├── backend/          Node.js + Express + WebSocket
│   └── src/
│       ├── index.js          Entry point
│       ├── routes/
│       │   ├── traders.js    Track/untrack wallet addresses
│       │   ├── trades.js     Manual + auto copy trades
│       │   └── wallet.js     USDC balance
│       └── services/
│           ├── polymarket.js Gamma + CLOB API calls
│           ├── executor.js   EIP-712 order signing + submission
│           ├── poller.js     Background polling loop
│           ├── store.js      In-memory state
│           └── websocket.js  Live push to frontend
└── frontend/         Next.js dashboard
    └── src/
        ├── pages/index.js    Main dashboard
        ├── components/       UI components
        ├── hooks/            WebSocket hook
        └── lib/api.js        Backend API client
```

---

## Setup

### 1. Backend

```bash
cd backend
cp .env.example .env
# Edit .env — add your PRIVATE_KEY
npm install
npm run dev
```

### 2. Frontend

```bash
cd frontend
cp .env.local.example .env.local
# Edit .env.local if backend is not on localhost:4000
npm install
npm run dev
```

Open http://localhost:3000

---

## .env (Backend)

| Variable | Description |
|---|---|
| `PRIVATE_KEY` | Private key of wallet that executes trades (⚠️ keep secret!) |
| `POLYGON_RPC` | Polygon RPC URL (default: public endpoint) |
| `POLL_INTERVAL` | How often to check traders in seconds (default: 30) |
| `MAX_AUTO_TRADE_USDC` | Max size per auto-copy trade (default: 100) |
| `MIN_CONFIDENCE` | Min price (0–1) to auto-copy (default: 0.55) |

---

## API Endpoints

### Traders
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/traders` | List tracked traders |
| POST | `/api/traders` | Add trader `{ address, label }` |
| DELETE | `/api/traders/:address` | Remove trader |
| GET | `/api/traders/:address/positions` | Open positions |
| GET | `/api/traders/:address/history` | Trade history |
| GET | `/api/traders/:address/pnl` | PnL summary |

### Trades
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/trades/copy` | Manually copy a trade |
| POST | `/api/trades/close` | Close a position |
| GET | `/api/trades/log` | Copy trade history |
| GET | `/api/trades/settings` | Get auto-copy settings |
| PUT | `/api/trades/settings` | Update settings |

### Wallet
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/wallet/balance` | USDC balance of executor wallet |

---

## WebSocket Events

Connect to `ws://localhost:4000` for live updates:

| Event | Description |
|---|---|
| `CONNECTED` | Initial handshake |
| `POSITIONS_UPDATE` | Trader positions refreshed (includes diff) |
| `COPY_TRADE_EXECUTED` | Auto-copy trade result |

---

## How Auto-Copy Works

1. Every `POLL_INTERVAL` seconds, backend fetches positions for all tracked traders
2. Compares with last snapshot to detect new/changed positions
3. If `autoCopyEnabled = true` and new position found:
   - Fetches best ask price from CLOB
   - Checks price >= `minConfidence`
   - Builds EIP-712 signed order
   - Submits to Polymarket CLOB `/order` endpoint
4. If trader partially closes: we sell the same proportion
5. All events pushed via WebSocket to frontend

---

## Security Notes

- ⚠️ **Never expose PRIVATE_KEY** — keep backend server private
- Add IP whitelisting to your server if deploying to cloud
- Use `MAX_AUTO_TRADE_USDC` to cap risk per trade
- Use `MIN_CONFIDENCE` to avoid copying low-probability bets
- Consider running backend on same machine as frontend (not public)

---

## Production Deployment

### Backend (EC2 / any VPS)
```bash
# Install pm2
npm i -g pm2
cd backend && pm2 start src/index.js --name polyclone-backend
pm2 save
```

### Frontend (same server)
```bash
cd frontend && npm run build
pm2 start npm --name polyclone-frontend -- start
```

### Nginx config
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location /api/ {
        proxy_pass http://localhost:4000;
    }
    location / {
        proxy_pass http://localhost:3000;
    }
}
```

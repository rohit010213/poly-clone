let wssInstance = null;

function initWS(wss) {
  wssInstance = wss;

  wss.on('connection', (ws) => {
    console.log('[WS] Client connected');
    ws.send(JSON.stringify({ type: 'CONNECTED', message: 'PolyClone live feed ready' }));

    ws.on('close', () => console.log('[WS] Client disconnected'));
    ws.on('error', (err) => console.error('[WS] Error:', err.message));
  });

  console.log('[WS] WebSocket server initialized');
}

function broadcast(wss, data) {
  const payload = JSON.stringify(data);
  if (!wss) return;
  wss.clients.forEach(client => {
    if (client.readyState === 1) { // OPEN
      client.send(payload);
    }
  });
}

module.exports = { initWS, broadcast };

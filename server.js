const express = require('express');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const { exec } = require('child_process');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/terminal' });

const sessions = new Map();
const histories = new Map();

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

wss.on('connection', (ws) => {
  const sessionId = uuidv4();
  sessions.set(sessionId, ws);
  ws.send(JSON.stringify({ type: 'session', id: sessionId }));

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'command') {
        const cmd = msg.data;
        if (!histories.has(sessionId)) histories.set(sessionId, []);
        
        exec(cmd, { timeout: 30000 }, (err, stdout, stderr) => {
          const output = err ? `Error: ${err.message}\n${stderr}` : stdout;
          histories.get(sessionId).push({ command: cmd, output, timestamp: Date.now() });
          if (histories.get(sessionId).length > 100) histories.get(sessionId).shift();
          ws.send(JSON.stringify({ type: 'output', data: output }));
        });
      }
    } catch (e) {
      ws.send(JSON.stringify({ type: 'output', data: 'Invalid message' }));
    }
  });

  ws.on('close', () => sessions.delete(sessionId));
});

app.get('/api/history/:sessionId', (req, res) => {
  res.json(histories.get(req.params.sessionId) || []);
});

app.delete('/api/history/:sessionId', (req, res) => {
  histories.delete(req.params.sessionId);
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Terminal server on port ${PORT}`));
    

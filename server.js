const express = require('express');
const http = require('http');
const path = require('path');
const { ExpressPeerServer } = require('peer');

const app = express();
const server = http.createServer(app);

// Serve static web files (index.html, assets, etc.)
app.use(express.static(path.join(__dirname, '/')));

// Mount integrated PeerJS Signaling Server on /peerjs endpoint
const peerServer = ExpressPeerServer(server, {
    debug: true,
    path: '/myapp',
    allow_discovery: true
});

app.use('/peerjs', peerServer);

peerServer.on('connection', (client) => {
    console.log(`[Peer Connected] ID: ${client.getId()}`);
});

peerServer.on('disconnect', (client) => {
    console.log(`[Peer Disconnected] ID: ${client.getId()}`);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`
======================================================
🎮 RetroCast Node Server Running!
📡 WebRTC PeerServer Endpoint: http://localhost:${PORT}/peerjs/myapp
🌐 Access in browser: http://localhost:${PORT}
======================================================
    `);
});
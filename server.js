const express = require('express');
const http = require('http');
const path = require('path');
const { ExpressPeerServer } = require('peer');

const app = express();
const server = http.createServer(app);

// Serve static web application files
app.use(express.static(path.join(__dirname, '/')));

// Mount PeerJS Signaling Server on /peerjs endpoint
const peerServer = ExpressPeerServer(server, {
    debug: false,
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
🎮 RetroCast Server Running!
📡 WebRTC PeerServer: http://localhost:${PORT}/peerjs/myapp
🌐 Access in browser: http://localhost:${PORT}
======================================================
    `);
});
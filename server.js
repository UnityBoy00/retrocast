const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    },
    // Increase max HTTP payload size to handle ROM streaming
    maxHttpBufferSize: 1e7, // 10MB
    pingInterval: 5000,
    pingTimeout: 10000
});

// Serve static frontend files
app.use(express.static(path.join(__dirname, '/')));

// Active Game Sessions Store
const activeSessions = new Map();
const socketToSession = new Map();

// Helper: Generate a unique 6-digit session code
function generateSessionCode() {
    let code;
    do {
        code = Math.floor(100000 + Math.random() * 900000).toString();
    } while (activeSessions.has(code));
    return code;
}

io.on('connection', (socket) => {
    console.log(`[Socket Connected] ID: ${socket.id}`);

    // Event 1: Host creates a new Game Session (TV / PC Display)
    socket.on('create-session', (ack) => {
        const code = generateSessionCode();
        activeSessions.set(code, {
            hostSocketId: socket.id,
            controllers: []
        });
        socketToSession.set(socket.id, { code, role: 'host' });
        socket.join(code);

        console.log(`[Session Created] Code: ${code} by Host: ${socket.id}`);
        if (typeof ack === 'function') {
            ack({ success: true, code });
        }
    });

    // Event 2: Controller joins an existing Game Session (Phone)
    socket.on('join-session', ({ code }, ack) => {
        const sessionCode = code ? code.toString().trim() : '';
        const session = activeSessions.get(sessionCode);

        if (!session) {
            if (typeof ack === 'function') {
                ack({ success: false, message: 'Invalid session code. Please check your TV screen.' });
            }
            return;
        }

        if (session.controllers.length >= 4) {
            if (typeof ack === 'function') {
                ack({ success: false, message: 'Session is full (Maximum 4 controllers allowed).' });
            }
            return;
        }

        session.controllers.push(socket.id);
        const playerIndex = session.controllers.length;
        socketToSession.set(socket.id, { code: sessionCode, role: 'controller', playerIndex });
        socket.join(sessionCode);

        console.log(`[Controller Joined] Code: ${sessionCode} | Player ${playerIndex} | Socket: ${socket.id}`);

        // Notify Host about new controller
        io.to(session.hostSocketId).emit('controller-joined', {
            controllerId: socket.id,
            playerIndex: playerIndex,
            totalControllers: session.controllers.length
        });

        if (typeof ack === 'function') {
            ack({ success: true, playerIndex, totalControllers: session.controllers.length });
        }
    });

    // Event 3: Stream NES ROM binary from Phone to TV
    socket.on('upload-rom-from-phone', ({ romData, fileName }, ack) => {
        const info = socketToSession.get(socket.id);
        if (!info || info.role !== 'controller') return;

        const session = activeSessions.get(info.code);
        if (session && session.hostSocketId) {
            console.log(`[ROM Stream] Controller ${socket.id} streaming "${fileName}" to TV Host ${session.hostSocketId}`);
            
            // Forward ROM data directly to the TV Display socket
            io.to(session.hostSocketId).emit('load-rom-data', {
                playerIndex: info.playerIndex,
                romData,
                fileName
            });

            if (typeof ack === 'function') {
                ack({ success: true });
            }
        }
    });

    // Event 4: High-frequency controller input routing (Volatile for maximum speed)
    socket.on('controller-input', (data) => {
        const info = socketToSession.get(socket.id);
        if (!info || info.role !== 'controller') return;

        const session = activeSessions.get(info.code);
        if (session && session.hostSocketId) {
            io.to(session.hostSocketId).emit('game-input', {
                playerIndex: info.playerIndex,
                button: data.button,   // 'UP', 'DOWN', 'LEFT', 'RIGHT', 'A', 'B', 'START', 'SELECT'
                action: data.action    // 'down' or 'up'
            });
        }
    });

    // Event 5: Disconnect cleanup
    socket.on('disconnect', () => {
        const info = socketToSession.get(socket.id);
        if (!info) return;

        const { code, role } = info;
        const session = activeSessions.get(code);

        if (session) {
            if (role === 'host') {
                console.log(`[Session Closed] Host ${socket.id} disconnected code: ${code}`);
                io.to(code).emit('session-closed', { message: 'The game host device disconnected.' });
                activeSessions.delete(code);
            } else if (role === 'controller') {
                session.controllers = session.controllers.filter(id => id !== socket.id);
                console.log(`[Controller Left] Code: ${code} | Socket: ${socket.id}`);
                
                io.to(session.hostSocketId).emit('controller-left', {
                    controllerId: socket.id,
                    totalControllers: session.controllers.length
                });
            }
        }

        socketToSession.delete(socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`
======================================================
🎮 RetroCast Server Running!
📡 WebSockets & Express Listening on Port: ${PORT}
🌐 Access in browser: http://localhost:${PORT}
======================================================
    `);
});

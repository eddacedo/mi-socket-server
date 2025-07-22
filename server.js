// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "https://www.pulsadorauxiliorapidopnp.com.pe",
        methods: ["GET", "POST"],
        credentials: true
    }
});

app.get('/', (req, res) => {
    res.send('Servidor Socket.IO para Walkie-Talkie activo ✅');
});

const activeSockets = new Set();
let currentSpeaker = null;

io.on('connection', (socket) => {
    console.log(`✅ Usuario conectado: ${socket.id}`);
    activeSockets.add(socket.id);
    socket.emit('yourId', socket.id);
    const otherClients = Array.from(activeSockets).filter(id => id !== socket.id);
    socket.emit('allClients', otherClients);
    socket.broadcast.emit('newClient', socket.id);

    // Manejar solicitud PTT
    socket.on('requestPTT', () => {
        if (!currentSpeaker) {
            currentSpeaker = socket.id;
            socket.emit('pttGranted');
            console.log(`✅ PTT concedido a ${socket.id}`);
            socket.broadcast.emit('pttDenied', 'Otro usuario está hablando');
        } else {
            socket.emit('pttDenied', 'Canal ocupado');
            console.log(`❌ PTT denegado para ${socket.id}: Canal ocupado`);
        }
    });

    // Manejar liberación PTT
    socket.on('releasePTT', () => {
        if (currentSpeaker === socket.id) {
            currentSpeaker = null;
            console.log(`✅ PTT liberado por ${socket.id}`);
            socket.broadcast.emit('pttReleased');
        }
    });

    // Manejar solicitud de lista de clientes
    socket.on('requestAllClients', () => {
        socket.emit('allClients', Array.from(activeSockets).filter(id => id !== socket.id));
    });

    // Reenviar oferta WebRTC
    socket.on('offer', (payload) => {
        console.log(`Reenviando oferta de ${socket.id} a ${payload.to}`);
        io.to(payload.to).emit('offer', {
            from: socket.id,
            sdp: payload.sdp
        });
    });

    // Reenviar respuesta WebRTC
    socket.on('answer', (payload) => {
        console.log(`Reenviando respuesta de ${socket.id} a ${payload.to}`);
        io.to(payload.to).emit('answer', {
            from: socket.id,
            sdp: payload.sdp
        });
    });

    // Reenviar candidatos ICE
    socket.on('ice-candidate', (payload) => {
        console.log(`Reenviando ICE candidate de ${socket.id} a ${payload.to}`);
        io.to(payload.to).emit('ice-candidate', {
            from: socket.id,
            candidate: payload.candidate
        });
    });

    socket.on('disconnect', () => {
        console.log(`🔴 Usuario desconectado: ${socket.id}`);
        if (currentSpeaker === socket.id) {
            currentSpeaker = null;
            socket.broadcast.emit('pttReleased');
        }
        activeSockets.delete(socket.id);
        socket.broadcast.emit('clientDisconnected', socket.id);
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor escuchando en puerto ${PORT}`);
});

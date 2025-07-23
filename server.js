// server.js (Versión optimizada y limpia)
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
    
    // Notificar al nuevo cliente sobre todos los demás clientes ya conectados
    const otherClients = Array.from(activeSockets).filter(id => id !== socket.id);
    socket.emit('allClients', otherClients);

    // Notificar a los clientes existentes sobre el nuevo cliente
    socket.broadcast.emit('newClient', socket.id);
    
    // Manejar PTT
    socket.on('requestPTT', () => {
        if (!currentSpeaker) {
            currentSpeaker = socket.id;
            socket.emit('pttGranted');
            socket.broadcast.emit('pttDenied', 'Otro usuario está hablando');
        } else {
            socket.emit('pttDenied', 'Canal ocupado');
        }
    });

    socket.on('releasePTT', () => {
        if (currentSpeaker === socket.id) {
            currentSpeaker = null;
            socket.broadcast.emit('pttReleased');
        }
    });

    // Señalización WebRTC
    socket.on('offer', ({ to, sdp }) => {
        console.log(`📩 Oferta de ${socket.id} a ${to}`);
        io.to(to).emit('offer', { from: socket.id, sdp });
    });

    socket.on('answer', ({ to, sdp }) => {
        console.log(`📨 Respuesta de ${socket.id} a ${to}`);
        io.to(to).emit('answer', { from: socket.id, sdp });
    });

    socket.on('ice-candidate', ({ to, candidate }) => {
        // Asegúrate de que no se envíe un candidato nulo
        if (candidate) {
            io.to(to).emit('ice-candidate', { from: socket.id, candidate });
        }
    });

    // Manejo de desconexión
    socket.on('disconnect', () => {
        console.log(`🔴 Usuario desconectado: ${socket.id}`);
        activeSockets.delete(socket.id);
        
        if (currentSpeaker === socket.id) {
            currentSpeaker = null;
            socket.broadcast.emit('pttReleased');
        }
        
        socket.broadcast.emit('clientDisconnected', socket.id);
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor escuchando en puerto ${PORT}`);
});

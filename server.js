const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Configuración de CORS más específica
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

io.on('connection', (socket) => {
    console.log(`✅ Usuario conectado: ${socket.id}`);
    activeSockets.add(socket.id);

    // Enviar al nuevo cliente su propio ID
    socket.emit('yourId', socket.id);

    // Enviar al nuevo cliente la lista de los demás conectados
    const otherClients = Array.from(activeSockets).filter(id => id !== socket.id);
    socket.emit('allClients', otherClients);

    // Notificar a los demás que un nuevo cliente se ha unido
    socket.broadcast.emit('newClient', socket.id);

    // WebRTC: Reenviar oferta (offer) al destinatario correcto
    socket.on('offer', (payload) => {
        console.log(` reenviando oferta de ${socket.id} a ${payload.to}`);
        io.to(payload.to).emit('offer', {
            from: socket.id,
            sdp: payload.sdp
        });
    });

    // WebRTC: Reenviar respuesta (answer) al destinatario correcto
    socket.on('answer', (payload) => {
        console.log(` reenviando respuesta de ${socket.id} a ${payload.to}`);
        io.to(payload.to).emit('answer', {
            from: socket.id,
            sdp: payload.sdp
        });
    });

    // WebRTC: Reenviar candidatos ICE
    socket.on('ice-candidate', (payload) => {
        io.to(payload.to).emit('ice-candidate', {
            from: socket.id,
            candidate: payload.candidate
        });
    });

    socket.on('disconnect', () => {
        console.log(`🔴 Usuario desconectado: ${socket.id}`);
        activeSockets.delete(socket.id);
        // Notificar a los demás que el cliente se ha desconectado
        socket.broadcast.emit('clientDisconnected', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor escuchando en puerto ${PORT}`);
});

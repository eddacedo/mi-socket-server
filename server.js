// server.js - Versión optimizada para compatibilidad móvil
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: [
            "https://www.pulsadorauxiliorapidopnp.com.pe",
            "http://localhost:3000" // Para pruebas locales
        ],
        methods: ["GET", "POST"],
        credentials: true
    },
    // ✅ Configuraciones optimizadas para móvil
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000
});

app.get('/', (req, res) => {
    res.send('Servidor Socket.IO para Walkie-Talkie activo ✅');
});

const activeSockets = new Set();
let currentSpeaker = null;
const connectionTimes = new Map(); // ✅ Para monitoreo

io.on('connection', (socket) => {
    console.log(`✅ Usuario conectado: ${socket.id} - ${new Date().toISOString()}`);
    activeSockets.add(socket.id);
    connectionTimes.set(socket.id, Date.now());
    
    // ✅ Información de cliente (útil para debug móvil)
    const clientInfo = socket.handshake.headers['user-agent'] || 'Unknown';
    console.log(`📱 Cliente: ${clientInfo.includes('Mobile') ? 'Móvil' : 'Desktop'}`);
    
    socket.emit('yourId', socket.id);
    
    // Notificar al nuevo cliente sobre todos los demás clientes ya conectados
    const otherClients = Array.from(activeSockets).filter(id => id !== socket.id);
    socket.emit('allClients', otherClients);
    
    // Notificar a los clientes existentes sobre el nuevo cliente
    socket.broadcast.emit('newClient', socket.id);
    
    // ✅ PTT con mejor manejo de timeouts
    socket.on('requestPTT', () => {
        if (!currentSpeaker) {
            currentSpeaker = socket.id;
            socket.emit('pttGranted');
            socket.broadcast.emit('pttDenied', 'Otro usuario está hablando');
            console.log(`🎤 PTT concedido a: ${socket.id}`);
            
            // ✅ Auto-release después de 30 segundos (seguridad)
            setTimeout(() => {
                if (currentSpeaker === socket.id) {
                    currentSpeaker = null;
                    socket.emit('pttDenied', 'Tiempo límite alcanzado');
                    socket.broadcast.emit('pttReleased');
                    console.log(`⏰ PTT auto-liberado para: ${socket.id}`);
                }
            }, 30000);
        } else {
            socket.emit('pttDenied', 'Canal ocupado');
            console.log(`❌ PTT denegado a: ${socket.id} (ocupado por: ${currentSpeaker})`);
        }
    });
    
    socket.on('releasePTT', () => {
        if (currentSpeaker === socket.id) {
            currentSpeaker = null;
            socket.broadcast.emit('pttReleased');
            console.log(`🔇 PTT liberado por: ${socket.id}`);
        }
    });
    
    // ✅ Señalización WebRTC con validación
    socket.on('offer', ({ to, sdp }) => {
        if (activeSockets.has(to) && sdp) {
            console.log(`📩 Oferta de ${socket.id} a ${to}`);
            io.to(to).emit('offer', { from: socket.id, sdp });
        } else {
            console.warn(`⚠️ Oferta inválida: to=${to}, sdp=${!!sdp}`);
        }
    });
    
    socket.on('answer', ({ to, sdp }) => {
        if (activeSockets.has(to) && sdp) {
            console.log(`📨 Respuesta de ${socket.id} a ${to}`);
            io.to(to).emit('answer', { from: socket.id, sdp });
        } else {
            console.warn(`⚠️ Respuesta inválida: to=${to}, sdp=${!!sdp}`);
        }
    });
    
    socket.on('ice-candidate', ({ to, candidate }) => {
        if (activeSockets.has(to) && candidate) {
            io.to(to).emit('ice-candidate', { from: socket.id, candidate });
        }
    });
    
    // ✅ Manejo de desconexión mejorado
    socket.on('disconnect', (reason) => {
        console.log(`🔴 Usuario desconectado: ${socket.id} - Razón: ${reason}`);
        activeSockets.delete(socket.id);
        connectionTimes.delete(socket.id);
        
        if (currentSpeaker === socket.id) {
            currentSpeaker = null;
            socket.broadcast.emit('pttReleased');
            console.log(`🔇 PTT auto-liberado por desconexión: ${socket.id}`);
        }
        
        socket.broadcast.emit('clientDisconnected', socket.id);
    });
});

// ✅ Estadísticas del servidor (útil para monitoreo)
setInterval(() => {
    console.log(`📊 Conexiones activas: ${activeSockets.size}, PTT activo: ${currentSpeaker ? 'Sí' : 'No'}`);
}, 60000);

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor escuchando en puerto ${PORT}`);
});

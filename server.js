const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Permitir solo tu dominio
const io = new Server(server, {
  cors: {
    origin: "https://www.pulsadorauxiliorapidopnp.com.pe ",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Ruta raíz: opcional - puedes dejar un mensaje simple
app.get('/', (req, res) => {
  res.send('Servidor Socket.IO activo ✅');
});

// Estado global
let currentSpeaker = null;

// Manejo de conexiones
io.on('connection', (socket) => {
  console.log('✅ Usuario conectado:', socket.id);

  // Enviar ID al cliente
  socket.emit('clientId', socket.id);

  // Notificar a otros usuarios
  socket.broadcast.emit('newClient', socket.id);

  // Solicitud para hablar (Push-to-Talk)
  socket.on('requestPTT', () => {
    if (!currentSpeaker) {
      currentSpeaker = socket.id;
      io.emit('speakerChanged', socket.id);
      socket.emit('pttGranted');
      console.log(`🎙️ Micrófono concedido a: ${socket.id}`);
    } else {
      socket.emit('pttDenied', 'Otro usuario está hablando.');
    }
  });

  // Liberar micrófono
  socket.on('releasePTT', () => {
    if (currentSpeaker === socket.id) {
      currentSpeaker = null;
      io.emit('speakerReleased');
      console.log(`🔇 Micrófono liberado por: ${socket.id}`);
    }
  });

  // WebRTC: Oferta SDP
  socket.on('offer', (data) => {
    socket.broadcast.emit('offer', data);
  });

  // WebRTC: Respuesta SDP
  socket.on('answer', (data) => {
    socket.broadcast.emit('answer', data);
  });

  // WebRTC: Candidatos ICE
  socket.on('ice-candidate', (data) => {
    socket.broadcast.emit('ice-candidate', data);
  });

  // Desconexión
  socket.on('disconnect', () => {
    console.log('🔴 Usuario desconectado:', socket.id);
    if (currentSpeaker === socket.id) {
      currentSpeaker = null;
      io.emit('speakerReleased');
    }
    socket.broadcast.emit('clientDisconnected', socket.id);
  });
});

// Puerto dinámico (Render) o 3000 (local)
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor escuchando en puerto ${PORT}`);
});

// Exportar para pruebas
module.exports = server;

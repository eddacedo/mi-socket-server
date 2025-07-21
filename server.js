const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');

const app = express();
const httpServer = createServer(app);

// Configuración de CORS para Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: [
      "https://www.pulsadorauxiliorapidopnp.com.pe",
      "http://localhost",
      "http://127.0.0.1"
    ],
    methods: ["GET", "POST"],
    credentials: true
  },
  allowEIO3: true
});

// Middlewares
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false
}));

app.use(cors({
  origin: [
    "https://www.pulsadorauxiliorapidopnp.com.pe",
    "http://localhost",
    "http://127.0.0.1"
  ],
  credentials: true
}));

app.use(express.json());

// Servir archivos estáticos (opcional)
app.use(express.static('public'));

// Variables para manejar el walkie-talkie
let clients = new Map();
let currentSpeaker = null;
let speakerTimeout = null;

// Función para limpiar speaker después de timeout
function clearSpeaker() {
  if (currentSpeaker) {
    console.log(`🔇 Speaker timeout para cliente: ${currentSpeaker}`);
    io.emit('speakerReleased');
    currentSpeaker = null;
  }
  if (speakerTimeout) {
    clearTimeout(speakerTimeout);
    speakerTimeout = null;
  }
}

// Función para establecer timeout del speaker
function setSpeakerTimeout() {
  if (speakerTimeout) {
    clearTimeout(speakerTimeout);
  }
  // 30 segundos de timeout por seguridad
  speakerTimeout = setTimeout(clearSpeaker, 30000);
}

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Servidor Walkie-Talkie GPS activo',
    timestamp: new Date().toISOString(),
    clients: clients.size,
    currentSpeaker: currentSpeaker
  });
});

// Ruta de estado
app.get('/status', (req, res) => {
  res.json({
    clients: Array.from(clients.keys()),
    currentSpeaker: currentSpeaker,
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// Configuración de Socket.IO
io.on('connection', (socket) => {
  console.log(`🔌 Cliente conectado: ${socket.id}`);
  
  // Registrar cliente
  clients.set(socket.id, {
    id: socket.id,
    connectedAt: new Date(),
    userInfo: null
  });

  // Enviar ID del cliente
  socket.emit('clientId', socket.id);
  
  // Notificar a otros clientes sobre la nueva conexión
  socket.broadcast.emit('newClient', socket.id);
  
  // Estado inicial del PTT
  if (currentSpeaker && currentSpeaker !== socket.id) {
    socket.emit('speakerChanged', currentSpeaker);
  } else {
    socket.emit('speakerReleased');
  }

  // Registro de información del usuario
  socket.on('registerUser', (userInfo) => {
    console.log(`👤 Usuario registrado: ${socket.id}`, userInfo);
    if (clients.has(socket.id)) {
      clients.get(socket.id).userInfo = userInfo;
    }
  });

  // Solicitud de PTT (Push-To-Talk)
  socket.on('requestPTT', () => {
    console.log(`🎤 Solicitud PTT de: ${socket.id}`);
    
    if (!currentSpeaker) {
      // Conceder PTT
      currentSpeaker = socket.id;
      socket.emit('pttGranted');
      socket.broadcast.emit('speakerChanged', socket.id);
      setSpeakerTimeout();
      console.log(`✅ PTT concedido a: ${socket.id}`);
    } else if (currentSpeaker === socket.id) {
      // Ya tiene el PTT
      socket.emit('pttGranted');
      setSpeakerTimeout();
    } else {
      // PTT ocupado
      socket.emit('pttDenied', 'Otro usuario está hablando');
      console.log(`❌ PTT denegado a: ${socket.id} (ocupado por: ${currentSpeaker})`);
    }
  });

  // Liberar PTT
  socket.on('releasePTT', () => {
    console.log(`🔇 Liberación PTT de: ${socket.id}`);
    
    if (currentSpeaker === socket.id) {
      clearSpeaker();
      console.log(`✅ PTT liberado por: ${socket.id}`);
    }
  });

  // WebRTC Signaling - Offer
  socket.on('offer', (data) => {
    console.log(`📞 Offer de ${socket.id} hacia ${data.targetId}`);
    socket.to(data.targetId).emit('offer', {
      offer: data.offer,
      fromId: socket.id
    });
  });

  // WebRTC Signaling - Answer
  socket.on('answer', (data) => {
    console.log(`📞 Answer de ${socket.id} hacia ${data.targetId}`);
    socket.to(data.targetId).emit('answer', {
      answer: data.answer,
      fromId: socket.id
    });
  });

  // WebRTC Signaling - ICE Candidate
  socket.on('ice-candidate', (data) => {
    socket.to(data.targetId).emit('ice-candidate', {
      candidate: data.candidate,
      fromId: socket.id
    });
  });

  // Keep alive / Heartbeat
  socket.on('ping', () => {
    socket.emit('pong');
  });

  // Desconexión
  socket.on('disconnect', (reason) => {
    console.log(`🔌 Cliente desconectado: ${socket.id} - Razón: ${reason}`);
    
    // Remover de la lista de clientes
    clients.delete(socket.id);
    
    // Si era el speaker actual, liberar PTT
    if (currentSpeaker === socket.id) {
      clearSpeaker();
      console.log(`🔇 PTT liberado por desconexión: ${socket.id}`);
    }
    
    // Notificar a otros clientes
    socket.broadcast.emit('clientDisconnected', socket.id);
  });

  // Manejo de errores
  socket.on('error', (error) => {
    console.error(`❌ Error en socket ${socket.id}:`, error);
  });
});

// Manejo de errores del servidor
httpServer.on('error', (error) => {
  console.error('❌ Error del servidor HTTP:', error);
});

io.on('error', (error) => {
  console.error('❌ Error de Socket.IO:', error);
});

// Limpieza periódica (cada 5 minutos)
setInterval(() => {
  console.log(`📊 Clientes conectados: ${clients.size}`);
  console.log(`🎤 Speaker actual: ${currentSpeaker || 'ninguno'}`);
}, 5 * 60 * 1000);

// Puerto del servidor
const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor Walkie-Talkie iniciado en puerto ${PORT}`);
  console.log(`🌐 Disponible en: http://localhost:${PORT}`);
  console.log(`🔗 Socket.IO listo para conexiones`);
});

// Manejo de cierre del proceso
process.on('SIGINT', () => {
  console.log('🛑 Cerrando servidor...');
  clearSpeaker();
  httpServer.close(() => {
    console.log('✅ Servidor cerrado correctamente');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('🛑 Terminando servidor...');
  clearSpeaker();
  httpServer.close(() => {
    console.log('✅ Servidor terminado correctamente');
    process.exit(0);
  });
});
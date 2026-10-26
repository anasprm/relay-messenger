import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';

import { CLIENT_ORIGINS, PORT, UPLOAD_DIR } from './config.js';
import { dbStatus, getDb, initDb } from './db.js';
import { firebaseStatus, probeStorage } from './firebase.js';
import { registerRealtime } from './realtime.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import conversationRoutes from './routes/conversations.js';
import messageRoutes from './routes/messages.js';
import uploadRoutes from './routes/uploads.js';

const app = express();
app.disable('x-powered-by');

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || CLIENT_ORIGINS.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  }),
);

app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  const db = getDb();
  res.json({
    ok: true,
    service: 'relay-api',
    users: db.users.length,
    conversations: db.conversations.length,
    messages: db.messages.length,
    database: dbStatus(),
    firebase: firebaseStatus(),
    uptimeSeconds: Math.round(process.uptime()),
  });
});

app.use(
  '/uploads',
  (_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; font-src 'self'",
    );
    next();
  },
  express.static(UPLOAD_DIR, { maxAge: '1h', dotfiles: 'deny', fallthrough: false }),
);

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/uploads', uploadRoutes);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Endpoint not found.' });
});

app.use((error, _req, res, _next) => {
  if (error?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON body.' });
  }
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body is too large.' });
  }
  console.error('[api] Unhandled error:', error);
  res.status(500).json({ error: 'Unexpected server error.' });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: CLIENT_ORIGINS,
    methods: ['GET', 'POST'],
  },
  maxHttpBufferSize: 1_000_000,
});

app.locals.io = io;

function shutdown(signal) {
  console.log(`\n[api] ${signal} received — shutting down.`);
  io.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 4000).unref();
}

async function main() {
  await initDb();
  await probeStorage();

  registerRealtime(io);

  const db = getDb();
  const status = firebaseStatus();
  const dbInfo = dbStatus();

  server.listen(PORT, () => {
    console.log(`\n  Relay API listening on http://localhost:${PORT}`);
    console.log(`  Allowed web origins: ${CLIENT_ORIGINS.join(', ')}`);
    console.log(
      `  Database: ${dbInfo.backend}${status.projectId ? ` (${status.projectId}/${status.databaseId})` : ''} · ${db.users.length} users · ${db.conversations.length} conversations · ${db.messages.length} messages`,
    );
    console.log(`  Uploads: ${status.storage === 'firebase' ? `Firebase Storage (${status.storageBucket})` : 'local disk'}`);
    console.log('  Demo login: demo / demo123\n');
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

main().catch((error) => {
  console.error('[api] Failed to start:', error);
  process.exit(1);
});

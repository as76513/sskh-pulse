import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import routes from './routes/index.js';

dotenv.config();
const app = express();

app.use(cors({ origin: process.env.CLIENT_ORIGIN?.split(',') || '*' }));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => res.json({ ok: true, app: 'SSKH Pulse' }));
app.use('/api', routes);

// central error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

export default app;

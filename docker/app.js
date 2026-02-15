const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bodyParser = require('body-parser');
const multer = require('multer');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const promClient = require('prom-client');
const logger = require('./utils/logger');
const { createHmacAuthMiddleware } = require('./utils/auth');
const { cookieDecrypt, normalizeCryptoType, AES_GCM_TYPE } = require('./utils/crypto');

const app = express();
const fsp = fs.promises;

const httpRequestsTotal = new promClient.Counter({
  name: 'cookiecloud_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

app.use((req, res, next) => {
  const incoming = req.get('x-request-id');
  const requestId = (typeof incoming === 'string' && incoming.trim().length > 0)
    ? incoming.trim()
    : crypto.randomUUID();

  req.request_id = requestId;
  res.setHeader('x-request-id', requestId);
  next();
});

app.use((req, res, next) => {
  res.on('finish', () => {
    const route = (req.route && req.route.path) ? String(req.route.path) : String(req.path || '');
    httpRequestsTotal.inc({
      method: req.method,
      route,
      status_code: String(res.statusCode)
    });
  });
  next();
});

const data_dir = path.join(__dirname, 'data');
if (!fs.existsSync(data_dir)) fs.mkdirSync(data_dir, { recursive: true });

const maxBodyMb = toSafeInt(process.env.CC_MAX_BODY_MB, 10, 1, 100);
const maxBodyBytes = maxBodyMb * 1024 * 1024;
const allowedOrigins = parseAllowedOrigins(process.env.CC_ALLOWED_ORIGINS || '');
const enableLegacyRead = String(process.env.CC_ENABLE_LEGACY_READ || 'true').toLowerCase() !== 'false';
const hmacAuthMiddleware = createHmacAuthMiddleware({
  keys: process.env.CC_HMAC_KEYS,
  ttlSec: process.env.CC_HMAC_TTL_SEC,
  logger
});

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://')) return callback(null, true);
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('CORS not allowed'));
  }
}));

const forms = multer({ limits: { fieldSize: maxBodyBytes, fields: 128 } });
app.use(forms.none());

app.use(compression());
app.use(bodyParser.json({ limit: `${maxBodyMb}mb` }));
app.use(bodyParser.urlencoded({ extended: true, limit: `${maxBodyMb}mb` }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

const api_root = process.env.API_ROOT ? process.env.API_ROOT.trim().replace(/\/+$/, '') : '';

app.get(`${api_root}/health`, (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    auth_keys_configured: Boolean(process.env.CC_HMAC_KEYS)
  });
});

app.all(`${api_root}/`, (req, res) => {
  res.send('Hello World!' + `API ROOT = ${api_root}`);
});

app.post(`${api_root}/update`, hmacAuthMiddleware, async (req, res) => {
  try {
    const { encrypted } = req.body || {};
    const uuid = sanitizeUuid((req.body || {}).uuid);
    const crypto_type = normalizeCryptoType((req.body || {}).crypto_type || AES_GCM_TYPE);

    if (!uuid || !isValidUuid(uuid)) {
      res.status(400).json({ error: 'Bad Request', message: 'Invalid uuid format' });
      return;
    }

    if (typeof encrypted !== 'string' || encrypted.length === 0) {
      logger.warn('Bad Request: Missing encrypted payload', { request_id: req.request_id });
      res.status(400).json({ error: 'Bad Request', message: 'encrypted is required' });
      return;
    }

    if (Buffer.byteLength(encrypted, 'utf8') > maxBodyBytes) {
      res.status(413).json({ error: 'Payload Too Large', message: 'encrypted payload exceeds limit' });
      return;
    }

    if (!isSupportedCryptoType(crypto_type)) {
      res.status(400).json({ error: 'Bad Request', message: `Unsupported crypto_type: ${crypto_type}` });
      return;
    }

    const file_path = buildDataFilePath(uuid);
    const content = JSON.stringify({
      encrypted,
      crypto_type,
      updated_at: new Date().toISOString()
    });

    await fsp.writeFile(file_path, content, 'utf8');
    const verify = await fsp.readFile(file_path, 'utf8');

    res.json({ action: verify === content ? 'done' : 'error' });
  } catch (error) {
    logger.error('update error', { request_id: req.request_id, err: error });
    res.status(500).send('Internal Serverless Error');
  }
});

app.all(`${api_root}/get/:uuid`, hmacAuthMiddleware, async (req, res) => {
  try {
    const uuid = sanitizeUuid((req.params || {}).uuid);
    const queryCryptoType = typeof req.query.crypto_type === 'string' ? req.query.crypto_type : '';

    if (!uuid || !isValidUuid(uuid)) {
      res.status(400).json({ error: 'Bad Request', message: 'Invalid uuid format' });
      return;
    }

    const file_path = buildDataFilePath(uuid);
    if (!(await fileExists(file_path))) {
      res.status(404).send('Not Found');
      return;
    }

    const raw = await fsp.readFile(file_path, 'utf8');
    const data = JSON.parse(raw);
    if (!data || typeof data.encrypted !== 'string') {
      res.status(500).send('Internal Serverless Error');
      return;
    }

    if (req.body && req.body.password) {
      const useCryptoType = normalizeCryptoType(queryCryptoType || data.crypto_type || 'legacy');
      if (!isSupportedCryptoType(useCryptoType)) {
        res.status(400).json({ error: 'Bad Request', message: `Unsupported crypto_type: ${useCryptoType}` });
        return;
      }

      try {
        const parsed = cookieDecrypt(uuid, data.encrypted, req.body.password, useCryptoType, { enableLegacyRead });
        res.json(parsed);
      } catch (error) {
        logger.warn('decrypt failed', { request_id: req.request_id, uuid, crypto_type: useCryptoType, message: error.message });
        res.status(400).json({ error: 'Decrypt Failed', message: 'Invalid password or payload format' });
      }
      return;
    }

    res.json({
      encrypted: data.encrypted,
      crypto_type: data.crypto_type || 'legacy'
    });
  } catch (error) {
    logger.error('get error', { request_id: req.request_id, err: error });
    res.status(500).send('Internal Serverless Error');
  }
});

app.use((req, res) => {
  logger.warn('404 Not Found', { request_id: req.request_id, method: req.method, path: req.originalUrl });
  res.status(404).json({
    error: 'Not Found',
    message: `The requested URL ${req.originalUrl} was not found on this server.`,
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

app.use((err, req, res, next) => {
  if (!err) {
    next();
    return;
  }

  if (err.type === 'entity.too.large' || err.code === 'LIMIT_FIELD_VALUE' || err.code === 'LIMIT_FIELD_COUNT') {
    res.status(413).json({ error: 'Payload Too Large', message: 'Request body exceeds limit' });
    return;
  }

  if (err.message === 'CORS not allowed') {
    res.status(403).json({ error: 'Forbidden', message: 'Origin is not allowed' });
    return;
  }

  logger.error('Unhandled Error', { request_id: req.request_id, err });
  res.status(500).send('Internal Serverless Error');
});

const port = process.env.PORT || 8088;
const server = app.listen(port, () => {
  logger.info(`Server start on http://localhost:${port}${api_root}`);
});

function gracefulShutdown(signal) {
  logger.info(`${signal} signal received.`);

  const forceExitTimer = setTimeout(() => {
    logger.error('Forced shutdown due to timeout.');
    process.exit(1);
  }, 5000);
  forceExitTimer.unref();

  server.close(() => {
    logger.info('HTTP server closed.');
    process.exit(0);
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

function buildDataFilePath(uuid) {
  return path.join(data_dir, `${path.basename(uuid)}.json`);
}

function sanitizeUuid(uuid) {
  return String(uuid || '').trim();
}

function isValidUuid(uuid) {
  return /^[A-Za-z0-9_-]{6,128}$/.test(uuid);
}

function fileExists(filePath) {
  return fsp.access(filePath).then(() => true).catch(() => false);
}

function parseAllowedOrigins(raw) {
  return String(raw || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function isSupportedCryptoType(cryptoType) {
  return ['legacy', 'aes-128-cbc-fixed', 'aes-256-gcm-v1'].includes(cryptoType);
}

function toSafeInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (Number.isNaN(parsed)) return fallback;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}

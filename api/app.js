const express = require('express');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');
const multer = require('multer');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const logger = require('./utils/logger');
const { createHmacAuthMiddleware } = require('./utils/auth');
const { cookieDecrypt, normalizeCryptoType, AES_GCM_TYPE } = require('./utils/crypto');
const {
  DEFAULT_RUNTIME_CONFIG_FILE,
  getRuntimeConfigFilePath,
  parseBoolean,
  toSafeInt,
  normalizeApiRootValue,
  normalizeAllowedOriginsInput,
  loadRuntimeConfig,
  resolveEffectiveConfig,
  buildRuntimeConfigPayload,
  saveRuntimeConfigAtomic,
  maskHmacKeys
} = require('./utils/runtime-config');
const { createSetupAuthMiddleware, getLazycatIdentity, getClientIp } = require('./utils/setup-auth');
const { validateSetupConfigPayload, buildSetupPreview } = require('./utils/setup-validate');

function createApp(options = {}) {
  const env = options.env || process.env;
  const log = options.logger || logger;
  const runtimeConfigPath = getRuntimeConfigFilePath(options.runtimeConfigPath || env.CC_RUNTIME_CONFIG_FILE || DEFAULT_RUNTIME_CONFIG_FILE);

  const defaults = {
    api_root: '',
    cc_hmac_ttl_sec: 300,
    cc_max_body_mb: 10,
    cc_allowed_origins: '',
    cc_enable_legacy_read: true,
    cc_data_dir: path.join(__dirname, 'data')
  };

  const loadEffectiveConfig = () => {
    const runtime = loadRuntimeConfig(runtimeConfigPath, log);
    const config = resolveEffectiveConfig({ env, runtimeConfig: runtime.config, defaults });
    return { runtime, config };
  };

  const { runtime: loadedRuntime, config: effectiveConfig } = loadEffectiveConfig();

  const data_dir = path.resolve(effectiveConfig.cc_data_dir || path.join(__dirname, 'data'));
  if (!fs.existsSync(data_dir)) fs.mkdirSync(data_dir, { recursive: true });

  const maxBodyMb = toSafeInt(effectiveConfig.cc_max_body_mb, 10, 1, 100);
  const maxBodyBytes = maxBodyMb * 1024 * 1024;
  const allowedOrigins = normalizeAllowedOriginsInput(effectiveConfig.cc_allowed_origins || '');
  const enableLegacyRead = parseBoolean(effectiveConfig.cc_enable_legacy_read, true);
  const api_root = normalizeApiRootValue(effectiveConfig.api_root || '');

  const hmacAuthMiddleware = createHmacAuthMiddleware({
    keys: effectiveConfig.cc_hmac_keys,
    ttlSec: effectiveConfig.cc_hmac_ttl_sec,
    logger: log
  });

  const setupUiEnabled = parseBoolean(env.CC_SETUP_UI_ENABLE, true);
  const setupDisableRestart = parseBoolean(env.CC_SETUP_DISABLE_RESTART, false);
  const setupAuthMiddleware = createSetupAuthMiddleware({ logger: log });
  const setupStaticRoot = path.join(__dirname, 'public', 'setup');
  const onRestartRequested = typeof options.onRestartRequested === 'function' ? options.onRestartRequested : null;

  const app = express();
  const fsp = fs.promises;

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

  const setupLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false
  });

  app.get(`${api_root}/health`, (req, res) => {
    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      auth_keys_configured: Boolean(effectiveConfig.cc_hmac_keys),
      runtime_config_source: loadedRuntime.source,
      setup_ui_enabled: setupUiEnabled
    });
  });

  app.all(`${api_root}/`, (req, res) => {
    res.send(`Hello World!API ROOT = ${api_root}`);
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
        log.warn('Bad Request: Missing encrypted payload');
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

      const file_path = buildDataFilePath(data_dir, uuid);
      const content = JSON.stringify({
        encrypted,
        crypto_type,
        updated_at: new Date().toISOString()
      });

      await fsp.writeFile(file_path, content, 'utf8');
      const verify = await fsp.readFile(file_path, 'utf8');

      res.json({ action: verify === content ? 'done' : 'error' });
    } catch (error) {
      log.error('update error:', error);
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

      const file_path = buildDataFilePath(data_dir, uuid);
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
          log.warn('decrypt failed', { uuid, crypto_type: useCryptoType, message: error.message });
          res.status(400).json({ error: 'Decrypt Failed', message: 'Invalid password or payload format' });
        }
        return;
      }

      res.json({
        encrypted: data.encrypted,
        crypto_type: data.crypto_type || 'legacy'
      });
    } catch (error) {
      log.error('get error:', error);
      res.status(500).send('Internal Serverless Error');
    }
  });

  if (setupUiEnabled) {
    app.get('/setup', setupLimiter, setupAuthMiddleware, (req, res) => {
      res.sendFile(path.join(setupStaticRoot, 'index.html'));
    });

    app.get('/setup/setup.css', setupLimiter, setupAuthMiddleware, (req, res) => {
      res.sendFile(path.join(setupStaticRoot, 'setup.css'));
    });

    app.get('/setup/setup.js', setupLimiter, setupAuthMiddleware, (req, res) => {
      res.sendFile(path.join(setupStaticRoot, 'setup.js'));
    });

    app.get('/setup/api/bootstrap', setupLimiter, setupAuthMiddleware, (req, res) => {
      const { runtime, config } = loadEffectiveConfig();
      const lazycatIdentity = getLazycatIdentity(req);
      const maskedKeys = maskHmacKeys(config.cc_hmac_keys);

      res.json({
        status: 'ok',
        user: lazycatIdentity,
        runtime_config_file: runtimeConfigPath,
        runtime_config_source: runtime.source,
        environment: {
          lazycat_app_id: String(env.LAZYCAT_APP_ID || ''),
          lazycat_app_domain: String(env.LAZYCAT_APP_DOMAIN || ''),
          lazycat_box_domain: String(env.LAZYCAT_BOX_DOMAIN || ''),
          lazycat_box_name: String(env.LAZYCAT_BOX_NAME || '')
        },
        config: {
          api_root: config.api_root,
          hmac_ttl_sec: config.cc_hmac_ttl_sec,
          max_body_mb: config.cc_max_body_mb,
          allowed_origins: normalizeAllowedOriginsInput(config.cc_allowed_origins),
          enable_legacy_read: parseBoolean(config.cc_enable_legacy_read, true),
          data_dir,
          hmac_keys: maskedKeys
        },
        plugin_defaults: {
          server_address: buildServerAddress(req, config.api_root),
          auth_key_id: maskedKeys[0]?.key_id || '',
          crypto_type: AES_GCM_TYPE
        },
        restart: {
          auto_restart_enabled: !setupDisableRestart,
          disable_flag: 'CC_SETUP_DISABLE_RESTART'
        }
      });
    });

    app.get('/setup/api/tutorial', setupLimiter, setupAuthMiddleware, (req, res) => {
      res.json({
        status: 'ok',
        sections: buildTutorialSections()
      });
    });

    app.post('/setup/api/preview', setupLimiter, setupAuthMiddleware, (req, res) => {
      const validation = validateSetupConfigPayload(req.body || {});
      if (!validation.ok) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid setup payload',
          details: validation.errors
        });
        return;
      }

      const preview = buildSetupPreview(validation.value, {
        baseUrl: buildBaseUrl(req),
        runtimeConfigPath
      });
      res.status(200).json(preview);
    });

    app.post('/setup/api/apply', setupLimiter, setupAuthMiddleware, async (req, res) => {
      const validation = validateSetupConfigPayload(req.body || {});
      if (!validation.ok) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid setup payload',
          details: validation.errors
        });
        return;
      }

      try {
        const identity = getLazycatIdentity(req);
        const clientIp = getClientIp(req);

        const runtimePayload = buildRuntimeConfigPayload(validation.value, {
          updated_by_user_id: identity.user_id,
          client_ip: clientIp
        });

        await saveRuntimeConfigAtomic(runtimeConfigPath, runtimePayload);

        const shouldRestart = isLikelyLazycatEnvironment(env) && !setupDisableRestart && Boolean(onRestartRequested);
        const message = shouldRestart
          ? 'Configuration saved. Restart scheduled.'
          : 'Configuration saved. Please restart service manually.';

        res.status(202).json({
          status: 'accepted',
          message,
          restart_scheduled: shouldRestart,
          runtime_config_file: runtimeConfigPath,
          applied: {
            api_root: validation.value.api_root,
            key_ids: validation.value.hmac_keys.map((item) => item.key_id),
            hmac_ttl_sec: validation.value.hmac_ttl_sec,
            max_body_mb: validation.value.max_body_mb,
            allowed_origins: validation.value.allowed_origins,
            enable_legacy_read: validation.value.enable_legacy_read
          }
        });

        if (shouldRestart && onRestartRequested) {
          const timer = setTimeout(() => onRestartRequested('SETUP_APPLY'), 800);
          timer.unref();
        }
      } catch (error) {
        log.error('setup apply error:', { message: error.message });
        res.status(500).json({
          error: 'Internal Server Error',
          message: 'Failed to persist runtime configuration'
        });
      }
    });
  }

  app.use((req, res) => {
    log.warn(`404 Not Found: ${req.method} ${req.originalUrl}`);
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

    log.error('Unhandled Error:', err);
    res.status(500).send('Internal Serverless Error');
  });

  app.locals.cookiecloud = {
    api_root,
    data_dir,
    runtime_config_file: runtimeConfigPath,
    setup_ui_enabled: setupUiEnabled
  };

  return app;
}

function startServer(options = {}) {
  const env = options.env || process.env;
  const port = Number.parseInt(String(options.port || env.PORT || 8088), 10);
  const log = options.logger || logger;

  let shutdownHandler = () => {};
  const app = createApp({
    ...options,
    onRestartRequested: (signal) => shutdownHandler(signal)
  });

  const server = app.listen(port, () => {
    log.info(`Server start on http://localhost:${port}${app.locals.cookiecloud.api_root}`);
  });

  function gracefulShutdown(signal) {
    log.info(`${signal} signal received.`);

    const forceExitTimer = setTimeout(() => {
      log.error('Forced shutdown due to timeout.');
      process.exit(1);
    }, 5000);
    forceExitTimer.unref();

    server.close(() => {
      log.info('HTTP server closed.');
      process.exit(0);
    });
  }

  shutdownHandler = gracefulShutdown;

  if (!options.disableSignalHandlers) {
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  }

  return { app, server, gracefulShutdown };
}

if (require.main === module) {
  startServer();
}

function buildDataFilePath(dataDir, uuid) {
  return path.join(dataDir, `${path.basename(uuid)}.json`);
}

function sanitizeUuid(uuid) {
  return String(uuid || '').trim();
}

function isValidUuid(uuid) {
  return /^[A-Za-z0-9_-]{6,128}$/.test(uuid);
}

function fileExists(filePath) {
  return fs.promises.access(filePath).then(() => true).catch(() => false);
}

function isSupportedCryptoType(cryptoType) {
  return ['legacy', 'aes-128-cbc-fixed', 'aes-256-gcm-v1'].includes(cryptoType);
}

function buildBaseUrl(req) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol = forwardedProto || req.protocol || 'http';
  const host = req.get('host') || '127.0.0.1:8088';
  return `${protocol}://${host}`;
}

function buildServerAddress(req, apiRoot) {
  return `${buildBaseUrl(req)}${normalizeApiRootValue(apiRoot)}`;
}

function isLikelyLazycatEnvironment(env) {
  return Boolean(env.LAZYCAT_APP_ID || env.LAZYCAT_APP_DOMAIN || env.LAZYCAT_BOX_DOMAIN || env.LAZYCAT_BOX_NAME);
}

function buildTutorialSections() {
  return [
    {
      id: 'threat-model',
      title: '1. 架构与威胁模型',
      paragraphs: [
        '只要服务可以通过公网域名访问，就必须按公网暴露处理。',
        'CookieCloud 的 /update 与 /get/:uuid 已强制 HMAC 签名校验，避免未授权读写。',
        '配置页仅用于生成与管理安全参数，不会返回明文密钥。'
      ]
    },
    {
      id: 'deploy-from-zero',
      title: '2. 从零部署到懒猫微服',
      paragraphs: [
        '将应用安装到懒猫后，访问 /setup 完成后端参数配置。',
        '生产建议默认 API_ROOT 使用 /api，对外插件地址填写为 https://<你的域名>/api。',
        '数据与运行时配置持久化目录建议为 /lzcapp/var/cookiecloud。'
      ]
    },
    {
      id: 'parameter-explain',
      title: '3. 参数说明（推荐值）',
      list: [
        'CC_HMAC_KEYS：至少 1 组 key_id:secret，secret 建议 64 位以上随机串。',
        'CC_HMAC_TTL_SEC：签名有效期，默认 300 秒。',
        'CC_MAX_BODY_MB：请求体上限，默认 10MB。',
        'CC_ALLOWED_ORIGINS：跨域白名单，通常可留空。',
        'CC_ENABLE_LEGACY_READ：迁移期 true，完成迁移后建议 false。'
      ]
    },
    {
      id: 'plugin-mapping',
      title: '4. 插件配置映射',
      list: [
        'Server Address = https://<域名><API_ROOT>',
        'Auth Key ID = 后端 key_id',
        'Auth Secret = 后端对应 secret（仅你自己保存）',
        'Encryption Algorithm = AES-256-GCM (PBKDF2)'
      ]
    },
    {
      id: 'verify',
      title: '5. 验证闭环',
      list: [
        '未签名请求 GET /get/:uuid 应返回 401。',
        '插件点击 Test 应出现 TestSuccess。',
        '手动同步后 data/<uuid>.json 更新时间应变化。'
      ]
    },
    {
      id: 'rotation',
      title: '6. 密钥轮换流程',
      list: [
        '先新增新 key（保留旧 key）并应用配置。',
        '将所有插件切换到新 key_id + secret。',
        '观察稳定后移除旧 key 并再次应用配置。'
      ]
    },
    {
      id: 'troubleshooting',
      title: '7. 常见故障矩阵',
      list: [
        '401 Unauthorized：签名头缺失、key_id/secret 不一致、时间窗过期。',
        '409 Conflict：nonce 重放。',
        '413 Payload Too Large：请求体超出限制。',
        '403 CORS：Origin 不在白名单。',
        '连接失败：服务未监听或路由未转发。'
      ]
    },
    {
      id: 'rollback',
      title: '8. 应急回滚',
      paragraphs: [
        '保留最近一次可用配置快照（脱敏+本地密钥记录）。',
        '回滚时恢复旧配置并重启服务，先验证 401 与 TestSuccess 再恢复业务流量。'
      ]
    }
  ];
}

module.exports = {
  createApp,
  startServer
};

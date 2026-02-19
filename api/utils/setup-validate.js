const { normalizeApiRootValue } = require('./runtime-config');

const DEFAULT_API_ROOT = '/api';
const DEFAULT_HMAC_TTL_SEC = 300;
const DEFAULT_MAX_BODY_MB = 10;

function validateSetupConfigPayload(rawPayload) {
  const errors = [];
  const payload = rawPayload && typeof rawPayload === 'object' && !Array.isArray(rawPayload) ? rawPayload : {};

  let api_root = DEFAULT_API_ROOT;
  try {
    api_root = normalizeAndValidateApiRoot(payload.api_root);
  } catch (error) {
    errors.push({ field: 'api_root', message: error.message });
  }

  const hmac_keys = validateHmacKeys(payload.hmac_keys, errors);

  const hmac_ttl_sec = validateIntField(payload.hmac_ttl_sec, {
    field: 'hmac_ttl_sec',
    fallback: DEFAULT_HMAC_TTL_SEC,
    min: 30,
    max: 3600,
    errors
  });

  const max_body_mb = validateIntField(payload.max_body_mb, {
    field: 'max_body_mb',
    fallback: DEFAULT_MAX_BODY_MB,
    min: 1,
    max: 100,
    errors
  });

  const allowed_origins = validateAllowedOrigins(payload.allowed_origins, errors);

  const enable_legacy_read = toBoolean(payload.enable_legacy_read, true);

  if (errors.length > 0) {
    return {
      ok: false,
      errors
    };
  }

  return {
    ok: true,
    value: {
      api_root,
      hmac_keys,
      hmac_ttl_sec,
      max_body_mb,
      allowed_origins,
      enable_legacy_read
    }
  };
}

function normalizeAndValidateApiRoot(value) {
  const raw = value === undefined || value === null || value === '' ? DEFAULT_API_ROOT : String(value).trim();

  if (!raw.startsWith('/')) {
    throw new Error('api_root must start with /');
  }

  if (!/^\/[A-Za-z0-9/_-]*$/.test(raw)) {
    throw new Error('api_root contains unsupported characters');
  }

  return normalizeApiRootValue(raw);
}

function validateHmacKeys(value, errors) {
  if (!Array.isArray(value)) {
    errors.push({ field: 'hmac_keys', message: 'hmac_keys must be an array' });
    return [];
  }

  if (value.length < 1) {
    errors.push({ field: 'hmac_keys', message: 'At least one hmac key is required' });
    return [];
  }

  const seen = new Set();
  const normalized = [];

  for (let i = 0; i < value.length; i += 1) {
    const item = value[i] || {};
    const key_id = String(item.key_id || '').trim();
    const secret = String(item.secret || '').trim();

    if (!/^[A-Za-z0-9_-]{1,64}$/.test(key_id)) {
      errors.push({ field: `hmac_keys[${i}].key_id`, message: 'key_id must match [A-Za-z0-9_-]{1,64}' });
      continue;
    }

    if (seen.has(key_id)) {
      errors.push({ field: `hmac_keys[${i}].key_id`, message: `Duplicate key_id: ${key_id}` });
      continue;
    }

    if (secret.length < 32 || secret.length > 256) {
      errors.push({ field: `hmac_keys[${i}].secret`, message: 'secret length must be between 32 and 256' });
      continue;
    }

    if (/\s/.test(secret)) {
      errors.push({ field: `hmac_keys[${i}].secret`, message: 'secret must not contain spaces' });
      continue;
    }

    if (!/[A-Za-z]/.test(secret) || !/[0-9]/.test(secret)) {
      errors.push({ field: `hmac_keys[${i}].secret`, message: 'secret must contain letters and digits' });
      continue;
    }

    seen.add(key_id);
    normalized.push({ key_id, secret });
  }

  if (normalized.length < 1) {
    errors.push({ field: 'hmac_keys', message: 'No valid hmac key remains after validation' });
  }

  return normalized;
}

function validateAllowedOrigins(value, errors) {
  const list = Array.isArray(value)
    ? value
    : String(value || '')
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean);

  const normalized = [];
  const seen = new Set();

  for (let i = 0; i < list.length; i += 1) {
    const raw = String(list[i] || '').trim();
    if (!raw) continue;

    let item = '';

    if (raw === '*') {
      item = '*';
    } else if (raw.startsWith('chrome-extension://') || raw.startsWith('moz-extension://')) {
      if (!/^((chrome|moz)-extension):\/\/[A-Za-z0-9\-._]+$/.test(raw)) {
        errors.push({ field: `allowed_origins[${i}]`, message: 'Invalid extension origin format' });
        continue;
      }
      item = raw;
    } else {
      try {
        const parsed = new URL(raw);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          errors.push({ field: `allowed_origins[${i}]`, message: 'origin must use http/https or extension scheme' });
          continue;
        }
        item = parsed.origin;
      } catch (error) {
        errors.push({ field: `allowed_origins[${i}]`, message: 'Invalid origin URL' });
        continue;
      }
    }

    if (!seen.has(item)) {
      normalized.push(item);
      seen.add(item);
    }
  }

  return normalized;
}

function validateIntField(value, options) {
  const { field, fallback, min, max, errors } = options;

  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (Number.isNaN(parsed)) {
    errors.push({ field, message: `${field} must be an integer` });
    return fallback;
  }

  if (parsed < min || parsed > max) {
    errors.push({ field, message: `${field} must be between ${min} and ${max}` });
    return fallback;
  }

  return parsed;
}

function toBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function buildSetupPreview(config, context = {}) {
  const baseUrl = String(context.baseUrl || 'http://127.0.0.1:8088').replace(/\/+$/, '');
  const apiRoot = normalizeApiRootValue(config.api_root || DEFAULT_API_ROOT);
  const serverAddress = `${baseUrl}${apiRoot}`;
  const keyIds = config.hmac_keys.map((item) => item.key_id);

  const backendEnv = [
    `API_ROOT=${apiRoot || '(empty)'}`,
    `CC_HMAC_KEYS=${keyIds.map((key_id) => `${key_id}:********`).join(',')}`,
    `CC_HMAC_TTL_SEC=${config.hmac_ttl_sec}`,
    `CC_MAX_BODY_MB=${config.max_body_mb}`,
    `CC_ALLOWED_ORIGINS=${config.allowed_origins.join(',')}`,
    `CC_ENABLE_LEGACY_READ=${config.enable_legacy_read ? 'true' : 'false'}`,
    `CC_RUNTIME_CONFIG_FILE=${context.runtimeConfigPath || '/lzcapp/var/cookiecloud/runtime-config.json'}`
  ].join('\n');

  const pluginTemplate = [
    `Server Address: ${serverAddress}`,
    `Auth Key ID: ${keyIds[0] || ''}`,
    'Auth Secret: <填写你本地保存的真实密钥>',
    'Encryption Algorithm: AES-256-GCM (PBKDF2)'
  ].join('\n');

  const verifyCommands = [
    `curl -i ${serverAddress}/get/<YOUR_UUID>`,
    `CC_BASE_URL='${serverAddress}' \\\nCC_API_ROOT='' \\\nCC_KEY_ID='${keyIds[0] || 'k1'}' \\\nCC_AUTH_SECRET='<REAL_SECRET>' \\\nCC_UUID='healthcheck_001' \\\napi/scripts/smoke_hmac.sh`
  ].join('\n\n');

  return {
    status: 'ok',
    summary: {
      api_root: apiRoot,
      key_ids: keyIds,
      hmac_ttl_sec: config.hmac_ttl_sec,
      max_body_mb: config.max_body_mb,
      allowed_origins_count: config.allowed_origins.length,
      enable_legacy_read: config.enable_legacy_read
    },
    blocks: {
      backend_env: backendEnv,
      plugin_template: pluginTemplate,
      verify_commands: verifyCommands
    },
    warnings: [
      '返回内容已脱敏，不包含明文密钥。',
      '请在插件中手动填写 Auth Secret。',
      '建议先用独立 UUID 做 smoke 测试，避免覆盖生产数据。'
    ]
  };
}

module.exports = {
  DEFAULT_API_ROOT,
  validateSetupConfigPayload,
  normalizeAndValidateApiRoot,
  buildSetupPreview
};

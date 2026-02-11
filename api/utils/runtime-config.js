const fs = require('fs');
const path = require('path');
const { parseHmacKeys } = require('./auth');

const DEFAULT_RUNTIME_CONFIG_FILE = '/lzcapp/var/cookiecloud/runtime-config.json';
const DEFAULT_HMAC_TTL_SEC = 300;
const DEFAULT_MAX_BODY_MB = 10;

function getRuntimeConfigFilePath(explicitPath) {
  const fromEnv = process.env.CC_RUNTIME_CONFIG_FILE;
  return String(explicitPath || fromEnv || DEFAULT_RUNTIME_CONFIG_FILE).trim();
}

function normalizeApiRootValue(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  let normalized = raw;
  if (!normalized.startsWith('/')) normalized = `/${normalized}`;
  normalized = normalized.replace(/\/+$/, '');
  if (normalized === '/') return '';
  return normalized;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function toSafeInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (Number.isNaN(parsed)) return fallback;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}

function normalizeAllowedOriginsInput(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }

  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatAllowedOrigins(origins) {
  return normalizeAllowedOriginsInput(origins).join(',');
}

function loadRuntimeConfig(filePath, log = console) {
  const targetPath = getRuntimeConfigFilePath(filePath);

  try {
    if (!fs.existsSync(targetPath)) {
      return {
        path: targetPath,
        source: 'missing',
        config: {}
      };
    }

    const raw = fs.readFileSync(targetPath, 'utf8');
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        path: targetPath,
        source: 'invalid',
        config: {},
        warning: 'Runtime config JSON must be an object'
      };
    }

    return {
      path: targetPath,
      source: 'file',
      config: normalizeRuntimeConfig(parsed)
    };
  } catch (error) {
    if (log && typeof log.error === 'function') {
      log.error('Failed to load runtime config:', { path: targetPath, message: error.message });
    }

    return {
      path: targetPath,
      source: 'error',
      config: {},
      warning: error.message
    };
  }
}

function normalizeRuntimeConfig(rawConfig) {
  const cfg = rawConfig || {};
  return {
    api_root: normalizeApiRootValue(cfg.api_root || cfg.API_ROOT || ''),
    cc_hmac_keys: String(cfg.cc_hmac_keys || cfg.CC_HMAC_KEYS || '').trim(),
    cc_hmac_ttl_sec: cfg.cc_hmac_ttl_sec ?? cfg.CC_HMAC_TTL_SEC,
    cc_max_body_mb: cfg.cc_max_body_mb ?? cfg.CC_MAX_BODY_MB,
    cc_allowed_origins: cfg.cc_allowed_origins ?? cfg.CC_ALLOWED_ORIGINS,
    cc_enable_legacy_read: cfg.cc_enable_legacy_read ?? cfg.CC_ENABLE_LEGACY_READ,
    cc_data_dir: String(cfg.cc_data_dir || cfg.CC_DATA_DIR || '').trim(),
    updated_at: cfg.updated_at || '',
    updated_by_user_id: cfg.updated_by_user_id || '',
    client_ip: cfg.client_ip || ''
  };
}

function resolveEffectiveConfig(options = {}) {
  const env = options.env || process.env;
  const runtimeConfig = options.runtimeConfig || {};
  const defaults = options.defaults || {};

  const envAllowedOrigins = normalizeAllowedOriginsInput(env.CC_ALLOWED_ORIGINS || defaults.cc_allowed_origins || '');
  const runtimeAllowedOrigins = normalizeAllowedOriginsInput(runtimeConfig.cc_allowed_origins);

  const api_root = runtimeConfig.api_root !== undefined && runtimeConfig.api_root !== ''
    ? normalizeApiRootValue(runtimeConfig.api_root)
    : normalizeApiRootValue(env.API_ROOT || defaults.api_root || '');

  const cc_hmac_keys = runtimeConfig.cc_hmac_keys || env.CC_HMAC_KEYS || defaults.cc_hmac_keys || '';

  const cc_hmac_ttl_sec = toSafeInt(
    runtimeConfig.cc_hmac_ttl_sec !== undefined ? runtimeConfig.cc_hmac_ttl_sec : env.CC_HMAC_TTL_SEC,
    toSafeInt(defaults.cc_hmac_ttl_sec, DEFAULT_HMAC_TTL_SEC, 30, 3600),
    30,
    3600
  );

  const cc_max_body_mb = toSafeInt(
    runtimeConfig.cc_max_body_mb !== undefined ? runtimeConfig.cc_max_body_mb : env.CC_MAX_BODY_MB,
    toSafeInt(defaults.cc_max_body_mb, DEFAULT_MAX_BODY_MB, 1, 100),
    1,
    100
  );

  const cc_allowed_origins = runtimeAllowedOrigins.length > 0 ? runtimeAllowedOrigins : envAllowedOrigins;

  const cc_enable_legacy_read = runtimeConfig.cc_enable_legacy_read !== undefined
    ? parseBoolean(runtimeConfig.cc_enable_legacy_read, true)
    : parseBoolean(env.CC_ENABLE_LEGACY_READ, parseBoolean(defaults.cc_enable_legacy_read, true));

  const cc_data_dir = runtimeConfig.cc_data_dir || env.CC_DATA_DIR || defaults.cc_data_dir || '';

  return {
    api_root,
    cc_hmac_keys,
    cc_hmac_ttl_sec,
    cc_max_body_mb,
    cc_allowed_origins,
    cc_enable_legacy_read,
    cc_data_dir
  };
}

function formatHmacKeysString(keys) {
  if (!Array.isArray(keys)) return '';
  return keys
    .map((item) => `${item.key_id}:${item.secret}`)
    .join(',');
}

async function saveRuntimeConfigAtomic(filePath, payload) {
  const targetPath = getRuntimeConfigFilePath(filePath);
  const dir = path.dirname(targetPath);
  await fs.promises.mkdir(dir, { recursive: true });

  const tempPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
  const content = `${JSON.stringify(payload, null, 2)}\n`;

  await fs.promises.writeFile(tempPath, content, { encoding: 'utf8', mode: 0o600 });
  await fs.promises.rename(tempPath, targetPath);
  await fs.promises.chmod(targetPath, 0o600).catch(() => {});

  return targetPath;
}

function buildRuntimeConfigPayload(input, metadata = {}) {
  return {
    version: 1,
    api_root: normalizeApiRootValue(input.api_root),
    cc_hmac_keys: formatHmacKeysString(input.hmac_keys),
    cc_hmac_ttl_sec: input.hmac_ttl_sec,
    cc_max_body_mb: input.max_body_mb,
    cc_allowed_origins: formatAllowedOrigins(input.allowed_origins),
    cc_enable_legacy_read: Boolean(input.enable_legacy_read),
    updated_at: new Date().toISOString(),
    updated_by_user_id: String(metadata.updated_by_user_id || ''),
    client_ip: String(metadata.client_ip || '')
  };
}

function maskSecret(secret) {
  const value = String(secret || '');
  if (!value) return '';
  if (value.length <= 8) return '*'.repeat(value.length);
  return `${value.slice(0, 4)}${'*'.repeat(Math.max(4, value.length - 8))}${value.slice(-4)}`;
}

function maskHmacKeys(hmacKeys) {
  const parsed = parseHmacKeys(hmacKeys);
  return Array.from(parsed.entries()).map(([key_id, secret]) => ({
    key_id,
    secret_masked: maskSecret(secret)
  }));
}

module.exports = {
  DEFAULT_RUNTIME_CONFIG_FILE,
  getRuntimeConfigFilePath,
  normalizeApiRootValue,
  parseBoolean,
  toSafeInt,
  normalizeAllowedOriginsInput,
  formatAllowedOrigins,
  loadRuntimeConfig,
  normalizeRuntimeConfig,
  resolveEffectiveConfig,
  formatHmacKeysString,
  saveRuntimeConfigAtomic,
  buildRuntimeConfigPayload,
  maskSecret,
  maskHmacKeys
};

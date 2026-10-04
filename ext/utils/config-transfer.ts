export interface ConfigData {
  endpoint: string;
  password: string;
  interval: number;
  domains: string;
  uuid: string;
  type: string;
  keep_live: string;
  with_storage: number;
  blacklist: string;
  headers: string;
  expire_minutes: number;
  crypto_type: string;
}

const stringFields = ['endpoint', 'password', 'domains', 'uuid', 'type', 'keep_live', 'blacklist', 'headers', 'crypto_type'] as const;
const numberFields = ['interval', 'with_storage', 'expire_minutes'] as const;

export function export_config(config: ConfigData): string {
  return JSON.stringify({ format: 'CookieCloudConfig', version: 1, config }, null, 2);
}

export function import_config(text: string): Partial<ConfigData> {
  let parsed: any;
  try { parsed = JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch { throw new Error('文件不是有效的 JSON 配置'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('配置必须是 JSON 对象');
  if ('format' in parsed || 'version' in parsed || 'config' in parsed) {
    if (parsed.format !== 'CookieCloudConfig' || parsed.version !== 1) throw new Error('不支持此配置文件格式或版本');
    parsed = parsed.config;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('配置内容无效');
  const config: Partial<ConfigData> = {};
  for (const field of stringFields) {
    if (!(field in parsed)) continue;
    if (typeof parsed[field] !== 'string') throw new Error(`${field} 必须是文本`);
    config[field] = parsed[field];
  }
  for (const field of numberFields) {
    if (!(field in parsed)) continue;
    const value = parsed[field];
    if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) throw new Error(`${field} 必须是整数`);
    const number = Number(value);
    if (!Number.isSafeInteger(number)) throw new Error(`${field} 必须是整数`);
    config[field] = number;
  }
  if (!Object.keys(config).length) throw new Error('文件中没有 CookieCloud 配置字段');
  if (config.endpoint?.trim()) {
    let url: URL;
    try { url = new URL(config.endpoint.trim()); } catch { throw new Error('服务器地址必须是有效的 HTTP/HTTPS 地址'); }
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('服务器地址必须是有效的 HTTP/HTTPS 地址');
  }
  if (config.type !== undefined && !['up', 'down', 'pause'].includes(config.type)) throw new Error('工作模式无效');
  if (config.crypto_type !== undefined && !['legacy', 'aes-128-cbc-fixed', 'none'].includes(config.crypto_type)) throw new Error('加密算法无效');
  if (config.interval !== undefined && config.interval < 1) throw new Error('同步间隔必须至少为 1 分钟');
  if (config.with_storage !== undefined && ![0, 1].includes(config.with_storage)) throw new Error('LocalStorage 同步选项必须为 0 或 1');
  if (config.expire_minutes !== undefined && config.expire_minutes < -1) throw new Error('Cookie 有效期必须为 -1 或非负整数');
  return config;
}

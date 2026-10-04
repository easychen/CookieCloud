import React, { useEffect, useState } from 'react';
import browser from 'webextension-polyfill';
import { next_sync_time, SyncConfig } from '../utils/sync-schedule';

export default function NextSync() {
  const [config, setConfig] = useState<SyncConfig | null>(null);
  const [alarm, setAlarm] = useState<browser.Alarms.Alarm | undefined>();
  const [now, setNow] = useState(Date.now());
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const [stored, timer] = await Promise.all([browser.storage.local.get('COOKIE_SYNC_SETTING'), browser.alarms.get('bg_1_minute')]);
        const saved = stored.COOKIE_SYNC_SETTING;
        const parsed = typeof saved === 'string' ? JSON.parse(saved) : saved;
        if (!active) return;
        setConfig(parsed && !Array.isArray(parsed) ? parsed : null);
        setAlarm(timer); setLoaded(true); setError(false);
      } catch { if (active) { setError(true); setLoaded(true); } }
    };
    const changed = (changes: Record<string, browser.Storage.StorageChange>, area: string) => {
      if (area === 'local' && changes.COOKIE_SYNC_SETTING) void refresh();
    };
    void refresh();
    const poll = setInterval(refresh, 5000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    browser.storage.onChanged.addListener(changed);
    return () => { active = false; clearInterval(poll); clearInterval(clock); browser.storage.onChanged.removeListener(changed); };
  }, []);
  const next = config ? next_sync_time(config, alarm, now) : null;
  const seconds = next === null ? 0 : Math.max(0, Math.ceil((next - now) / 1000));
  const label = config?.type === 'down' ? '下次自动下载' : '下次自动上传';
  let status = '正在读取自动同步计划…';
  if (loaded) {
    if (error) status = '无法读取自动同步计划';
    else if (!config?.uuid || !config.endpoint || (config.type !== 'pause' && config.crypto_type !== 'none' && !config.password)) status = '请先保存完整配置以启用自动同步';
    else if (config.type === 'pause') status = '自动同步已暂停';
    else if (!alarm) status = '后台计时未启动，请重新加载插件';
    else if (next === null) status = '当前间隔无法安排同步，请检查已保存的同步间隔';
    else status = `${label}：${new Date(next).toLocaleString()}（约 ${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒后）`;
  }
  return <section className="rounded border border-blue-100 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 p-4 mb-5">
    <p className="text-sm font-medium text-gray-800 dark:text-slate-100">{status}</p>
    <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">按已保存配置计算，草稿不影响计划。浏览器休眠或后台调度可能延迟执行。</p>
  </section>;
}

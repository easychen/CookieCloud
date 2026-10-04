export interface SyncConfig {
  endpoint?: string;
  uuid?: string;
  password?: string;
  crypto_type?: string;
  type?: string;
  interval?: number | string;
}

export function sync_due(date: Date, interval: number | string | undefined): boolean {
  const value = Number(interval);
  const minuteCount = (date.getDate() * 24 + date.getHours()) * 60 + date.getMinutes();
  return Number.isFinite(value) && (value < 1 || minuteCount % value === 0);
}

export function next_sync_time(config: SyncConfig, alarm: { scheduledTime: number; periodInMinutes?: number } | undefined, now: number): number | null {
  if (!alarm || !config.endpoint || !config.uuid || config.type === 'pause' || (config.crypto_type !== 'none' && !config.password)) return null;
  const period = (alarm.periodInMinutes || 1) * 60_000;
  if (!Number.isFinite(Number(config.interval)) || !Number.isFinite(alarm.scheduledTime) || !Number.isFinite(period) || period <= 0) return null;
  const first = alarm.scheduledTime + Math.max(0, Math.ceil((now - alarm.scheduledTime) / period)) * period;
  // Background scheduling uses local day/hour/minute and resets each month.
  // A full 32-day window covers every possible day-of-month minute count.
  for (let tick = first; tick <= first + 32 * 24 * 60 * 60_000; tick += period) {
    if (sync_due(new Date(tick), config.interval)) return tick;
  }
  return null;
}

export function parse_keep_alive(text: string): { url: string; interval: number }[] {
  const rules = new Map<string, number>();
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [address, minutes = '60'] = line.split('|');
    const url = new URL(address.trim());
    const interval = Number(minutes.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !Number.isSafeInteger(interval) || interval < 1 || interval > 10080) {
      throw new Error('保活格式应为 HTTP/HTTPS 地址|间隔分钟，间隔为 1 至 10080 分钟，地址不能包含用户名或密码');
    }
    url.hash = '';
    rules.set(url.href, interval);
  }
  return [...rules].map(([url, interval]) => ({ url, interval }));
}

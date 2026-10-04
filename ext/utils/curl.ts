// Single-quote arguments for POSIX shells (bash, zsh and sh).
function shell_quote(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

export function page_curl(url: string, cookies: { name: string; value: string }[]): string {
  const address = new URL(url);
  if (!['http:', 'https:'].includes(address.protocol)) throw new Error('仅支持 HTTP/HTTPS 页面');
  address.hash = '';
  const header = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
  return ['curl', '--include', '--compressed', ...(address.protocol === 'https:' ? ['-k'] : []),
    '--url', shell_quote(address.href), ...(header ? ['--header', shell_quote(`Cookie: ${header}`)] : [])].join(' ');
}

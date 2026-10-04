import React, { useEffect, useRef, useState } from 'react';
import browser from 'webextension-polyfill';
import { CopyToClipboard } from 'react-copy-to-clipboard';
import { ConfigData } from '../utils/config-transfer';
import { apply_browser_cookie_value, cookie_identity, read_page_cookies, upload_page_cookies } from '../utils/functions';
import { page_curl } from '../utils/curl';

interface Props { config: ConfigData; addKeepAlive: (url: string, interval: number) => void }

export default function PageCookies({ config, addKeepAlive }: Props) {
  const [target, setTarget] = useState<{ url: string; storeId?: string } | null>(null);
  const [cookies, setCookies] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showCurl, setShowCurl] = useState(false);
  const [applyLocal, setApplyLocal] = useState(true);
  const [interval, setInterval] = useState(60);
  const baseline = useRef<any[]>([]);

  const refresh = async () => {
    setBusy(true); setError(''); setNotice(''); setShowCurl(false); setLoaded(false); setCookies([]); setTarget(null);
    try {
      const params = new URLSearchParams(location.search);
      const tabId = params.get('targetTabId');
      if (!tabId) throw new Error('请回到已登录的网站页面，点击工具栏中的 CookieCloud');
      const result = await read_page_cookies(Number(tabId));
      setTarget({ url: result.url, storeId: result.storeId });
      baseline.current = result.cookies;
      setCookies(result.cookies);
      setLoaded(true);
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  useEffect(() => { void refresh(); }, []);

  const save = async (upload: boolean) => {
    setBusy(true); setError(''); setNotice('');
    let localSaved = false;
    try {
      if (!target || !cookies.length) throw new Error('请先读取页面 Cookie');
      const originals = await browser.cookies.getAll({ url: target.url, storeId: target.storeId });
      const changed = cookies.filter(cookie => {
        const original = originals.find(item => cookie_identity(item) === cookie_identity(cookie));
        if (!original) throw new Error('页面 Cookie 已变化，请重新读取后操作');
        const previous = baseline.current.find(item => cookie_identity(item) === cookie_identity(cookie));
        if (original.value !== previous?.value && original.value !== cookie.value) throw new Error('网站已更新登录 Cookie，请重新读取后操作');
        return original.value !== cookie.value;
      });
      if (!upload || applyLocal) {
        for (const cookie of changed) await apply_browser_cookie_value(cookie, cookie.value);
        localSaved = true;
        baseline.current = cookies.map(cookie => ({ ...cookie }));
      }
      if (upload) await upload_page_cookies(config, cookies);
      setNotice(upload ? `已将 ${cookies.length} 个页面 Cookie 上传到 UUID ${config.uuid}${applyLocal ? '，修改已写回浏览器' : ''}` : '已保存到当前浏览器');
    } catch (error) { setError(`${localSaved && upload ? '浏览器已保存，但上传失败：' : ''}${error instanceof Error ? error.message : String(error)}`); }
    finally { setBusy(false); }
  };

  const header = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
  const curl = target ? page_curl(target.url, cookies) : '';
  return <section className="border border-blue-200 dark:border-blue-800 rounded p-4 mb-5">
    <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100">当前页面 Cookie</h3>
    <p className="text-sm text-gray-500 dark:text-slate-400 mt-2">登录网站后点击插件，即可读取该页面的 Cookie（含 HttpOnly），复制或修改值，再上传到当前 UUID。</p>
    {target && <p className="text-sm break-all mt-2">页面：{target.url}</p>}
    <div className="flex flex-wrap gap-2 mt-3">
      <button className="btn btn-primary disabled:opacity-50" disabled={busy} onClick={refresh}>{busy ? '处理中…' : '重新读取页面 Cookie'}</button>
      <CopyToClipboard text={header} onCopy={(_, ok) => ok ? setNotice('已复制 Cookie Header') : setError('复制失败，请手动复制下方文本')}><button className="btn bg-gray-100 dark:bg-slate-700 disabled:opacity-50" disabled={busy || !cookies.length}>复制 Cookie Header</button></CopyToClipboard>
      <CopyToClipboard text={JSON.stringify(cookies, null, 2)} onCopy={(_, ok) => ok ? setNotice('已复制 Cookie JSON') : setError('复制失败')}><button className="btn bg-gray-100 dark:bg-slate-700 disabled:opacity-50" disabled={busy || !cookies.length}>复制 JSON</button></CopyToClipboard>
      <CopyToClipboard text={curl} onCopy={(_, ok) => { setShowCurl(true); setError(''); setNotice(''); if (ok) setNotice('已生成并复制 curl 命令'); else setError('复制失败，请手动复制下方 curl 命令'); }}><button className="btn bg-gray-100 dark:bg-slate-700 disabled:opacity-50" disabled={busy || !loaded || !target}>生成并复制 curl 命令</button></CopyToClipboard>
    </div>
    {showCurl && <div className="mt-3">
      <label htmlFor="page-curl-command" className="block text-sm">curl 命令</label>
      <textarea id="page-curl-command" readOnly className="form-textarea mt-1 font-mono" value={curl} />
      <p className="text-xs text-gray-500 dark:text-slate-400 mt-2">使用当前页面地址和编辑后的 Cookie，适用于 bash / zsh / sh。HTTPS 命令包含 -k，不校验证书。</p>
    </div>}
    {loaded && <>
      <p className="text-sm text-gray-600 dark:text-slate-300 mt-3">共 {cookies.length} 个 Cookie。修改值后可复制、保存到浏览器或上传；重新读取会放弃未保存的 Cookie 修改。</p>
      <details className="mt-2"><summary className="cursor-pointer text-sm">查看 Cookie Header</summary><textarea aria-label="页面 Cookie Header" readOnly className="form-textarea mt-2" value={header} /></details>
      <div className="max-h-96 overflow-auto mt-3 space-y-3">
        {cookies.map((cookie, index) => <div key={index} className="bg-gray-50 dark:bg-slate-800 rounded p-3">
          <label className="block text-sm break-all" htmlFor={`page-cookie-${index}`}>{cookie.name} · {cookie.domain} · {cookie.path}{cookie.httpOnly ? ' · HttpOnly' : ''}</label>
          <textarea id={`page-cookie-${index}`} className="form-textarea mt-1" disabled={busy} value={cookie.value} onChange={event => setCookies(previous => previous.map((item, i) => i === index ? { ...item, value: event.target.value } : item))} />
        </div>)}
      </div>
      <label className="flex items-center gap-2 text-sm mt-3"><input type="checkbox" checked={applyLocal} disabled={busy} onChange={event => setApplyLocal(event.target.checked)} />上传时将修改同时写回浏览器</label>
      <p className="text-xs text-gray-500 dark:text-slate-400 mt-2">上传会合并此 UUID 的服务端记录。仅上传修改值时，后续自动上传可能用浏览器的原值覆盖它。</p>
      <div className="flex flex-wrap gap-2 mt-3">
        <button className="btn bg-gray-100 dark:bg-slate-700 disabled:opacity-50" disabled={busy || !cookies.length} onClick={() => save(false)}>保存修改到浏览器</button>
        <button className="btn btn-primary disabled:opacity-50" disabled={busy || !cookies.length || config.type === 'pause'} onClick={() => save(true)}>上传页面 Cookie</button>
      </div>
    </>}
    {target && <div className="border-t mt-4 pt-3">
      <label className="text-sm" htmlFor="page-keep-alive">服务端 Session Alive 间隔（分钟）</label>
      <input id="page-keep-alive" type="number" min={1} step={1} className="form-input mt-1" value={interval} disabled={busy} onChange={event => setInterval(Number(event.target.value))} />
      <button className="btn bg-gray-100 dark:bg-slate-700 mt-2 disabled:opacity-50" disabled={busy || !Number.isSafeInteger(interval) || interval < 1} onClick={() => { addKeepAlive(target.url, interval); setNotice('已加入服务端保活草稿，请在下方点击“保存并启用服务端保活”'); }}>将此页面加入服务端保活</button>
      <p className="text-xs text-gray-500 dark:text-slate-400 mt-2">先上传登录 Cookie，再启用服务端保活；关闭浏览器后由服务端继续执行。</p>
    </div>}
    {error && <p role="alert" className="text-red-600 dark:text-red-400 mt-3">{error}</p>}
    {notice && <p role="status" className="text-green-700 dark:text-emerald-400 mt-3">{notice}</p>}
  </section>;
}

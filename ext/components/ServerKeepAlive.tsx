import React, { useEffect, useRef, useState } from 'react';
import { ConfigData } from '../utils/config-transfer';
import { server_keep_alive, ServerKeepAliveStatus } from '../utils/functions';
import { parse_keep_alive } from '../utils/keep-alive';

interface Props { config: ConfigData; onChange: (text: string) => void }

export default function ServerKeepAlive({ config, onChange }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [status, setStatus] = useState<ServerKeepAliveStatus | null>(null);
  const [insecureUrls, setInsecureUrls] = useState<string[]>([]);
  const generation = useRef(0);
  useEffect(() => { generation.current++; setStatus(null); setInsecureUrls([]); setError(''); setNotice(''); setBusy(false); }, [config.endpoint, config.uuid, config.password, config.headers]);

  const execute = async (action: 'query' | 'enable' | 'disable') => {
    const id = ++generation.current;
    setBusy(true); setError(''); setNotice('');
    try {
      const rules = action === 'enable' ? parse_keep_alive(config.keep_live).map(rule => ({ ...rule, verify_tls: !insecureUrls.includes(rule.url) })) : [];
      if (action === 'enable' && !rules.length) throw new Error('请先填写保活地址，或将当前页面加入服务端保活');
      const result = await server_keep_alive(config, action === 'query' ? undefined : rules, action === 'enable');
      if (id !== generation.current) return;
      setStatus(result);
      setInsecureUrls(result.rules.filter(rule => rule.verify_tls === false).map(rule => rule.url));
      setNotice(action === 'query' ? '已读取服务端任务状态' : action === 'enable' ? '服务端保活任务已保存并启用，关闭浏览器后仍会执行' : '服务端保活任务已停用');
    } catch (error) { if (id === generation.current) setError(error instanceof Error ? error.message : String(error)); }
    finally { if (id === generation.current) setBusy(false); }
  };
  useEffect(() => {
    if (config.endpoint.trim() && config.uuid) void execute('query');
  }, [config.endpoint, config.uuid, config.password, config.headers]);
  let certificateUrls: string[] = [];
  try { certificateUrls = parse_keep_alive(config.keep_live).filter(rule => rule.url.startsWith('https:')).map(rule => rule.url); } catch { /* Show validation when saving. */ }
  const formatTime = (time: number | null) => time ? new Date(time).toLocaleString() : '尚未执行';
  return <section className="border border-gray-200 dark:border-slate-700 rounded p-4 mb-5">
    <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100">服务端 Session Alive 保活</h3>
    <p className="text-sm text-gray-500 dark:text-slate-400 mt-2">由服务端定期使用当前 UUID 的最新 Cookie 访问网址并保存响应中的新 Cookie，插件不执行保活。请先上传登录 Cookie。</p>
    <label htmlFor="server-keep-alive-rules" className="block text-sm mt-3">保活地址与间隔（分钟）</label>
    <textarea id="server-keep-alive-rules" className="form-textarea mt-1" value={config.keep_live} disabled={busy} placeholder={'https://example.com/account|10\n一行一个地址，未指定间隔时默认 60 分钟'} onChange={event => onChange(event.target.value)} />
    {certificateUrls.map(url => <label key={url} className="block text-xs mt-2 break-all">
      <input type="checkbox" disabled={busy} checked={insecureUrls.includes(url)} onChange={event => setInsecureUrls(current => event.target.checked ? [...current, url] : current.filter(item => item !== url))} /> 不校验 HTTPS 证书：{url}
    </label>)}
    {certificateUrls.length > 0 && <p className="text-xs text-gray-500 dark:text-slate-400 mt-2">默认校验证书。勾选后无法验证该服务器身份；跳转到其他源仍校验证书。修改后点击“保存并启用服务端保活”生效。</p>}
    <p className="text-xs text-gray-500 dark:text-slate-400 mt-2">保存任务会将当前 UUID 的解密密码交给服务端，并加密保存在服务端的数据目录。服务端仅发起 HTTP 请求，不执行网页 JavaScript。</p>
    <div className="flex flex-wrap gap-2 mt-3">
      <button className="btn btn-primary disabled:opacity-50" disabled={busy} onClick={() => execute('enable')}>保存并启用服务端保活</button>
      <button className="btn bg-gray-100 dark:bg-slate-700 disabled:opacity-50" disabled={busy} onClick={() => execute('query')}>刷新任务状态</button>
      <button className="btn bg-gray-100 dark:bg-slate-700 disabled:opacity-50" disabled={busy} onClick={() => execute('disable')}>停用服务端保活</button>
    </div>
    <p className="text-xs text-gray-500 dark:text-slate-400 mt-2">底部“保存”和插件暂停模式只影响浏览器同步；服务端保活需在这里单独启用或停用。网站是否延长登录取决于其会话策略。</p>
    {error && <p role="alert" className="text-red-600 dark:text-red-400 mt-3">{error}</p>}
    {notice && <p role="status" className="text-green-700 dark:text-emerald-400 mt-3">{notice}</p>}
    {status && <div className="text-sm mt-3 space-y-2">
      <p>服务端任务：{status.enabled ? '已启用' : '已停用'}</p>
      {status.rules.map(rule => <div key={rule.url} className="rounded bg-gray-50 dark:bg-slate-800 p-3 break-all">
        <p>{rule.url} · 每 {rule.interval} 分钟</p>
        {rule.verify_tls === false && <p>此地址已关闭 HTTPS 证书校验</p>}
        <p>最近执行：{formatTime(rule.last_run)} · {rule.last_error || (rule.last_status ? `HTTP ${rule.last_status}` : '尚无结果')}</p>
        {status.enabled && <p>下次执行：{formatTime(rule.next_run)}</p>}
      </div>)}
    </div>}
  </section>;
}

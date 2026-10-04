import React, { useEffect, useMemo, useRef, useState } from 'react';
import { query_uploaded_cookies, update_uploaded_cookie, delete_uploaded_cookie, clear_uploaded_cookies, is_host_only_cookie, apply_browser_cookie_value, cookie_identity, UploadedRecord } from '../utils/functions';

interface Props { endpoint: string; password: string; headers: string; currentUuid: string; mode: string }

export default function UploadedCookies({ endpoint, password, headers, currentUuid, mode }: Props) {
  const [records, setRecords] = useState<UploadedRecord[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<{ uuid: string; domain: string; index: number; name: string; cookieDomain: string; path: string; deleting: boolean } | null>(null);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [clearConfirm, setClearConfirm] = useState(false);
  const [applyLocal, setApplyLocal] = useState(false);
  const requestId = useRef(0);
  useEffect(() => { requestId.current++; setRecords(null); setError(''); setLoading(false); setEditing(null); setNotice(''); setClearConfirm(false); }, [endpoint, password, headers]);
  const rows = useMemo(() => (records || []).flatMap(record =>
    Object.entries(record.data?.cookie_data || {}).flatMap(([domain, cookies]) =>
      Array.isArray(cookies) ? cookies.map((cookie, index) => ({ uuid: record.uuid, domain, index, cookie })) : []
    )
  ), [records]);
  const filtered = useMemo(() => {
    const keyword = search.toLowerCase();
    return rows.filter(row => [row.uuid, row.domain, row.cookie.domain, row.cookie.name, row.cookie.value].some(value => String(value || '').toLowerCase().includes(keyword)));
  }, [rows, search]);
  const pages = Math.max(1, Math.ceil(filtered.length / 100));
  const currentPage = Math.min(page, pages - 1);

  const query = async () => {
    const id = ++requestId.current;
    setLoading(true); setError(''); setRecords(null); setPage(0); setEditing(null); setNotice('');
    try {
      if (!endpoint.trim()) throw new Error('请先填写服务器地址');
      const result = await query_uploaded_cookies(endpoint, password, headers);
      if (id === requestId.current) setRecords(result);
    } catch (error) {
      if (id === requestId.current) setError(error instanceof Error ? error.message : '查询失败');
    } finally { if (id === requestId.current) setLoading(false); }
  };

  const saveCookie = async () => {
    if (!editing || !records) return;
    const record = records.find(item => item.uuid === editing.uuid);
    if (!record) return;
    const id = requestId.current;
    const selected = record.data?.cookie_data[editing.domain]?.[editing.index];
    setSaving(true); setError(''); setNotice('');
    try {
      const updated = editing.deleting
        ? await delete_uploaded_cookie(endpoint, password, headers, record, editing.domain, editing.index)
        : await update_uploaded_cookie(endpoint, password, headers, record, editing.domain, editing.index, value);
      if (id !== requestId.current) return;
      if (!editing.deleting && applyLocal && selected) {
        const target = Object.values(updated.data?.cookie_data || {}).flat().find(cookie => cookie_identity(cookie) === cookie_identity(selected));
        if (!target) throw new Error('服务端已保存，但无法定位对应的本地 Cookie，请重新查询');
        try { await apply_browser_cookie_value(target, value); }
        catch (error) { throw new Error(`服务端已保存，但更新浏览器失败：${error instanceof Error ? error.message : '未知错误'}`); }
        if (id !== requestId.current) return;
      }
      setRecords(previous => previous?.map(item => item.uuid === updated.uuid ? updated : item) || null);
      setEditing(null);
      setNotice(editing.deleting ? `已从 UUID ${editing.uuid} 的服务器记录删除 Cookie「${editing.name}」` : `已上传 Cookie「${editing.name}」到 UUID ${editing.uuid}${applyLocal ? '，并更新当前浏览器中相同范围的 Cookie' : ''}`);
    } catch (error) {
      if (id === requestId.current) setError(error instanceof Error ? error.message : '上传失败');
    } finally { setSaving(false); }
  };

  const clearCookies = async () => {
    const id = ++requestId.current;
    setSaving(true); setError(''); setNotice(''); setEditing(null);
    try {
      if (!endpoint.trim()) throw new Error('请先填写服务器地址');
      const result = await clear_uploaded_cookies(endpoint, password, headers);
      if (id !== requestId.current) return;
      setClearConfirm(false); setRecords(null);
      setNotice(`已清理 ${result.cleared_uuids} 个 UUID 中的 ${result.deleted_cookies} 个 Cookie，LocalStorage 已保留。`);
      if (result.skipped.length) setError(`有 ${result.skipped.length} 个 UUID 因密码不匹配或数据无法读取而跳过：${result.skipped.map(item => item.uuid).join('、')}。请填写对应密码后再次清理。`);
      const fresh = await query_uploaded_cookies(endpoint, password, headers);
      if (id === requestId.current) setRecords(fresh);
    } catch (error) {
      if (id === requestId.current) setError(error instanceof Error ? error.message : '清理失败');
    } finally { setSaving(false); }
  };

  return <section className="border-t border-gray-200 dark:border-slate-700 mt-8 pt-6">
    <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100">服务端所有 UUID 的 Cookie</h3>
    <p className="text-sm text-gray-500 dark:text-slate-400 mt-2">查询全部已上传记录。加密记录使用当前填写的密码解密；不同密码的记录需换用对应密码后重新查询。</p>
    <button className="btn btn-primary mt-3 disabled:opacity-50" disabled={loading || saving} onClick={query}>
      {loading ? '查询中…' : '查询 / 刷新全部记录'}
    </button>
    <button className="btn bg-red-600 hover:bg-red-700 text-white mt-3 ml-2 disabled:opacity-50" disabled={loading || saving} onClick={() => { setClearConfirm(true); setEditing(null); setError(''); setNotice(''); }}>清空服务端全部 Cookie</button>
    {clearConfirm && <div className="border border-red-200 dark:border-red-800 rounded p-4 mt-4 bg-red-50 dark:bg-red-950">
      <h4 className="font-medium text-red-700 dark:text-red-300">确认清空服务端全部 UUID 的 Cookie？</h4>
      <p className="text-sm text-gray-700 dark:text-slate-200 break-all mt-2">服务器：{endpoint}</p>
      <p className="text-sm text-gray-600 dark:text-slate-300 mt-2">保留 LocalStorage 和 UUID 记录。加密记录使用当前密码，无法解密的记录会跳过并列出。浏览器本地 Cookie 不会删除，自动上传可能重新填充服务端。</p>
      <div className="flex gap-2 mt-3">
        <button className="btn bg-red-600 text-white disabled:opacity-50" disabled={saving} onClick={clearCookies}>{saving ? '清理中…' : '确认清空全部 Cookie'}</button>
        <button className="btn bg-white dark:bg-slate-900 disabled:opacity-50" disabled={saving} onClick={() => setClearConfirm(false)}>取消</button>
      </div>
    </div>}
    {error && <p role="alert" className="text-red-600 dark:text-red-400 mt-3">{error}</p>}
    {notice && <p role="status" className="text-green-700 dark:text-emerald-400 mt-3">{notice}</p>}
    {editing && <div className="border rounded p-4 mt-4 bg-gray-50 dark:bg-slate-800">
      <h4 className="font-medium break-all">{editing.deleting ? '删除' : '修改'} Cookie：{editing.name}</h4>
      <p className="text-sm text-gray-600 dark:text-slate-300 break-all mt-1">UUID：{editing.uuid} · 域名：{editing.cookieDomain} · 路径：{editing.path}</p>
      {!editing.deleting && <>
        <label className="block text-sm mt-3" htmlFor="edited-cookie-value">Cookie 值</label>
        <textarea id="edited-cookie-value" className="form-textarea mt-1" value={value} disabled={saving} onChange={event => setValue(event.target.value)} />
        <label className="flex items-center gap-2 text-sm mt-3">
          <input type="checkbox" checked={applyLocal} disabled={saving} onChange={event => setApplyLocal(event.target.checked)} />
          同时更新当前浏览器的 Cookie（避免下次上传用旧值覆盖）
        </label>
      </>}
      <p className="text-xs text-gray-500 dark:text-slate-400 mt-2">{editing.deleting ? '删除此 UUID 服务端记录中的指定 Cookie，保留其他数据。当前浏览器中的 Cookie 不会随之删除，后续自动上传可能再次上传它。' : '保存到此 UUID 的服务器记录。启用浏览器自动上传时，后续同步可能覆盖此修改。'}</p>
      <div className="flex gap-2 mt-3">
        <button className={`btn text-white disabled:opacity-50 ${editing.deleting ? 'bg-red-600 hover:bg-red-700' : 'btn-primary'}`} disabled={saving} onClick={saveCookie}>{saving ? '上传中…' : editing.deleting ? '删除并上传' : '保存并上传'}</button>
        <button className="btn bg-white dark:bg-slate-900 disabled:opacity-50" disabled={saving} onClick={() => setEditing(null)}>取消</button>
      </div>
    </div>}
    {records && <>
      <p className="text-sm text-gray-600 dark:text-slate-300 my-3">共 {records.length} 个 UUID，已读取 {rows.length} 个 Cookie，{records.filter(record => record.error).length} 个 UUID 无法读取。</p>
      <div className="space-y-2">
        {records.map(record => <details key={record.uuid} className="rounded border p-3 text-sm">
          <summary className="cursor-pointer break-all">{record.uuid} · {record.crypto_type} · {record.error || `${Object.values(record.data?.cookie_data || {}).reduce((count, cookies) => count + (Array.isArray(cookies) ? cookies.length : 0), 0)} 个 Cookie`}</summary>
          {record.data && <>
            <p className="text-gray-500 dark:text-slate-400 mt-2">更新时间：{record.data.update_time || '未知'}</p>
            <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all bg-gray-50 dark:bg-slate-800 p-3">{JSON.stringify(record.data, null, 2)}</pre>
          </>}
        </details>)}
      </div>
      <input aria-label="搜索上传的 Cookie" className="form-input mt-4" placeholder="搜索 UUID、域名、Cookie 名称或值" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} />
      <p className="text-sm text-gray-500 dark:text-slate-400 my-2">匹配 {filtered.length} 个 Cookie</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left table-fixed">
          <thead className="bg-gray-100 dark:bg-slate-700"><tr>{['UUID', '域名', '范围', '名称', '值', '路径', '操作'].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead>
          <tbody>{filtered.slice(currentPage * 100, (currentPage + 1) * 100).map((row, index) => <tr key={`${currentPage}-${index}`} className="border-b align-top">
            {[row.uuid, row.cookie.domain || row.domain, is_host_only_cookie(row.cookie) ? '仅当前主机' : '域及子域', row.cookie.name, row.cookie.value, row.cookie.path].map((value, column) => <td key={column} className="p-2 break-all whitespace-pre-wrap">{String(value ?? '')}</td>)}
            <td className="p-2"><div className="flex flex-col gap-2">{[false, true].map(deleting => <button key={String(deleting)} className={`${deleting ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'} disabled:opacity-50`} disabled={saving} onClick={() => { setEditing({ uuid: row.uuid, domain: row.domain, index: row.index, name: row.cookie.name, cookieDomain: row.cookie.domain || row.domain, path: row.cookie.path || '/', deleting }); setValue(String(row.cookie.value ?? '')); setApplyLocal(!deleting && row.uuid === currentUuid && mode === 'up'); setError(''); setNotice(''); }}>{deleting ? '删除' : '修改值'}</button>)}</div></td>
          </tr>)}</tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="text-gray-500 dark:text-slate-400 mt-3">没有可展示的 Cookie。</p>}
      <div className="flex items-center gap-3 mt-3">
        <button className="btn bg-gray-100 dark:bg-slate-700 disabled:opacity-50" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>上一页</button>
        <span className="text-sm">{currentPage + 1} / {pages}</span>
        <button className="btn bg-gray-100 dark:bg-slate-700 disabled:opacity-50" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>下一页</button>
      </div>
    </>}
  </section>;
}

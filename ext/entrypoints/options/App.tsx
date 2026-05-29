import React, { ChangeEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import short_uid from 'short-uuid';
import browser from 'webextension-polyfill';
import { CopyToClipboard } from 'react-copy-to-clipboard';

import {
  add_domain_to_blacklist,
  add_domain_to_sync_list,
  add_domains_to_blacklist,
  add_domains_to_sync_list,
  ConfigData,
  cookie_list_to_header_string,
  DEFAULT_CONFIG,
  delete_cookie,
  DomainFilterType,
  fetch_remote_cookie_snapshot,
  filter_domains_by_type,
  get_default_domain_filter,
  get_cookie_identity_key,
  get_domain_status,
  list_cookies_by_domain,
  list_sync_logs,
  load_data,
  ManagedCookie,
  normalize_config,
  normalize_domain,
  remove_domain_from_blacklist,
  remove_domain_from_sync_list,
  remove_domains_from_blacklist,
  remove_domains_from_sync_list,
  save_data,
  split_lines,
  SyncLogEntry,
  upsert_cookie,
} from '../../utils/functions';
import { handleConfigMessage } from '../../utils/messaging';

type TabKey = 'settings' | 'manager' | 'diff' | 'logs';
type CookieGroups = Record<string, ManagedCookie[]>;
type SelectedDomainMap = Record<string, boolean>;

type EditableCookie = ManagedCookie & {
  sameSite: string;
  expirationDateText: string;
};

type CookieEditorState = {
  original: ManagedCookie;
  draft: EditableCookie;
};

type ToastType = 'success' | 'error' | 'info';

type ToastItem = {
  id: string;
  type: ToastType;
  text: string;
};

type DiffGroup = {
  domain: string;
  onlyLocal: ManagedCookie[];
  onlyRemote: ManagedCookie[];
  changed: Array<{ local: ManagedCookie; remote: ManagedCookie }>;
};

const CopyIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
);

const COOKIE_SAME_SITE_OPTIONS = ['no_restriction', 'lax', 'strict', 'unspecified'];

const TAB_ITEMS: Array<{ key: TabKey; labelKey: string; fallback: string }> = [
  { key: 'settings', labelKey: 'settingsTab', fallback: '设置' },
  { key: 'manager', labelKey: 'managerTab', fallback: '管理' },
  { key: 'diff', labelKey: 'diffPreviewTitle', fallback: '差异预览' },
  { key: 'logs', labelKey: 'syncLogsTitle', fallback: '同步日志' },
];

const DOMAIN_FILTER_ITEMS: Array<{ key: DomainFilterType; labelKey: string; fallback: string }> = [
  { key: 'sync', labelKey: 'filterSyncDomains', fallback: '同步域名' },
  { key: 'all', labelKey: 'filterAllDomains', fallback: '所有' },
  { key: 'blacklist', labelKey: 'filterBlacklistDomains', fallback: '黑名单' },
];

function message(key: string, fallback: string): string {
  return browser.i18n.getMessage(key) || fallback;
}

function createDefaultConfig(): ConfigData {
  return {
    ...DEFAULT_CONFIG,
    uuid: String(short_uid.generate()),
  };
}

function toEditableCookie(cookie: ManagedCookie): EditableCookie {
  return {
    ...cookie,
    sameSite: cookie.sameSite || 'unspecified',
    expirationDateText: cookie.expirationDate ? String(cookie.expirationDate) : '',
  };
}

function toManagedCookie(cookie: EditableCookie): ManagedCookie {
  const expirationDate = cookie.expirationDateText.trim().length ? Number(cookie.expirationDateText) : undefined;

  return {
    ...cookie,
    sameSite: cookie.sameSite || undefined,
    expirationDate: Number.isFinite(expirationDate) ? expirationDate : undefined,
  };
}

function downloadJson(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function hasSavedConfig(config: ConfigData): boolean {
  return Boolean(config.endpoint && config.password && config.uuid);
}

function cookieKey(cookie: ManagedCookie): string {
  return get_cookie_identity_key(cookie);
}

function formatCookieLabel(cookie: ManagedCookie): string {
  return `${cookie.name} ${cookie.path}`;
}

function areCookiesDifferent(left: ManagedCookie, right: ManagedCookie): boolean {
  return [
    left.value !== right.value,
    left.secure !== right.secure,
    left.httpOnly !== right.httpOnly,
    (left.sameSite || 'unspecified') !== (right.sameSite || 'unspecified'),
    (left.expirationDate || 0) !== (right.expirationDate || 0),
  ].some(Boolean);
}

function cookieMatchesSyncScope(cookie: ManagedCookie, config: Pick<ConfigData, 'domains' | 'blacklist'>): boolean {
  const normalizedDomain = normalize_domain(cookie.domain || '');
  const syncDomains = split_lines(config.domains);

  if (syncDomains.length > 0) {
    return syncDomains.some(item => normalizedDomain.includes(normalize_domain(item)));
  }

  const blacklistDomains = split_lines(config.blacklist);
  return !blacklistDomains.some(item => normalizedDomain.includes(normalize_domain(item)));
}

function regroupCookiesForSyncDiff(cookieGroups: CookieGroups, config: Pick<ConfigData, 'domains' | 'blacklist'>): CookieGroups {
  const groupedByDomain: CookieGroups = {};
  const seen = new Set<string>();

  for (const cookies of Object.values(cookieGroups)) {
    for (const cookie of cookies) {
      if (!cookieMatchesSyncScope(cookie, config)) {
        continue;
      }

      const identity = `${cookie.domain}|${cookie.path}|${cookie.name}`;
      if (seen.has(identity)) {
        continue;
      }
      seen.add(identity);

      const domain = cookie.domain || '';
      if (!groupedByDomain[domain]) {
        groupedByDomain[domain] = [];
      }
      groupedByDomain[domain].push(cookie);
    }
  }

  return Object.keys(groupedByDomain)
    .sort((left, right) => normalize_domain(left).localeCompare(normalize_domain(right)))
    .reduce((result, domain) => {
      result[domain] = groupedByDomain[domain].slice().sort((left, right) => {
        const leftName = `${left.name || ''}${left.path || ''}`;
        const rightName = `${right.name || ''}${right.path || ''}`;
        return leftName.localeCompare(rightName);
      });
      return result;
    }, {} as CookieGroups);
}

function buildDiffGroups(localGroups: CookieGroups, remoteGroups: CookieGroups): DiffGroup[] {
  const domains = Array.from(new Set([...Object.keys(localGroups), ...Object.keys(remoteGroups)])).sort();

  return domains.map(domain => {
    const localCookies = localGroups[domain] || [];
    const remoteCookies = remoteGroups[domain] || [];
    const localMap = new Map(localCookies.map(cookie => [cookieKey(cookie), cookie]));
    const remoteMap = new Map(remoteCookies.map(cookie => [cookieKey(cookie), cookie]));

    const onlyLocal: ManagedCookie[] = [];
    const onlyRemote: ManagedCookie[] = [];
    const changed: Array<{ local: ManagedCookie; remote: ManagedCookie }> = [];

    for (const [key, localCookie] of localMap) {
      const remoteCookie = remoteMap.get(key);
      if (!remoteCookie) {
        onlyLocal.push(localCookie);
      } else if (areCookiesDifferent(localCookie, remoteCookie)) {
        changed.push({ local: localCookie, remote: remoteCookie });
      }
    }

    for (const [key, remoteCookie] of remoteMap) {
      if (!localMap.has(key)) {
        onlyRemote.push(remoteCookie);
      }
    }

    return { domain, onlyLocal, onlyRemote, changed };
  }).filter(group => group.onlyLocal.length || group.onlyRemote.length || group.changed.length);
}

function formatLogTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

function maskCookieValue(value: string): string {
  if (!value) {
    return '';
  }
  if (value.length <= 8) {
    return '*'.repeat(value.length);
  }
  return `${value.slice(0, 4)}***${value.slice(-4)}`;
}

const CookieCloudPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('settings');
  const [data, setData] = useState<ConfigData>(createDefaultConfig);
  const [allCookieGroups, setAllCookieGroups] = useState<CookieGroups>({});
  const [searchKeyword, setSearchKeyword] = useState('');
  const [loadingCookies, setLoadingCookies] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingCookie, setEditingCookie] = useState<CookieEditorState | null>(null);
  const [domainFilter, setDomainFilter] = useState<DomainFilterType>('all');
  const [openDomainMenu, setOpenDomainMenu] = useState<string | null>(null);
  const [visibleValues, setVisibleValues] = useState<Record<string, boolean>>({});
  const [toastItems, setToastItems] = useState<ToastItem[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([]);
  const [diffGroups, setDiffGroups] = useState<DiffGroup[]>([]);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [selectedDomains, setSelectedDomains] = useState<SelectedDomainMap>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const pushToast = (type: ToastType, text: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToastItems(prev => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToastItems(prev => prev.filter(item => item.id !== id));
    }, 2600);
  };

  const loadSyncLogs = async () => {
    setSyncLogs(await list_sync_logs());
  };

  const loadConfig = async () => {
    const savedData = await load_data('COOKIE_SYNC_SETTING');
    const normalized = normalize_config(savedData);

    if (!normalized.uuid) {
      normalized.uuid = String(short_uid.generate());
    }

    setData(normalized);
    setDomainFilter(get_default_domain_filter(normalized));
    setActiveTab(hasSavedConfig(normalized) ? 'manager' : 'settings');
    return normalized;
  };

  const loadCookies = async (keyword: string = searchKeyword) => {
    setLoadingCookies(true);
    try {
      const groups = await list_cookies_by_domain(keyword);
      setAllCookieGroups(groups as CookieGroups);
    } finally {
      setLoadingCookies(false);
    }
  };

  useEffect(() => {
    void loadConfig();
    void loadCookies('');
    void loadSyncLogs();
  }, []);

  const filteredCookieGroups = useMemo(
    () => filter_domains_by_type(allCookieGroups, domainFilter, data) as CookieGroups,
    [allCookieGroups, domainFilter, data],
  );
  const visibleFilterItems = useMemo(() => {
    const hasSyncKeywords = split_lines(data.domains).length > 0;
    return hasSyncKeywords ? DOMAIN_FILTER_ITEMS : DOMAIN_FILTER_ITEMS.filter(item => item.key !== 'sync');
  }, [data.domains]);
  const visibleDomainEntries = useMemo(() => Object.entries(filteredCookieGroups), [filteredCookieGroups]);
  const visibleDomainNames = useMemo(() => visibleDomainEntries.map(([domain]) => domain), [visibleDomainEntries]);
  const selectedDomainNames = useMemo(
    () => Object.keys(selectedDomains).filter(domain => selectedDomains[domain]),
    [selectedDomains],
  );
  const selectedVisibleDomainCount = useMemo(
    () => visibleDomainNames.filter(domain => selectedDomains[domain]).length,
    [selectedDomains, visibleDomainNames],
  );

  const handleInputChange = (field: keyof ConfigData, value: string | number) => {
    setData(prevData => ({
      ...prevData,
      [field]: value,
    }));
  };

  const runManualAction = async (actionLabel: string) => {
    if (!data.endpoint || !data.password || !data.uuid || !data.type) {
      pushToast('error', message('fullMessagePlease', '请填写完整的信息'));
      return;
    }

    if (data.type === 'pause') {
      pushToast('error', message('actionNotAllowedInPause', '暂停状态下无法进行此操作'));
      return;
    }

    try {
      const ret = await handleConfigMessage({ ...data, no_cache: 1, trigger: 'manual' });
      await loadSyncLogs();
      if (ret && ret.message === 'done') {
        pushToast('success', ret.note || `${actionLabel}${message('success', '成功')}`);
        return;
      }
    } catch (error) {
      console.error('Action failed:', error);
    }

    pushToast('error', `${actionLabel}${message('failedCheckInfo', '失败，请检查填写的信息是否正确')}`);
  };

  const save = async () => {
    if (!data.endpoint || !data.password || !data.uuid || !data.type) {
      pushToast('error', message('fullMessagePlease', '请填写完整的信息'));
      return;
    }

    await save_data('COOKIE_SYNC_SETTING', data);
    setActiveTab('manager');
    pushToast('success', message('saveSucess', '保存成功'));
  };

  const exportConfig = () => {
    downloadJson(`cookiecloud-config-${Date.now()}.json`, data);
    pushToast('success', message('exportedConfig', '配置已导出'));
  };

  const importConfig = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const normalized = normalize_config(parsed);
      if (!normalized.uuid) {
        normalized.uuid = String(short_uid.generate());
      }
      setData(normalized);
      setDomainFilter(get_default_domain_filter(normalized));
      await save_data('COOKIE_SYNC_SETTING', normalized);
      setActiveTab('manager');
      pushToast('success', message('importSuccess', '导入成功'));
    } catch (error) {
      console.error('Import failed:', error);
      pushToast('error', message('importFailed', '导入失败，请检查 JSON 文件'));
    } finally {
      event.target.value = '';
    }
  };

  const uuidRegen = () => handleInputChange('uuid', String(short_uid.generate()));
  const passwordGen = () => handleInputChange('password', String(short_uid.generate()));

  const searchDomains = async () => {
    await loadCookies(searchKeyword);
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      void searchDomains();
    }
  };

  const beginEditCookie = (cookie: ManagedCookie) => {
    setEditingKey(get_cookie_identity_key(cookie));
    setEditingCookie({
      original: cookie,
      draft: toEditableCookie(cookie),
    });
  };

  const cancelEditCookie = () => {
    setEditingKey(null);
    setEditingCookie(null);
  };

  const saveCookieEdit = async () => {
    if (!editingCookie) {
      return;
    }

    const nextCookie = toManagedCookie(editingCookie.draft);
    const previousCookie = editingCookie.original;

    if (get_cookie_identity_key(previousCookie) !== get_cookie_identity_key(nextCookie)) {
      await delete_cookie(previousCookie);
    }

    await upsert_cookie(nextCookie);
    cancelEditCookie();
    await loadCookies(searchKeyword);
    pushToast('success', message('cookieUpdated', 'Cookie 已更新'));
  };

  const removeCookie = async (cookie: ManagedCookie) => {
    const ok = window.confirm(message('deleteCookieConfirm', '确认删除这条 Cookie 吗？'));
    if (!ok) {
      return;
    }

    await delete_cookie(cookie);
    if (editingKey === get_cookie_identity_key(cookie)) {
      cancelEditCookie();
    }
    await loadCookies(searchKeyword);
    pushToast('success', message('cookieDeleted', 'Cookie 已删除'));
  };

  const updateConfigAndMenu = (nextConfig: ConfigData) => {
    setData(nextConfig);
    setDomainFilter(prev => (prev === 'sync' && split_lines(nextConfig.domains).length === 0 ? 'all' : prev));
    setOpenDomainMenu(null);
  };

  const appendToBlacklist = async (domain: string) => {
    updateConfigAndMenu(await add_domain_to_blacklist(domain));
    pushToast('success', message('blacklistAdded', '已加入同步黑名单'));
  };

  const removeFromBlacklist = async (domain: string) => {
    updateConfigAndMenu(await remove_domain_from_blacklist(domain));
    pushToast('success', message('blacklistRemoved', '已移出同步黑名单'));
  };

  const appendToSyncList = async (domain: string) => {
    updateConfigAndMenu(await add_domain_to_sync_list(domain));
    pushToast('success', message('syncAdded', '已加入同步域名'));
  };

  const removeFromSyncList = async (domain: string) => {
    updateConfigAndMenu(await remove_domain_from_sync_list(domain));
    pushToast('success', message('syncRemoved', '已移出同步域名'));
  };

  const copyDomainCookies = async (domain: string, cookies: ManagedCookie[]) => {
    const text = cookie_list_to_header_string(cookies);
    await navigator.clipboard.writeText(text);
    setOpenDomainMenu(null);
    pushToast('success', `${domain} ${message('copySuccess', '已复制到剪贴板')}`);
  };

  const toggleCookieValue = (key: string) => {
    setVisibleValues(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const toggleDomainSelection = (domain: string) => {
    setSelectedDomains(prev => ({
      ...prev,
      [domain]: !prev[domain],
    }));
  };

  const selectVisibleDomains = () => {
    if (visibleDomainNames.length === 0) {
      return;
    }

    setSelectedDomains(prev => {
      const next = { ...prev };
      for (const domain of visibleDomainNames) {
        next[domain] = true;
      }
      return next;
    });
    pushToast('info', message('selectedCurrentFilter', '已选中当前筛选结果'));
  };

  const clearAllSelections = () => {
    setSelectedDomains({});
    pushToast('info', message('selectionCleared', '已取消全部选择'));
  };

  const runBatchDomainAction = async (action: 'addSync' | 'removeSync' | 'addBlacklist' | 'removeBlacklist') => {
    if (selectedDomainNames.length === 0) {
      pushToast('error', message('selectDomainsFirst', '请先选择域名'));
      return;
    }

    let nextConfig: ConfigData;
    let toastKey = 'batchActionCompleted';
    let fallback = '批量操作已完成';

    switch (action) {
      case 'addSync':
        nextConfig = await add_domains_to_sync_list(selectedDomainNames);
        toastKey = 'batchSyncAdded';
        fallback = '已批量加入同步域名';
        break;
      case 'removeSync':
        nextConfig = await remove_domains_from_sync_list(selectedDomainNames);
        toastKey = 'batchSyncRemoved';
        fallback = '已批量移出同步域名';
        break;
      case 'addBlacklist':
        nextConfig = await add_domains_to_blacklist(selectedDomainNames);
        toastKey = 'batchBlacklistAdded';
        fallback = '已批量加入同步黑名单';
        break;
      default:
        nextConfig = await remove_domains_from_blacklist(selectedDomainNames);
        toastKey = 'batchBlacklistRemoved';
        fallback = '已批量移出同步黑名单';
        break;
    }

    updateConfigAndMenu(nextConfig);
    pushToast('success', `${message(toastKey, fallback)} (${selectedDomainNames.length})`);
  };

  const loadDiffPreview = async () => {
    if (!data.endpoint || !data.password || !data.uuid) {
      pushToast('error', message('fullMessagePlease', '请填写完整的信息'));
      return;
    }

    setLoadingDiff(true);
    try {
      const remoteSnapshot = await fetch_remote_cookie_snapshot({
        endpoint: data.endpoint,
        password: data.password,
        uuid: data.uuid,
        crypto_type: data.crypto_type,
      });
      const localGroups = await list_cookies_by_domain('');
      const localScopedGroups = regroupCookiesForSyncDiff(localGroups as CookieGroups, data);
      const remoteScopedGroups = regroupCookiesForSyncDiff((remoteSnapshot.cookie_data || {}) as CookieGroups, data);
      setDiffGroups(buildDiffGroups(localScopedGroups, remoteScopedGroups));
      pushToast('info', message('diffLoaded', '差异预览已更新'));
    } catch (error) {
      console.error('Diff preview failed:', error);
      pushToast('error', message('diffFailed', '差异预览加载失败'));
    } finally {
      setLoadingDiff(false);
    }
  };

  const domainCount = Object.keys(filteredCookieGroups).length;
  const cookieCount = Object.values(filteredCookieGroups).reduce((sum, items) => sum + items.length, 0);
  const blacklistDomains = split_lines(data.blacklist).length;
  const blacklistEffective = split_lines(data.domains).length === 0;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-80 flex-col gap-2">
        {toastItems.map(item => (
          <div
            key={item.id}
            className={[
              'rounded-2xl px-4 py-3 text-sm text-white shadow-lg',
              item.type === 'success' ? 'bg-emerald-600' : item.type === 'error' ? 'bg-rose-600' : 'bg-slate-900',
            ].join(' ')}
          >
            {item.text}
          </div>
        ))}
      </div>

      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 rounded-3xl bg-gradient-to-r from-sky-700 via-cyan-600 to-emerald-500 px-6 py-6 text-white shadow-xl shadow-sky-900/15">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-white/70">CookieCloud</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">{message('appTitle', 'CookieCloud')}</h1>
              <p className="mt-2 max-w-2xl text-sm text-white/85">{message('pageSubtitle', '管理同步设置，查看 Cookie 与同步状态。')}</p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-white/15 px-4 py-3 backdrop-blur-sm">
                <div className="text-xs uppercase tracking-wide text-white/70">{message('statsDomains', '域名数')}</div>
                <div className="mt-1 text-2xl font-semibold">{domainCount}</div>
              </div>
              <div className="rounded-2xl bg-white/15 px-4 py-3 backdrop-blur-sm">
                <div className="text-xs uppercase tracking-wide text-white/70">{message('statsCookies', 'Cookie 数')}</div>
                <div className="mt-1 text-2xl font-semibold">{cookieCount}</div>
              </div>
              <div className="rounded-2xl bg-white/15 px-4 py-3 backdrop-blur-sm">
                <div className="text-xs uppercase tracking-wide text-white/70">{message('statsBlacklist', '黑名单')}</div>
                <div className="mt-1 text-2xl font-semibold">{blacklistDomains}</div>
              </div>
            </div>
          </div>
        </header>

        <div className="mb-6 flex flex-wrap gap-3">
          {TAB_ITEMS.map(item => (
            <button
              key={item.key}
              type="button"
              onClick={() => setActiveTab(item.key)}
              className={[
                'rounded-full px-5 py-2.5 text-sm font-medium transition-colors',
                activeTab === item.key ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/15' : 'bg-white text-slate-600 hover:bg-slate-200',
              ].join(' ')}
            >
              {message(item.labelKey, item.fallback)}
            </button>
          ))}
        </div>

        {activeTab === 'settings' && (
          <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <div className="mb-6 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">{message('settingsTab', '设置')}</h2>
                <p className="mt-1 text-sm text-slate-500">{message('settingsIntro', '配置同步方式、加密信息与同步范围。')}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-secondary" onClick={exportConfig}>{message('exportConfig', '导出配置')}</button>
                <button type="button" className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>{message('importConfig', '导入配置')}</button>
                <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={importConfig} />
              </div>
            </div>

            <div className="space-y-5">
              <div>
                <label className="form-label">{message('workingMode', '工作模式')}</label>
                <div className="mt-2 flex flex-wrap gap-3">
                  {[
                    { value: 'up', label: message('upToServer', '上传到服务器') },
                    { value: 'down', label: message('overwriteToBrowser', '覆盖到浏览器') },
                    { value: 'pause', label: message('pauseSync', '暂停同步') },
                  ].map(item => (
                    <label key={item.value} className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
                      <input type="radio" name="type" value={item.value} checked={data.type === item.value} onChange={e => handleInputChange('type', e.target.value)} className="mr-2 h-4 w-4 accent-sky-600" />
                      {item.label}
                    </label>
                  ))}
                </div>
                {data.type === 'down' && (
                  <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    {message('overwriteModeDesp', '覆盖模式主要用于云端和只读用的浏览器，Cookie和Local Storage覆盖可能导致当前浏览器的登录和修改操作失效；另外部分网站不允许同一个cookie在多个浏览器同时登录，可能导致其他浏览器上账号退出。')}
                  </p>
                )}
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label className="form-label">{message('serverHost', '服务器地址')}</label>
                  <input type="text" className="form-input" value={data.endpoint} onChange={e => handleInputChange('endpoint', e.target.value)} placeholder={message('serverHostPlaceholder', '请输入服务器地址')} />
                </div>
                <div>
                  <label className="form-label">{message('syncTimeInterval', '同步时间间隔·分钟')}</label>
                  <input type="number" min="1" className="form-input" value={data.interval} onChange={e => handleInputChange('interval', parseInt(e.target.value, 10) || 10)} placeholder={message('syncTimeIntervalPlaceholder', '最少10分钟')} />
                </div>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label className="form-label">{message('uuid', '用户KEY · UUID')}</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input type="text" className="form-input pl-10" value={data.uuid} onChange={e => handleInputChange('uuid', e.target.value)} placeholder={message('uuidPlaceholder', '唯一用户ID')} />
                      <CopyToClipboard text={data.uuid} onCopy={() => pushToast('success', `UUID ${message('copySuccess', '已复制到剪贴板')}`)}>
                        <button type="button" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600"><CopyIcon /></button>
                      </CopyToClipboard>
                    </div>
                    <button type="button" className="btn btn-secondary" onClick={uuidRegen}>{message('reGenerate', '重新生成')}</button>
                  </div>
                </div>
                <div>
                  <label className="form-label">{message('syncPassword', '端对端加密密码')}</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input type="password" className="form-input pl-10" value={data.password} onChange={e => handleInputChange('password', e.target.value)} placeholder={message('syncPasswordPlaceholder', '丢失后数据失效，请妥善保管')} />
                      <CopyToClipboard text={data.password} onCopy={() => pushToast('success', `Password ${message('copySuccess', '已复制到剪贴板')}`)}>
                        <button type="button" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600"><CopyIcon /></button>
                      </CopyToClipboard>
                    </div>
                    <button type="button" className="btn btn-secondary" onClick={passwordGen}>{message('generate', '自动生成')}</button>
                  </div>
                </div>
              </div>

              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <label className="form-label">{message('cookieExpireMinutes', 'Cookie过期时间·分钟')}</label>
                  <input type="number" min="0" className="form-input" value={data.expire_minutes} onChange={e => handleInputChange('expire_minutes', parseInt(e.target.value, 10) || 0)} placeholder={message('cookieExpireMinutesPlaceholder', '0为关闭浏览器后立刻过期')} />
                </div>
                <div>
                  <label className="form-label">{message('syncLocalStorageOrNot', '是否同步Local Storage')}</label>
                  <div className="flex gap-3">
                    {[
                      { value: 1, label: message('yes', '是') },
                      { value: 0, label: message('no', '否') },
                    ].map(item => (
                      <label key={item.value} className="flex flex-1 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-700">
                        <input type="radio" name="with_storage" checked={Number(data.with_storage) === item.value} onChange={() => handleInputChange('with_storage', item.value)} className="mr-2 h-4 w-4 accent-sky-600" />
                        {item.label}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="xl:col-span-2">
                  <label className="form-label">{message('cryptoAlgorithm', '加密算法')}</label>
                  <select className="form-input" value={data.crypto_type} onChange={e => handleInputChange('crypto_type', e.target.value)}>
                    <option value="legacy">{message('cryptoLegacy', 'CryptoJS(动态IV)')}</option>
                    <option value="aes-128-cbc-fixed">{message('cryptoAesCbcFixed', 'AES-128-CBC(固定IV)')}</option>
                  </select>
                  <p className="mt-2 text-xs text-slate-500">
                    {data.crypto_type === 'aes-128-cbc-fixed'
                      ? message('cryptoAesCbcFixedDesc', '使用标准 AES-128-CBC 算法，IV固定为 0x0')
                      : message('cryptoLegacyDesc', '使用CryptoJS加密算法，会动态生成IV')}
                  </p>
                </div>
              </div>

              <div>
                <label className="form-label">{message('requestHeader', '请求Header·选填')}</label>
                <textarea className="form-textarea" value={data.headers} onChange={e => handleInputChange('headers', e.target.value)} placeholder={message('requestHeaderPlaceholder', "在请求时追加Header，用于服务端鉴权等场景，一行一个，格式为'Key:Value'，不能有空格")} />
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label className="form-label">{message('syncDomainKeyword', '同步域名关键词·选填')}</label>
                  <textarea className="form-textarea" value={data.domains} onChange={e => handleInputChange('domains', e.target.value)} placeholder={message('syncDomainKeywordPlaceholder', '一行一个，同步包含关键词的全部域名，如qq.com,jd.com会包含全部子域名，留空默认同步全部')} />
                </div>
                <div>
                  <label className="form-label">{message('syncDomainBlacklist', '同步域名黑名单·选填')}</label>
                  <textarea className="form-textarea" value={data.blacklist} onChange={e => handleInputChange('blacklist', e.target.value)} placeholder={message('syncDomainBlacklistPlaceholder', '黑名单仅在同步域名关键词为空时生效。一行一个域名，匹配则不参与同步')} />
                  <p className={`mt-2 text-xs ${blacklistEffective ? 'text-slate-500' : 'text-amber-700'}`}>
                    {blacklistEffective
                      ? message('blacklistEffectiveHint', '当前未设置同步域名关键词，黑名单会参与实际同步过滤。')
                      : message('blacklistInactiveHint', '当前已设置同步域名关键词，黑名单仅作标记展示，不会影响实际同步范围。')}
                  </p>
                </div>
              </div>

              <div>
                <label className="form-label">{message('cookieKeepLive', 'Cookie保活·选填')}</label>
                <textarea className="form-textarea" value={data.keep_live} onChange={e => handleInputChange('keep_live', e.target.value)} placeholder={message('cookieKeepLivePlaceholder', '定时后台刷新URL，模拟用户活跃。一行一个URL，默认60分钟，可用 URL|分钟数 的方式指定刷新时间')} />
                <p className="mt-2 text-xs text-slate-500">{message('keepLiveStop', '暂停同步和保活')}</p>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap justify-end gap-3 border-t border-slate-200 pt-5">
              {data.type !== 'pause' && (
                <>
                  <button type="button" className="btn btn-primary" onClick={() => void runManualAction(message('syncManual', '手动同步'))}>{message('syncManual', '手动同步')}</button>
                  <button type="button" className="btn btn-secondary" onClick={() => void runManualAction(message('test', '测试'))}>{message('test', '测试')}</button>
                </>
              )}
              <button type="button" className="btn btn-success" onClick={save}>{message('save', '保存')}</button>
            </div>
          </section>
        )}

        {activeTab === 'manager' && (
          <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <div className="flex flex-col gap-4 border-b border-slate-200 pb-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">{message('managerTab', '管理')}</h2>
                  <p className="mt-1 text-sm text-slate-500">{message('managerIntroCompact', '按域名查看 Cookie，并进行筛选、批量操作和编辑。')}</p>
                </div>
                <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
                  <input
                    type="text"
                    className="form-input min-w-[260px]"
                    value={searchKeyword}
                    onChange={e => setSearchKeyword(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    placeholder={message('searchDomainPlaceholder', '输入域名关键字，如 github 或 qq.com')}
                  />
                  <button type="button" className="btn btn-primary" onClick={() => void searchDomains()}>{message('searchDomain', '搜索域名')}</button>
                  <button type="button" className="btn btn-secondary" onClick={() => void loadCookies(searchKeyword)}>{message('refreshList', '刷新列表')}</button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {visibleFilterItems.map(item => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setDomainFilter(item.key)}
                    className={[
                      'rounded-full px-4 py-2 text-sm transition-colors',
                      domainFilter === item.key ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                    ].join(' ')}
                  >
                    {message(item.labelKey, item.fallback)}
                  </button>
                ))}
              </div>

              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="text-sm text-slate-600">
                    {message('selectionSummary', '已选域名')} <span className="font-semibold text-slate-900">{selectedDomainNames.length}</span>
                    {' / '}
                    {message('currentFilterCount', '当前筛选结果')} <span className="font-semibold text-slate-900">{visibleDomainNames.length}</span>
                    {selectedVisibleDomainCount !== selectedDomainNames.length && (
                      <span className="ml-2 text-xs text-slate-500">{message('selectionRetainedHint', '其他筛选结果中的选择已保留')}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn btn-secondary" onClick={selectVisibleDomains}>{message('selectCurrentFiltered', '全选当前筛选结果')}</button>
                    <button type="button" className="btn btn-secondary" onClick={clearAllSelections}>{message('clearSelection', '取消全部选择')}</button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className="btn btn-secondary" onClick={() => void runBatchDomainAction('addSync')} disabled={selectedDomainNames.length === 0}>{message('batchAddToSync', '批量加入同步')}</button>
                  <button type="button" className="btn btn-secondary" onClick={() => void runBatchDomainAction('removeSync')} disabled={selectedDomainNames.length === 0}>{message('batchRemoveFromSync', '批量移出同步')}</button>
                  <button type="button" className="btn btn-secondary" onClick={() => void runBatchDomainAction('addBlacklist')} disabled={selectedDomainNames.length === 0}>{message('batchAddToBlacklist', '批量加入黑名单')}</button>
                  <button type="button" className="btn btn-secondary" onClick={() => void runBatchDomainAction('removeBlacklist')} disabled={selectedDomainNames.length === 0}>{message('batchRemoveFromBlacklist', '批量移出黑名单')}</button>
                </div>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {loadingCookies && <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">{message('loadingCookies', '正在读取 Cookie...')}</div>}
              {!loadingCookies && domainCount === 0 && <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-10 text-center text-sm text-slate-500">{message('noCookieFound', '没有找到匹配的 Cookie 数据')}</div>}

              {!loadingCookies && visibleDomainEntries.map(([domain, cookies]) => {
                const status = get_domain_status(domain, data);

                return (
                  <div key={domain} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <label className="flex min-w-0 flex-1 cursor-pointer gap-3">
                        <input type="checkbox" checked={Boolean(selectedDomains[domain])} onChange={() => toggleDomainSelection(domain)} className="mt-1 h-4 w-4 shrink-0 accent-sky-600" />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-base font-semibold text-slate-900">{domain}</h3>
                            {status.isInSyncList && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-700">{message('tagSync', '需同步')}</span>}
                            {status.isInBlacklist && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-700">{message('tagBlacklist', '黑名单')}</span>}
                            {status.isInBlacklist && !blacklistEffective && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">{message('tagBlacklistInactive', '黑名单未生效')}</span>}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">{cookies.length} {message('cookieItems', '条 Cookie')}</div>
                          {status.isInBlacklist && !blacklistEffective && <div className="mt-1 text-xs text-amber-700">{message('blacklistInactiveDomainHint', '已配置同步域名关键词，此标记当前不会阻止该域名参与同步。')}</div>}
                        </div>
                      </label>

                      <div className="relative self-start">
                        <button type="button" className="btn btn-secondary px-3 py-2" onClick={() => setOpenDomainMenu(prev => prev === domain ? null : domain)}>{message('domainActions', '操作')}</button>
                        {openDomainMenu === domain && (
                          <div className="absolute right-0 z-20 mt-2 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                            <button type="button" className="menu-item" onClick={() => void copyDomainCookies(domain, cookies)}>{message('copyDomainCookies', '复制当前域名 Cookie')}</button>
                            {status.isInBlacklist ? (
                              <button type="button" className="menu-item" onClick={() => void removeFromBlacklist(domain)}>{message('removeFromBlacklist', '移出黑名单')}</button>
                            ) : (
                              <button type="button" className="menu-item" onClick={() => void appendToBlacklist(domain)}>{message('addToBlacklist', '加入同步黑名单')}</button>
                            )}
                            {status.isInSyncList ? (
                              <button type="button" className="menu-item" onClick={() => void removeFromSyncList(domain)}>{message('removeFromSync', '移出同步域名')}</button>
                            ) : (
                              <button type="button" className="menu-item" onClick={() => void appendToSyncList(domain)}>{message('addToSync', '加入同步域名')}</button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 space-y-2">
                      {cookies.map(cookie => {
                        const rowKey = cookieKey(cookie);
                        const isEditing = editingKey === rowKey && editingCookie;
                        const currentCookie = isEditing ? editingCookie.draft : null;

                        return (
                          <div key={rowKey} className="rounded-2xl bg-slate-50 px-3 py-3">
                            {isEditing && currentCookie ? (
                              <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                                <div>
                                  <label className="form-label">Name</label>
                                  <input type="text" className="form-input" value={currentCookie.name} onChange={e => setEditingCookie(prev => prev ? { ...prev, draft: { ...prev.draft, name: e.target.value } } : prev)} />
                                </div>
                                <div>
                                  <label className="form-label">Value</label>
                                  <input type="text" className="form-input" value={currentCookie.value} onChange={e => setEditingCookie(prev => prev ? { ...prev, draft: { ...prev.draft, value: e.target.value } } : prev)} />
                                </div>
                                <div>
                                  <label className="form-label">Path</label>
                                  <input type="text" className="form-input" value={currentCookie.path} onChange={e => setEditingCookie(prev => prev ? { ...prev, draft: { ...prev.draft, path: e.target.value } } : prev)} />
                                </div>
                                <div>
                                  <label className="form-label">SameSite</label>
                                  <select className="form-input" value={currentCookie.sameSite} onChange={e => setEditingCookie(prev => prev ? { ...prev, draft: { ...prev.draft, sameSite: e.target.value } } : prev)}>
                                    {COOKIE_SAME_SITE_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label className="form-label">Expiration</label>
                                  <input type="text" className="form-input" value={currentCookie.expirationDateText} onChange={e => setEditingCookie(prev => prev ? { ...prev, draft: { ...prev.draft, expirationDateText: e.target.value } } : prev)} placeholder={message('expirationPlaceholder', '秒级时间戳，可留空')} />
                                </div>
                                <div className="flex items-end gap-4">
                                  <label className="inline-flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={currentCookie.secure} onChange={e => setEditingCookie(prev => prev ? { ...prev, draft: { ...prev.draft, secure: e.target.checked } } : prev)} className="h-4 w-4 accent-sky-600" />Secure</label>
                                  <label className="inline-flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={currentCookie.httpOnly} onChange={e => setEditingCookie(prev => prev ? { ...prev, draft: { ...prev.draft, httpOnly: e.target.checked } } : prev)} className="h-4 w-4 accent-sky-600" />HttpOnly</label>
                                </div>
                                <div className="flex flex-wrap gap-3 xl:col-span-3">
                                  <button type="button" className="btn btn-success" onClick={() => void saveCookieEdit()}>{message('saveCookie', '保存 Cookie')}</button>
                                  <button type="button" className="btn btn-secondary" onClick={cancelEditCookie}>{message('cancelEdit', '取消')}</button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded-full bg-slate-900 px-2 py-0.5 text-xs font-medium text-white">{cookie.name}</span>
                                    <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-600">{cookie.path}</span>
                                    {cookie.secure && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">S</span>}
                                    {cookie.httpOnly && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">H</span>}
                                  </div>
                                  <div className="mt-1 grid gap-x-3 gap-y-1 text-xs text-slate-500 md:grid-cols-2 xl:grid-cols-4">
                                    <div className="truncate">
                                      <span className="font-medium text-slate-700">Value:</span>{' '}
                                      {visibleValues[rowKey] ? cookie.value : maskCookieValue(cookie.value)}
                                      <button type="button" className="ml-2 text-sky-600" onClick={() => toggleCookieValue(rowKey)}>{visibleValues[rowKey] ? message('hideValue', '隐藏') : message('showValue', '显示')}</button>
                                    </div>
                                    <div><span className="font-medium text-slate-700">SameSite:</span> {cookie.sameSite || 'unspecified'}</div>
                                    <div><span className="font-medium text-slate-700">Expires:</span> {cookie.expirationDate || message('sessionCookie', '会话 Cookie')}</div>
                                    <div><span className="font-medium text-slate-700">Store:</span> {cookie.storeId || '-'}</div>
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-2 lg:justify-end">
                                  <button type="button" className="btn btn-secondary px-3 py-2" onClick={() => beginEditCookie(cookie)}>{message('editCookie', '编辑')}</button>
                                  <button type="button" className="btn btn-danger px-3 py-2" onClick={() => void removeCookie(cookie)}>{message('deleteCookie', '删除')}</button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {activeTab === 'diff' && (
          <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">{message('diffPreviewTitle', '差异预览')}</h2>
                <p className="mt-1 text-sm text-slate-500">{message('diffPreviewIntro', '查看当前同步范围内的本地与云端差异。')}</p>
              </div>
              <button type="button" className="btn btn-secondary" onClick={() => void loadDiffPreview()}>{loadingDiff ? message('loadingDiff', '加载中...') : message('refreshDiff', '刷新差异')}</button>
            </div>

            <div className="max-h-[calc(100vh-18rem)] space-y-4 overflow-y-auto pr-1">
              {diffGroups.length === 0 ? (
                <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">{message('noDiffData', '暂无差异数据，点击刷新差异查看。')}</div>
              ) : diffGroups.map(group => (
                <div key={group.domain} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="font-semibold text-slate-900">{group.domain}</div>
                    <div className="text-xs text-slate-500">
                      {message('diffLocalOnly', '仅本地')}: {group.onlyLocal.length} · {message('diffRemoteOnly', '仅云端')}: {group.onlyRemote.length} · {message('diffChanged', '值变更')}: {group.changed.length}
                    </div>
                  </div>

                  {group.onlyLocal.length > 0 && (
                    <div className="mt-3">
                      <div className="text-xs font-medium uppercase tracking-wide text-emerald-700">{message('diffLocalOnly', '仅本地')}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {group.onlyLocal.map(cookie => (
                          <span key={`${group.domain}-local-${cookieKey(cookie)}`} className="rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-700">{formatCookieLabel(cookie)}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {group.onlyRemote.length > 0 && (
                    <div className="mt-3">
                      <div className="text-xs font-medium uppercase tracking-wide text-amber-700">{message('diffRemoteOnly', '仅云端')}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {group.onlyRemote.map(cookie => (
                          <span key={`${group.domain}-remote-${cookieKey(cookie)}`} className="rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-700">{formatCookieLabel(cookie)}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {group.changed.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <div className="text-xs font-medium uppercase tracking-wide text-sky-700">{message('diffChanged', '值变更')}</div>
                      {group.changed.map(({ local, remote }) => (
                        <div key={`${group.domain}-changed-${cookieKey(local)}`} className="rounded-2xl bg-slate-50 px-3 py-3 text-xs text-slate-600">
                          <div className="font-medium text-slate-900">{formatCookieLabel(local)}</div>
                          <div className="mt-1">Local: {maskCookieValue(local.value)}</div>
                          <div className="mt-1">Remote: {maskCookieValue(remote.value)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {activeTab === 'logs' && (
          <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">{message('syncLogsTitle', '同步日志')}</h2>
                <p className="mt-1 text-sm text-slate-500">{message('syncLogsIntro', '查看最近的同步记录与结果。')}</p>
              </div>
              <button type="button" className="btn btn-secondary" onClick={() => void loadSyncLogs()}>{message('refreshLogs', '刷新日志')}</button>
            </div>

            <div className="max-h-[calc(100vh-18rem)] space-y-3 overflow-y-auto pr-1">
              {syncLogs.length === 0 ? (
                <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">{message('noSyncLogs', '暂无同步日志')}</div>
              ) : syncLogs.map(log => (
                <div key={log.id} className="rounded-2xl bg-slate-50 px-4 py-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium text-slate-900">{log.direction === 'upload' ? message('logUpload', '上传') : message('logDownload', '下载')}</div>
                    <span className={log.success ? 'text-emerald-600' : 'text-rose-600'}>{log.success ? message('logSuccess', '成功') : message('logFailed', '失败')}</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{formatLogTime(log.timestamp)} · {message('logTrigger', '触发方式')}: {log.trigger}</div>
                  <div className="mt-1 text-xs text-slate-500">{message('statsDomains', '域名数')}: {log.domainCount} · {message('statsCookies', 'Cookie 数')}: {log.cookieCount}</div>
                  <div className="mt-1 text-xs text-slate-600">{log.note}</div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default CookieCloudPage;

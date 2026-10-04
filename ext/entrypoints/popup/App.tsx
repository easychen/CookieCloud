import React, { useState, useEffect, useRef } from 'react';
import { load_data, save_data } from '../../utils/functions';
import UploadedCookies from '../../components/UploadedCookies';
import PageCookies from '../../components/PageCookies';
import ServerKeepAlive from '../../components/ServerKeepAlive';
import NextSync from '../../components/NextSync';
import ThemeSettings from '../../components/ThemeSettings';
import { ConfigData, export_config, import_config } from '../../utils/config-transfer';
import { handleConfigMessage } from '../../utils/messaging';
import short_uid from 'short-uuid';
import browser from 'webextension-polyfill';
import { CopyToClipboard } from 'react-copy-to-clipboard';

// 复制图标 SVG 组件
const CopyIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
);

const CookieCloudPopup: React.FC = () => {
  const [loaded, setLoaded] = useState(false);
  const [draftError, setDraftError] = useState('');
  const draftWrites = useRef(Promise.resolve());
  const importInput = useRef<HTMLInputElement>(null);
  const [transferMessage, setTransferMessage] = useState('');
  const [transferError, setTransferError] = useState(false);
  const [importing, setImporting] = useState(false);
  const [data, setData] = useState<ConfigData>({
    endpoint: "https://ccc.ft07.com",
    password: "",
    interval: 10,
    domains: "",
    uuid: String(short_uid.generate()),
    type: "up",
    keep_live: "",
    with_storage: 1,
    blacklist: "google.com",
    headers: "",
    expire_minutes: 60 * 24 * 365,
    crypto_type: "legacy"
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        const [saved, draft] = await Promise.all([load_data("COOKIE_SYNC_SETTING"), load_data("COOKIE_SYNC_DRAFT")]);
        const savedData = { ...(saved && !Array.isArray(saved) ? saved : {}), ...(draft && !Array.isArray(draft) ? draft : {}) };
        if (savedData) {
          // 旧版本 popup 把 radio/number 输入存成字符串；这里归一化成数字，
          // 否则 with_storage === 1 之类的严格比较会让控件显示成未选中。
          if (savedData.with_storage !== undefined) {
            savedData.with_storage = Number(savedData.with_storage);
          }
          if (savedData.interval !== undefined) {
            savedData.interval = Number(savedData.interval);
          }
          if (savedData.expire_minutes !== undefined) {
            savedData.expire_minutes = Number(savedData.expire_minutes);
          }
          setData(prevData => ({ ...prevData, ...savedData }));
        }
      } catch (error) {
        console.error('Failed to load data:', error);
        setDraftError('无法加载已保存配置，请刷新页面后重试。');
        return;
      }
      setLoaded(true);
    };
    loadData();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    draftWrites.current = draftWrites.current
      .then(() => save_data('COOKIE_SYNC_DRAFT', data))
      .then(() => setDraftError(''))
      .catch(() => setDraftError('草稿保存失败，请保持此页面打开并重试。'));
  }, [data, loaded]);

  const handleInputChange = (field: keyof ConfigData, value: string | number) => {
    setData(prevData => ({
      ...prevData,
      [field]: value
    }));
  };

  const test = async (action: string = browser.i18n.getMessage('test') || '测试') => {
    console.log("request,begin");
    
    if (!data.endpoint || (data.crypto_type !== 'none' && !data.password) || !data.uuid || !data.type) {
      alert(browser.i18n.getMessage("fullMessagePlease") || "请填写完整的信息");
      return;
    }
    
    if (data.type === 'pause') {
      alert(browser.i18n.getMessage("actionNotAllowedInPause") || "暂停状态下无法进行此操作");
      return;
    }
    
    try {
      const ret = await handleConfigMessage({ ...data, no_cache: 1 });
      console.log(action + " returned", ret);
      
      if (ret && ret.message === 'done') {
        if (ret.note) {
          alert(ret.note);
        } else {
          alert(action + (browser.i18n.getMessage('success') || '成功'));
        }
      } else {
        alert(action + (browser.i18n.getMessage('failedCheckInfo') || '失败，请检查填写的信息是否正确') + (ret?.note ? `\n${ret.note}` : ''));
      }
    } catch (error) {
      console.error('Test failed:', error);
      alert(action + (browser.i18n.getMessage('failedCheckInfo') || '失败，请检查填写的信息是否正确') + `\n${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const save = async () => {
    if (!data.endpoint || (data.crypto_type !== 'none' && !data.password) || !data.uuid || !data.type) {
      alert(browser.i18n.getMessage("fullMessagePlease") || "请填写完整的信息");
      return;
    }
    
    try {
      await save_data("COOKIE_SYNC_SETTING", data);
      const ret = await load_data("COOKIE_SYNC_SETTING");
      console.log("Read after save", ret);
      alert(browser.i18n.getMessage("saveSucess") || "保存成功");
    } catch (error) {
      console.error('Save failed:', error);
      alert(error instanceof Error ? error.message : 'Save failed');
    }
  };

  const uuidRegen = () => {
    handleInputChange('uuid', String(short_uid.generate()));
  };

  const passwordGen = () => {
    handleInputChange('password', String(short_uid.generate()));
  };

  const exportConfig = () => {
    const url = URL.createObjectURL(new Blob([export_config(data)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `cookiecloud-config-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setTransferError(false);
    setTransferMessage('已导出当前页面配置。');
  };

  const importConfig = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setImporting(true);
    try {
      if (file.size > 1024 * 1024) throw new Error('配置文件不能超过 1 MB');
      const config = import_config(await file.text());
      setData(previous => ({ ...previous, ...config }));
      setTransferError(false);
      setTransferMessage('配置已导入草稿，未提供的字段保留当前值。请检查后点击“保存”以应用。');
    } catch (error) {
      setTransferError(true);
      setTransferMessage(error instanceof Error ? error.message : '配置导入失败');
    } finally { setImporting(false); }
  };

  // 复制成功回调
  const onCopySuccess = (type: 'UUID' | 'Password') => {
    alert(`${type} ${browser.i18n.getMessage('copySuccess') || '已复制到剪贴板'}`);
  };

  // 复制失败回调
  const onCopyError = () => {
    alert(browser.i18n.getMessage('copyFailed') || '复制失败，请手动复制');
  };

  return (
    <div className="w-full max-w-5xl mx-auto overflow-x-hidden bg-white dark:bg-slate-900 rounded-lg shadow-lg flex flex-col min-h-screen relative">
      <div className="flex-1 overflow-y-auto p-5 pb-20">
        <div className="text-center mb-5 pb-4 border-b border-gray-200 dark:border-slate-700">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-slate-100">CookieCloud <span className="text-sm text-gray-500 dark:text-slate-400">v{browser.runtime.getManifest().version}</span></h2>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-2">未保存的设置会自动保留为草稿；点击“保存”后才应用于自动同步。</p>
          {draftError && <p role="alert" className="text-sm text-red-600 dark:text-red-400 mt-2">{draftError}</p>}
        </div>

        <ThemeSettings />
        <NextSync />
        {loaded && <PageCookies config={data} addKeepAlive={(url, interval) => {
          const address = new URL(url); address.hash = '';
          const lines = data.keep_live.split('\n').filter(line => line.split('|')[0].trim() !== address.href);
          handleInputChange('keep_live', [...lines.filter(line => line.trim()), `${address.href}|${interval}`].join('\n'));
        }} />}
        {loaded && <ServerKeepAlive config={data} onChange={value => handleInputChange('keep_live', value)} />}
        <section className="border border-gray-200 dark:border-slate-700 rounded p-4 mb-5">
          <h3 className="font-medium text-gray-800 dark:text-slate-100">配置导入 / 导出</h3>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-2">导出当前页面的全部设置，包含 UUID、密码和请求 Header，请妥善保管。配置文件不包含 Cookie 或 LocalStorage 数据。</p>
          <div className="flex gap-2 mt-3">
            <button className="btn btn-primary disabled:opacity-50" disabled={!loaded || importing} onClick={exportConfig}>导出配置</button>
            <button className="btn bg-gray-100 dark:bg-slate-700 disabled:opacity-50" disabled={!loaded || importing} onClick={() => importInput.current?.click()}>{importing ? '导入中…' : '导入配置'}</button>
            <input ref={importInput} type="file" accept=".json,application/json" className="hidden" onChange={importConfig} aria-label="选择配置 JSON 文件" />
          </div>
          {transferMessage && <p role={transferError ? 'alert' : 'status'} className={`text-sm mt-3 ${transferError ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-emerald-400'}`}>{transferMessage}</p>}
        </section>
        
        <fieldset disabled={!loaded || importing} className="space-y-4">
          {/* Working Mode */}
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-slate-300 mb-2">
              {browser.i18n.getMessage('workingMode') || '工作模式'}
            </label>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="type"
                  value="up"
                  checked={data.type === 'up'}
                  onChange={(e) => handleInputChange('type', e.target.value)}
                  className="mr-2"
                />
                {browser.i18n.getMessage('upToServer') || '上传到服务器'}
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="type"
                  value="down"
                  checked={data.type === 'down'}
                  onChange={(e) => handleInputChange('type', e.target.value)}
                  className="mr-2"
                />
                {browser.i18n.getMessage('overwriteToBrowser') || '覆盖到浏览器'}
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="type"
                  value="pause"
                  checked={data.type === 'pause'}
                  onChange={(e) => handleInputChange('type', e.target.value)}
                  className="mr-2"
                />
                {browser.i18n.getMessage('pauseSync') || '暂停同步'}
              </label>
            </div>
            
            {data.type === 'down' && (
              <div className="bg-red-600 text-white p-3 mt-2 rounded">
                {browser.i18n.getMessage('overwriteModeDesp') || '覆盖模式主要用于云端和只读用的浏览器，Cookie和Local Storage覆盖可能导致当前浏览器的登录和修改操作失效；另外部分网站不允许同一个cookie在多个浏览器同时登录，可能导致其他浏览器上账号退出。'}
              </div>
            )}
          </div>

          {data.type !== 'pause' && (
            <>
              {/* Server Address */}
              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-slate-300 mb-1">
                  {browser.i18n.getMessage('serverHost') || '服务器地址'}
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder={browser.i18n.getMessage('serverHostPlaceholder') || '请输入服务器地址'}
                  value={data.endpoint}
                  onChange={(e) => handleInputChange('endpoint', e.target.value)}
                />
              </div>

              {/* UUID */}
              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-slate-300 mb-1">
                  {browser.i18n.getMessage('uuid') || 'User KEY · UUID'}
                </label>
                <div className="flex">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      className="form-input pl-10 pr-3"
                      value={data.uuid}
                      onChange={(e) => handleInputChange('uuid', e.target.value)}
                    />
                    <CopyToClipboard 
                      text={data.uuid}
                      onCopy={() => onCopySuccess('UUID')}
                    >
                      <button
                        className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-slate-400 hover:text-gray-600 dark:hover:text-slate-200"
                        title="复制 UUID"
                      >
                        <CopyIcon />
                      </button>
                    </CopyToClipboard>
                  </div>
                  <button
                    className="ml-2 px-3 py-2 bg-gray-500 dark:bg-slate-600 text-white rounded hover:bg-gray-600 dark:hover:bg-slate-500"
                    onClick={uuidRegen}
                  >
                    {browser.i18n.getMessage('reGenerate') || '重新生成'}
                  </button>
                </div>
              </div>

              {/* Password */}
              {data.crypto_type !== 'none' && <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-slate-300 mb-1">
                  {browser.i18n.getMessage('syncPassword') || '端对端加密密码'}
                </label>
                <div className="flex">
                  <div className="relative flex-1">
                    <input
                      type="password"
                      className="form-input pl-10 pr-3"
                      placeholder={browser.i18n.getMessage('syncPasswordPlaceholder') || '丢失后数据失效，请妥善保管'}
                      value={data.password}
                      onChange={(e) => handleInputChange('password', e.target.value)}
                    />
                    <CopyToClipboard 
                      text={data.password}
                      onCopy={() => onCopySuccess('Password')}
                    >
                      <button
                        className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-slate-400 hover:text-gray-600 dark:hover:text-slate-200"
                        title="复制密码"
                      >
                        <CopyIcon />
                      </button>
                    </CopyToClipboard>
                  </div>
                  <button
                    className="ml-2 px-3 py-2 bg-gray-500 dark:bg-slate-600 text-white rounded hover:bg-gray-600 dark:hover:bg-slate-500"
                    onClick={passwordGen}
                  >
                    {browser.i18n.getMessage('generate') || '生成'}
                  </button>
                </div>
              </div>}

              {/* Crypto Algorithm */}
              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-slate-300 mb-1">
                  {browser.i18n.getMessage('cryptoAlgorithm') || '加密算法'}
                </label>
                <select
                  className="form-input"
                  value={data.crypto_type}
                  onChange={(e) => handleInputChange('crypto_type', e.target.value)}
                >
                  <option value="legacy">{browser.i18n.getMessage('cryptoLegacy') || 'CryptoJS(动态IV)'}</option>
                  <option value="aes-128-cbc-fixed">{browser.i18n.getMessage('cryptoAesCbcFixed') || 'AES-128-CBC(固定IV)'}</option>
                  <option value="none">{browser.i18n.getMessage('cryptoNone') || '不加密（明文）'}</option>
                </select>
                <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                  {data.crypto_type === 'none'
                    ? (browser.i18n.getMessage('cryptoNoneDesc') || '无需密码，Cookie 和 LocalStorage 将以明文传输并存储，适用于可信内网。')
                    : data.crypto_type === 'legacy'
                    ? (browser.i18n.getMessage('cryptoLegacyDesc') || '使用CryptoJS加密算法，会动态生成IV')
                    : (browser.i18n.getMessage('cryptoAesCbcFixedDesc') || '使用标准 AES-128-CBC 算法，IV固定为 0x0')
                  }
                </div>
              </div>

              {/* Cookie Expiration Time */}
              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-slate-300 mb-1">
                  {browser.i18n.getMessage('cookieExpireMinutes') || 'Cookie过期时间·分钟'}
                </label>
                <select className="form-input mb-2" aria-label={browser.i18n.getMessage('cookieExpiryMode') || 'Cookie 有效期模式'}
                  value={data.expire_minutes === -1 ? 'long' : 'custom'}
                  onChange={event => handleInputChange('expire_minutes', event.target.value === 'long' ? -1 : 60 * 24 * 365)}>
                  <option value="custom">{browser.i18n.getMessage('cookieExpiryCustom') || '自定义分钟数'}</option>
                  <option value="long">{browser.i18n.getMessage('cookieExpiryLong') || '长期有效（每次同步延长 400 天）'}</option>
                </select>
                {data.expire_minutes !== -1 && <input
                  type="number"
                  min="0"
                  className="form-input"
                  placeholder={browser.i18n.getMessage('cookieExpireMinutesPlaceholder') || '0为关闭浏览器后立刻过期'}
                  value={data.expire_minutes}
                  onChange={(e) => handleInputChange('expire_minutes', Math.max(0, parseInt(e.target.value) || 0))}
                />}
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">{browser.i18n.getMessage('cookieExpiryDesc') || '仅在覆盖到浏览器时生效。0 为会话 Cookie；长期有效每次同步延长 400 天，无法延长网站服务端的登录会话。'}</p>
              </div>

              {/* Sync Interval */}
              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-slate-300 mb-1">
                  {browser.i18n.getMessage('syncTimeInterval') || '同步时间间隔·分钟'}
                </label>
                <input
                  type="number"
                  className="form-input"
                  min="1"
                  placeholder={browser.i18n.getMessage('syncTimeIntervalPlaceholder') || '最少10分钟'}
                  value={data.interval}
                  onChange={(e) => handleInputChange('interval', parseInt(e.target.value) || 10)}
                />
              </div>

              {data.type === 'up' && (
                <>
                  {/* Sync LocalStorage */}
                  <div>
                    <label className="block text-sm font-medium text-gray-600 dark:text-slate-300 mb-2">
                      {browser.i18n.getMessage('syncLocalStorageOrNot') || '是否同步Local Storage'}
                    </label>
                    <div className="flex items-center space-x-4">
                      <label className="flex items-center">
                        <input
                          type="radio"
                          name="with_storage"
                          value="1"
                          checked={data.with_storage === 1}
                          onChange={(e) => handleInputChange('with_storage', parseInt(e.target.value))}
                          className="mr-2"
                        />
                        {browser.i18n.getMessage('yes') || '是'}
                      </label>
                      <label className="flex items-center">
                        <input
                          type="radio"
                          name="with_storage"
                          value="0"
                          checked={data.with_storage === 0}
                          onChange={(e) => handleInputChange('with_storage', parseInt(e.target.value))}
                          className="mr-2"
                        />
                        {browser.i18n.getMessage('no') || '否'}
                      </label>
                    </div>
                  </div>

                  {/* Additional Request Headers */}
                  <div>
                    <label className="block text-sm font-medium text-gray-600 dark:text-slate-300 mb-1">
                      {browser.i18n.getMessage('requestHeader') || '请求Header·选填'}
                    </label>
                    <textarea
                      className="form-textarea"
                      placeholder={browser.i18n.getMessage('requestHeaderPlaceholder') || '在请求时追加Header，用于服务端鉴权等场景，一行一个，格式为\'Key:Value\'，不能有空格'}
                      value={data.headers}
                      onChange={(e) => handleInputChange('headers', e.target.value)}
                    />
                  </div>

                  {/* Domain Filter */}
                  <div>
                    <label className="block text-sm font-medium text-gray-600 dark:text-slate-300 mb-1">
                      {browser.i18n.getMessage('syncDomainKeyword') || '同步域名关键词·选填'}
                    </label>
                    <textarea
                      className="form-textarea"
                      placeholder={browser.i18n.getMessage('syncDomainKeywordPlaceholder') || '一行一个，同步包含关键词的全部域名，如qq.com,jd.com会包含全部子域名，留空默认同步全部'}
                      value={data.domains}
                      onChange={(e) => handleInputChange('domains', e.target.value)}
                    />
                  </div>

                  {/* Blacklist */}
                  <div>
                    <label className="block text-sm font-medium text-gray-600 dark:text-slate-300 mb-1">
                      {browser.i18n.getMessage('syncDomainBlacklist') || '同步域名黑名单·选填'}
                    </label>
                    <textarea
                      className="form-textarea"
                      placeholder={browser.i18n.getMessage('syncDomainBlacklistPlaceholder') || '黑名单仅在同步域名关键词为空时生效。一行一个域名，匹配则不参与同步'}
                      value={data.blacklist}
                      onChange={(e) => handleInputChange('blacklist', e.target.value)}
                    />
                  </div>

                </>
              )}
            </>
          )}



        </fieldset>
        {loaded && <UploadedCookies endpoint={data.endpoint} password={data.password} headers={data.headers} currentUuid={data.uuid} mode={data.type} />}
      </div>
      
      {/* 固定在底部的按钮组 */}
      <div className="sticky bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-gray-200 dark:border-slate-700 p-4">
        <div className="flex justify-between">
          <div className="space-x-2">
            {data.type !== 'pause' && (
              <>
                <button
                  className="btn btn-primary text-sm px-3 py-2"
                  disabled={!loaded || importing}
                  onClick={() => test(browser.i18n.getMessage('syncManual') || '手动同步')}
                >
                  {browser.i18n.getMessage('syncManual') || '手动同步'}
                </button>
                <button
                  className="btn btn-primary text-sm px-3 py-2"
                  disabled={!loaded || importing}
                  onClick={() => test(browser.i18n.getMessage('test') || '测试')}
                >
                  {browser.i18n.getMessage('test') || '测试'}
                </button>
              </>
            )}
          </div>
          <button
            className="btn btn-success text-sm px-4 py-2"
            disabled={!loaded || importing}
            onClick={save}
          >
            {browser.i18n.getMessage('save') || '保存'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CookieCloudPopup;

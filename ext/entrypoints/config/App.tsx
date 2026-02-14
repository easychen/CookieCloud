import React, { useState, useEffect } from 'react';
import { load_data, save_data } from '../../utils/functions';
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

interface ConfigData {
  endpoint: string;
  password: string;
  auth_key_id: string;
  auth_secret: string;
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

type AutoSaveState = 'idle' | 'saving' | 'saved' | 'error';
type ToastType = 'info' | 'success' | 'error';

const defaultConfigData: ConfigData = {
  endpoint: "https://ccc.ft07.com",
  password: "",
  auth_key_id: "default",
  auth_secret: "",
  interval: 10,
  domains: "",
  uuid: String(short_uid.generate()),
  type: "up",
  keep_live: "",
  with_storage: 1,
  blacklist: "google.com",
  headers: "",
  expire_minutes: 60 * 24 * 365,
  crypto_type: "aes-256-gcm-v1"
};

const CookieCloudConfig: React.FC = () => {
  const [data, setData] = useState<ConfigData>(defaultConfigData);
  const [isHydrated, setIsHydrated] = useState(false);
  const [autoSaveState, setAutoSaveState] = useState<AutoSaveState>('idle');
  const [toast, setToast] = useState<{ type: ToastType; text: string } | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const showToast = (type: ToastType, text: string) => {
    setToast({ type, text });
  };

  useEffect(() => {
    if (!toast) return;
    // Keep "in-progress" info toast visible while an action is running.
    if (toast.type === 'info' && isBusy) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast, isBusy]);

  useEffect(() => {
    let isCancelled = false;

    const loadData = async () => {
      try {
        const savedData = await load_data("COOKIE_SYNC_SETTING");
        if (!isCancelled && savedData) {
          setData(prevData => ({ ...prevData, ...savedData }));
        }
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        if (!isCancelled) {
          setIsHydrated(true);
        }
      }
    };

    loadData();

    return () => {
      isCancelled = true;
    };
  }, []);

  const handleInputChange = (field: keyof ConfigData, value: string | number) => {
    setData(prevData => ({
      ...prevData,
      [field]: value
    }));
  };

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    setAutoSaveState('saving');
    const timer = window.setTimeout(async () => {
      try {
        await save_data("COOKIE_SYNC_SETTING", data);
        setAutoSaveState('saved');
      } catch (error) {
        console.error('Auto-save failed:', error);
        setAutoSaveState('error');
      }
    }, 500);

    return () => {
      window.clearTimeout(timer);
    };
  }, [data, isHydrated]);

  const test = async (action: string = browser.i18n.getMessage('test') || '测试') => {
    console.log("request,begin");

    // Common misconfig on LazyCat: using container-internal hostname, which browsers cannot resolve.
    try {
      const u = new URL(String(data.endpoint || '').trim());
      if (u.hostname === 'cookiecloud' && u.port === '8088') {
        showToast('error', '你填的是容器内部地址（cookiecloud:8088），浏览器访问不到。请改成 https://<你的CookieCloud域名>/api');
        return;
      }
    } catch {
      // ignore parse errors here; required-field validation below will handle empty/invalid endpoint.
    }
    
    if (!data.endpoint || !data.password || !data.uuid || !data.type || !data.auth_key_id || !data.auth_secret) {
      showToast('error', browser.i18n.getMessage("fullMessagePlease") || "请填写完整的信息");
      return;
    }
    
    if (data.type === 'pause') {
      showToast('error', browser.i18n.getMessage("actionNotAllowedInPause") || "暂停状态下无法进行此操作");
      return;
    }
    
    try {
      setIsBusy(true);
      showToast('info', `${action}...`);
      const ret = await handleConfigMessage({ ...data, no_cache: 1 });
      console.log(action + " returned", ret);
      
      if (ret && ret.message === 'done') {
        if (ret.note) {
          showToast('info', ret.note);
        } else {
          showToast('success', action + (browser.i18n.getMessage('success') || '成功'));
        }
      } else {
        if (ret?.note) {
          showToast('error', ret.note);
        } else {
          showToast('error', action + (browser.i18n.getMessage('failedCheckInfo') || '失败，请检查填写的信息是否正确'));
        }
      }
    } catch (error) {
      console.error('Test failed:', error);
      const message = error instanceof Error ? error.message : String(error || '');
      showToast('error', message ? `${action}失败：${message}` : action + (browser.i18n.getMessage('failedCheckInfo') || '失败，请检查填写的信息是否正确'));
    } finally {
      setIsBusy(false);
    }
  };

  const uuidRegen = () => {
    handleInputChange('uuid', String(short_uid.generate()));
  };

  const passwordGen = () => {
    handleInputChange('password', String(short_uid.generate()));
  };

  // 复制成功回调
  const onCopySuccess = (type: 'UUID' | 'Password') => {
    showToast('success', `${type} ${browser.i18n.getMessage('copySuccess') || '已复制到剪贴板'}`);
  };

  const autoSaveMessage = autoSaveState === 'saving'
    ? (browser.i18n.getMessage('autoSaveSaving') || '自动保存中...')
    : autoSaveState === 'saved'
    ? (browser.i18n.getMessage('autoSaveSaved') || '已自动保存')
    : autoSaveState === 'error'
    ? (browser.i18n.getMessage('autoSaveFailed') || '自动保存失败')
    : '';

  const autoSaveClass = autoSaveState === 'error' ? 'text-red-600' : 'text-gray-500';

  return (
    <div className="min-h-screen bg-slate-100 py-6 px-4">
	      <div className="mx-auto w-full max-w-4xl overflow-x-hidden bg-white rounded-lg shadow-lg border border-gray-200 flex flex-col">
	        {toast && (
	          <div
	            data-testid="toast"
	            className={
	              `fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[min(56rem,calc(100%-2rem))] px-4 py-3 text-sm font-medium rounded-md shadow border pointer-events-none ` +
	              (toast.type === 'success'
	                ? 'bg-green-50 text-green-700 border-green-200'
	                : toast.type === 'error'
	                ? 'bg-red-50 text-red-700 border-red-200'
	                : 'bg-blue-50 text-blue-700 border-blue-200')
	            }
	          >
	            {toast.text}
	          </div>
	        )}
        <div className="p-5 pb-6 md:p-6 md:pb-8">
          <div className="text-center mb-5 pb-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-800">CookieCloud</h2>
          </div>

          <div className="space-y-4">
            {/* Working Mode */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">
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
                  <label className="block text-sm font-medium text-gray-600 mb-1">
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
                  <label className="block text-sm font-medium text-gray-600 mb-1">
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
                          className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          title="复制 UUID"
                        >
                          <CopyIcon />
                        </button>
                      </CopyToClipboard>
                    </div>
                    <button
                      className="ml-2 px-3 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
                      onClick={uuidRegen}
                    >
                      {browser.i18n.getMessage('reGenerate') || '重新生成'}
                    </button>
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
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
                          className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          title="复制密码"
                        >
                          <CopyIcon />
                        </button>
                      </CopyToClipboard>
                    </div>
                    <button
                      className="ml-2 px-3 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
                      onClick={passwordGen}
                    >
                      {browser.i18n.getMessage('generate') || '生成'}
                    </button>
                  </div>
                </div>

                {/* Auth Key ID */}
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    {browser.i18n.getMessage('authKeyId') || 'Auth Key ID'}
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder={browser.i18n.getMessage('authKeyIdPlaceholder') || '用于服务端定位签名密钥'}
                    value={data.auth_key_id}
                    onChange={(e) => handleInputChange('auth_key_id', e.target.value)}
                  />
                </div>

                {/* Auth Secret */}
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    {browser.i18n.getMessage('authSecret') || 'Auth Secret'}
                  </label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder={browser.i18n.getMessage('authSecretPlaceholder') || '用于生成请求签名，需与服务端一致'}
                    value={data.auth_secret}
                    onChange={(e) => handleInputChange('auth_secret', e.target.value)}
                  />
                </div>

                {/* Crypto Algorithm */}
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    {browser.i18n.getMessage('cryptoAlgorithm') || '加密算法'}
                  </label>
                  <select
                    className="form-input"
                    value={data.crypto_type}
                    onChange={(e) => handleInputChange('crypto_type', e.target.value)}
                  >
                    <option value="aes-256-gcm-v1">{browser.i18n.getMessage('cryptoAesGcm') || 'AES-256-GCM (PBKDF2)'}</option>
                    <option value="legacy">{browser.i18n.getMessage('cryptoLegacy') || 'CryptoJS(动态IV)'}</option>
                    <option value="aes-128-cbc-fixed">{browser.i18n.getMessage('cryptoAesCbcFixed') || 'AES-128-CBC(固定IV)'}</option>
                  </select>
                  <div className="text-xs text-gray-500 mt-1">
                    {data.crypto_type === 'aes-256-gcm-v1'
                      ? (browser.i18n.getMessage('cryptoAesGcmDesc') || '推荐：AES-256-GCM + PBKDF2，包含认证标签，安全性更高')
                      : data.crypto_type === 'legacy'
                      ? (browser.i18n.getMessage('cryptoLegacyDesc') || '使用CryptoJS加密算法，会动态生成IV')
                      : (browser.i18n.getMessage('cryptoAesCbcFixedDesc') || '使用标准 AES-128-CBC 算法，IV固定为 0x0')
                    }
                  </div>
                </div>

                {/* Cookie Expiration Time */}
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    {browser.i18n.getMessage('cookieExpireMinutes') || 'Cookie过期时间·分钟'}
                  </label>
                  <input
                    type="number"
                    className="form-input"
                    placeholder={browser.i18n.getMessage('cookieExpireMinutesPlaceholder') || '0为关闭浏览器后立刻过期'}
                    value={data.expire_minutes}
                    onChange={(e) => handleInputChange('expire_minutes', parseInt(e.target.value, 10) || 0)}
                  />
                </div>

                {/* Sync Interval */}
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    {browser.i18n.getMessage('syncTimeInterval') || '同步时间间隔·分钟'}
                  </label>
                  <input
                    type="number"
                    className="form-input"
                    min="1"
                    placeholder={browser.i18n.getMessage('syncTimeIntervalPlaceholder') || '最少10分钟'}
                    value={data.interval}
                    onChange={(e) => handleInputChange('interval', parseInt(e.target.value, 10) || 10)}
                  />
                </div>

                {data.type === 'up' && (
                  <>
                    {/* Sync LocalStorage */}
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-2">
                        {browser.i18n.getMessage('syncLocalStorageOrNot') || '是否同步Local Storage'}
                      </label>
                      <div className="flex items-center space-x-4">
                        <label className="flex items-center">
                          <input
                            type="radio"
                            name="with_storage"
                            value="1"
                            checked={data.with_storage === 1}
                            onChange={(e) => handleInputChange('with_storage', parseInt(e.target.value, 10))}
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
                            onChange={(e) => handleInputChange('with_storage', parseInt(e.target.value, 10))}
                            className="mr-2"
                          />
                          {browser.i18n.getMessage('no') || '否'}
                        </label>
                      </div>
                    </div>

                    {/* Additional Request Headers */}
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">
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
                      <label className="block text-sm font-medium text-gray-600 mb-1">
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
                      <label className="block text-sm font-medium text-gray-600 mb-1">
                        {browser.i18n.getMessage('syncDomainBlacklist') || '同步域名黑名单·选填'}
                      </label>
                      <textarea
                        className="form-textarea"
                        placeholder={browser.i18n.getMessage('syncDomainBlacklistPlaceholder') || '黑名单仅在同步域名关键词为空时生效。一行一个域名，匹配则不参与同步'}
                        value={data.blacklist}
                        onChange={(e) => handleInputChange('blacklist', e.target.value)}
                      />
                    </div>

                    {/* Keep Live */}
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">
                        {browser.i18n.getMessage('cookieKeepLive') || 'Cookie Keep Alive · 选填'}
                      </label>
                      <textarea
                        className="form-textarea"
                        style={{ height: "60px" }}
                        placeholder={browser.i18n.getMessage('cookieKeepLivePlaceholder') || '定期刷新URL在后台模拟用户活动。一行一个URL，默认60分钟，可以指定刷新时间与间隔'}
                        value={data.keep_live}
                        onChange={(e) => handleInputChange('keep_live', e.target.value)}
                      />
                    </div>
                  </>
                )}
              </>
            )}

            {data.type === 'pause' && (
              <div className="bg-blue-400 text-white p-3 rounded">
                {browser.i18n.getMessage('keepLiveStop') || '保持活跃已停止'}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4 z-10">
        <div className="flex justify-between">
          <div className="flex items-center flex-wrap gap-2">
            {data.type !== 'pause' && (
              <>
                <button
                  className="btn btn-primary text-sm px-3 py-2"
                  onClick={() => test(browser.i18n.getMessage('syncManual') || '手动同步')}
                  disabled={isBusy}
                >
                  {browser.i18n.getMessage('syncManual') || '手动同步'}
                </button>
                <button
                  className="btn btn-primary text-sm px-3 py-2"
                  onClick={() => test(browser.i18n.getMessage('test') || '测试')}
                  disabled={isBusy}
                >
                  {browser.i18n.getMessage('test') || '测试'}
                </button>
              </>
            )}
          </div>
          <div className={`text-sm font-medium ${autoSaveClass}`}>{autoSaveMessage}</div>
        </div>
      </div>
    </div>
  );
};

export default CookieCloudConfig;

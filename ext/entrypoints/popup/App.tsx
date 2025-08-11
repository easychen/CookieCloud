import React, { useState, useEffect } from 'react';
import { load_data, save_data } from '../../utils/functions';
import { handleConfigMessage } from '../../utils/messaging';
import short_uid from 'short-uuid';
import browser from 'webextension-polyfill';

interface ConfigData {
  endpoint: string;
  password: string;
  interval: number;
  domains: string;
  uuid: string;
  type: string;
  keep_live: string;
  with_storage: number;
  blacklist: string;
  headers: string;
  expire_minutes: number;
}

const CookieCloudPopup: React.FC = () => {
  const [data, setData] = useState<ConfigData>({
    endpoint: "http://127.0.0.1:8088",
    password: "",
    interval: 10,
    domains: "",
    uuid: String(short_uid.generate()),
    type: "up",
    keep_live: "",
    with_storage: 1,
    blacklist: "google.com",
    headers: "",
    expire_minutes: 60 * 24 * 365
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        const savedData = await load_data("COOKIE_SYNC_SETTING");
        if (savedData) {
          setData(prevData => ({ ...prevData, ...savedData }));
        }
      } catch (error) {
        console.error('Failed to load data:', error);
      }
    };
    loadData();
  }, []);

  const handleInputChange = (field: keyof ConfigData, value: string | number) => {
    setData(prevData => ({
      ...prevData,
      [field]: value
    }));
  };

  const test = async (action: string = browser.i18n.getMessage('test') || '测试') => {
    console.log("request,begin");
    
    if (!data.endpoint || !data.password || !data.uuid || !data.type) {
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
        alert(action + (browser.i18n.getMessage('failedCheckInfo') || '失败，请检查填写的信息是否正确'));
      }
    } catch (error) {
      console.error('Test failed:', error);
      alert(action + (browser.i18n.getMessage('failedCheckInfo') || '失败，请检查填写的信息是否正确'));
    }
  };

  const save = async () => {
    if (!data.endpoint || !data.password || !data.uuid || !data.type) {
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
      alert('Save failed');
    }
  };

  const uuidRegen = () => {
    handleInputChange('uuid', String(short_uid.generate()));
  };

  const passwordGen = () => {
    handleInputChange('password', String(short_uid.generate()));
  };

  return (
    <div className="w-96 overflow-x-hidden bg-white rounded-lg shadow-lg">
      <div className="p-5">
        <div className="text-center mb-5 pb-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800">CookieCloud</h2>
        </div>
        
        <div className="space-y-4">
          {/* Working Mode */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">
              {browser.i18n.getMessage('workingMode') || '工作模式'}
            </label>
            <div className="space-y-2">
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
                  <input
                    type="text"
                    className="form-input flex-1"
                    value={data.uuid}
                    onChange={(e) => handleInputChange('uuid', e.target.value)}
                  />
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
                  <input
                    type="password"
                    className="form-input flex-1"
                    placeholder={browser.i18n.getMessage('syncPasswordPlaceholder') || '丢失后数据失效，请妥善保管'}
                    value={data.password}
                    onChange={(e) => handleInputChange('password', e.target.value)}
                  />
                  <button
                    className="ml-2 px-3 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
                    onClick={passwordGen}
                  >
                    {browser.i18n.getMessage('generate') || '生成'}
                  </button>
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
                  onChange={(e) => handleInputChange('expire_minutes', parseInt(e.target.value) || 0)}
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
                  onChange={(e) => handleInputChange('interval', parseInt(e.target.value) || 10)}
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
                </>
              )}
            </>
          )}

          {data.type === 'pause' && (
            <div className="bg-blue-400 text-white p-3 rounded">
              {browser.i18n.getMessage('keepLiveStop') || '保持活跃已停止'}
            </div>
          )}

          {/* Button Group */}
          <div className="flex justify-between mt-6">
            <div className="space-x-2">
              {data.type !== 'pause' && (
                <>
                  <button
                    className="btn btn-primary"
                    onClick={() => test(browser.i18n.getMessage('syncManual') || '手动同步')}
                  >
                    {browser.i18n.getMessage('syncManual') || '手动同步'}
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={() => test(browser.i18n.getMessage('test') || '测试')}
                  >
                    {browser.i18n.getMessage('test') || '测试'}
                  </button>
                </>
              )}
            </div>
            <button
              className="btn btn-success"
              onClick={save}
            >
              {browser.i18n.getMessage('save') || '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CookieCloudPopup;
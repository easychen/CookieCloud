import "./style.css";
import typescriptLogo from '@/assets/typescript.svg';
import viteLogo from '/wxt.svg';
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

class CookieCloudPopup {
  private data: ConfigData;
  private init: ConfigData = {
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
  };

  constructor() {
    this.data = { ...this.init };
    this.initializeUI();
    this.loadData();
  }

  private initializeUI() {
    document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
      <div class="popup-container">
        <div class="header">
          <h2>CookieCloud</h2>
        </div>
        
        <div class="form-group">
          <label>${browser.i18n.getMessage('serverHost') || '服务器地址'}</label>
          <input type="text" id="endpoint" placeholder="${browser.i18n.getMessage('serverHostPlaceholder') || '请输入服务器地址'}" />
        </div>
        
        <div class="form-group">
          <label>${browser.i18n.getMessage('uuid') || 'User KEY · UUID'}</label>
          <input type="text" id="uuid" />
        </div>
        
        <div class="form-group">
          <label>${browser.i18n.getMessage('password') || '密码'}</label>
          <input type="password" id="password" placeholder="${browser.i18n.getMessage('passwordPlaceholder') || '请输入密码'}" />
        </div>
        
        <div class="form-group">
          <label>${browser.i18n.getMessage('workingMode') || '工作模式'}</label>
          <select id="type">
            <option value="up">${browser.i18n.getMessage('upToServer') || '上传到服务器'}</option>
            <option value="down">${browser.i18n.getMessage('overwriteToBrowser') || '覆盖到浏览器'}</option>
            <option value="pause">${browser.i18n.getMessage('pauseSync') || '暂停同步'}</option>
          </select>
        </div>
        
        <div class="form-group">
          <label>${browser.i18n.getMessage('syncInterval') || '同步间隔(分钟)'}</label>
          <input type="number" id="interval" min="1" />
        </div>
        
        <div class="form-group">
          <label>${browser.i18n.getMessage('domains') || '域名过滤'}</label>
          <textarea id="domains" placeholder="${browser.i18n.getMessage('domainsPlaceholder') || '每行一个域名，留空表示所有域名'}"></textarea>
        </div>
        
        <div class="form-group">
          <label>${browser.i18n.getMessage('blacklist') || '黑名单'}</label>
          <textarea id="blacklist" placeholder="${browser.i18n.getMessage('blacklistPlaceholder') || '每行一个域名'}"></textarea>
        </div>
        
        <div class="form-group">
          <label>${browser.i18n.getMessage('withStorage') || '同步LocalStorage'}</label>
          <input type="checkbox" id="with_storage" />
        </div>
        
        <div class="form-group">
          <label>${browser.i18n.getMessage('headers') || '额外请求头'}</label>
          <textarea id="headers" placeholder="${browser.i18n.getMessage('headersPlaceholder') || '每行一个，格式：key:value'}"></textarea>
        </div>
        
        <div class="form-group">
          <label>${browser.i18n.getMessage('expireMinutes') || 'Cookie过期时间(分钟)'}</label>
          <input type="number" id="expire_minutes" />
        </div>
        
        <div class="button-group">
          <button id="test-btn" class="btn btn-primary">${browser.i18n.getMessage('test') || '测试'}</button>
          <button id="save-btn" class="btn btn-success">${browser.i18n.getMessage('save') || '保存'}</button>
        </div>
        
        <div class="overwrite-warning" id="overwrite-warning" style="display: none;">
          <p>${browser.i18n.getMessage('overwriteModeDesp') || '覆盖模式主要用于云端和只读用的浏览器，Cookie和Local Storage覆盖可能导致当前浏览器的登录和修改操作失效；另外部分网站不允许同一个cookie在多个浏览器同时登录，可能导致其他浏览器上账号退出。'}</p>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  private bindEvents() {
    const testBtn = document.getElementById('test-btn')!;
    const saveBtn = document.getElementById('save-btn')!;
    const typeSelect = document.getElementById('type') as HTMLSelectElement;
    const overwriteWarning = document.getElementById('overwrite-warning')!;

    testBtn.addEventListener('click', () => this.test());
    saveBtn.addEventListener('click', () => this.save());
    
    typeSelect.addEventListener('change', (e) => {
      const target = e.target as HTMLSelectElement;
      if (target.value === 'down') {
        overwriteWarning.style.display = 'block';
      } else {
        overwriteWarning.style.display = 'none';
      }
    });

    // Bind input events
    const inputs = ['endpoint', 'uuid', 'password', 'interval', 'domains', 'blacklist', 'headers', 'expire_minutes'];
    inputs.forEach(id => {
      const element = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement;
      element.addEventListener('input', () => this.updateData());
    });

    const withStorageCheckbox = document.getElementById('with_storage') as HTMLInputElement;
    withStorageCheckbox.addEventListener('change', () => this.updateData());
    
    typeSelect.addEventListener('change', () => this.updateData());
  }

  private updateData() {
    const getValue = (id: string) => (document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
    const getChecked = (id: string) => (document.getElementById(id) as HTMLInputElement).checked;

    this.data = {
      endpoint: getValue('endpoint'),
      password: getValue('password'),
      interval: parseInt(getValue('interval')) || 10,
      domains: getValue('domains'),
      uuid: getValue('uuid'),
      type: getValue('type'),
      keep_live: "",
      with_storage: getChecked('with_storage') ? 1 : 0,
      blacklist: getValue('blacklist'),
      headers: getValue('headers'),
      expire_minutes: parseInt(getValue('expire_minutes')) || 60 * 24 * 365
    };
  }

  private setFormValues() {
    const setValue = (id: string, value: any) => {
      const element = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      if (element) element.value = value.toString();
    };
    const setChecked = (id: string, checked: boolean) => {
      const element = document.getElementById(id) as HTMLInputElement;
      if (element) element.checked = checked;
    };

    setValue('endpoint', this.data.endpoint);
    setValue('password', this.data.password);
    setValue('interval', this.data.interval);
    setValue('domains', this.data.domains);
    setValue('uuid', this.data.uuid);
    setValue('type', this.data.type);
    setValue('blacklist', this.data.blacklist);
    setValue('headers', this.data.headers);
    setValue('expire_minutes', this.data.expire_minutes);
    setChecked('with_storage', this.data.with_storage === 1);

    // Show/hide overwrite warning
    const overwriteWarning = document.getElementById('overwrite-warning')!;
    if (this.data.type === 'down') {
      overwriteWarning.style.display = 'block';
    } else {
      overwriteWarning.style.display = 'none';
    }
  }

  private async loadData() {
    try {
      const savedData = await load_data("COOKIE_SYNC_SETTING");
      if (savedData) {
        this.data = { ...this.init, ...savedData };
        this.setFormValues();
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  }

  private async test(action: string = browser.i18n.getMessage('test') || '测试') {
    console.log("request,begin");
    this.updateData();
    
    if (!this.data.endpoint || !this.data.password || !this.data.uuid || !this.data.type) {
      alert(browser.i18n.getMessage("fullMessagePlease") || "请填写完整的信息");
      return;
    }
    
    if (this.data.type == 'pause') {
      alert(browser.i18n.getMessage("actionNotAllowedInPause") || "暂停状态下无法进行此操作");
      return;
    }
    
    try {
      const ret = await handleConfigMessage({ ...this.data, no_cache: 1 });
      console.log(action + "返回", ret);
      
      if (ret && ret.message == 'done') {
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
  }

  private async save() {
    this.updateData();
    
    if (!this.data.endpoint || !this.data.password || !this.data.uuid || !this.data.type) {
      alert(browser.i18n.getMessage("fullMessagePlease") || "请填写完整的信息");
      return;
    }
    
    try {
      await save_data("COOKIE_SYNC_SETTING", this.data);
      const ret = await load_data("COOKIE_SYNC_SETTING");
      console.log("保存后读取", ret);
      alert(browser.i18n.getMessage("saveSucess") || "保存成功");
    } catch (error) {
      console.error('Save failed:', error);
      alert('保存失败');
    }
  }
}

// Initialize the popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new CookieCloudPopup();
});

// Also initialize immediately in case DOMContentLoaded has already fired
if (document.readyState === 'loading') {
  // Do nothing, wait for DOMContentLoaded
} else {
  // DOM is already loaded
  new CookieCloudPopup();
}

import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: '__MSG_appTitle__',
    description: '__MSG_appDesc__',
    default_locale: 'zh_CN',
    permissions: [
      'cookies',
      'tabs', 
      'storage',
      'alarms',
      'unlimitedStorage'
    ],
    host_permissions: [
      '<all_urls>'
    ],
    version: '0.2.4'
  }
});

import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  outDir: 'dist',
  modules: ['@wxt-dev/webextension-polyfill'],
  hooks: {
    'build:manifestGenerated': (_wxt, manifest) => {
      // Keep popup.html as a tab page; toolbar clicks are handled by the background.
      if (manifest.action) delete manifest.action.default_popup;
      if (manifest.browser_action) delete manifest.browser_action.default_popup;
    },
  },
  manifest: ({ browser }) => ({
    name: '__MSG_appTitle__',
    description: '__MSG_appDesc__',
    default_locale: 'zh_CN',
    ...(browser === 'firefox' ? {
      browser_specific_settings: {
        gecko: {
          id: 'cookiecloud@yuliyang2023.github.io',
          strict_min_version: '140.0',
          // Sync transmits cookies and LocalStorage to the configured server.
          data_collection_permissions: {
            required: ['websiteContent', 'browsingActivity', 'authenticationInfo'],
          },
        },
        gecko_android: {
          strict_min_version: '142.0',
        },
      },
    } : {}),
    permissions: [
      'cookies',
      'tabs', 
      'storage',
      'alarms',
      'unlimitedStorage'
    ],
    host_permissions: [
      '<all_urls>'
    ]
  }),
  vite: () => ({
    css: {
      postcss: './postcss.config.js'
    }
  })
});

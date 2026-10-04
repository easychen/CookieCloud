import { upload_cookie, download_cookie, load_data } from '../utils/functions';
import browser from 'webextension-polyfill';
import { sync_due } from '../utils/sync-schedule';

export default defineBackground(() => {
  console.log('CookieCloud Background Script Started', { id: browser.runtime.id });

  (browser.action ?? browser.browserAction).onClicked.addListener(async tab => {
    const page = browser.runtime.getURL('/popup.html');
    const params = new URLSearchParams();
    if (tab.id !== undefined) params.set('targetTabId', String(tab.id));
    if (tab.url) params.set('targetUrl', tab.url);
    const url = `${page}?${params}`;
    const existing = (await browser.tabs.query({})).find(item => item.url?.split('?')[0] === page);
    if (existing?.id !== undefined) {
      await browser.tabs.update(existing.id, { active: true, url });
      if (existing.windowId !== undefined) await browser.windows.update(existing.windowId, { focused: true });
      return;
    }
    await browser.tabs.create({ url, active: true });
  });

  const ensureAlarm = async () => {
    if (!await browser.alarms.get('bg_1_minute')) {
      await browser.alarms.create('bg_1_minute', { periodInMinutes: 1 });
    }
  };
  void ensureAlarm();
  browser.runtime.onStartup.addListener(ensureAlarm);

  browser.runtime.onInstalled.addListener(function (details) {
    if (details.reason == "install") {
      browser.alarms.create('bg_1_minute', {
        when: Date.now(),
        periodInMinutes: 1
      });
    }
    else if (details.reason == "update") {
      browser.alarms.create('bg_1_minute', {
        when: Date.now(),
        periodInMinutes: 1
      });
    }
  });

  browser.alarms.onAlarm.addListener(async a => {
    if (a.name == 'bg_1_minute') {
      // console.log( 'bg_1_minute' );
      const config = await load_data("COOKIE_SYNC_SETTING");
      if (config) {
        if (config.type && config.type == 'pause') {
          console.log("Pause mode, no sync");
          return true;
        }

        // Get current minute count
        const now = new Date();
        const minute = now.getMinutes();
        const hour = now.getHours();
        const day = now.getDate();
        const minute_count = (day * 24 + hour) * 60 + minute;

        if (config.uuid) {
          // If current minute count is divisible by interval, execute sync
          if (sync_due(now, config.interval)) {
            // Start sync
            console.log(`Execute sync ${minute_count} ${config.interval}`);
            if (config.type && config.type == 'down') {
              // Download cookies from server and write to local
              const result = await download_cookie(config);
              if (result && result['action'] == 'done') 
                console.log("Download success");
              else
                console.log(result);
            } else {
              const result = await upload_cookie(config);
              if (result && result['action'] == 'done') 
                console.log("Upload success");
              else
                console.log(result);
            }
          } else {
            // console.log(`Not sync time yet ${minute_count} ${config.interval}`);
          }
        }

      }
    }
  });
});

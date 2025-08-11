import { upload_cookie, download_cookie, load_data, save_data, sleep } from '../utils/functions';
import browser from 'webextension-polyfill';

export default defineBackground(() => {
  console.log('CookieCloud Background Script Started', { id: browser.runtime.id });

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
          console.log("暂停模式，不同步");
          return true;
        }

        // 获得当前的分钟数
        const now = new Date();
        const minute = now.getMinutes();
        const hour = now.getHours();
        const day = now.getDate();
        const minute_count = (day * 24 + hour) * 60 + minute;

        // 如果当前分钟数能被interval整除，则执行同步
        if (minute_count % config.interval == 0) {
          console.log("执行同步", minute_count, config.interval);
          const result = (config.type && config.type == 'down') ? await download_cookie(config) : await upload_cookie(config);
          console.log("同步结果", result);
        }
      }
    }
  });
});

import { load_data, save_data, remove_data } from '../utils/functions';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    console.log('CookieCloud Content Script Loaded');
    
    window.addEventListener("load", async () => {
      // Get current domain
      const host = window.location.hostname;
      const config = await load_data("COOKIE_SYNC_SETTING");
      if (config?.domains) {
        const domains = config.domains?.trim().split("\n");
        // Check if domain partially matches each domain in domains
        let matched = false;
        for (const domain of domains) {
          if (host.includes(domain)) matched = true;
        }
        if (domains.length > 0 && !matched) return false;
      }

      if (config?.type && config.type == 'down') {
        const the_data = await load_data("LS-" + host);
        // console.log( "the_data", the_data );
        if (the_data) {
          // Override local localStorage
          for (const key in the_data) {
            localStorage.setItem(key, the_data[key]);
          }
          // Clear browser storage to avoid multiple overwrites
          await remove_data("LS-" + host);
        }
      } else {
        // Get all localStorage of current page
        const all = localStorage;
        const keys = Object.keys(all);
        const values = Object.values(all);
        const result: any = {};
        for (let i = 0; i < keys.length; i++) {
          result[keys[i]] = values[i];
        }
        // Store it in browser storage
        if (Object.keys(result).length > 0) {
          await save_data("LS-" + host, result);
        }
      }
    });
  },
});

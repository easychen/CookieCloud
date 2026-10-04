export type ThemePreference = 'light' | 'dark' | 'system';
export const THEME_STORAGE_KEY = 'COOKIE_CLOUD_THEME';

export function read_theme(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    if (value === 'light' || value === 'dark') return value;
  } catch { /* Use the system preference when storage is unavailable. */ }
  return 'system';
}

export function apply_theme(preference: ThemePreference) {
  const dark = preference === 'dark' || (preference === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

// Apply before rendering and follow OS changes and other open settings tabs.
export function initialize_theme() {
  const refresh = () => apply_theme(read_theme());
  const media = matchMedia('(prefers-color-scheme: dark)');
  const changed = (event: StorageEvent) => {
    if (event.storageArea === localStorage && (event.key === THEME_STORAGE_KEY || event.key === null)) refresh();
  };
  refresh();
  media.addEventListener('change', refresh);
  window.addEventListener('storage', changed);
  return () => { media.removeEventListener('change', refresh); window.removeEventListener('storage', changed); };
}

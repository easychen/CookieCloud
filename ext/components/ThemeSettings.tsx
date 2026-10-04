import React, { useEffect, useState } from 'react';
import { apply_theme, read_theme, THEME_STORAGE_KEY, ThemePreference } from '../utils/theme';

export default function ThemeSettings() {
  const [theme, setTheme] = useState<ThemePreference>(read_theme);
  const [error, setError] = useState('');
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.storageArea === localStorage && (event.key === THEME_STORAGE_KEY || event.key === null)) setTheme(read_theme());
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);
  const change = (value: ThemePreference) => {
    apply_theme(value);
    setTheme(value);
    try { localStorage.setItem(THEME_STORAGE_KEY, value); setError(''); }
    catch { setError('主题已切换，但无法保存，下次打开将使用之前的设置。'); }
  };
  return <section className="border border-gray-200 dark:border-slate-700 rounded p-4 mb-5">
    <label htmlFor="theme-preference" className="block font-medium text-gray-800 dark:text-slate-100">界面主题</label>
    <select id="theme-preference" className="form-select mt-2" value={theme} onChange={event => change(event.target.value as ThemePreference)}>
      <option value="light">浅色 Light</option>
      <option value="dark">深色 Dark</option>
      <option value="system">跟随系统</option>
    </select>
    <p className="text-xs text-gray-500 dark:text-slate-400 mt-2">立即生效并自动保存。跟随系统会随系统外观变化自动切换。</p>
    {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400 mt-2">{error}</p>}
  </section>;
}

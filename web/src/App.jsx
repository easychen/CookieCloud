/* Cookie Cloud Landing Page
 * Implements a refined, dark-first landing experience with
 * Hero, Feature grid, CTA, Footer, extension dropdown and i18n toggle.
 */
import { useState } from 'react'

// Simple i18n dictionary for EN/ZH. Comments in English as requested.
const dict = {
  en: {
    nav: { github: 'GitHub', docs: 'Docs', get: 'Get Extension', lang: '中文' },
    hero: {
      h1a: 'Sync your cookies',
      h1b: 'across browsers & devices',
      p: 'Cookie Cloud keeps your session cookies in sync — fast, privacy-first, and developer-friendly. Perfect for testing, automation, and multi-device workflows.',
      get: 'Get the Extension',
      self: 'Self-host',
      edge: 'Edge Add-on',
      chrome: 'Chrome Web Store',
    },
    features: [
      { title: 'Configure once', desc: 'Automatic cookie sync after a one-time setup. No manual export/import.' },
      { title: 'Privacy-first', desc: 'Your data stays under your control. Self-host with your own infrastructure.' },
      { title: 'End-to-end encrypted', desc: 'Client-side encryption ensures only you can read your cookie data.' },
      { title: 'Cross-browser', desc: 'Works across Chromium-based browsers and beyond via extension.' },
      { title: 'Automation-friendly', desc: 'Useful in QA flows, playwright tests, and developer tooling.' },
    ],
    cta: { h2: 'Ready to streamline your cookie workflow?', p: 'Install the extension or self-host the API and start syncing today.', get: 'Get Extension', repo: 'GitHub Repo' },
    footer: { license: 'GPLv3 License' },
  },
  zh: {
    nav: { github: 'GitHub', docs: '文档', get: '安装扩展', lang: 'EN' },
    hero: {
      h1a: '同步你的 Cookie',
      h1b: '跨浏览器与设备',
      p: 'Cookie Cloud 让会话 Cookie 自动同步——快速、隐私优先、开发者友好。适用于测试、自动化与多设备场景。',
      get: '安装扩展',
      self: '自托管',
      edge: 'Edge 应用商店',
      chrome: 'Chrome 应用商店',
    },
    features: [
      { title: '一次配置', desc: '一次设置后自动同步 Cookie，无需手动导入/导出。' },
      { title: '隐私优先', desc: '数据由你掌控，可在自有基础设施上自托管。' },
      { title: '端到端加密', desc: '在客户端加密，只有你可以读取 Cookie 数据。' },
      { title: '跨浏览器', desc: '支持 Chromium 系浏览器，更多浏览器可通过扩展支持。' },
      { title: '自动化友好', desc: '适用于 QA 流程、Playwright 测试与开发工具。' },
    ],
    cta: { h2: '准备好优化你的 Cookie 工作流了吗？', p: '安装扩展或自托管 API，立即开始同步。', get: '安装扩展', repo: 'GitHub 仓库' },
    footer: { license: 'GPLv3 许可' },
  },
}

function Nav({ t, lang, onToggleLang }) {
  const [open, setOpen] = useState(false)
  return (
    <header className="fixed top-0 inset-x-0 z-30 backdrop-blur supports-[backdrop-filter]:bg-zinc-900/60 bg-zinc-900/80 border-b border-zinc-800">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        <a href="#" className="flex items-center gap-2">
          <img src="/icon.png" alt="Cookie Cloud logo" className="h-6 w-6 rounded" />
          <span className="text-zinc-200 font-semibold tracking-tight">Cookie Cloud</span>
        </a>
        <nav className="hidden md:flex items-center gap-3 text-sm">
          <a className="text-zinc-300 hover:text-white" href="https://github.com/easychen/CookieCloud" target="_blank" rel="noreferrer">{t.nav.github}</a>
          <a className="text-zinc-300 hover:text-white" href="https://github.com/easychen/CookieCloud#readme" target="_blank" rel="noreferrer">{t.nav.docs}</a>
          <div className="relative">
            <button className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-zinc-800 text-zinc-200 hover:bg-zinc-700 border border-zinc-700" onClick={() => setOpen(v => !v)} aria-haspopup="menu" aria-expanded={open}>
              {t.nav.get}
            </button>
            {open && (
              <div className="absolute right-0 mt-2 w-56 rounded-md border border-zinc-700 bg-zinc-900/95 shadow-lg z-40">
                <a className="block px-3 py-2 text-zinc-200 hover:bg-zinc-800" href="https://microsoftedge.microsoft.com/addons/detail/cookiecloud/bffenpfpjikaeocaihdonmgnjjdpjkeo" target="_blank" rel="noreferrer">{t.hero.edge}</a>
                <a className="block px-3 py-2 text-zinc-200 hover:bg-zinc-800" href="https://chrome.google.com/webstore/detail/cookiecloud/ffjiejobkoibkjlhjnlgmcnnigeelbdl" target="_blank" rel="noreferrer">{t.hero.chrome}</a>
              </div>
            )}
          </div>
          <button className="px-3 py-1.5 rounded-md border border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700" onClick={onToggleLang} aria-label="Toggle language">
            {t.nav.lang}
          </button>
        </nav>
      </div>
    </header>
  )
}

function Hero({ t }) {
  const [open, setOpen] = useState(false)
  return (
    <section className="relative pt-28">
      <div className="absolute inset-0 gradient-ring pointer-events-none" aria-hidden />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-white">
            {t.hero.h1a}
            <span className="block bg-clip-text text-transparent bg-gradient-to-r from-brand to-teal-300">{t.hero.h1b}</span>
          </h1>
          <p className="mt-6 text-lg text-zinc-300">{t.hero.p}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3" id="get-extension">
            <div className="relative">
              <button
                className="px-5 py-2.5 rounded-md bg-brand/90 hover:bg-brand text-zinc-950 font-medium shadow-sm"
                onClick={() => setOpen(v => !v)}
                aria-haspopup="menu"
                aria-expanded={open}
              >
                {t.hero.get}
              </button>
              {open && (
                <div className="absolute left-0 mt-2 w-64 rounded-md border border-zinc-700 bg-zinc-900/95 shadow-lg z-40">
                  <a className="block px-3 py-2 text-zinc-200 hover:bg-zinc-800" href="https://microsoftedge.microsoft.com/addons/detail/cookiecloud/bffenpfpjikaeocaihdonmgnjjdpjkeo" target="_blank" rel="noreferrer">{t.hero.edge}</a>
                  <a className="block px-3 py-2 text-zinc-200 hover:bg-zinc-800" href="https://chrome.google.com/webstore/detail/cookiecloud/ffjiejobkoibkjlhjnlgmcnnigeelbdl" target="_blank" rel="noreferrer">{t.hero.chrome}</a>
                </div>
              )}
            </div>
            <a
              className="px-5 py-2.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700"
              href="https://github.com/easychen/CookieCloud"
              target="_blank"
              rel="noreferrer"
            >
              {t.hero.self}
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}

function Features({ t }) {
  const items = t.features

  return (
    <section className="py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-6">
          {items.map((it, idx) => (
            <div key={it.title} className="hover-border-glow hover-card-gradient rounded-xl border border-zinc-800 bg-zinc-900/70 p-6">
              <div className="h-9 w-9 rounded-md bg-zinc-800 border border-zinc-700 mb-4 flex items-center justify-center text-brand">
                {idx === 0 && <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"></polyline><polyline points="23 20 23 14 17 14"></polyline><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10"></path><path d="M3.51 15A9 9 0 0 0 18.36 18.36L23 14"></path></svg>}
                {idx === 1 && <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>}
                {idx === 2 && <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"></path></svg>}
                {idx === 3 && <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>}
                {idx === 4 && <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>}
              </div>
              <h3 className="text-zinc-100 font-semibold">{it.title}</h3>
              <p className="mt-2 text-zinc-400 text-sm leading-6">{it.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function CTA({ t }) {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-800 border border-zinc-700 p-8 sm:p-12">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white">{t.cta.h2}</h2>
              <p className="mt-2 text-zinc-400">{t.cta.p}</p>
            </div>
            <div className="flex gap-3">
              <a className="px-5 py-2.5 rounded-md bg-brand/90 hover:bg-brand text-zinc-950 font-medium" href="#get-extension">{t.cta.get}</a>
              <a className="px-5 py-2.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700" href="https://github.com/easychen/CookieCloud" target="_blank" rel="noreferrer">{t.cta.repo}</a>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function Footer({ t }) {
  return (
    <footer className="py-10 border-t border-zinc-800">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <p className="text-zinc-500 text-sm">© {new Date().getFullYear()} Cookie Cloud. {t.footer.license}.</p>
        <div className="flex items-center gap-4 text-sm">
          <a className="text-zinc-400 hover:text-zinc-200" href="https://github.com/easychen/CookieCloud" target="_blank" rel="noreferrer">GitHub</a>
          <a className="text-zinc-400 hover:text-zinc-200" href="https://github.com/easychen/CookieCloud#readme" target="_blank" rel="noreferrer">Docs</a>
          <a className="text-zinc-400 hover:text-zinc-200" href="https://github.com/easychen/CookieCloud#readme" target="_blank" rel="noreferrer">API</a>
        </div>
      </div>
    </footer>
  )
}

export default function App() {
  const [lang, setLang] = useState(() => (typeof navigator !== 'undefined' && navigator.language && navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'))
  const t = dict[lang]
  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-200">
      <Nav t={t} lang={lang} onToggleLang={() => setLang(prev => (prev === 'en' ? 'zh' : 'en'))} />
      <main>
        <Hero t={t} />
        <Features t={t} />
        <CTA t={t} />
      </main>
      <Footer t={t} />
    </div>
  )
}
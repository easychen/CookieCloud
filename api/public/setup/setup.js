(() => {
  /* ===== State ===== */
  const state = {
    bootstrap: null,
    tutorial: [],
    lastPreview: null,
    currentStep: 1,
    form: {
      api_root: '/api',
      hmac_ttl_sec: 300,
      max_body_mb: 10,
      enable_legacy_read: true,
      allowed_origins: '',
      hmac_keys: [{ key_id: 'k1', secret: '' }]
    }
  };

  /* ===== DOM Refs ===== */
  const refs = {
    globalToast: document.getElementById('globalToast'),
    // Hero meta
    runtimeSource: document.getElementById('runtimeSource'),
    currentUser: document.getElementById('currentUser'),
    appDomain: document.getElementById('appDomain'),
    // Runtime status (step 3)
    runtimePath: document.getElementById('runtimePath'),
    dataDir: document.getElementById('dataDir'),
    restartMode: document.getElementById('restartMode'),
    currentKeyIds: document.getElementById('currentKeyIds'),
    messageBox: document.getElementById('messageBox'),
    // Form fields (step 2)
    apiRoot: document.getElementById('apiRoot'),
    hmacTtlSec: document.getElementById('hmacTtlSec'),
    maxBodyMb: document.getElementById('maxBodyMb'),
    legacyRead: document.getElementById('legacyRead'),
    allowedOrigins: document.getElementById('allowedOrigins'),
    // Keys (step 1)
    addKeyBtn: document.getElementById('addKeyBtn'),
    keyList: document.getElementById('keyList'),
    // Action buttons (step 3)
    previewBtn: document.getElementById('previewBtn'),
    applyBtn: document.getElementById('applyBtn'),
    exportBtn: document.getElementById('exportBtn'),
    // Preview outputs (step 3)
    backendEnv: document.getElementById('backendEnv'),
    pluginTemplate: document.getElementById('pluginTemplate'),
    verifyCommands: document.getElementById('verifyCommands'),
    warnings: document.getElementById('warnings'),
    // Plugin template fields (step 3)
    pluginServerAddress: document.getElementById('pluginServerAddress'),
    pluginKeyId: document.getElementById('pluginKeyId'),
    pluginSecret: document.getElementById('pluginSecret'),
    // Tutorial
    tutorialList: document.getElementById('tutorialList'),
    // Key template
    keyTemplate: document.getElementById('keyTemplate'),
    // Wizard steps
    wizardStep1: document.getElementById('wizardStep1'),
    wizardStep2: document.getElementById('wizardStep2'),
    wizardStep3: document.getElementById('wizardStep3')
  };

  let toastTimerId = null;

  /* ===== Init ===== */
  init().catch((error) => {
    setMessage('error', `初始化失败：${error.message}`);
  });

  async function init() {
    bindEvents();

    const [bootstrap, tutorial] = await Promise.all([
      requestJSON('/setup/api/bootstrap'),
      requestJSON('/setup/api/tutorial')
    ]);

    state.bootstrap = bootstrap;
    state.tutorial = tutorial.sections || [];

    hydrateForm(bootstrap.config || {});
    renderRuntimeStatus();
    renderForm();
    renderTutorial();
    updatePluginDefaults();

    setMessage('info', '🎉 配置页已加载！请从「第一步：创建安全密钥」开始。');
  }

  /* ===== Event Binding ===== */
  function bindEvents() {
    refs.addKeyBtn.addEventListener('click', () => {
      state.form.hmac_keys.push({ key_id: '', secret: '' });
      renderKeyList();
    });

    refs.previewBtn.addEventListener('click', onPreview);
    refs.applyBtn.addEventListener('click', onApply);
    refs.exportBtn.addEventListener('click', onExportSnapshot);

    // Step navigation
    const step1Next = document.getElementById('step1Next');
    const step2Prev = document.getElementById('step2Prev');
    const step2Skip = document.getElementById('step2Skip');
    const step2Next = document.getElementById('step2Next');
    const step3Prev = document.getElementById('step3Prev');

    if (step1Next) step1Next.addEventListener('click', () => {
      syncFormFromDOM();
      // Validate step 1: at least one key with secret
      const hasValidKey = state.form.hmac_keys.some(k => k.key_id && k.secret && k.secret.length >= 32);
      if (!hasValidKey) {
        setMessage('error', '❌ 请至少创建一组密钥。Secret 需至少 32 位，且包含字母和数字。点击"🎲 生成"按钮可自动创建。');
        return;
      }
      goToStep(2);
    });

    if (step2Prev) step2Prev.addEventListener('click', () => { syncFormFromDOM(); goToStep(1); });
    if (step2Skip) step2Skip.addEventListener('click', () => { goToStep(3); });
    if (step2Next) step2Next.addEventListener('click', () => { syncFormFromDOM(); goToStep(3); });
    if (step3Prev) step3Prev.addEventListener('click', () => { syncFormFromDOM(); goToStep(2); });

    // Copy buttons
    document.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-copy-target');
        const targetEl = document.getElementById(targetId);
        if (targetEl) {
          const text = String(targetEl.textContent || '').trim();
          if (!text || text === '-' || text.includes('保存配置后自动显示')) {
            setMessage('error', '当前字段还没有可复制的有效值，请先执行“校验并预览”或“保存并重启”。');
            return;
          }
          copyToClipboard(text);
          btn.textContent = '✅';
          btn.classList.add('copied');
          setTimeout(() => { btn.textContent = '📋'; btn.classList.remove('copied'); }, 2000);
        }
      });
    });
  }

  /* ===== Step Navigation ===== */
  function goToStep(n) {
    state.currentStep = n;

    // Show/hide panels
    [refs.wizardStep1, refs.wizardStep2, refs.wizardStep3].forEach((el, i) => {
      if (el) {
        el.classList.toggle('active', i + 1 === n);
      }
    });

    // Update progress bar
    document.querySelectorAll('.progress-step').forEach(el => {
      const stepNum = parseInt(el.getAttribute('data-step'), 10);
      el.classList.remove('active', 'done');
      if (stepNum === n) el.classList.add('active');
      else if (stepNum < n) el.classList.add('done');
    });

    document.querySelectorAll('.progress-connector').forEach((el, i) => {
      el.classList.toggle('done', i + 1 < n);
    });

    // Clear messages when navigating
    refs.messageBox.textContent = '';
    refs.messageBox.className = 'message';

    // When entering step 3, refresh plugin defaults
    if (n === 3) {
      updatePluginDefaults();
    }

    // Scroll to top of step
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ===== Secret Generation ===== */
  function generateRandomSecret(length = 64) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars[array[i] % chars.length];
    }
    // Ensure at least one letter and one digit
    if (!/[A-Za-z]/.test(result)) result = 'A' + result.slice(1);
    if (!/[0-9]/.test(result)) result = result.slice(0, -1) + '7';
    return result;
  }

  /* ===== Clipboard ===== */
  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }

  /* ===== Hydrate Form ===== */
  function hydrateForm(config) {
    state.form.api_root = config.api_root || '/api';
    state.form.hmac_ttl_sec = Number.parseInt(String(config.hmac_ttl_sec || 300), 10);
    state.form.max_body_mb = Number.parseInt(String(config.max_body_mb || 10), 10);
    state.form.enable_legacy_read = Boolean(config.enable_legacy_read);
    state.form.allowed_origins = Array.isArray(config.allowed_origins) ? config.allowed_origins.join('\n') : '';

    if (Array.isArray(config.hmac_keys) && config.hmac_keys.length > 0) {
      state.form.hmac_keys = config.hmac_keys.map((item) => ({
        key_id: item.key_id || '',
        secret: ''
      }));
    } else {
      state.form.hmac_keys = [{ key_id: 'k1', secret: '' }];
    }
  }

  /* ===== Sync Form From DOM ===== */
  function syncFormFromDOM() {
    if (refs.apiRoot) state.form.api_root = refs.apiRoot.value.trim();
    if (refs.hmacTtlSec) state.form.hmac_ttl_sec = Number.parseInt(refs.hmacTtlSec.value, 10) || 300;
    if (refs.maxBodyMb) state.form.max_body_mb = Number.parseInt(refs.maxBodyMb.value, 10) || 10;
    if (refs.legacyRead) state.form.enable_legacy_read = refs.legacyRead.value === 'true';
    if (refs.allowedOrigins) state.form.allowed_origins = refs.allowedOrigins.value;
  }

  /* ===== Render ===== */
  function renderRuntimeStatus() {
    const bootstrap = state.bootstrap || {};
    const config = bootstrap.config || {};
    const user = bootstrap.user || {};
    const env = bootstrap.environment || {};

    refs.runtimeSource.textContent = `runtime: ${bootstrap.runtime_config_source || 'unknown'}`;
    refs.currentUser.textContent = `user: ${user.user_id || 'unknown'}`;
    refs.appDomain.textContent = `domain: ${env.lazycat_app_domain || window.location.host}`;

    refs.runtimePath.textContent = bootstrap.runtime_config_file || '-';
    refs.dataDir.textContent = config.data_dir || '-';
    refs.restartMode.textContent = bootstrap.restart?.auto_restart_enabled ? '已开启（保存后自动重启）' : '关闭（需手工重启）';

    const ids = Array.isArray(config.hmac_keys) ? config.hmac_keys.map((item) => item.key_id) : [];
    refs.currentKeyIds.textContent = ids.length ? ids.join(', ') : '尚未配置';
  }

  function renderForm() {
    refs.apiRoot.value = state.form.api_root;
    refs.hmacTtlSec.value = String(state.form.hmac_ttl_sec);
    refs.maxBodyMb.value = String(state.form.max_body_mb);
    refs.legacyRead.value = state.form.enable_legacy_read ? 'true' : 'false';
    refs.allowedOrigins.value = state.form.allowed_origins;
    renderKeyList();
  }

  function renderKeyList() {
    refs.keyList.innerHTML = '';

    state.form.hmac_keys.forEach((item, index) => {
      const node = refs.keyTemplate.content.firstElementChild.cloneNode(true);
      const idInput = node.querySelector('.key-id');
      const secretInput = node.querySelector('.key-secret');
      const removeBtn = node.querySelector('.remove-key');
      const generateBtn = node.querySelector('.btn-generate');

      idInput.value = item.key_id;
      secretInput.value = item.secret;

      idInput.addEventListener('input', (event) => {
        state.form.hmac_keys[index].key_id = event.target.value;
      });

      secretInput.addEventListener('input', (event) => {
        state.form.hmac_keys[index].secret = event.target.value;
      });

      // Generate random secret button
      if (generateBtn) {
        generateBtn.addEventListener('click', () => {
          const secret = generateRandomSecret(64);
          secretInput.value = secret;
          secretInput.type = 'text';
          state.form.hmac_keys[index].secret = secret;
          generateBtn.textContent = '✅ 已生成';
          setTimeout(() => { generateBtn.textContent = '🎲 生成'; }, 2000);
          setTimeout(() => {
            secretInput.type = 'password';
          }, 2000);

          setMessage('success', `✅ 已为 Key "${item.key_id || 'k1'}" 自动生成 64 位安全密钥。请务必记下此密钥，后续需填入浏览器插件。`);
        });
      }

      secretInput.addEventListener('click', () => {
        const text = String(secretInput.value || '').trim();
        if (!text) return;
        copyToClipboard(text);
        setMessage('info', `已复制 Key "${idInput.value || 'k1'}" 的 Secret 到剪贴板。`);
      });

      removeBtn.addEventListener('click', () => {
        if (state.form.hmac_keys.length <= 1) {
          setMessage('error', '至少保留一组 HMAC Key。');
          return;
        }
        state.form.hmac_keys.splice(index, 1);
        renderKeyList();
      });

      refs.keyList.appendChild(node);
    });
  }

  function updatePluginDefaults() {
    const bootstrap = state.bootstrap || {};
    const pluginDefaults = bootstrap.plugin_defaults || {};

    if (refs.pluginServerAddress) {
      refs.pluginServerAddress.textContent = pluginDefaults.server_address || '保存配置后自动显示';
    }
    if (refs.pluginKeyId) {
      const ids = state.form.hmac_keys.filter(k => k.key_id).map(k => k.key_id);
      refs.pluginKeyId.textContent = ids[0] || pluginDefaults.auth_key_id || '-';
    }
  }

  /* ===== API Actions: collectPayload, onPreview, onApply, onExport ===== */
  function collectPayload() {
    syncFormFromDOM();

    const api_root = state.form.api_root;
    const hmac_ttl_sec = state.form.hmac_ttl_sec;
    const max_body_mb = state.form.max_body_mb;
    const enable_legacy_read = state.form.enable_legacy_read;

    const allowed_origins = (state.form.allowed_origins || '')
      .split(/\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);

    const hmac_keys = state.form.hmac_keys
      .map((item) => ({
        key_id: String(item.key_id || '').trim(),
        secret: String(item.secret || '').trim()
      }))
      .filter((item) => item.key_id || item.secret);

    return {
      api_root,
      hmac_keys,
      hmac_ttl_sec,
      max_body_mb,
      allowed_origins,
      enable_legacy_read
    };
  }

  async function onPreview() {
    toggleBusy(true);

    try {
      const payload = collectPayload();
      const response = await requestJSON('/setup/api/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      state.lastPreview = response;
      refs.backendEnv.textContent = response.blocks?.backend_env || '';
      refs.pluginTemplate.textContent = response.blocks?.plugin_template || '';
      refs.verifyCommands.textContent = response.blocks?.verify_commands || '';

      // Update plugin card values from preview
      if (response.blocks?.plugin_template) {
        const lines = response.blocks.plugin_template.split('\n');
        for (const line of lines) {
          if (line.startsWith('Server Address:')) {
            const val = line.replace('Server Address:', '').trim();
            if (refs.pluginServerAddress) refs.pluginServerAddress.textContent = val;
          }
          if (line.startsWith('Auth Key ID:')) {
            const val = line.replace('Auth Key ID:', '').trim();
            if (refs.pluginKeyId) refs.pluginKeyId.textContent = val;
          }
        }
      }

      refs.warnings.innerHTML = '';
      (response.warnings || []).forEach((item) => {
        const li = document.createElement('li');
        li.textContent = item;
        refs.warnings.appendChild(li);
      });

      setMessage('success', '✅ 预览成功：内容已脱敏，未返回明文 secret。确认无误后可点击"保存并重启"。');
    } catch (error) {
      setMessage('error', extractErrorMessage(error));
    } finally {
      toggleBusy(false);
    }
  }

  async function onApply() {
    const accepted = window.confirm('将写入运行时配置并尝试自动重启服务，是否继续？');
    if (!accepted) return;

    toggleBusy(true);
    let keepApplyDisabled = false;

    try {
      const payload = collectPayload();
      const response = await requestJSON('/setup/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      setMessage('success', `🎉 ${response.message} 配置文件：${response.runtime_config_file}`);

      if (response.restart_scheduled) {
        keepApplyDisabled = true;
        refs.applyBtn.disabled = true;
        window.setTimeout(() => {
          refs.applyBtn.disabled = false;
        }, 3000);
      }
    } catch (error) {
      setMessage('error', extractErrorMessage(error));
    } finally {
      toggleBusy(false);
      if (keepApplyDisabled) {
        refs.applyBtn.disabled = true;
      }
    }
  }

  function onExportSnapshot() {
    const exportPayload = {
      exported_at: new Date().toISOString(),
      bootstrap: state.bootstrap,
      preview_summary: state.lastPreview?.summary || null,
      warnings: state.lastPreview?.warnings || []
    };

    const blob = new Blob([`${JSON.stringify(exportPayload, null, 2)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cookiecloud-setup-snapshot-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    setMessage('info', '📦 已导出脱敏快照。请与本地密钥记录分开存放。');
  }

  /* ===== Tutorial ===== */
  function renderTutorial() {
    refs.tutorialList.innerHTML = '';

    state.tutorial.forEach((section, index) => {
      const details = document.createElement('details');
      details.className = 'tutorial-item';
      if (index === 0) details.open = true;

      const summary = document.createElement('summary');
      summary.textContent = section.title || `章节 ${index + 1}`;
      details.appendChild(summary);

      const body = document.createElement('div');
      body.className = 'tutorial-body';

      (section.paragraphs || []).forEach((text) => {
        const p = document.createElement('p');
        p.textContent = text;
        body.appendChild(p);
      });

      if (Array.isArray(section.list) && section.list.length > 0) {
        const ul = document.createElement('ul');
        section.list.forEach((text) => {
          const li = document.createElement('li');
          li.textContent = text;
          ul.appendChild(li);
        });
        body.appendChild(ul);
      }

      details.appendChild(body);
      refs.tutorialList.appendChild(details);
    });
  }

  /* ===== Utilities ===== */
  function toggleBusy(isBusy) {
    refs.previewBtn.disabled = isBusy;
    refs.applyBtn.disabled = isBusy;
    refs.exportBtn.disabled = isBusy;
  }

  function setMessage(type, text) {
    showGlobalToast(type, text);

    if (refs.messageBox) {
      refs.messageBox.classList.remove('success', 'error', 'info');
      refs.messageBox.classList.add(type);
      refs.messageBox.textContent = text;
    }
  }

  function showGlobalToast(type, text) {
    if (!refs.globalToast) return;

    refs.globalToast.classList.remove('success', 'error', 'info');
    refs.globalToast.classList.add(type, 'show');
    refs.globalToast.textContent = text;

    if (toastTimerId) {
      clearTimeout(toastTimerId);
    }

    toastTimerId = setTimeout(() => {
      refs.globalToast.classList.remove('show');
      toastTimerId = null;
    }, 3200);
  }

  async function requestJSON(url, options = {}) {
    const response = await fetch(url, options);
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new Error(payload.message || `HTTP ${response.status}`);
      error.payload = payload;
      throw error;
    }

    return payload;
  }

  function extractErrorMessage(error) {
    if (error && error.payload && Array.isArray(error.payload.details) && error.payload.details.length > 0) {
      return error.payload.details.map((item) => `${item.field}: ${item.message}`).join('；');
    }

    return error?.message || '未知错误';
  }
})();

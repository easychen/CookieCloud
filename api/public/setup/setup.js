(() => {
  const state = {
    bootstrap: null,
    tutorial: [],
    lastPreview: null,
    form: {
      api_root: '/api',
      hmac_ttl_sec: 300,
      max_body_mb: 10,
      enable_legacy_read: true,
      allowed_origins: '',
      hmac_keys: [{ key_id: 'k1', secret: '' }]
    }
  };

  const refs = {
    runtimeSource: document.getElementById('runtimeSource'),
    currentUser: document.getElementById('currentUser'),
    appDomain: document.getElementById('appDomain'),
    runtimePath: document.getElementById('runtimePath'),
    dataDir: document.getElementById('dataDir'),
    restartMode: document.getElementById('restartMode'),
    currentKeyIds: document.getElementById('currentKeyIds'),
    messageBox: document.getElementById('messageBox'),
    apiRoot: document.getElementById('apiRoot'),
    hmacTtlSec: document.getElementById('hmacTtlSec'),
    maxBodyMb: document.getElementById('maxBodyMb'),
    legacyRead: document.getElementById('legacyRead'),
    allowedOrigins: document.getElementById('allowedOrigins'),
    addKeyBtn: document.getElementById('addKeyBtn'),
    keyList: document.getElementById('keyList'),
    previewBtn: document.getElementById('previewBtn'),
    applyBtn: document.getElementById('applyBtn'),
    exportBtn: document.getElementById('exportBtn'),
    backendEnv: document.getElementById('backendEnv'),
    pluginTemplate: document.getElementById('pluginTemplate'),
    verifyCommands: document.getElementById('verifyCommands'),
    warnings: document.getElementById('warnings'),
    tutorialList: document.getElementById('tutorialList'),
    keyTemplate: document.getElementById('keyTemplate')
  };

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

    setMessage('info', '配置页已加载。建议先点“校验并预览”确认参数，再执行“保存并重启”。');
  }

  function bindEvents() {
    refs.addKeyBtn.addEventListener('click', () => {
      state.form.hmac_keys.push({ key_id: '', secret: '' });
      renderKeyList();
    });

    refs.previewBtn.addEventListener('click', onPreview);
    refs.applyBtn.addEventListener('click', onApply);
    refs.exportBtn.addEventListener('click', onExportSnapshot);
  }

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

      idInput.value = item.key_id;
      secretInput.value = item.secret;

      idInput.addEventListener('input', (event) => {
        state.form.hmac_keys[index].key_id = event.target.value;
      });

      secretInput.addEventListener('input', (event) => {
        state.form.hmac_keys[index].secret = event.target.value;
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

  function collectPayload() {
    const api_root = refs.apiRoot.value.trim();
    const hmac_ttl_sec = Number.parseInt(refs.hmacTtlSec.value, 10);
    const max_body_mb = Number.parseInt(refs.maxBodyMb.value, 10);
    const enable_legacy_read = refs.legacyRead.value === 'true';

    const allowed_origins = refs.allowedOrigins.value
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

      refs.warnings.innerHTML = '';
      (response.warnings || []).forEach((item) => {
        const li = document.createElement('li');
        li.textContent = item;
        refs.warnings.appendChild(li);
      });

      setMessage('success', '预览成功：内容已脱敏，未返回明文 secret。');
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

    try {
      const payload = collectPayload();
      const response = await requestJSON('/setup/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      setMessage('success', `${response.message} 配置文件：${response.runtime_config_file}`);

      if (response.restart_scheduled) {
        refs.applyBtn.disabled = true;
        window.setTimeout(() => {
          refs.applyBtn.disabled = false;
        }, 3000);
      }
    } catch (error) {
      setMessage('error', extractErrorMessage(error));
    } finally {
      toggleBusy(false);
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

    setMessage('info', '已导出脱敏快照。请与本地密钥记录分开存放。');
  }

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

  function toggleBusy(isBusy) {
    refs.previewBtn.disabled = isBusy;
    refs.applyBtn.disabled = isBusy;
    refs.exportBtn.disabled = isBusy;
  }

  function setMessage(type, text) {
    refs.messageBox.classList.remove('success', 'error', 'info');
    refs.messageBox.classList.add(type);
    refs.messageBox.textContent = text;
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

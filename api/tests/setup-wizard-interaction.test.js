const assert = require('assert');
const {
  bootPage,
  createJsonResponse,
  defaultBootstrapPayload,
  defaultTutorialPayload,
  buildPreviewPayload
} = require('./helpers/setup-dom-harness');

(async () => {
  let page = null;

  try {
    page = await bootPage({
      fetchHandler: async ({ pathname, body }) => {
        if (pathname === '/setup/api/bootstrap') {
          const payload = defaultBootstrapPayload();
          payload.plugin_defaults = {
            server_address: '',
            auth_key_id: '',
            crypto_type: 'aes-256-gcm-v1'
          };
          return createJsonResponse(200, payload);
        }

        if (pathname === '/setup/api/tutorial') {
          return createJsonResponse(200, defaultTutorialPayload());
        }

        if (pathname === '/setup/api/preview') {
          return createJsonResponse(200, buildPreviewPayload(body, 'https://cookiecloud.example.test'));
        }

        if (pathname === '/setup/api/apply') {
          return createJsonResponse(202, {
            status: 'accepted',
            message: 'Configuration saved. Restart scheduled.',
            restart_scheduled: true,
            runtime_config_file: '/lzcapp/var/cookiecloud/runtime-config.json',
            applied: {
              api_root: body.api_root,
              key_ids: body.hmac_keys.map((item) => item.key_id)
            }
          });
        }

        return createJsonResponse(404, { message: `Unhandled path: ${pathname}` });
      }
    });

    // 1) defaults: step1 visible, progress state correct
    assert.strictEqual(page.getActiveStep(), 1, 'step 1 should be active by default');
    assert.strictEqual(page.isStepVisible(1), true, 'step 1 should be visible');
    assert.strictEqual(page.isStepVisible(2), false, 'step 2 should be hidden');
    assert.strictEqual(page.isStepVisible(3), false, 'step 3 should be hidden');
    assert(page.getProgressStep(1).classList.contains('active'), 'progress step 1 should be active');

    // 2) step1 invalid next shows global toast error
    page.click('#step1Next');
    await page.flushAsync();
    let toast = page.getToast();
    assert.strictEqual(toast.visible, true, 'global toast should be visible on validation error');
    assert.match(toast.text, /请至少创建一组密钥/, 'global toast should contain validation message');

    // 3) generate secret -> 64 chars + text then auto-hide
    page.click('.btn-generate');
    await page.flushAsync();
    const secretInput = page.query('.key-secret');
    const generatedSecret = String(secretInput.value || '');
    assert.strictEqual(generatedSecret.length, 64, 'generated secret should be 64 chars');
    assert(/[A-Za-z]/.test(generatedSecret), 'generated secret should contain letters');
    assert(/[0-9]/.test(generatedSecret), 'generated secret should contain digits');
    assert.strictEqual(secretInput.type, 'text', 'generated secret should be temporarily visible');
    page.runAllTimers();
    assert.strictEqual(secretInput.type, 'password', 'generated secret should auto-hide back to password');

    // 4) click secret input copies to clipboard
    const copyCountBeforeSecretClick = page.clipboardWrites.length;
    page.click('.key-secret');
    await page.flushAsync();
    assert.strictEqual(page.clipboardWrites.length, copyCountBeforeSecretClick + 1, 'secret click should copy once');
    assert.strictEqual(page.clipboardWrites[page.clipboardWrites.length - 1], generatedSecret, 'copied secret should match input value');

    // Move to step2
    page.click('#step1Next');
    await page.flushAsync();
    assert.strictEqual(page.getActiveStep(), 2, 'after valid key, should navigate to step 2');

    // 5) step2 modifies values, skip should keep current values
    page.setValue('#apiRoot', '/api-custom');
    page.setValue('#hmacTtlSec', '777');
    page.setValue('#maxBodyMb', '33');
    page.setValue('#legacyRead', 'false');
    page.setValue('#allowedOrigins', 'https://panel.example.com');

    page.click('#step2Skip');
    await page.flushAsync();
    assert.strictEqual(page.getActiveStep(), 3, 'step2 skip should navigate to step 3');

    // 8) placeholder copy should be blocked
    const copyCountBeforePlaceholder = page.clipboardWrites.length;
    page.click('[data-copy-target="pluginServerAddress"]');
    await page.flushAsync();
    assert.strictEqual(page.clipboardWrites.length, copyCountBeforePlaceholder, 'placeholder copy should be blocked');
    toast = page.getToast();
    assert.match(toast.text, /还没有可复制的有效值/, 'placeholder copy should show warning toast');

    // 6) preview request payload should preserve edited step2 values
    page.click('#previewBtn');
    await page.flushAsync();

    const previewReq = page.getLastRequest('/setup/api/preview');
    assert(previewReq, 'preview request should be sent');
    assert.strictEqual(previewReq.body.api_root, '/api-custom', 'api_root should keep edited value after skip');
    assert.strictEqual(previewReq.body.hmac_ttl_sec, 777, 'hmac_ttl_sec should keep edited value after skip');
    assert.strictEqual(previewReq.body.max_body_mb, 33, 'max_body_mb should keep edited value after skip');
    assert.strictEqual(previewReq.body.enable_legacy_read, false, 'legacy_read should keep edited value after skip');
    assert.deepStrictEqual(previewReq.body.allowed_origins, ['https://panel.example.com'], 'allowed_origins should keep edited value after skip');

    assert.match(page.text('#backendEnv'), /CC_HMAC_TTL_SEC=777/, 'preview backend env should update');
    assert.match(page.text('#verifyCommands'), /smoke_hmac/, 'preview commands should update');
    assert.strictEqual(page.text('#pluginServerAddress').trim(), 'https://cookiecloud.example.test/api-custom', 'plugin server address should update from preview');
    assert.strictEqual(page.text('#pluginKeyId').trim(), 'k1', 'plugin key id should update from preview');

    // copy should work after preview has real value
    const copyCountAfterPreview = page.clipboardWrites.length;
    page.click('[data-copy-target="pluginServerAddress"]');
    await page.flushAsync();
    assert.strictEqual(page.clipboardWrites.length, copyCountAfterPreview + 1, 'valid copy should increase clipboard writes');
    assert.strictEqual(page.clipboardWrites[page.clipboardWrites.length - 1], 'https://cookiecloud.example.test/api-custom', 'copied server address should be latest value');

    // 7) apply should send request and disable/re-enable apply button around timer
    const applyButton = page.query('#applyBtn');
    page.click('#applyBtn');
    await page.flushAsync();

    const applyReq = page.getLastRequest('/setup/api/apply');
    assert(applyReq, 'apply request should be sent');
    assert.strictEqual(applyReq.body.api_root, '/api-custom', 'apply should use edited values');

    assert.strictEqual(applyButton.disabled, true, 'apply button should be disabled after scheduled restart');
    page.runAllTimers();
    await page.flushAsync();
    assert.strictEqual(applyButton.disabled, false, 'apply button should be re-enabled after timer');

    toast = page.getToast();
    assert.match(toast.text, /Configuration saved/, 'apply success should show toast');

    console.log('setup-wizard-interaction.test.js passed');
  } catch (error) {
    console.error('setup-wizard-interaction.test.js failed:', error);
    process.exitCode = 1;
  } finally {
    if (page) {
      page.teardown();
    }
  }
})();

/**
 * Playwright-native stealth patches injected via addInitScript.
 * Replaces puppeteer-extra-plugin-stealth which doesn't fully patch Playwright.
 *
 * Each patch runs in the page context before any page script executes.
 */

// Serialisable: must be a self-contained string (no closures over Node.js scope).
export const STEALTH_SCRIPT = /* js */ `
(function () {
  'use strict';

  // ── 1. navigator.webdriver ────────────────────────────────────────────────
  try {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
      configurable: true,
    });
  } catch (_) {}

  // ── 2. window.chrome ─────────────────────────────────────────────────────
  if (!window.chrome) {
    window.chrome = {
      app: {
        isInstalled: false,
        InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
        RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
        getDetails: function () {},
        getIsInstalled: function () {},
        installState: function () {},
      },
      runtime: {
        OnInstalledReason: {
          CHROME_UPDATE: 'chrome_update',
          INSTALL: 'install',
          SHARED_MODULE_UPDATE: 'shared_module_update',
          UPDATE: 'update',
        },
        OnRestartRequiredReason: { APP_UPDATE: 'app_update', GC_PRESSURE: 'gc_pressure', OS_UPDATE: 'os_update' },
        PlatformArch: { ARM: 'arm', ARM64: 'arm64', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
        PlatformOs: { ANDROID: 'android', CROS: 'cros', LINUX: 'linux', MAC: 'mac', OPENBSD: 'openbsd', WIN: 'win' },
        RequestUpdateCheckStatus: { NO_UPDATE: 'no_update', THROTTLED: 'throttled', UPDATE_AVAILABLE: 'update_available' },
        connect: function () {},
        sendMessage: function () {},
        id: undefined,
      },
      loadTimes: function () {
        return {
          commitLoadTime: Date.now() / 1000 - Math.random() * 2,
          connectionInfo: 'h2',
          finishDocumentLoadTime: 0,
          finishLoadTime: 0,
          firstPaintAfterLoadTime: 0,
          firstPaintTime: 0,
          navigationType: 'Other',
          npnNegotiatedProtocol: 'h2',
          requestTime: Date.now() / 1000 - Math.random() * 3,
          startLoadTime: Date.now() / 1000 - Math.random() * 3,
          wasAlternateProtocolAvailable: false,
          wasFetchedViaSpdy: true,
          wasNpnNegotiated: true,
        };
      },
      csi: function () {
        return { onloadT: Date.now(), pageT: Math.random() * 2000, startE: Date.now(), tran: 15 };
      },
    };
  }

  // ── 3. navigator.plugins + mimeTypes ─────────────────────────────────────
  // Chrome ships with PDF viewer plugins; absent list = obvious headless signal.
  const pluginData = [
    {
      name: 'PDF Viewer',
      filename: 'internal-pdf-viewer',
      description: 'Portable Document Format',
      mimes: [
        { type: 'application/pdf', suffixes: 'pdf', description: '' },
        { type: 'text/pdf', suffixes: 'pdf', description: '' },
      ],
    },
    {
      name: 'Chrome PDF Viewer',
      filename: 'internal-pdf-viewer',
      description: 'Portable Document Format',
      mimes: [
        { type: 'application/pdf', suffixes: 'pdf', description: '' },
        { type: 'text/pdf', suffixes: 'pdf', description: '' },
      ],
    },
    {
      name: 'Chromium PDF Viewer',
      filename: 'internal-pdf-viewer',
      description: 'Portable Document Format',
      mimes: [
        { type: 'application/pdf', suffixes: 'pdf', description: '' },
        { type: 'text/pdf', suffixes: 'pdf', description: '' },
      ],
    },
    {
      name: 'Microsoft Edge PDF Viewer',
      filename: 'internal-pdf-viewer',
      description: 'Portable Document Format',
      mimes: [
        { type: 'application/pdf', suffixes: 'pdf', description: '' },
        { type: 'text/pdf', suffixes: 'pdf', description: '' },
      ],
    },
    {
      name: 'WebKit built-in PDF',
      filename: 'internal-pdf-viewer',
      description: 'Portable Document Format',
      mimes: [
        { type: 'application/pdf', suffixes: 'pdf', description: '' },
        { type: 'text/pdf', suffixes: 'pdf', description: '' },
      ],
    },
  ];

  try {
    const makePlugin = (pd) => {
      const plugin = { name: pd.name, filename: pd.filename, description: pd.description, length: pd.mimes.length };
      pd.mimes.forEach((m, i) => {
        const mime = { type: m.type, suffixes: m.suffixes, description: m.description, enabledPlugin: plugin };
        plugin[i] = mime;
        plugin[m.type] = mime;
      });
      return plugin;
    };
    const plugins = pluginData.map(makePlugin);
    const mimeTypes = pluginData.flatMap((pd) =>
      pd.mimes.map((m) => ({ type: m.type, suffixes: m.suffixes, description: m.description })),
    );
    Object.defineProperty(navigator, 'plugins', {
      get: () => {
        const arr = [...plugins];
        arr.refresh = function () {};
        arr.item = (i) => plugins[i] ?? null;
        arr.namedItem = (n) => plugins.find((p) => p.name === n) ?? null;
        return arr;
      },
      configurable: true,
    });
    Object.defineProperty(navigator, 'mimeTypes', {
      get: () => {
        const arr = [...mimeTypes];
        arr.item = (i) => mimeTypes[i] ?? null;
        arr.namedItem = (t) => mimeTypes.find((m) => m.type === t) ?? null;
        return arr;
      },
      configurable: true,
    });
  } catch (_) {}

  // ── 4. navigator.languages ────────────────────────────────────────────────
  try {
    Object.defineProperty(navigator, 'languages', {
      get: () => ['fr-FR', 'fr', 'en-US', 'en'],
      configurable: true,
    });
  } catch (_) {}

  // ── 5. navigator.deviceMemory + hardwareConcurrency ───────────────────────
  try {
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 8, configurable: true });
  } catch (_) {}
  try {
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8, configurable: true });
  } catch (_) {}

  // ── 6. navigator.permissions — masquer le statut "automation" ─────────────
  try {
    const origQuery = window.Permissions && window.Permissions.prototype.query;
    if (origQuery) {
      window.Permissions.prototype.query = function (params) {
        if (params && params.name === 'notifications') {
          return Promise.resolve({ state: Notification.permission, onchange: null });
        }
        return origQuery.call(this, params);
      };
    }
  } catch (_) {}

  // ── 7. Canvas fingerprint noise ───────────────────────────────────────────
  // Tiny, imperceptible per-session noise defeats exact-hash canvas checks.
  try {
    const _noise = (Math.random() - 0.5) * 0.02;
    const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (...args) {
      const ctx2d = this.getContext('2d');
      if (ctx2d) {
        const id = ctx2d.getImageData(0, 0, 1, 1);
        id.data[0] = Math.max(0, Math.min(255, id.data[0] + Math.round(_noise * 255)));
        ctx2d.putImageData(id, 0, 0);
      }
      return origToDataURL.apply(this, args);
    };
    const origToBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (cb, ...args) {
      const ctx2d = this.getContext('2d');
      if (ctx2d) {
        const id = ctx2d.getImageData(0, 0, 1, 1);
        id.data[0] = Math.max(0, Math.min(255, id.data[0] + Math.round(_noise * 255)));
        ctx2d.putImageData(id, 0, 0);
      }
      return origToBlob.call(this, cb, ...args);
    };
  } catch (_) {}

  // ── 8. WebGL vendor / renderer ────────────────────────────────────────────
  try {
    const getParam = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function (param) {
      // UNMASKED_VENDOR_WEBGL
      if (param === 37445) return 'Google Inc. (Intel)';
      // UNMASKED_RENDERER_WEBGL
      if (param === 37446) return 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)';
      return getParam.call(this, param);
    };
  } catch (_) {}
  try {
    const getParam2 = WebGL2RenderingContext.prototype.getParameter;
    WebGL2RenderingContext.prototype.getParameter = function (param) {
      if (param === 37445) return 'Google Inc. (Intel)';
      if (param === 37446) return 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)';
      return getParam2.call(this, param);
    };
  } catch (_) {}

  // ── 9. Supprimer les globaux Playwright ───────────────────────────────────
  try {
    delete window.__playwright;
    delete window.__pw_manual;
    delete window.__pwInitScripts;
  } catch (_) {}

  // ── 10. outerWidth / outerHeight cohérents avec innerWidth ────────────────
  try {
    if (window.outerWidth === 0) {
      Object.defineProperty(window, 'outerWidth', { get: () => window.innerWidth + 16, configurable: true });
      Object.defineProperty(window, 'outerHeight', { get: () => window.innerHeight + 88, configurable: true });
    }
  } catch (_) {}
})();
`;

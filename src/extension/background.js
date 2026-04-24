// Chargement du polyfill (uniquement si nécessaire, ex: Chrome Service Worker)
if (typeof browser === 'undefined') {
  try {
    importScripts('browser-polyfill.js');
  } catch (e) {
    console.warn('[OpenClaw Bridge] importScripts non supporté ou échoué, passage en mode natif');
  }
}

const CONFIG = {
  GATEWAY_URL: 'ws://localhost:8080/ws/browser-bridge',
  RECONNECT_BASE_MS: 1000,
  RECONNECT_MAX_MS: 30000,
  HEARTBEAT_INTERVAL_MS: 15000,
  // Si aucune trame serveur reçue depuis ce délai, on coupe et reconnecte.
  SERVER_SILENCE_TIMEOUT_MS: 40000,
  COMMAND_TIMEOUT: 30000,
  VISION_FPS: 2,
  VISION_QUALITY: 70
};

class BrowserBridge {
  constructor() {
    this.ws = null;
    this.reconnectAttempts = 0;
    this.isConnected = false;
    this.sessionData = {
      cookies: {},
      lastSearch: null,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Claw/3.0'
    };
    this.visionStream = null;
    this.heartBeatInterval = null;
    this.serverWatchdog = null;
    this.lastServerMessageAt = 0;
    this.reconnectTimer = null;
    // init() removed from here to be called after listeners are set
  }

  updateBadge() {
    try {
      const action = browser.action || browser.browserAction;
      if (!action) return;
      const suffix = this.isConnected ? 'green' : 'red';
      if (action.setIcon) {
        action.setIcon({
          path: {
            16:  `icons/icon16_${suffix}.png`,
            48:  `icons/icon48_${suffix}.png`,
            128: `icons/icon128_${suffix}.png`
          }
        });
      }
      // On retire le badge texte : la couleur de l'icône suffit.
      if (action.setBadgeText) action.setBadgeText({ text: '' });
    } catch (e) {}
  }

  init() {
    console.log('[OpenClaw Bridge] Initialisation v3.2 (Stable)...');
    this.connect();
    this.setupTabListener();

    // Reprise immédiate quand le réseau revient (utile après veille / Wi-Fi off)
    if (typeof self !== 'undefined' && self.addEventListener) {
      self.addEventListener('online', () => {
        if (!this.isConnected) {
          console.log('[OpenClaw Bridge] Réseau revenu, reconnexion immédiate');
          this.scheduleReconnect(0);
        }
      });
    }
  }

  connect() {
    // Annule tout reconnect en attente : on tente maintenant.
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    this.stopServerWatchdog();

    try {
      if (this.ws) {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onclose = null;
        this.ws.onerror = null;
        try { this.ws.close(); } catch (_) {}
      }

      console.log(`[OpenClaw Bridge] Connexion à ${CONFIG.GATEWAY_URL}...`);
      this.ws = new WebSocket(CONFIG.GATEWAY_URL);

      this.ws.onopen = () => {
        console.log('[OpenClaw Bridge] Connecté !');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.lastServerMessageAt = Date.now();
        this.updateBadge();

        this.startHeartbeat();
        this.startServerWatchdog();

        this.send({
          type: 'bridge.ready',
          payload: {
            version: '3.2.1',
            browser: 'mv3-bridge-stable',
            capabilities: [
              'search.google', 'search.bing', 'data.extract', 'navigate.human', 'screenshot',
              'mouse.move', 'mouse.click', 'mouse.scroll', 'keyboard.type', 'dom.click', 'dom.inspect'
            ]
          }
        });
      };

      this.ws.onmessage = (event) => {
        this.lastServerMessageAt = Date.now();
        try {
          const message = JSON.parse(event.data);
          // Les acks de heartbeat ne sont qu'un signal de vivacité.
          if (message.type === 'bridge.heartbeat.ack') return;
          this.handleMessage(message);
        } catch (e) {
          console.error('[OpenClaw Bridge] Erreur parsing message:', e);
        }
      };

      this.ws.onclose = (event) => {
        console.log('[OpenClaw Bridge] Déconnecté (code: ' + event.code + ')');
        this.isConnected = false;
        this.updateBadge();
        this.stopVisionStream();
        this.stopHeartbeat();
        this.stopServerWatchdog();
        this.scheduleReconnect();
      };

      // onerror : log uniquement. onclose suit toujours et déclenche la reconnexion.
      this.ws.onerror = (error) => {
        console.warn('[OpenClaw Bridge] Erreur WebSocket:', error && error.message);
      };

    } catch (e) {
      console.error('[OpenClaw Bridge] Erreur connexion:', e);
      this.scheduleReconnect();
    }
  }

  startHeartbeat() {
    this.heartBeatInterval = setInterval(() => {
      if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: 'bridge.heartbeat', timestamp: Date.now() }));
        } catch (e) {
          // L'envoi a échoué : la socket est probablement morte. Forcer la fermeture.
          try { this.ws.close(); } catch (_) {}
        }
      }
    }, CONFIG.HEARTBEAT_INTERVAL_MS);
  }

  stopHeartbeat() {
    if (this.heartBeatInterval) {
      clearInterval(this.heartBeatInterval);
      this.heartBeatInterval = null;
    }
  }

  // Détecte un serveur qui ne répond plus (TCP zombie sans FIN).
  startServerWatchdog() {
    this.serverWatchdog = setInterval(() => {
      if (!this.isConnected) return;
      const silence = Date.now() - this.lastServerMessageAt;
      if (silence > CONFIG.SERVER_SILENCE_TIMEOUT_MS) {
        console.warn(`[OpenClaw Bridge] Serveur silencieux ${silence}ms, reset socket`);
        try { this.ws && this.ws.close(); } catch (_) {}
      }
    }, 10000);
  }

  stopServerWatchdog() {
    if (this.serverWatchdog) {
      clearInterval(this.serverWatchdog);
      this.serverWatchdog = null;
    }
  }

  scheduleReconnect(forcedDelay) {
    if (this.reconnectTimer) return; // déjà programmé
    let delay;
    if (typeof forcedDelay === 'number') {
      delay = forcedDelay;
    } else {
      const exp = Math.min(CONFIG.RECONNECT_MAX_MS, CONFIG.RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempts));
      const jitter = Math.floor(Math.random() * 1000);
      delay = exp + jitter;
    }
    this.reconnectAttempts++;
    console.log(`[OpenClaw Bridge] Reconnexion dans ${delay}ms (tentative ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  async handleMessage(message) {
    const { commandId, type, payload = {} } = message;

    // Toute trame sans commandId n'est pas une commande à exécuter
    // (ack serveur, broadcast non sollicité, etc.). On évite ainsi
    // d'envoyer un command.result orphelin qui serait relayé vers les dashboards.
    if (!commandId) {
      return;
    }

    console.log('[OpenClaw Bridge] Commande reçue:', type);

    try {
      let result;

      switch (type) {
        case 'search':
          result = await this.executeSearch(payload);
          break;

        case 'navigate':
          result = await this.executeNavigate(payload);
          break;

        case 'extract':
          result = await this.executeExtract(payload);
          break;

        case 'screenshot':
          result = await this.executeScreenshot(payload);
          break;

        case 'dom.find':
          result = await this.executeDomFind(payload);
          break;

        case 'form.fill':
          result = await this.executeFormFill(payload);
          break;

        case 'file.download':
          result = await this.executeDownload(payload);
          break;

        case 'cookie.get':
          result = await this.getCookies(payload);
          break;

        case 'cookie.set':
          result = await this.setCookies(payload);
          break;

        case 'tab.list':
          result = await this.listTabs();
          break;

        case 'tab.close':
          result = await this.closeTab(payload);
          break;

        // === CONTRÔLE SOURIS ===
        case 'action.click':
        case 'action.hover':
        case 'mouse.move':
        case 'mouse.click':
        case 'mouse.doubleClick':
        case 'mouse.rightClick':
        case 'mouse.scroll':
        case 'mouse.hover':
          result = await this.executeContentAction(type, payload);
          break;

        case 'mouse.clickOnText':
          result = await this.executeClickOnText(payload);
          break;

        // === CONTRÔLE CLAVIER ===
        case 'keyboard.type':
        case 'keyboard.press':
          result = await this.executeContentAction(type, payload);
          break;

        // === VISION TEMPS RÉEL ===
        case 'vision.start':
          result = await this.startVisionStream(payload);
          break;

        case 'vision.stop':
          result = this.stopVisionStream();
          break;

        case 'vision.screenshot':
          result = await this.executeScreenshot(payload);
          break;

        // === NAVIGATION HUMAINE ===
        case 'human.read':
        case 'human.explore':
          result = await this.executeContentAction(type, payload);
          break;

        // === EXEC SCRIPT ===
        case 'exec.script':
          result = await this.executeScriptCommand(payload);
          break;

        // === COMBO ACTIONS ===
        case 'combo.searchAndClick':
          result = await this.executeContentAction(type, payload);
          break;

        // === INTERACTION DOM-AWARE ===
        case 'dom.click':
        case 'dom.doubleClick':
        case 'dom.hover':
        case 'dom.type':
        case 'dom.select':
        case 'dom.inspect':
        case 'dom.waitFor':
          result = await this.executeContentAction(type, payload);
          break;

        // === COMMANDES DOM-CENTRIC (NOUVELLE APPROCHE) ===
        case 'dom.extract':
        case 'dom.html':
        case 'dom.search':
        case 'dom.goto':
        case 'dom.find':
        case 'dom.fillForm':
        case 'dom.submit':
        case 'dom.scrollDown':
        case 'dom.scrollUp':
        case 'dom.press':
          result = await this.executeContentAction(type, payload);
          break;

        default:
          result = { error: `Commande inconnue: ${type}` };
      }

      this.send({
        type: 'command.result',
        commandId,
        payload: result,
        success: !result || !result.error
      });

    } catch (error) {
      console.error('[OpenClaw Bridge] Erreur exécution:', error);
      this.send({
        type: 'command.result',
        commandId,
        payload: { error: error.message },
        success: false
      });
    }
  }

  // === FONCTIONNALITÉS P0: RECHERCHE ===

  async executeSearch(payload) {
    const { engine = 'google', query, options = {} } = payload;

    console.log(`[OpenClaw Bridge] Recherche ${engine}: "${query}"`);

    let searchUrl;
    switch (engine) {
      case 'google':
        searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=fr`;
        break;
      case 'bing':
        searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setmkt=fr-FR`;
        break;
      case 'duckduckgo':
        searchUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=fr-fr`;
        break;
      default:
        throw new Error(`Moteur inconnu: ${engine}`);
    }

    // Chercher un onglet existant de recherche pour le réutiliser
    const existingTabs = await browser.tabs.query({});
    const existingSearchTab = existingTabs.find(t => 
      t.url && (t.url.includes('google.com/search') || t.url.includes('bing.com/search'))
    );

    let tab;
    if (existingSearchTab && options.reuseTab !== false) {
      console.log('[OpenClaw Bridge] Réutilisation onglet existant:', existingSearchTab.id);
      tab = await browser.tabs.update(existingSearchTab.id, { url: searchUrl, active: true });
    } else {
      // Utiliser l'onglet actif au lieu d'en créer un nouveau
      const activeTabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (activeTabs.length > 0) {
        console.log('[OpenClaw Bridge] Navigation dans onglet actif:', activeTabs[0].id);
        tab = await browser.tabs.update(activeTabs[0].id, { url: searchUrl, active: true });
      } else {
        tab = await browser.tabs.create({ url: searchUrl, active: true });
      }
    }

    let results = [];
    let searchTitle = '';
    
    try {
      await this.waitForTabLoad(tab.id, 20000, searchUrl);
      await this.humanDelay(3000, 4000);
      
      // Vérifier que l'onglet existe toujours
      try {
        const updatedTab = await browser.tabs.get(tab.id);
        searchTitle = updatedTab.title || '';
        console.log('[OpenClaw Bridge] Onglet chargé:', updatedTab.url);
      } catch (e) {
        console.warn('[OpenClaw Bridge] Onglet non accessible après chargement');
        return {
          engine, query, url: searchUrl, tabId: tab.id,
          title: 'Inconnu', results: [], resultCount: 0,
          timestamp: new Date().toISOString(),
          error: 'Onglet devenu invalide après chargement'
        };
      }
      
      // Pas de scroll sur un onglet de recherche fraîchement créé
      // directement extraire les résultats
      results = await this.extractFromTab(tab.id, engine);
      
      if (results.length === 0) {
        console.log('[OpenClaw Bridge] Pas de résultats, nouvel essai après délai...');
        await this.humanDelay(3000, 5000);
        // Revérifier l'onglet
        try {
          await browser.tabs.get(tab.id);
          results = await this.extractFromTab(tab.id, engine);
        } catch (e) {
          console.warn('[OpenClaw Bridge] Onglet invalide au 2ème essai');
        }
      }
    } catch (e) {
      console.log('[OpenClaw Bridge] Erreur recherche:', e.message);
    }

    this.sessionData.lastSearch = {
      engine,
      query,
      timestamp: Date.now(),
      results: results.length
    };

    return {
      engine,
      query,
      url: searchUrl,
      tabId: tab.id,
      title: searchTitle,
      results,
      resultCount: results.length,
      timestamp: new Date().toISOString()
    };
  }

  // === FONCTIONNALITÉS P1: NAVIGATION HUMAINE ===

  async executeNavigate(payload) {
    const { url, options = {} } = payload;

    console.log(`[OpenClaw Bridge] Navigation: ${url}`);

    let tab;
    let createdNew = false;
    
    if (options.tabId) {
      // Naviguer dans un onglet spécifique
      try {
        tab = await browser.tabs.update(options.tabId, { url, active: true });
        console.log('[OpenClaw Bridge] Navigation dans onglet spécifié:', tab.id);
      } catch (e) {
        console.warn('[OpenClaw Bridge] Onglet spécifié invalide');
      }
    }
    
    if (!tab) {
      // OVERRIDE ABSOLU : L'utilisateur exige que la navigation se fasse toujours dans un nouvel onglet.
      // On ignore options.newTab et on force browser.tabs.create.
      console.log('[OpenClaw Bridge] Création d\'un NOUVEL onglet (FORCÉ)');
      tab = await browser.tabs.create({ url, active: true });
      createdNew = true;
    }

    // Attendre le chargement avec vérification de l'URL cible
    try {
      await this.waitForTabLoad(tab.id, 20000, url);
    } catch (e) {
      console.warn('[OpenClaw Bridge] Timeout ou erreur chargement:', e.message);
    }

    // Petit délai pour le rendu et le JS
    await new Promise(r => setTimeout(r, 1000));

    // Récupérer les infos à jour
    let finalTabId = tab.id;
    let finalUrl = url;
    let finalTitle = 'Inconnu';
    
    try {
      const updatedTab = await browser.tabs.get(tab.id);
      finalTabId = updatedTab.id;
      finalUrl = updatedTab.url;
      finalTitle = updatedTab.title || url;
    } catch (e) {
      console.warn('[OpenClaw Bridge] Onglet non accessible après navigation, recherche alternative...');
      // Essayer de retrouver par URL
      const allTabs = await browser.tabs.query({});
      const foundTab = allTabs.find(t => t.url === url || (t.url && url && t.url.includes(url.split('?')[0])));
      if (foundTab) {
        finalTabId = foundTab.id;
        finalUrl = foundTab.url;
        finalTitle = foundTab.title || url;
      } else {
        return { error: 'Onglet perdu après navigation', url: url };
      }
    }

    // Comportement humain optionnel
    if (options.humanBehavior !== false) {
      await this.humanDelay(800, 1500);
      try {
        await this.humanScroll(finalTabId, options.scrollCount || 1);
      } catch (e) {
        console.warn('[OpenClaw Bridge] humanScroll ignoré:', e.message);
      }
    }

    return {
      tabId: finalTabId,
      url: finalUrl,
      title: finalTitle,
      loaded: true,
      createdNew
    };
  }

  async humanDelay(min = 1000, max = 3000) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  async humanScroll(tabId, count = 2) {
    // Vérifier que l'onglet existe encore
    try {
      await browser.tabs.get(tabId);
    } catch (e) {
      console.warn('[OpenClaw Bridge] humanScroll: onglet inexistant');
      return;
    }

    for (let i = 0; i < count; i++) {
      try {
        await browser.scripting.executeScript({
          target: { tabId },
          func: (y) => {
            window.scrollBy({ top: y, behavior: 'smooth' });
          },
          args: [Math.floor(Math.random() * 500 + 300)]
        });
      } catch (e) {
        console.warn('[OpenClaw Bridge] humanScroll ignoré (onglet inaccessible):', e.message);
        break;
      }
      await this.humanDelay(800, 2000);
    }
  }

  // === FONCTIONNALITÉS P0: EXTRACTION DE DONNÉES ===

  async executeExtract(payload) {
    const { tabId, selector, attribute, options = {} } = payload;

    const targetTabId = tabId || (await browser.tabs.query({ active: true, currentWindow: true }))[0]?.id;

    if (!targetTabId) {
      throw new Error('Aucun onglet actif');
    }

    const results = await browser.scripting.executeScript({
      target: { tabId: targetTabId },
      func: (selector, attribute) => {
        const elements = document.querySelectorAll(selector);

        return Array.from(elements).map(el => {
          if (attribute) {
            return el.getAttribute(attribute);
          }
          return {
            text: el.innerText,
            html: el.innerHTML,
            href: el.href || null,
            src: el.src || null
          };
        });
      },
      args: [selector, attribute]
    });

    const data = results[0]?.result || [];
    return {
      selector,
      count: data.length,
      data: data
    };

  }

  async extractFromTab(tabId, engine) {
    const selectors = {
      google: {
        results: 'div.g, div[data-ved]',
        title: 'h3',
        url: 'a[href]',
        snippet: 'div.VwiC3b, span'
      },
      bing: {
        results: 'li.b_algo',
        title: 'h2 a',
        url: 'a[href]',
        snippet: 'p'
      },
      duckduckgo: {
        results: '.result, .web-result',
        title: '.result__title, h2 a',
        url: 'a[href]',
        snippet: '.result__snippet, .result__a'
      }
    };

    const config = selectors[engine] || selectors.google;

    const results = await browser.scripting.executeScript({
      target: { tabId },
      func: (config, engine) => {
        const results = document.querySelectorAll(config.results);
        return Array.from(results).slice(0, 10).map(result => {
          const titleEl = result.querySelector(config.title);
          const linkEl = result.querySelector(config.url);
          const snippetEl = result.querySelector(config.snippet);

          return {
            title: titleEl ? titleEl.innerText.trim() : '',
            url: linkEl ? linkEl.href : '',
            snippet: snippetEl ? snippetEl.innerText.trim() : '',
            source: engine
          };
        }).filter(r => r.title && r.url);
      },
      args: [config, engine]
    });

    return results[0]?.result || [];

  }

  // === FONCTIONNALITÉ: DOM INTERACTIF ===

  async executeDomFind(payload) {
    const { text, selector, tabId } = payload;

    // Trouver l'onglet cible
    let targetTabId = tabId;
    if (!targetTabId) {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      targetTabId = tabs[0]?.id;
    }

    if (!targetTabId) {
      throw new Error('Aucun onglet trouvé');
    }

    console.log(`[OpenClaw Bridge] DOM.find: "${text || selector}" dans onglet ${targetTabId}`);

    // Injecter un script natif (contourne la CSP)
    const results = await browser.scripting.executeScript({
      target: { tabId: targetTabId },
      func: (searchText, cssSelector) => {
        let element = null;

        if (cssSelector) {
          element = document.querySelector(cssSelector);
        } else if (searchText) {
          // Chercher par texte conten
          const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_ELEMENT,
            null,
            false
          );
          
          while (walker.nextNode()) {
            const node = walker.currentNode;
            if (node.children.length === 0 && node.textContent.includes(searchText)) {
              element = node.parentElement;
              break;
            }
            if (node.textContent.includes(searchText) && node.tagName !== 'SCRIPT') {
              element = node;
              break;
            }
          }
        }

        if (!element) {
          return { found: false, error: 'Élément non trouvé' };
        }

        const rect = element.getBoundingClientRect();
        return {
          found: true,
          x: Math.round(rect.left + rect.width / 2),
          y: Math.round(rect.top + rect.height / 2),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          tag: element.tagName,
          text: element.textContent.trim().substring(0, 200),
          href: element.href || null
        };
      },
      args: [text, selector]
    });

    const result = results[0]?.result;
    if (!result?.found) {
      throw new Error(result?.error || 'Élément non trouvé');
    }

    return {
      found: true,
      x: result.x,
      y: result.y,
      width: result.width,
      height: result.height,
      tag: result.tag,
      text: result.text,
      href: result.href,
      tabId: targetTabId
    };
  }

  async executeClickOnText(payload) {
    const { text, selector, tabId, doubleClick = false, rightClick = false } = payload;

    console.log(`[OpenClaw Bridge] clickOnText: "${text || selector}"`);

    // Étape 1: Trouver l'élément dans le DOM
    const findResult = await this.executeDomFind({ text, selector, tabId });
    
    if (!findResult.found) {
      throw new Error(findResult.error || 'Élément non trouvé pour clic');
    }

    const { x, y, width, height } = findResult;
    console.log(`[OpenClaw Bridge] Élément trouvé à (${x}, ${y}), clic...`);

    // Étape 2: Déplacer la souris
    await this.executeContentAction('mouse.move', { x, y, tabId: findResult.tabId });
    await new Promise(r => setTimeout(r, 300)); // Petit délai humain

    // Étape 3: Clic
    let clickResult;
    if (rightClick) {
      clickResult = await this.executeContentAction('mouse.rightClick', { x, y, tabId: findResult.tabId });
    } else if (doubleClick) {
      clickResult = await this.executeContentAction('mouse.doubleClick', { x, y, tabId: findResult.tabId });
    } else {
      clickResult = await this.executeContentAction('mouse.click', { x, y, tabId: findResult.tabId });
    }

    return {
      clicked: true,
      x,
      y,
      width,
      height,
      text: findResult.text,
      href: findResult.href,
      tabId: findResult.tabId,
      clickResult
    };
  }

  // === FONCTIONNALITÉS P2: SCREENSHOT & VISION ===

  async executeScreenshot(payload) {
    const { tabId, format = 'png', fullPage = false } = payload;

    // Utiliser captureTab avec un ID spécifique, ou l'onglet actif
    let targetTabId = tabId;
    
    if (!targetTabId) {
      // Trouver l'onglet actif
      const activeTabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (activeTabs.length > 0) {
        targetTabId = activeTabs[0].id;
      }
    }

    if (!targetTabId) {
      // Fallback: dernier onglet web
      const tabs = await browser.tabs.query({});
      const webTab = tabs
        .filter(t => t.url && (t.url.startsWith('http://') || t.url.startsWith('https://')))
        .pop();
      targetTabId = webTab?.id;
    }

    if (!targetTabId) {
      throw new Error('Aucun onglet web disponible pour screenshot');
    }

    // Vérifier si l'onglet est accessible et prêt
    try {
      const tab = await browser.tabs.get(targetTabId);
      if (!tab.url || tab.url.startsWith('about:') || tab.url.startsWith('chrome:')) {
        throw new Error('L\'onglet est une page système, capture impossible');
      }
    } catch (e) {
      throw new Error('Onglet inaccessible: ' + e.message);
    }

    // captureVisibleTab capture l'onglet actif de la fenêtre. On n'active la cible
    // que si elle ne l'est pas déjà — sinon on perturbe l'utilisateur sans raison.
    {
      const current = await browser.tabs.get(targetTabId);
      if (!current.active) {
        await browser.tabs.update(targetTabId, { active: true });
        await new Promise(r => setTimeout(r, 500)); // Laisser le rendu se faire
      }
    }

    const dataUrl = await browser.tabs.captureVisibleTab(null, {
      format,
      quality: format === 'jpeg' ? CONFIG.VISION_QUALITY : undefined
    });

    const tab = await browser.tabs.get(targetTabId);

    return {
      format,
      dataUrl,
      tabId: targetTabId,
      title: tab.title,
      url: tab.url,
      timestamp: new Date().toISOString()
    };
  }

  async startVisionStream(payload) {
    const fps = payload?.fps || CONFIG.VISION_FPS;
    const interval = 1000 / fps;

    if (this.visionStream) {
      clearInterval(this.visionStream);
    }

    const captureAndSend = async () => {
      try {
        const tab = (await browser.tabs.query({ active: true, currentWindow: true }))[0];
        if (!tab) return;

        const dataUrl = await browser.tabs.captureVisibleTab(null, {
          format: 'jpeg',
          quality: CONFIG.VISION_QUALITY
        });

        let w = 0, h = 0, s = 0;
        try {
          const info = await browser.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => ({ w: window.innerWidth, h: window.innerHeight, s: window.scrollY })
          });
          if (info?.[0]?.result) ({ w, h, s } = info[0].result);
        } catch (_) { /* onglet système ou about:blank */ }


        this.send({
          type: 'vision.frame',
          payload: {
            image: dataUrl,
            timestamp: Date.now(),
            url: tab.url,
            scrollY: s,
            viewport: { width: w, height: h }
          }
        });
      } catch (e) {
        console.error('[OpenClaw Vision] Erreur capture:', e);
      }
    };

    this.visionStream = setInterval(captureAndSend, interval);
    console.log(`[OpenClaw Vision] Stream démarré à ${fps} FPS`);

    return { success: true, streaming: true, fps };
  }

  stopVisionStream() {
    if (this.visionStream) {
      clearInterval(this.visionStream);
      this.visionStream = null;
      console.log('[OpenClaw Vision] Stream arrêté');
    }
    return { success: true, streaming: false };
  }

  // === FONCTIONNALITÉS P2: FORM FILL ===

  async executeFormFill(payload) {
    const { tabId, fields, submit = false } = payload;

    const targetTabId = tabId || (await browser.tabs.query({ active: true, currentWindow: true }))[0]?.id;

    if (!targetTabId) {
      throw new Error('Aucun onglet actif');
    }

    const results = await browser.scripting.executeScript({
      target: { tabId: targetTabId },
      func: (fields, submit) => {
        const results = [];

        for (const [selector, value] of Object.entries(fields)) {
          const el = document.querySelector(selector);
          if (el) {
            el.focus();
            el.click();
            el.value = '';

            for (let i = 0; i < value.length; i++) {
              el.value += value[i];
              el.dispatchEvent(new Event('input', { bubbles: true }));
            }

            el.blur();
            results.push({ selector, success: true });
          } else {
            results.push({ selector, success: false, error: 'Element not found' });
          }
        }

        if (submit && results.every(r => r.success)) {
          const form = document.querySelector('form') || document.querySelector(Object.keys(fields)[0])?.closest('form');
          if (form) {
            form.submit();
          }
        }

        return results;
      },
      args: [fields, submit]
    });

    return {
      filled: results[0]?.result || [],
      submitted: submit
    };

  }

  // === FONCTIONNALITÉS P2: FILE DOWNLOAD ===

  async executeDownload(payload) {
    const { url, filename, options = {} } = payload;

    console.log(`[OpenClaw Bridge] Téléchargement: ${url}`);

    const downloadId = await browser.downloads.download({
      url,
      filename: filename || undefined,
      saveAs: options.saveAs || false,
      conflictAction: options.conflictAction || 'uniquify'
    });

    return {
      downloadId,
      url,
      filename,
      status: 'started'
    };
  }

  // === FONCTIONNALITÉS P1: SESSION PERSISTENCE ===

  async getCookies(payload = {}) {
    const { url, name } = payload;

    const query = {};
    if (url) query.url = url;
    if (name) query.name = name;

    const cookies = await browser.cookies.getAll(query);

    return {
      count: cookies.length,
      cookies: cookies.map(c => ({
        name: c.name,
        value: c.value.substring(0, 20) + '...',
        domain: c.domain,
        path: c.path,
        secure: c.secure,
        httpOnly: c.httpOnly,
        expirationDate: c.expirationDate
      }))
    };
  }

  async setCookies(payload) {
    const { cookies } = payload;

    const results = [];
    for (const cookie of cookies) {
      try {
        await browser.cookies.set({
          url: cookie.url,
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path || '/',
          secure: cookie.secure || false,
          httpOnly: cookie.httpOnly || false,
          expirationDate: cookie.expirationDate
        });
        results.push({ name: cookie.name, success: true });
      } catch (e) {
        results.push({ name: cookie.name, success: false, error: e.message });
      }
    }

    return { set: results };
  }

  // === EXEC SCRIPT ===

  async executeScriptCommand(payload) {
    const { tabId, code, file } = payload;
    const targetTabId = tabId || (await browser.tabs.query({ active: true, currentWindow: true }))[0]?.id;

    if (!targetTabId) {
      throw new Error('Aucun onglet actif');
    }

    // Liste blanche de fonctions autorisées pour la sécurité
    const ALLOWED_FUNCTIONS = {
      'document.title': () => document.title,
      'document.url': () => window.location.href,
      'document.domain': () => window.location.hostname,
      'document.links.count': () => document.querySelectorAll('a').length,
      'document.images.count': () => document.querySelectorAll('img').length,
      'document.headings': () => Array.from(document.querySelectorAll('h1, h2, h3')).map(h => h.innerText),
      'document.forms.count': () => document.querySelectorAll('form').length,
      'window.scrollY': () => window.scrollY,
      'window.innerWidth': () => window.innerWidth,
      'window.innerHeight': () => window.innerHeight,
    };

    let funcToExecute;
    let args = [];

    if (ALLOWED_FUNCTIONS[code]) {
      funcToExecute = ALLOWED_FUNCTIONS[code];
    } else {
      throw new Error('Code non autorisé. Utilisez les fonctions prédéfinies (document.title, window.scrollY, etc.).');
    }

    const results = await browser.scripting.executeScript({
      target: { tabId: targetTabId },
      func: funcToExecute,
      args: args
    });

    return {
      tabId: targetTabId,
      result: results[0]?.result,
      timestamp: new Date().toISOString()
    };
  }

  // === UTILITAIRES ===

  async waitForTabLoad(tabId, timeout = 15000, targetUrl = null) {
    const startTime = Date.now();
    const cleanUrl = (u) => u ? u.split('#')[0].split('?')[0] : '';
    const targetBase = targetUrl ? cleanUrl(targetUrl) : null;

    // D'abord vérifier si l'onglet est déjà chargé et correspond à l'URL cible
    try {
      const tab = await browser.tabs.get(tabId);
      if (tab.status === 'complete' && tab.url && !tab.url.startsWith('about:blank')) {
        // Si on attend une URL spécifique, vérifier si elle est là
        if (!targetBase || cleanUrl(tab.url).includes(targetBase)) {
          console.log('[OpenClaw Bridge] Onglet déjà prêt:', tab.url);
          return;
        }
      }
    } catch (e) { /* on continue */ }

    return new Promise((resolve) => {
      let settled = false;
      
      const done = (reason) => {
        if (settled) return;
        settled = true;
        browser.tabs.onUpdated.removeListener(listener);
        clearInterval(pollInterval);
        clearTimeout(timer);
        resolve();
      };

      const timer = setTimeout(() => {
        console.warn('[OpenClaw Bridge] waitForTabLoad timeout');
        done('timeout');
      }, timeout);

      const listener = (updatedTabId, changeInfo, tab) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          if (!targetBase || (tab.url && cleanUrl(tab.url).includes(targetBase))) {
            console.log('[OpenClaw Bridge] Chargement détecté par event:', tab.url || 'ok');
            done('event');
          }
        }
      };

      // Polling de secours (certains sites/moteurs peuvent rater l'event 'complete')
      const pollInterval = setInterval(async () => {
        try {
          const tab = await browser.tabs.get(tabId);
          if (tab.status === 'complete') {
            if (!targetBase || (tab.url && cleanUrl(tab.url).includes(targetBase))) {
              console.log('[OpenClaw Bridge] Chargement détecté par polling:', tab.url);
              done('polling');
            }
          }
        } catch (e) {
          done('tab_lost');
        }
      }, 1000);

      browser.tabs.onUpdated.addListener(listener);
    });
  }

  async listTabs() {
    const tabs = await browser.tabs.query({});
    return {
      count: tabs.length,
      tabs: tabs.map(t => ({
        id: t.id,
        title: t.title,
        url: t.url,
        active: t.active,
        windowId: t.windowId
      }))
    };
  }

  async closeTab(payload) {
    const { tabId } = payload;
    await browser.tabs.remove(tabId);
    return { closed: tabId, success: true };
  }

  // setupMessageListener removed from class

  async executeDomClick(tabId, payload) {
    const { selector, text } = payload;

    try {
      const results = await browser.scripting.executeScript({
        target: { tabId },
        func: (selector, text) => {
          let el = null;

          if (selector) {
            try { el = document.querySelector(selector); } catch (e) {}
          }

          if (!el && text) {
            const elements = Array.from(document.querySelectorAll('a, button, [role="button"]'));
            el = elements.find(e => {
              const elText = (e.innerText || e.textContent || e.value || '').trim();
              return elText.toLowerCase().includes(text.toLowerCase());
            });
          }

          if (!el) {
            return { success: false, error: 'Élément non trouvé' };
          }

          el.scrollIntoView({ behavior: 'smooth', block: 'center' });

          const clickEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window
          });
          el.dispatchEvent(clickEvent);
          el.click();

          return { 
            success: true, 
            element: el.tagName,
            text: (el.innerText || el.textContent || '').substring(0, 50),
            href: el.href || null
          };
        },
        args: [selector, text]
      });

      return results[0]?.result || { success: false, error: 'Script failed' };
    } catch (e) {
      console.error('[OpenClaw Bridge] Erreur dom.click:', e.message);
      return { success: false, error: e.message };
    }
  }
  
  handleRuntimeMessage(message, sender, sendResponse) {
    if (message.type === 'bridge.status') {
      sendResponse({
        connected: this.isConnected,
        session: this.sessionData,
        capabilities: [
          'search.google', 'search.bing', 'search.duckduckgo',
          'data.extract', 'navigate.human', 'screenshot',
          'form.fill', 'file.download',
          'mouse.move', 'mouse.click', 'mouse.doubleClick', 'mouse.rightClick', 'mouse.scroll', 'mouse.hover',
          'keyboard.type', 'keyboard.press',
          'vision.start', 'vision.stop', 'vision.screenshot',
          'human.read', 'human.explore',
          'combo.searchAndClick',
          'dom.click', 'dom.doubleClick', 'dom.hover', 'dom.type', 'dom.select', 'dom.inspect', 'dom.waitFor'
        ]
      });
      return true;
    }

    // Relayer les frames de vision du content script vers le Gateway
    if (message.type === 'vision.frame' && sender.tab) {
      this.send({
        type: 'vision.frame',
        payload: message.payload
      });
      sendResponse({ relayed: true });
      return true;
    }

    return false;
  }

  setupTabListener() {
    browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.url && changeInfo.url.includes('google.com')) {
        this.sessionData.lastGoogleVisit = {
          url: changeInfo.url,
          timestamp: Date.now()
        };
      }
    });
  }

  // === ACTIONS CONTENT SCRIPT (souris, clavier, navigation humaine, combo) ===

  async injectContentScript(tabId) {
    try {
      const tab = await browser.tabs.get(tabId);
      if (!tab.url || tab.url.startsWith('about:') || tab.url.startsWith('moz-extension:') || tab.url.startsWith('chrome:')) {
        return false;
      }

      // Vérifier si le script unifié est présent
      const checkResult = await browser.scripting.executeScript({
        target: { tabId },
        func: () => !!window.__openclaw_unified_loaded
      });

      if (checkResult[0]?.result) return true;

      // Injecter le content script unifié
      await browser.scripting.executeScript({
        target: { tabId },
        files: ['browser-polyfill.js', 'content.js']
      });

      await new Promise(r => setTimeout(r, 500));
      return true;
    } catch (e) {
      console.warn('[OpenClaw Bridge] Erreur injection:', e.message);
      return false;
    }
  }

  async executeContentAction(type, payload) {
    const { tabId } = payload || {};
    const targetTabId = tabId || (await browser.tabs.query({ active: true, currentWindow: true }))[0]?.id;

    if (!targetTabId) throw new Error('Aucun onglet actif');

    // Pour dom.click, utiliser executeScript directement (plus fiable)
    if (type === 'dom.click') {
      return await this.executeDomClick(targetTabId, payload);
    }

    // S'assurer que le content script est injecté
    const injected = await this.injectContentScript(targetTabId);
    if (!injected) {
      return { success: false, error: 'Impossible d\'injecter le content script sur cette page.' };
    }

    try {
      console.log(`[OpenClaw Bridge] Envoi message à ${targetTabId}:`, type);
      const response = await browser.tabs.sendMessage(targetTabId, {
        type: type,
        payload: payload
      });
      console.log(`[OpenClaw Bridge] Réponse de ${targetTabId}:`, response);
      return response || { success: true };
    } catch (e) {
      console.warn('[OpenClaw Bridge] Erreur envoi message au content script:', e.message);
      return { success: false, error: 'Content script non disponible: ' + e.message };
    }
  }
}

// Initialisation de l'instance
const bridge = new BrowserBridge();

/**
 * Écouteur global de messages (doit être au top-level pour MV3)
 */
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Gérer immédiatement le statut pour éviter le "Receiving end does not exist"
  if (message.type === 'bridge.status') {
    sendResponse({
      connected: bridge.isConnected,
      session: bridge.sessionData,
      capabilities: [
        'search.google', 'search.bing', 'search.duckduckgo',
        'data.extract', 'navigate.human', 'screenshot',
        'form.fill', 'file.download',
        'mouse.move', 'mouse.click', 'mouse.doubleClick', 'mouse.rightClick', 'mouse.scroll', 'mouse.hover',
        'keyboard.type', 'keyboard.press',
        'vision.start', 'vision.stop', 'vision.screenshot',
        'human.read', 'human.explore',
        'combo.searchAndClick',
        'dom.click', 'dom.doubleClick', 'dom.hover', 'dom.type', 'dom.select', 'dom.inspect', 'dom.waitFor'
      ]
    });
    return false; // Réponse synchrone
  }

  // Relayer les messages à l'instance
  return bridge.handleRuntimeMessage(message, sender, sendResponse);
});

// Démarrer la connexion après avoir mis les écouteurs
bridge.init();

// Note: window.OpenClawBridge n'est plus accessible en MV3 (Service Worker)


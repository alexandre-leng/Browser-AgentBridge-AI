/**
 * OpenClaw Browser Bridge - Content Script
 * Injecté dans chaque page pour extraction et interaction DOM
 */

(function() {
  'use strict';

  // Éviter double injection
  if (window.__openclawContentScript) return;
  window.__openclawContentScript = true;

  console.log('[OpenClaw Content] Script injecté sur:', window.location.href);

  // === EXTRACTEURS SPÉCIALISÉS PAR SITE ===
  
  const extractors = {
    // Google Search
    'google.com': {
      searchResults: () => {
        const results = [];
        
        // Sélecteurs Google modernes
        const containers = document.querySelectorAll('div.g, div[data-ved], div.tF2Cxc, div.MjjYud');
        
        containers.forEach((container, index) => {
          try {
            const titleEl = container.querySelector('h3, .LC20lb, [data-attrid="title"]');
            const linkEl = container.querySelector('a[href], .yuRUbf a');
            const snippetEl = container.querySelector('.VwiC3b, .s3v94d, [data-attrid="description"]');
            
            if (titleEl && linkEl) {
              results.push({
                position: index + 1,
                title: titleEl.innerText.trim(),
                url: linkEl.href,
                snippet: snippetEl ? snippetEl.innerText.trim() : '',
                source: 'google'
              });
            }
          } catch (e) {
            console.error('[OpenClaw Content] Erreur extraction:', e);
          }
        });
        
        return results;
      },
      
      relatedQueries: () => {
        return Array.from(document.querySelectorAll('a[href*="/search?q="]'))
          .map(a => a.innerText)
          .filter(text => text.length > 0);
      },
      
      resultStats: () => {
        const statsEl = document.querySelector('#result-stats, [id="result-stats"]');
        return statsEl ? statsEl.innerText : null;
      }
    },
    
    // Bing Search
    'bing.com': {
      searchResults: () => {
        const results = [];
        const containers = document.querySelectorAll('li.b_algo, .b_algo');
        
        containers.forEach((container, index) => {
          try {
            const titleEl = container.querySelector('h2 a, .b_title a');
            const snippetEl = container.querySelector('p, .b_caption p');
            const urlEl = container.querySelector('cite, .b_attribution cite');
            
            if (titleEl) {
              results.push({
                position: index + 1,
                title: titleEl.innerText.trim(),
                url: titleEl.href || urlEl?.innerText,
                snippet: snippetEl ? snippetEl.innerText.trim() : '',
                source: 'bing'
              });
            }
          } catch (e) {
            console.error('[OpenClaw Content] Erreur extraction Bing:', e);
          }
        });
        
        return results;
      }
    },
    
    // DuckDuckGo
    'duckduckgo.com': {
      searchResults: () => {
        const results = [];
        const containers = document.querySelectorAll('.result, .web-result');
        
        containers.forEach((container, index) => {
          try {
            const titleEl = container.querySelector('.result__title a, h2 a');
            const snippetEl = container.querySelector('.result__snippet, .result__a');
            const urlEl = container.querySelector('.result__url, .result__extras__url');
            
            if (titleEl) {
              results.push({
                position: index + 1,
                title: titleEl.innerText.trim(),
                url: titleEl.href || urlEl?.href,
                snippet: snippetEl ? snippetEl.innerText.trim() : '',
                source: 'duckduckgo'
              });
            }
          } catch (e) {
            console.error('[OpenClaw Content] Erreur extraction DDG:', e);
          }
        });
        
        return results;
      }
    }
  };

  // === UTILITAIRES DOM ===
  
  const DOMUtils = {
    // Scroll fluide vers un élément
    scrollToElement: (selector, behavior = 'smooth') => {
      const el = document.querySelector(selector);
      if (el) {
        el.scrollIntoView({ behavior, block: 'center' });
        return true;
      }
      return false;
    },
    
    // Click sur un élément
    clickElement: (selector) => {
      const el = document.querySelector(selector);
      if (el) {
        // Events souris réalistes
        const events = ['mousedown', 'mouseup', 'click'];
        events.forEach(eventType => {
          const event = new MouseEvent(eventType, {
            bubbles: true,
            cancelable: true,
            view: window
          });
          el.dispatchEvent(event);
        });
        return true;
      }
      return false;
    },
    
    // Remplir un champ
    fillField: (selector, value) => {
      const el = document.querySelector(selector);
      if (!el) return false;
      
      el.focus();
      el.click();
      el.value = '';
      
      // Typing humain
      for (let i = 0; i < value.length; i++) {
        el.value += value[i];
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('keydown', { bubbles: true }));
        el.dispatchEvent(new Event('keyup', { bubbles: true }));
      }
      
      el.blur();
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    },
    
    // Attendre un élément
    waitForElement: (selector, timeout = 5000) => {
      return new Promise((resolve, reject) => {
        const el = document.querySelector(selector);
        if (el) {
          resolve(el);
          return;
        }
        
        const observer = new MutationObserver(() => {
          const el = document.querySelector(selector);
          if (el) {
            observer.disconnect();
            resolve(el);
          }
        });
        
        observer.observe(document.body, {
          childList: true,
          subtree: true
        });
        
        setTimeout(() => {
          observer.disconnect();
          reject(new Error(`Timeout: élément ${selector} non trouvé`));
        }, timeout);
      });
    },
    
    // Extraire données génériques
    extractData: (config) => {
      const { selector, attribute, multiple = false } = config;
      
      if (multiple) {
        return Array.from(document.querySelectorAll(selector)).map(el => {
          if (attribute) return el.getAttribute(attribute);
          return {
            text: el.innerText,
            html: el.innerHTML,
            href: el.href || null
          };
        });
      } else {
        const el = document.querySelector(selector);
        if (!el) return null;
        if (attribute) return el.getAttribute(attribute);
        return {
          text: el.innerText,
          html: el.innerHTML,
          href: el.href || null
        };
      }
    }
  };

  // === COMPORTEMENT HUMAIN ===
  
  const HumanBehavior = {
    // Délai aléatoire
    delay: (min = 800, max = 2500) => {
      const delay = Math.floor(Math.random() * (max - min + 1)) + min;
      return new Promise(resolve => setTimeout(resolve, delay));
    },
    
    // Scroll progressif
    scrollDown: async (amount = 500) => {
      const scrollAmount = Math.floor(Math.random() * amount) + amount / 2;
      window.scrollBy({
        top: scrollAmount,
        behavior: 'smooth'
      });
      await HumanBehavior.delay(500, 1500);
    },
    
    // Lecture simulée
    simulateReading: async (time = 3000) => {
      await HumanBehavior.delay(time, time + 2000);
    },
    
    // Mouvement souris vers élément (simulation)
    moveToElement: (selector) => {
      const el = document.querySelector(selector);
      if (!el) return false;
      
      const rect = el.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      
      // Simuler mousemove
      const event = new MouseEvent('mousemove', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y
      });
      document.dispatchEvent(event);
      return true;
    }
  };

  // === ÉCOUTEUR DE MESSAGES ===
  
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[OpenClaw Content] Message reçu:', message.type);
    
    const handleAsync = async () => {
      switch (message.type) {
        case 'content.extract':
          const { extractor } = message;
          const hostname = window.location.hostname;
          
          // Trouver l'extracteur approprié
          let siteExtractor = null;
          for (const [domain, siteExtractorFns] of Object.entries(extractors)) {
            if (hostname.includes(domain)) {
              siteExtractor = siteExtractorFns;
              break;
            }
          }
          
          if (siteExtractor && siteExtractor[extractor]) {
            return await siteExtractor[extractor]();
          } else {
            // Extraction générique
            return DOMUtils.extractData(message.config || {});
          }
          
        case 'content.click':
          return { success: DOMUtils.clickElement(message.selector) };
          
        case 'content.fill':
          return { success: DOMUtils.fillField(message.selector, message.value) };
          
        case 'content.scroll':
          await HumanBehavior.scrollDown(message.amount);
          return { success: true, scrollY: window.scrollY };
          
        case 'content.wait':
          await HumanBehavior.delay(message.min, message.max);
          return { success: true };
          
        case 'content.waitForElement':
          try {
            const el = await DOMUtils.waitForElement(message.selector, message.timeout);
            return { success: true, found: true };
          } catch (e) {
            return { success: false, error: e.message };
          }
          
        case 'content.getPageInfo':
          return {
            url: window.location.href,
            title: document.title,
            hostname: window.location.hostname,
            scrollY: window.scrollY,
            scrollHeight: document.documentElement.scrollHeight,
            viewport: {
              width: window.innerWidth,
              height: window.innerHeight
            }
          };
          
        default:
          return { error: 'Type de message inconnu' };
      }
    };
    
    handleAsync()
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ error: error.message }));
    
    return true; // Important pour async
  });

  // === INJECTION DE FONCTIONS UTILITAIRES ===
  
  // Exposer pour debug
  window.OpenClawContent = {
    extractors,
    DOMUtils,
    HumanBehavior,
    version: '1.0.0'
  };

  console.log('[OpenClaw Content] Initialisé et prêt');
})();
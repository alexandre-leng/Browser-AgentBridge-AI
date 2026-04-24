/**
 * OpenClaw Browser Bridge - Unified Human-DOM Engine v3.4
 * DOM-centric interaction with full text extraction and mouse control
 */

(function() {
  'use strict';

  if (window.__openclaw_unified_loaded) return;
  window.__openclaw_unified_loaded = true;

  // === CONFIGURATION ===
  const CONFIG = {
    CURSOR_SPEED: 600,
    JITTER_AMOUNT: 1.2,
    ARC_OFFSET: 25
  };

  // === UTILITAIRES DOM ===
  const DOMUtils = {
    resolve(target) {
      if (!target) return null;
      const query = target.query || target.text || target.selector || target.label || target.inputLabel || '';
      let el = null;

      // 1. XPath
      if (target.xpath || query.startsWith('//') || query.startsWith('/html') || query.startsWith('(')) {
        try {
          el = document.evaluate(target.xpath || query, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
          if (el) return el;
        } catch(e) {}
      }

      // 2. CSS Selector
      if (target.selector || query.startsWith('#') || query.startsWith('.') || query.startsWith('[')) {
        try {
          el = document.querySelector(target.selector || query);
          if (el) return el;
        } catch(e) {}
        if (target.selector) return null;
      }

      // 3. Attributs
      try {
        el = document.querySelector(`[aria-label*="${query}" i], [title*="${query}" i], [placeholder*="${query}" i], [name="${query}"]`);
        if (el && this.isVisible(el)) return el;
      } catch(e) {}

      // 4. Texte
      const lowerQuery = query.toLowerCase();
      const inputs = Array.from(document.querySelectorAll('input[type="button"], input[type="submit"], input[type="text"], input[type="search"], input[type="email"], input[type="password"], textarea'));
      el = inputs.find(i => (i.value || '').toLowerCase().includes(lowerQuery) && this.isVisible(i));
      if (el) return el;

      const elements = Array.from(document.querySelectorAll('button, a, label, span, p, h1, h2, h3, h4, h5, h6, div, li, td, [role="button"], [role="link"]'));
      el = elements.find(e => e.innerText && e.innerText.trim().toLowerCase() === lowerQuery && this.isVisible(e));
      if (el) return el;
      el = elements.find(e => e.innerText && e.innerText.toLowerCase().includes(lowerQuery) && this.isVisible(e));
      if (el) {
        const child = Array.from(el.querySelectorAll('*')).find(c => c.innerText && c.innerText.toLowerCase().includes(lowerQuery) && this.isVisible(c));
        return child || el;
      }
      return null;
    },

    findInputByLabel(label) {
      const lower = label.toLowerCase();
      const labels = Array.from(document.querySelectorAll('label'));
      for (const lbl of labels) {
        if ((lbl.innerText || '').toLowerCase().includes(lower)) {
          const forId = lbl.getAttribute('for');
          if (forId) {
            const input = document.getElementById(forId);
            if (input) return input;
          }
          const nested = lbl.querySelector('input, textarea, select');
          if (nested) return nested;
        }
      }
      return document.querySelector(`input[placeholder*="${label}" i], input[aria-label*="${label}" i], input[name*="${label}" i], textarea[placeholder*="${label}" i], select[aria-label*="${label}" i]`);
    },

    getCenter(el) {
      const rect = el.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    },

    isVisible(el) {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    },

    scrollIfNeeded(el) {
      const rect = el.getBoundingClientRect();
      if (rect.top < 0 || rect.bottom > window.innerHeight || rect.left < 0 || rect.right > window.innerWidth) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        return true;
      }
      return false;
    }
  };

  // === MOTEUR DE SOURIS HUMAINE ===
  const MouseEngine = {
    cursorEl: null,
    currentX: window.innerWidth / 2,
    currentY: window.innerHeight / 2,
    isMoving: false,

    init() {
      this.createCursor();
    },

    createCursor() {
      if (this.cursorEl) return;
      this.cursorEl = document.createElement('div');
      this.cursorEl.id = 'openclaw-v3-cursor';
      this.cursorEl.style.cssText = `
        position: fixed; top: 0; left: 0; width: 18px; height: 18px;
        background: rgba(233, 69, 96, 0.7); border: 2px solid #fff;
        border-radius: 50%; pointer-events: none; z-index: 2147483647;
        box-shadow: 0 0 8px rgba(0,0,0,0.3); transition: opacity 0.3s;
        opacity: 0; display: flex; align-items: center; justify-content: center;
      `;
      const dot = document.createElement('div');
      dot.style.cssText = 'width: 4px; height: 4px; background: #fff; border-radius: 50%;';
      this.cursorEl.appendChild(dot);
      document.documentElement.appendChild(this.cursorEl);
    },

    getBezierPoint(t, p0, p1, p2) {
      const invT = 1 - t;
      return {
        x: invT * invT * p0.x + 2 * invT * t * p1.x + t * t * p2.x,
        y: invT * invT * p0.y + 2 * invT * t * p1.y + t * t * p2.y
      };
    },

    async move(targetX, targetY) {
      if (this.isMoving) await new Promise(r => setTimeout(r, 200));
      this.isMoving = true;
      this.cursorEl.style.opacity = '1';
      const start = { x: this.currentX, y: this.currentY };
      const end = { x: targetX, y: targetY };
      const ctrl = {
        x: (start.x + end.x) / 2 + (Math.random() - 0.5) * CONFIG.ARC_OFFSET * 2,
        y: (start.y + end.y) / 2 + (Math.random() - 0.5) * CONFIG.ARC_OFFSET * 2
      };
      const duration = CONFIG.CURSOR_SPEED + (Math.random() * 400);
      const startTime = performance.now();

      return new Promise(resolve => {
        const step = (now) => {
          const elapsed = now - startTime;
          const progress = Math.min(elapsed / duration, 1);
          const t = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
          const pos = this.getBezierPoint(t, start, ctrl, end);
          const jitterX = (Math.random() - 0.5) * CONFIG.JITTER_AMOUNT;
          const jitterY = (Math.random() - 0.5) * CONFIG.JITTER_AMOUNT;
          this.cursorEl.style.transform = `translate(${pos.x + jitterX}px, ${pos.y + jitterY}px)`;
          this.currentX = pos.x;
          this.currentY = pos.y;
          if (progress < 1) {
            requestAnimationFrame(step);
          } else {
            this.isMoving = false;
            setTimeout(() => { if(!this.isMoving) this.cursorEl.style.opacity = '0.4'; }, 1000);
            resolve();
          }
        };
        requestAnimationFrame(step);
      });
    },

    async click(x, y) {
      await this.move(x, y);
      this.cursorEl.style.transform += ' scale(0.8)';
      this.cursorEl.style.background = '#e94560';
      const el = document.elementFromPoint(x, y);
      if (el) {
        const link = el.closest('a');
        if (link && link.href && !link.getAttribute('target')) {
          link.setAttribute('target', '_blank');
        }
        el.click();
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y }));
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x, clientY: y }));
      }
      setTimeout(() => {
        this.cursorEl.style.transform = this.cursorEl.style.transform.replace(' scale(0.8)', '');
        this.cursorEl.style.background = 'rgba(233, 69, 96, 0.7)';
      }, 150);
      return { success: true, x, y, element: el?.tagName, text: el?.innerText?.substring(0, 50) };
    }
  };

  // === EXTRACTEUR DE TEXTE AVANCÉ ===
  const TextExtractor = {
    /**
     * Extrait tout le texte de la page avec positions
     * Retourne une structure hiérarchique facile à naviguer
     */
    extractAllText() {
      const textBlocks = [];
      const seen = new Set();
      
      // Walk the DOM tree
      const walk = (node, depth = 0) => {
        if (depth > 20) return;
        
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent.trim();
          if (text.length > 0) {
            const parent = node.parentElement;
            if (parent && DOMUtils.isVisible(parent)) {
              const rect = parent.getBoundingClientRect();
              const key = `${rect.top.toFixed(0)}_${rect.left.toFixed(0)}_${text.substring(0, 30)}`;
              if (!seen.has(key)) {
                seen.add(key);
                textBlocks.push({
                  text: text,
                  tag: parent.tagName,
                  x: Math.round(rect.left + rect.width / 2),
                  y: Math.round(rect.top + rect.height / 2),
                  width: Math.round(rect.width),
                  height: Math.round(rect.height),
                  selector: ContentExtractor.getOptimizedSelector(parent),
                  fontSize: parseInt(window.getComputedStyle(parent).fontSize) || 16
                });
              }
            }
          }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          // Skip script, style, nav elements
          if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'SVG', 'PATH'].includes(node.tagName)) return;
          
          // For block elements, also capture their full text
          if (['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TD', 'DIV', 'SPAN', 'A', 'BUTTON', 'LABEL', 'STRONG', 'EM'].includes(node.tagName)) {
            const text = node.innerText?.trim();
            if (text && text.length > 0 && DOMUtils.isVisible(node)) {
              const rect = node.getBoundingClientRect();
              const key = `${rect.top.toFixed(0)}_${rect.left.toFixed(0)}_${text.substring(0, 30)}`;
              if (!seen.has(key) && text.length < 500) {
                seen.add(key);
                textBlocks.push({
                  text: text,
                  tag: node.tagName,
                  x: Math.round(rect.left + rect.width / 2),
                  y: Math.round(rect.top + rect.height / 2),
                  width: Math.round(rect.width),
                  height: Math.round(rect.height),
                  selector: ContentExtractor.getOptimizedSelector(node),
                  fontSize: parseInt(window.getComputedStyle(node).fontSize) || 16
                });
              }
            }
          }
          
          Array.from(node.childNodes).forEach(child => walk(child, depth + 1));
        }
      };
      
      walk(document.body);
      
      // Sort by vertical position (reading order)
      textBlocks.sort((a, b) => a.y - b.y || a.x - b.x);
      
      // Deduplicate overlapping text
      const filtered = [];
      for (const block of textBlocks) {
        const isDuplicate = filtered.some(existing => 
          Math.abs(existing.y - block.y) < 5 && 
          existing.text.includes(block.text) || block.text.includes(existing.text)
        );
        if (!isDuplicate && block.text.length > 1) {
          filtered.push(block);
        }
      }
      
      return {
        success: true,
        title: document.title,
        url: window.location.href,
        totalBlocks: filtered.length,
        textBlocks: filtered,
        fullText: filtered.map(b => b.text).join('\n')
      };
    },

    /**
     * Trouve du texte spécifique et retourne sa position
     */
    findTextPosition(searchText) {
      const lower = searchText.toLowerCase();
      const result = this.extractAllText();
      const matches = result.textBlocks.filter(b => b.text.toLowerCase().includes(lower));
      
      if (matches.length === 0) {
        return { success: false, error: 'Texte non trouvé: ' + searchText };
      }
      
      return {
        success: true,
        matches: matches.map(m => ({
          text: m.text,
          x: m.x,
          y: m.y,
          selector: m.selector
        })),
        bestMatch: matches[0]
      };
    },

    /**
     * Extrait le texte visible par sections (articles, sections, etc.)
     */
    extractBySections() {
      const sections = [];
      const sectionElements = document.querySelectorAll('article, section, main, [role="main"], .content, .main-content');
      
      if (sectionElements.length === 0) {
        // Fallback: use headings to split content
        const headings = Array.from(document.querySelectorAll('h1, h2, h3'));
        for (let i = 0; i < headings.length; i++) {
          const h = headings[i];
          const rect = h.getBoundingClientRect();
          sections.push({
            heading: h.innerText.trim(),
            level: parseInt(h.tagName[1]),
            x: Math.round(rect.left + rect.width / 2),
            y: Math.round(rect.top + rect.height / 2),
            content: ''
          });
        }
      } else {
        sectionElements.forEach((sec, i) => {
          if (DOMUtils.isVisible(sec)) {
            const rect = sec.getBoundingClientRect();
            const heading = sec.querySelector('h1, h2, h3')?.innerText?.trim() || `Section ${i + 1}`;
            sections.push({
              heading,
              x: Math.round(rect.left + rect.width / 2),
              y: Math.round(rect.top + rect.height / 2),
              content: (sec.innerText || '').substring(0, 2000).trim()
            });
          }
        });
      }
      
      return { success: true, sections };
    }
  };

  // === GESTIONNAIRE DE COMMANDES ===
  const CommandHandler = {
    async execute(msg) {
      const { type, payload = {} } = msg;

      // Résolution auto si query/selector/text/label fourni
      let targetEl = null;
      if (payload.query || payload.selector || payload.text || payload.label || payload.xpath) {
        targetEl = DOMUtils.resolve(payload);
        if (targetEl) {
          DOMUtils.scrollIfNeeded(targetEl);
          const center = DOMUtils.getCenter(targetEl);
          payload.x = center.x;
          payload.y = center.y;
        } else if (type.startsWith('mouse.') || type.startsWith('action.') || type.startsWith('dom.click') || type.startsWith('dom.hover') || type.startsWith('dom.type')) {
          return { success: false, error: 'Élément cible non trouvé pour: ' + (payload.text || payload.selector || payload.label) };
        }
      }

      switch (type) {
        case 'ping': return { success: true, mode: 'unified-v3.4' };

        case 'action.click':
        case 'mouse.click':
        case 'dom.click': {
          if (payload.x === undefined || payload.y === undefined) {
            return { success: false, error: 'Coordonnées (x, y) manquantes' };
          }
          return await MouseEngine.click(payload.x, payload.y);
        }

        case 'action.hover':
        case 'mouse.move':
        case 'dom.hover': {
          const x = payload.x ?? payload.targetX ?? window.innerWidth / 2;
          const y = payload.y ?? payload.targetY ?? window.innerHeight / 2;
          await MouseEngine.move(x, y);
          return { success: true, x, y };
        }

        // === NOUVELLES COMMANDES DE TEXTE ===
        case 'dom.read':
        case 'read': {
          const result = TextExtractor.extractAllText();
          return result;
        }

        case 'dom.readSections':
        case 'read.sections': {
          return TextExtractor.extractBySections();
        }

        case 'dom.findText':
        case 'find.text': {
          const searchText = payload.text || payload.query || '';
          if (!searchText) return { success: false, error: 'Texte de recherche manquant' };
          return TextExtractor.findTextPosition(searchText);
        }

        case 'mouse.gotoText':
        case 'goto.text': {
          const searchText = payload.text || payload.query || '';
          if (!searchText) return { success: false, error: 'Texte cible manquant' };
          const result = TextExtractor.findTextPosition(searchText);
          if (!result.success) return result;
          const match = result.bestMatch || result.matches[0];
          await MouseEngine.move(match.x, match.y);
          return { success: true, x: match.x, y: match.y, text: match.text, action: 'hovered' };
        }

        case 'mouse.scroll': {
          const amount = payload.y || payload.amount || 500;
          window.scrollBy({ top: amount, behavior: 'smooth' });
          return { success: true, scrolled: amount };
        }

        case 'dom.scrollDown': {
          const amt = payload.amount || 500;
          window.scrollBy({ top: amt, behavior: 'smooth' });
          return { success: true, scrolled: amt };
        }

        case 'dom.scrollUp': {
          const amt2 = payload.amount || 500;
          window.scrollBy({ top: -amt2, behavior: 'smooth' });
          return { success: true, scrolled: -amt2 };
        }

        case 'dom.extract':
          return ContentExtractor.extract(payload.type || 'full');

        case 'dom.html':
          return { success: true, html: document.documentElement.outerHTML, title: document.title, url: window.location.href };

        case 'dom.fillForm':
          return await ContentExtractor.smartFill(payload.fields || payload);

        case 'dom.type': {
          let input = targetEl;
          if (!input && payload.selector) input = document.querySelector(payload.selector);
          if (!input && payload.label) input = DOMUtils.findInputByLabel(payload.label);
          if (!input) input = document.activeElement;
          if (!input || !['INPUT','TEXTAREA','SELECT'].includes(input.tagName) && !input.isContentEditable) {
            return { success: false, error: 'Aucun champ de saisie trouvé' };
          }
          const text = payload.value || payload.text || '';
          input.focus();
          input.click();
          if (input.isContentEditable) {
            input.innerText = text;
          } else {
            input.value = text;
          }
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          return { success: true, value: text, element: input.tagName };
        }

        case 'keyboard.type': {
          let input2 = targetEl;
          if (!input2 && payload.selector) input2 = document.querySelector(payload.selector);
          if (!input2) input2 = document.activeElement;
          if (!input2 || (!['INPUT','TEXTAREA'].includes(input2.tagName) && !input2.isContentEditable)) {
            return { success: false, error: 'Aucun champ actif pour taper' };
          }
          const text2 = payload.text || '';
          input2.focus();
          for (const char of text2) {
            if (input2.isContentEditable) input2.innerText += char;
            else input2.value += char;
            input2.dispatchEvent(new Event('input', { bubbles: true }));
            await new Promise(r => setTimeout(r, 30 + Math.random() * 80));
          }
          input2.dispatchEvent(new Event('change', { bubbles: true }));
          return { success: true, typed: text2.length };
        }

        case 'dom.press':
        case 'keyboard.press': {
          const key = payload.key || payload.keys || 'Enter';
          const target = targetEl || document.activeElement || document.body;
          target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
          target.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
          if (key === 'Enter' && target.tagName === 'INPUT' && target.form) {
            target.form.dispatchEvent(new Event('submit', { bubbles: true }));
          }
          return { success: true, key };
        }

        case 'dom.find': {
          const el = DOMUtils.resolve(payload);
          if (!el) return { success: false, error: 'Élément non trouvé' };
          const rect = el.getBoundingClientRect();
          return { success: true, tag: el.tagName, text: (el.innerText || '').substring(0, 100), x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2), selector: ContentExtractor.getOptimizedSelector(el) };
        }

        case 'dom.search': {
          const searchText = payload.text || '';
          const results = [];
          if (searchText) {
            const lowerSearch = searchText.toLowerCase();
            const elements = Array.from(document.querySelectorAll('p, span, div, h1, h2, h3, a, button, label, li, td'));
            for (const el of elements) {
              const text = (el.innerText || '').trim();
              if (text.toLowerCase().includes(lowerSearch) && DOMUtils.isVisible(el)) {
                const rect = el.getBoundingClientRect();
                results.push({ text: text.substring(0, 80), tag: el.tagName, x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) });
                if (results.length >= 15) break;
              }
            }
          }
          return { success: true, results };
        }

        case 'dom.submit': {
          const form = targetEl?.closest('form') || document.querySelector('form');
          if (form) {
            form.dispatchEvent(new Event('submit', { bubbles: true }));
            return { success: true };
          }
          return { success: false, error: 'Aucun formulaire trouvé' };
        }

        case 'dom.select': {
          const sel = targetEl || (payload.selector ? document.querySelector(payload.selector) : null);
          if (!sel || sel.tagName !== 'SELECT') return { success: false, error: 'Select non trouvé' };
          const option = Array.from(sel.options).find(o => o.text.toLowerCase().includes((payload.option || '').toLowerCase()));
          if (option) {
            sel.value = option.value;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            return { success: true, selected: option.text };
          }
          return { success: false, error: 'Option non trouvée' };
        }

        case 'dom.waitFor': {
          const timeout = payload.timeout || 5000;
          const start = Date.now();
          while (Date.now() - start < timeout) {
            const found = DOMUtils.resolve(payload);
            if (found) return { success: true, found: true, waited: Date.now() - start };
            await new Promise(r => setTimeout(r, 300));
          }
          return { success: false, error: 'Timeout en attendant l\'élément', waited: timeout };
        }

        case 'dom.doubleClick': {
          if (payload.x === undefined || payload.y === undefined) return { success: false, error: 'Coordonnées manquantes' };
          await MouseEngine.move(payload.x, payload.y);
          const el2 = document.elementFromPoint(payload.x, payload.y);
          if (el2) {
            el2.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: payload.x, clientY: payload.y }));
          }
          return { success: true };
        }

        default:
          return { error: `Commande ${type} non gérée par le moteur unifié` };
      }
    }
  };

  const ContentExtractor = {
    extract(type) {
      if (type === 'text') {
        return { success: true, text: (document.body.innerText || '').substring(0, 8000).trim() };
      }
      if (type === 'links') {
        const links = Array.from(document.querySelectorAll('a[href]'))
          .filter(a => DOMUtils.isVisible(a))
          .map(a => ({ text: (a.innerText || '').trim().substring(0, 60), href: a.href }))
          .slice(0, 50);
        return { success: true, links };
      }
      if (type === 'forms') {
        const forms = Array.from(document.querySelectorAll('input, textarea, select'))
          .filter(el => DOMUtils.isVisible(el))
          .map(el => {
            const lbl = this.findLabel(el);
            return { tag: el.tagName, type: el.type, name: el.name, placeholder: el.placeholder, label: lbl, selector: this.getOptimizedSelector(el) };
          });
        return { success: true, forms };
      }
      if (type === 'buttons') {
        const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], [role="button"]'))
          .filter(b => DOMUtils.isVisible(b))
          .map(b => ({ text: (b.innerText || b.value || '').trim().substring(0, 50), selector: this.getOptimizedSelector(b) }));
        return { success: true, buttons };
      }
      if (type === 'headings') {
        const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'))
          .map(h => ({ level: parseInt(h.tagName[1]), text: (h.innerText || '').trim() }));
        return { success: true, headings };
      }
      if (type === 'images') {
        const images = Array.from(document.querySelectorAll('img'))
          .filter(img => img.src && DOMUtils.isVisible(img))
          .map(img => ({ src: img.src, alt: img.alt, width: img.width, height: img.height }));
        return { success: true, images };
      }

      // full
      return {
        success: true,
        data: {
          meta: { title: document.title, url: window.location.href, description: document.querySelector('meta[name="description"]')?.content },
          headings: Array.from(document.querySelectorAll('h1, h2, h3')).map(h => ({ level: parseInt(h.tagName[1]), text: h.innerText.trim() })),
          links: Array.from(document.querySelectorAll('a[href]')).filter(a => DOMUtils.isVisible(a)).map(a => ({ text: a.innerText.trim().substring(0, 50), href: a.href })).slice(0, 20),
          buttons: Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"]')).filter(b => DOMUtils.isVisible(b)).map(b => ({ text: (b.innerText || b.value || '').trim().substring(0, 50) })),
          forms: Array.from(document.querySelectorAll('input, textarea, select')).filter(el => DOMUtils.isVisible(el)).map(el => ({ tag: el.tagName, type: el.type, name: el.name, placeholder: el.placeholder, label: this.findLabel(el) })),
          content: (document.body.innerText || '').substring(0, 3000).trim(),
          interactive: this.extractInteractive()
        }
      };
    },

    extractInteractive() {
      return Array.from(document.querySelectorAll('button, a, input, select, textarea, [role="button"], [onclick]'))
        .filter(el => DOMUtils.isVisible(el))
        .map(el => {
          const rect = el.getBoundingClientRect();
          return { tag: el.tagName, type: el.type, text: (el.innerText || el.value || el.placeholder || '').trim().substring(0, 50), x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2), selector: this.getOptimizedSelector(el) };
        });
    },

    findLabel(el) {
      const id = el.id;
      if (id) {
        const lbl = document.querySelector(`label[for="${id}"]`);
        if (lbl) return lbl.innerText.trim();
      }
      const parent = el.closest('label');
      if (parent) {
        const txt = parent.innerText.replace(el.value || '', '').trim();
        if (txt) return txt;
      }
      return el.getAttribute('aria-label') || el.placeholder || el.name || '';
    },

    async smartFill(fields) {
      const results = [];
      const entries = Array.isArray(fields) ? fields : Object.entries(fields);
      for (const entry of entries) {
        let label, value;
        if (Array.isArray(entry)) { [label, value] = entry; }
        else if (entry.label !== undefined) { label = entry.label; value = entry.value; }
        else { continue; }
        const input = DOMUtils.findInputByLabel(label);
        if (input) {
          await MouseEngine.move(DOMUtils.getCenter(input).x, DOMUtils.getCenter(input).y);
          input.focus();
          input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          results.push({ label, success: true });
        } else {
          results.push({ label, success: false, error: 'Label non trouvé' });
        }
      }
      return { success: true, results };
    },

    getOptimizedSelector(el) {
      if (el.id) return `#${el.id}`;
      if (el.className && typeof el.className === 'string') {
        const cls = el.className.split(' ').filter(c => c && !c.startsWith('_'))[0];
        if (cls) return `.${cls}`;
      }
      if (el.name) return `${el.tagName.toLowerCase()}[name="${el.name}"]`;
      return el.tagName.toLowerCase();
    }
  };

  // Initialisation
  MouseEngine.init();
  browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    (async () => {
      try {
        const result = await CommandHandler.execute(request);
        sendResponse(result);
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  });

  console.log('[OpenClaw] Moteur Unified Human-DOM v3.4 prêt - Text extraction active');
})();

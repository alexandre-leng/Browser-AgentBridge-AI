(function() {
  /**
   * OpenClaw Browser Bridge - Content Script Enhanced
   * Implémente le contrôle "Humain" du DOM et de la souris
   */

  // === CONTRÔLE SOURIS AVANCÉ ===

  const MouseController = {
    cursorEl: null,
    currentX: window.innerWidth / 2,
    currentY: window.innerHeight / 2,
    isMoving: false,

    init: function() {
      this.createGhostCursor();
    },

    createGhostCursor: function() {
      if (this.cursorEl || typeof document === 'undefined') return;
      
      this.cursorEl = document.createElement('div');
      this.cursorEl.id = 'openclaw-ghost-cursor';
      this.cursorEl.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 20px;
        height: 20px;
        background: rgba(233, 69, 96, 0.6);
        border: 2px solid #e94560;
        border-radius: 50%;
        pointer-events: none;
        z-index: 9999999;
        transition: transform 0.1s ease-out, opacity 0.3s ease;
        opacity: 0;
        box-shadow: 0 0 10px rgba(233, 69, 96, 0.4);
        display: flex;
        align-items: center;
        justify-content: center;
      `;
      
      const dot = document.createElement('div');
      dot.style.cssText = 'width: 4px; height: 4px; background: #fff; border-radius: 50%;';
      this.cursorEl.appendChild(dot);
      
      if (document.body) {
        document.body.appendChild(this.cursorEl);
      } else {
        document.addEventListener('DOMContentLoaded', () => document.body.appendChild(this.cursorEl));
      }
    },

    showCursor: function(x, y) {
      if (!this.cursorEl) this.createGhostCursor();
      if (this.cursorEl) {
        this.cursorEl.style.opacity = '1';
        this.cursorEl.style.transform = `translate(${x}px, ${y}px)`;
      }
    },

    hideCursor: function() {
      if (this.cursorEl) this.cursorEl.style.opacity = '0';
    },

    playClickAnimation: function() {
      if (!this.cursorEl) return;
      this.cursorEl.style.transition = 'transform 0.1s ease-out, opacity 0.3s ease';
      this.cursorEl.style.transform += ' scale(0.7)';
      setTimeout(() => {
        if (this.cursorEl) this.cursorEl.style.transform = this.cursorEl.style.transform.replace(' scale(0.7)', '');
      }, 150);
    },

    move: async function(targetX, targetY, duration = 800) {
      if (this.isMoving) return;
      this.isMoving = true;

      const startX = this.currentX;
      const startY = this.currentY;
      let startTime = null;

      return new Promise((resolve) => {
        const animate = (timestamp) => {
          if (!startTime) startTime = timestamp;
          const progress = Math.min((timestamp - startTime) / duration, 1);
          const t = this.easeInOut(progress);

          // Ajout d'un petit arc (effet Bézier simple)
          const x = this.lerp(startX, targetX, t) + Math.sin(t * Math.PI) * 15;
          const y = this.lerp(startY, targetY, t);

          this.showCursor(x, y);
          this.currentX = x;
          this.currentY = y;

          if (progress < 1) {
            requestAnimationFrame(animate);
          } else {
            this.currentX = targetX;
            this.currentY = targetY;
            this.isMoving = false;
            setTimeout(() => this.hideCursor(), 1200);
            resolve();
          }
        };
        requestAnimationFrame(animate);
      });
    },

    easeInOut: function(t) {
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    },

    lerp: function(start, end, t) {
      return start + (end - start) * t;
    },

    click: async function(x, y) {
      await this.move(x, y, 600 + Math.random() * 400);
      this.playClickAnimation();
      
      const el = document.elementFromPoint(x, y);
      if (el) {
        el.click();
        return { success: true, element: el.tagName };
      }
      return { success: false, error: 'Pas d\'élément à cette position' };
    },

    scroll: async function(y) {
      window.scrollBy({ top: y, behavior: 'smooth' });
      return { success: true, scrollY: window.scrollY + y };
    }
  };

  // === RESOLVER DOM-AWARE ===

  const DOMResolver = {
    resolve: function(target) {
      const { selector, text, role } = target;
      let el = null;

      if (selector) el = document.querySelector(selector);
      if (!el && text) {
        const elements = Array.from(document.querySelectorAll('button, a, input[type="button"], label, span, div'));
        el = elements.find(e => e.innerText && e.innerText.trim().toLowerCase().includes(text.toLowerCase()));
      }
      
      if (el) {
        const rect = el.getBoundingClientRect();
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          element: el
        };
      }
      return null;
    }
  };

  // === GESTIONNAIRE DE MESSAGES ===

  browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const { type, payload } = request;

    (async () => {
      try {
        let result;

        switch (type) {
          case 'mouse.move':
            await MouseController.move(payload.x, payload.y);
            result = { success: true };
            break;

          case 'mouse.click':
            result = await MouseController.click(payload.x, payload.y);
            break;

          case 'mouse.scroll':
            result = await MouseController.scroll(payload.y);
            break;

          case 'dom.click':
            const target = DOMResolver.resolve(payload);
            if (target) {
              result = await MouseController.click(target.x, target.y);
            } else {
              result = { success: false, error: 'Élément non trouvé' };
            }
            break;

          case 'dom.inspect':
            const elements = Array.from(document.querySelectorAll('button, a, input, select, [role="button"]'))
              .slice(0, 20)
              .map(el => ({
                tag: el.tagName,
                text: el.innerText?.substring(0, 30),
                id: el.id,
                role: el.getAttribute('role')
              }));
            result = { success: true, elements };
            break;

          case 'keyboard.type':
            const input = document.activeElement;
            if (input && (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA' || input.isContentEditable)) {
              for (const char of payload.text) {
                input.value = (input.value || '') + char;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                await new Promise(r => setTimeout(r, 50 + Math.random() * 100));
              }
              result = { success: true };
            } else {
              result = { success: false, error: 'Pas de champ de saisie actif' };
            }
            break;

          default:
            result = { error: 'Commande inconnue dans le content script' };
        }

        sendResponse(result);
      } catch (e) {
        sendResponse({ error: e.message });
      }
    })();

    return true; // Asynchrone
  });

  // Initialisation
  MouseController.init();
  console.log('[OpenClaw Content] Système human-like prêt');
})();

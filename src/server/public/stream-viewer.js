const VisionViewer = {
  ws: null,
  isStreaming: false,
  frameCount: 0,
  lastFpsTime: Date.now(),

  init: function() {
    this.connectWebSocket();
    this.setupEventListeners();
    this.addLog('Vision Viewer initialisé');
  },

  connectWebSocket: function() {
    this.ws = new WebSocket('ws://localhost:8080/ws/browser-bridge');

    this.ws.onopen = () => {
      this.addLog('Connecté au Bridge');
      this.updateStatus(true);
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.handleMessage(msg);
      } catch (e) {
        console.error('Erreur parsing:', e);
      }
    };

    this.ws.onclose = () => {
      this.addLog('Déconnecté');
      this.updateStatus(false);
      setTimeout(() => this.connectWebSocket(), 5000);
    };
  },

  handleMessage: function(msg) {
    if (msg.type === 'vision.frame') {
      this.displayFrame(msg.payload);
    } else if (msg.type === 'command.result') {
      this.addLog('Résultat: ' + JSON.stringify(msg.payload).substring(0, 100));
    }
  },

  displayFrame: function(payload) {
    const img = document.getElementById('streamImage');
    const noSignal = document.getElementById('noSignal');

    img.src = payload.image;
    img.style.display = 'block';
    noSignal.style.display = 'none';

    document.getElementById('infoUrl').textContent = payload.url.substring(0, 30) + '...';
    document.getElementById('infoResolution').textContent = payload.viewport.width + 'x' + payload.viewport.height;
    document.getElementById('infoScroll').textContent = payload.scrollY + 'px';
    document.getElementById('infoTimestamp').textContent = new Date(payload.timestamp).toLocaleTimeString();

    this.frameCount++;
    const now = Date.now();
    if (now - this.lastFpsTime >= 1000) {
      document.getElementById('fpsCounter').textContent = this.frameCount + ' FPS';
      this.frameCount = 0;
      this.lastFpsTime = now;
    }
  },

  sendCommand: function(type, payload) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        commandId: 'cmd-' + Date.now(),
        type,
        payload
      }));
    }
  },

  updateStatus: function(connected) {
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusText');
    dot.classList.toggle('bg-green-400', connected);
    dot.classList.toggle('shadow-[0_0_6px_#4ade80]', connected);
    dot.classList.toggle('streaming', connected);
    dot.classList.toggle('bg-red-500', !connected);
    text.textContent = connected ? 'Stream actif' : 'Déconnecté';
  },

  setupEventListeners: function() {
    document.getElementById('startStream').addEventListener('click', () => {
      this.sendCommand('vision.start', { fps: 2 });
      this.addLog('Stream démarré');
    });

    document.getElementById('stopStream').addEventListener('click', () => {
      this.sendCommand('vision.stop');
      this.addLog('Stream arrêté');
    });

    document.getElementById('takeScreenshot').addEventListener('click', () => {
      this.sendCommand('vision.screenshot');
      this.addLog('Screenshot demandé');
    });

    document.getElementById('fullScreen').addEventListener('click', () => {
      document.documentElement.requestFullscreen();
    });

    const viewport = document.getElementById('viewport');

    viewport.addEventListener('click', (e) => {
      const rect = viewport.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      this.sendCommand('mouse.click', { x, y });
      this.addLog(`Clic à (${Math.round(x)}, ${Math.round(y)})`);
    });

    viewport.addEventListener('touchend', (e) => {
      e.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const touch = e.changedTouches[0];
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      this.sendCommand('mouse.click', { x, y });
      this.addLog(`Touch à (${Math.round(x)}, ${Math.round(y)})`);
    }, { passive: false });
  },

  addLog: function(message) {
    const log = document.getElementById('log');
    const time = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = 'flex gap-2 px-1 py-0.5 rounded hover:bg-dark-800';
    const timeEl = document.createElement('span');
    timeEl.className = 'text-brand shrink-0';
    timeEl.textContent = time;
    const textEl = document.createElement('span');
    textEl.className = 'text-gray-400 break-all';
    textEl.textContent = message;
    entry.appendChild(timeEl);
    entry.appendChild(textEl);
    log.appendChild(entry);
    log.scrollTop = log.scrollHeight;
  }
};

VisionViewer.init();

/**
 * OpenClaw Browser Bridge - Popup Script
 * Interface utilisateur de l'extension
 */

document.addEventListener('DOMContentLoaded', async () => {
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const searchInput = document.getElementById('searchInput');
  const searchBtn = document.getElementById('searchBtn');
  const screenshotBtn = document.getElementById('screenshotBtn');
  const extractBtn = document.getElementById('extractBtn');
  const googleBtn = document.getElementById('googleBtn');
  const bingBtn = document.getElementById('bingBtn');
  const logContainer = document.getElementById('log');
  const searchCountEl = document.getElementById('searchCount');
  const tabCountEl = document.getElementById('tabCount');
  
  let searchCount = 0;
  
  // === FONCTIONS UTILITAIRES ===
  
  function addLog(message) {
    const time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    const timeSpan = document.createElement('span');
    timeSpan.className = 'log-time';
    timeSpan.textContent = `[${time}]`;
    entry.appendChild(timeSpan);
    entry.appendChild(document.createTextNode(' ' + message));
    logContainer.appendChild(entry);
    logContainer.scrollTop = logContainer.scrollHeight;
  }
  
  function updateStatus(connected) {
    if (connected) {
      statusDot.classList.add('connected');
      statusText.textContent = 'Connecté à OpenClaw';
      statusText.style.color = '#2ed573';
    } else {
      statusDot.classList.remove('connected');
      statusText.textContent = 'Déconnecté';
      statusText.style.color = '#ff4757';
    }
  }
  
  async function getBridgeStatus() {
    try {
      const response = await browser.runtime.sendMessage({ type: 'bridge.status' });
      updateStatus(response.connected);
      
      if (response.session) {
        searchCount = response.session.searchCount || 0;
        searchCountEl.textContent = searchCount;
      }
      
      // Compter les onglets
      const tabs = await browser.tabs.query({});
      tabCountEl.textContent = tabs.length;
      
    } catch (e) {
      updateStatus(false);
      addLog('Erreur connexion: ' + e.message);
    }
  }
  
  // === ACTIONS ===
  
  async function performSearch(engine = 'google') {
    const query = searchInput.value.trim();
    if (!query) {
      addLog('⚠️ Entrez une recherche');
      return;
    }
    
    addLog(`🔍 Recherche ${engine}: "${query}"`);
    
    try {
      // Ouvrir nouvel onglet avec la recherche
      let url;
      switch (engine) {
        case 'google':
          url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
          break;
        case 'bing':
          url = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
          break;
        default:
          url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
      }
      
      await browser.tabs.create({ url, active: false });
      searchCount++;
      searchCountEl.textContent = searchCount;
      addLog(`✅ Onglet ouvert pour recherche ${engine}`);
      
    } catch (e) {
      addLog('❌ Erreur: ' + e.message);
    }
  }
  
  async function takeScreenshot() {
    addLog('📸 Capture d\'écran...');
    
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (tabs.length === 0) {
        addLog('⚠️ Aucun onglet actif');
        return;
      }
      
      const dataUrl = await browser.tabs.captureVisibleTab(null, {
        format: 'png'
      });

      
      // Télécharger
      await browser.downloads.download({
        url: dataUrl,
        filename: `screenshot-${Date.now()}.png`
      });
      
      addLog('✅ Screenshot sauvegardé');
      
    } catch (e) {
      addLog('❌ Erreur screenshot: ' + e.message);
    }
  }
  
  async function extractData() {
    addLog('📋 Extraction données...');
    
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (tabs.length === 0) {
        addLog('⚠️ Aucun onglet actif');
        return;
      }
      
      // Envoyer message au content script
      const response = await browser.tabs.sendMessage(tabs[0].id, {
        type: 'content.getPageInfo'
      });
      
      addLog(`✅ Page: ${response.title}`);
      addLog(`   URL: ${response.url}`);
      addLog(`   Scroll: ${response.scrollY}px`);
      
    } catch (e) {
      addLog('❌ Erreur extraction: ' + e.message);
    }
  }
  
  // === ÉVÉNEMENTS ===
  
  searchBtn.addEventListener('click', () => performSearch('google'));
  
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      performSearch('google');
    }
  });
  
  screenshotBtn.addEventListener('click', takeScreenshot);
  extractBtn.addEventListener('click', extractData);
  googleBtn.addEventListener('click', () => performSearch('google'));
  bingBtn.addEventListener('click', () => performSearch('bing'));
  
  // === INITIALISATION ===
  
  addLog('Popup ouvert');
  await getBridgeStatus();
  
  // Mettre à jour le statut toutes les 5 secondes
  setInterval(getBridgeStatus, 5000);
});
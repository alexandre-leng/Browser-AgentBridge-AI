# 🦾 OpenClaw Browser Bridge v2.0

Extension Firefox qui transforme ton navigateur en un **outil d'automatisation web avancé** avec contrôle souris temps réel et vision à distance.

## ✨ Fonctionnalités Avancées

### 🔴 P0 — Essentielles
- **🔍 Recherche multi-moteurs** : Google, Bing, DuckDuckGo (sans captcha)
- **📊 Extraction structurée** : Titres, URLs, snippets automatiques

### 🟡 P1 — Avancées
- **🤖 Navigation humaine** : Délais aléatoires, scroll fluide, comportement naturel
- **🔄 Multi-moteurs** : Basculer entre Google/Bing/DDG
- **💾 Persistance session** : Cookies, historique, état de navigation

### 🟢 P2 — Premium
- **📸 Screenshot** : Capture d'écran des pages
- **📝 Remplissage formulaires** : Automatisation input humaine
- **⬇️ Téléchargement** : Télécharger fichiers PDF, images

### 🆕 NOUVEAU — Contrôle Total
- **🖱️ Contrôle souris** : Mouvements courbes de Bézier, clic, double-clic, droit, scroll
- **⌨️ Contrôle clavier** : Frappe caractère par caractère, touches spéciales
- **📺 Vision temps réel** : Stream vidéo du navigateur (2 FPS)
- **🎮 Viewer distant** : Interface web pour voir et contrôler à distance
- **🤖 Combo actions** : Recherche + clic automatique

## 🚀 Installation

### 1. Lancer le serveur
```bash
cd openclaw-browser-bridge
npm install
npm start
```

Services disponibles :
- Interface test : http://localhost:8080
- Vision Viewer : http://localhost:8080/viewer
- WebSocket : ws://localhost:8080/ws/browser-bridge

### 2. Installer l'extension Firefox
1. Ouvrir Firefox → `about:debugging`
2. "Ce Firefox" → "Charger un module complémentaire temporaire"
3. Sélectionner `manifest.json`

### 3. Ouvrir le Viewer
1. Aller sur http://localhost:8080/viewer
2. Le viewer affiche le flux vidéo du navigateur
3. Cliquez sur l'image pour déplacer la souris

## 🎮 Utilisation

### Commandes disponibles

| Commande | Description | Paramètres |
|----------|-------------|------------|
| `search` | Recherche web | `{engine, query}` |
| `navigate` | Navigation URL | `{url, options}` |
| `extract` | Extraction DOM | `{selector, attribute}` |
| `screenshot` | Capture écran | `{format}` |
| `form.fill` | Remplir formulaire | `{fields, submit}` |
| `file.download` | Télécharger | `{url, filename}` |
| `mouse.move` | Déplacer souris | `{x, y, duration}` |
| `mouse.click` | Clic gauche | `{x, y}` |
| `mouse.doubleClick` | Double-clic | `{x, y}` |
| `mouse.rightClick` | Clic droit | `{x, y}` |
| `mouse.scroll` | Scroll molette | `{amount, direction}` |
| `mouse.hover` | Hover élément | `{selector}` |
| `keyboard.type` | Taper texte | `{text, selector}` |
| `keyboard.press` | Touche spéciale | `{key}` |
| `vision.start` | Démarrer stream | `{fps}` |
| `vision.stop` | Arrêter stream | `{}` |
| `vision.screenshot` | Screenshot | `{}` |
| `human.read` | Lire page | `{}` |
| `human.explore` | Explorer liens | `{count}` |
| `combo.searchAndClick` | Recherche+clic | `{query}` |

### Exemples de commandes

**Déplacer la souris naturellement :**
```json
{
  "type": "mouse.move",
  "payload": {
    "x": 500,
    "y": 300,
    "duration": 1500
  }
}
```

**Taper du texte comme un humain :**
```json
{
  "type": "keyboard.type",
  "payload": {
    "text": "formateur IA marseille",
    "selector": "input[name='q']"
  }
}
```

**Démarrer le stream vidéo :**
```json
{
  "type": "vision.start",
  "payload": {
    "fps": 2
  }
}
```

**Combo recherche + clic :**
```json
{
  "type": "combo.searchAndClick",
  "payload": {
    "query": "openclaw browser bridge"
  }
}
```

## 🖱️ Contrôle Souris Avancé

### Mouvements naturels
- **Courbes de Bézier** : Trajectoires fluides et réalistes
- **Vitesse variable** : Accélération et décélération naturelles
- **Points de contrôle aléatoires** : Chaque mouvement est unique

### Actions disponibles
- **move** : Déplacement avec durée personnalisable
- **click** : Clic gauche avec events complets (mousedown, mouseup, click)
- **doubleClick** : Double-clic automatique
- **rightClick** : Clic droit (contextmenu)
- **scroll** : Scroll molette avec amount et direction
- **hover** : Survol d'élément avec sélecteur CSS

## 📺 Vision Temps Réel

### Stream vidéo
- **Capture canvas** : Rendu de la page en temps réel
- **2 FPS par défaut** : Paramétrable
- **Compression JPEG** : Qualité ajustable (0.7 par défaut)
- **Résolution max** : 1280px de large

### Viewer distant
- **Interface web** : http://localhost:8080/viewer
- **Affichage temps réel** : Images actualisées automatiquement
- **FPS counter** : Indicateur de performance
- **Informations page** : URL, résolution, scroll, timestamp
- **Clic interactif** : Cliquer sur l'image = envoyer commande clic

## 🛡️ Anti-Détection

L'extension utilise :
- **Vrai navigateur Firefox** (pas headless)
- **Vos cookies et session** (identité authentique)
- **Délais humains** (pas de robot rapide)
- **Scroll fluide** (comportement naturel)
- **Mouvements souris réalistes** (courbes de Bézier)
- **Frappe clavier humaine** (caractère par caractère)
- **Proxy via votre connexion** (IP FAI legit)

## 🏗️ Architecture

```
[OpenClaw Agent]
    ↓ (commandes WebSocket)
[Gateway OpenClaw]
    ↓ (WebSocket)
[Background Script]
    ↓ (messages)
[Content Script]
    ↓ (DOM/events)
[Page Web]
    ↑ (capture)
[Content Script]
    ↑ (frames vision)
[Background Script]
    ↑ (WebSocket)
[Gateway OpenClaw]
    ↑ (broadcast)
[Vision Viewer]
```

## 🔒 Sécurité

- Code 100% open-source
- Aucune donnée externe
- Communication localhost uniquement
- Permissions minimales
- Pas d'accès mots de passe

## 📝 Changelog

### v2.0.0 — Contrôle Total
- ✅ Contrôle souris (courbes Bézier)
- ✅ Contrôle clavier (frappe humaine)
- ✅ Vision temps réel (stream 2 FPS)
- ✅ Viewer distant interactif
- ✅ Combo actions automatisées
- ✅ Curseur visuel debug

### v1.0.0 — Initial
- ✅ Recherche multi-moteurs
- ✅ Extraction structurée
- ✅ Navigation humaine
- ✅ Screenshot
- ✅ Form fill
- ✅ File download

## 🤝 Contribution

Code source complet dans ce dossier. Libre de modifier et adapter.

## 📄 License

MIT — Utilisation libre pour usage personnel.

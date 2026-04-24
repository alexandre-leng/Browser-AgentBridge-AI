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

### 🆕 NOUVEAU — Contrôle Total & IA Native (v3.2)
- **🎯 Sélecteur Universel (Omni-Resolver)** : L'IA peut cibler n'importe quel élément avec une seule propriété (`query` ou `selector`). Le moteur comprend automatiquement : texte exact, texte flou, sélecteur CSS, ou chemin XPath.
- **🖱️ Moteur de Souris Humaine** : Mouvements par courbes de Bézier avec *jitter* humain, ciblage automatique du centre des éléments visibles.
- **⌨️ Frappe au clavier naturelle** : Délais aléatoires entre chaque touche.
- **💻 CLI `live.js` intégrée** : Contrôle l'extension directement depuis un terminal (`npm run live`).
- **🗂️ Architecture propre** : Standard US avec `src/`, `logs/screenshots/`.

## 🚀 Installation

### 1. Installation et Lancement
```bash
cd openclaw-browser-bridge
npm install
npm run build   # Compile les extensions dans dist/
npm start       # Lance le serveur WebSocket
```

### 2. Installer l'extension Firefox/Chrome
- Les extensions compilées se trouvent dans `dist/` (`openclaw-chrome.zip` et `openclaw-firefox.xpi`).
- Vous pouvez aussi charger temporairement le dossier `src/extension/` en mode développeur.

### 3. Ouvrir le Viewer
1. Aller sur http://localhost:8080/viewer
2. Le viewer affiche le flux vidéo du navigateur
3. Cliquez sur l'image pour déplacer la souris

## 🎮 Utilisation

### Commandes disponibles

| Commande | Description | Paramètres (Payload) |
|----------|-------------|------------|
| `search` | Recherche web | `{engine, query}` |
| `navigate` | Navigation URL | `{url, options}` |
| `dom.html` | Extraire le HTML | `{}` |
| `dom.search` | Chercher un texte | `{text}` |
| `screenshot` | Capture écran | `{format}` (sauvé dans `logs/screenshots/`) |
| `action.click` ou `dom.click` | Clic intelligent | `{query}` (Texte, CSS ou XPath) |
| `action.hover` ou `dom.hover` | Survol intelligent | `{query}` (Texte, CSS ou XPath) |
| `keyboard.type` ou `dom.type` | Taper texte | `{query, value}` |
| `mouse.move` | Déplacer souris | `{x, y}` |
| `mouse.scroll` | Scroll molette | `{y}` |

### Exemples de commandes

**Cliquer sur un élément de n'importe quelle façon :**
```json
{
  "type": "dom.click",
  "payload": {
    "selector": "//button[text()='Login']"
  }
}
// Note: Le moteur devinera automatiquement s'il s'agit d'un XPath, CSS, ou d'un texte.

```

**Taper du texte comme un humain :**
```json
{
  "type": "keyboard.type",
  "payload": {
    "text": "mon_mot_de_passe",
    "query": "password" // Fonctionne avec aria-label, name, placeholder, texte...
  }
}
```

### 💻 Utilisation via CLI (`npm run live`)

L'agent IA peut utiliser le pont depuis le terminal sans écrire de code !

```bash
npm run live goto "https://google.com"
npm run live type "Recherche" "Météo Paris"
npm run live click "Recherche Google"
npm run live screenshot
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

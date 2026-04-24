# 🦾 OpenClaw Browser Bridge - Utilisation Rapide

## Architecture
- **Serveur** WebSocket sur `localhost:8080` (relai)
- **Extension** Firefox/Chrome (injecte le content script, contrôle le DOM)
- **Client CLI** `bridge.js` pour envoyer des commandes

## Démarrage

### 1. Lancer le serveur
```bash
npm start
```
Ou s'il est déjà lancé (vérifie avec `Get-NetTCPConnection -LocalPort 8080`)

### 2. Charger l'extension dans Firefox
- Ouvrir `about:debugging` → "Ce Firefox" → "Charger un module complémentaire temporaire"
- Sélectionner `dist/firefox/manifest.json`
- **IMPORTANT** : Recharger l'extension après chaque modification des fichiers

### 3. Vérifier la connexion
```bash
node bridge.js status
```

## Commandes CLI

```bash
# Navigation
node bridge.js navigate https://google.com

# Recherche
node bridge.js search google "météo paris"

# Cliquer (par texte ou sélecteur CSS)
node bridge.js click "Accepter"
node bridge.js click "#submit-button"

# Taper du texte
node bridge.js type "#search" "openclaw"

# Remplir un formulaire par label
node bridge.js fill "Email" "test@example.com"

# Screenshot
node bridge.js screenshot

# Extraire la page
node bridge.js extract

# LIRE LE TEXTE (nouveau v3.4)
node bridge.js read                    # Tout le texte avec positions x,y
node bridge.js read.sections          # Texte par sections
node bridge.js find.text "conditions" # Trouver position d'un texte
node bridge.js goto.text "Accepter"   # Déplacer souris sur un texte

# Scroller
node bridge.js scroll 500
node bridge.js scroll -500

# Presser une touche
node bridge.js press Enter

# Lister les onglets
node bridge.js tabs
```

## Détection d'éléments DOM

Le content script essaie dans l'ordre :
1. **XPath** (`//button[text()='OK']`)
2. **CSS Selector** (`#id`, `.class`, `[attr]`)
3. **Attributs** (`aria-label`, `title`, `placeholder`, `name`)
4. **Texte exact** puis **texte partiel**

## API WebSocket directe

Pour une intégration programmatique :
```javascript
const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:8080/ws/browser-bridge');
ws.on('open', () => {
  ws.send(JSON.stringify({
    type: 'dom.click',
    payload: { text: 'OK' },
    commandId: 'cmd_123'
  }));
});
```

## Fichiers clés

| Fichier | Rôle |
|---------|------|
| `src/server/server.js` | Serveur WebSocket relai |
| `src/extension/background.js` | Service worker extension |
| `src/extension/content.js` | Script injecté dans les pages (contrôle DOM) |
| `bridge.js` | Client CLI |
| `scripts/build.ps1` | Build Chrome + Firefox |

## Dépannage

- **Icône grise** : L'extension n'est pas rechargée avec le nouveau `icon16_simplified.svg`
- **Déconnecté** : Le serveur ne tourne pas, ou l'extension n'est pas rechargée
- **Content script non injecté** : Attendre que la page charge, certains sites (about:, moz-extension:) bloquent l'injection
- **Commande timeout** : L'extension n'est pas connectée au serveur

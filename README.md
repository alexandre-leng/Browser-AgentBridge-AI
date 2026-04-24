# 🦾 OpenClaw Browser Bridge v3.0

Pont de contrôle navigateur basé sur **Playwright** — pilote un vrai Chromium comme un humain (courbes de Bézier, frappe avec délais variables, scroll progressif) via une API WebSocket compatible OpenClaw Agent.

Plus d'extension à installer : Playwright gère tout.

## 🚀 Installation

```bash
npm install
npx playwright install chromium
npm start
```

Ça lance :
- Un Chromium non-headless contrôlé par Playwright
- Un serveur HTTP + WebSocket sur `http://localhost:8080`
  - Viewer temps réel : http://localhost:8080/viewer
  - WS agent : `ws://localhost:8080/ws/browser-bridge`

## 🎮 CLI

```bash
npm run live goto "https://google.com"
npm run live type "Recherche" "Météo Paris"
npm run live press Enter
npm run live click "Images"
npm run live screenshot
npm run live scroll 800
npm run live read 4000
```

Ou JSON brut :
```bash
npm run live dom.click '{"query":"//button[text()=\"Login\"]"}'
```

## 🌐 Protocole WebSocket

Requête :
```json
{ "id": "abc", "type": "dom.click", "payload": { "query": "Recherche Google" } }
```

Réponse :
```json
{ "id": "abc", "type": "dom.click", "ok": true, "result": { "x": 612, "y": 340 } }
```

## 📜 Commandes disponibles

| Catégorie | Commandes |
|-----------|-----------|
| Navigation | `navigate`, `search`, `dom.goto` |
| DOM | `dom.click`, `dom.doubleClick`, `dom.hover`, `dom.type`, `dom.press`, `dom.select`, `dom.waitFor`, `dom.extract`, `dom.html`, `dom.search`, `dom.inspect`, `dom.scrollDown`, `dom.scrollUp`, `dom.fillForm`, `dom.submit` |
| Souris brute | `mouse.move`, `mouse.click`, `mouse.doubleClick`, `mouse.rightClick`, `mouse.hover`, `mouse.scroll`, `mouse.clickOnText` |
| Clavier | `keyboard.type`, `keyboard.press` |
| Capture | `screenshot`, `vision.start`, `vision.stop`, `vision.screenshot` |
| Cookies | `cookie.get`, `cookie.set` |
| Onglets | `tab.list`, `tab.new`, `tab.close`, `tab.switch` |
| Script | `exec.script` |
| Combos | `combo.searchAndClick` |
| Humain | `human.read`, `human.explore` |
| Lifecycle | `browser.close`, `ping` |

### Sélecteur universel (`query`)

Pour toutes les commandes DOM, `query` accepte :
- **XPath** : `//button[text()='Login']`
- **CSS** : `#submit-btn`, `input[name="email"]`
- **Texte/rôle** : `"Recherche Google"` (matche bouton/lien/label/placeholder/texte)

## 🖱️ Contrôle humain

- **Souris** : trajectoires Bézier avec jitter, ~30 steps par déplacement
- **Clavier** : délais 40–160 ms par touche + pauses aléatoires
- **Scroll** : wheel en 4–8 petits increments avec pauses
- **Clics** : `mousedown`/`mouseup` séparés par ~40–120 ms

Fourni par Playwright + wrappers `src/browser/human.ts`.

## 📺 Viewer

http://localhost:8080/viewer
- Flux JPEG temps réel (2 FPS par défaut, paramétrable)
- Clic sur l'image = commande `mouse.click` aux coordonnées réelles

## 🏗️ Architecture

```
Agent OpenClaw / CLI
        │ WebSocket
        ▼
src/transport/ws.ts      ← routing commandes
        │
src/browser/handlers.ts  ← ~40 handlers
        │
src/browser/controller.ts (Playwright) → Chromium
        │
src/browser/human.ts     ← Bézier / jitter / pauses
src/browser/resolver.ts  ← XPath | CSS | text
src/browser/vision.ts    ← stream JPEG
```

## 📁 Arborescence

```
src/
  server.ts
  browser/   { controller, handlers, human, resolver, vision }.ts
  transport/ ws.ts
  cli/       live.ts
  viewer/    index.html
logs/screenshots/
```

## 📄 License

MIT

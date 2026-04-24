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

## 🎮 CLI `bridge` (Game Changer)

Pilotez le navigateur directement depuis le terminal sans boilerplate JSON.

```bash
# Navigation
bridge navigate https://google.com

# Voir la page (retourne les éléments interactifs + screenshot)
bridge annotate

# Agir par ID d'élément (récupéré via annotate)
bridge click 7
bridge type 7 "monténégro"
bridge press Enter

# Actions combinées sans latence
bridge run "navigate https://google.com" "annotate" "click 7" "type 7 monténégro" "press Enter" "wait 2000" "annotate"

# Extraire l'état
bridge screenshot
bridge extract
bridge status
```

**Flags utiles :**
- `--save` : force la sauvegarde d'une image dans `/captures/`
- `--wait <ms>` : attend X millisecondes après l'action
- `--quiet` : n'affiche que `{"ok": true}`

*Note : Les wrappers `bridge.cmd` (Windows) et `bridge.ps1` sont disponibles à la racine.*

## 🌐 API WebSocket

Le serveur WebSocket (`ws://localhost:8080/ws/browser-bridge`) gère désormais des **sessions multiples** (via `sessionId`) et des exécutions par lot (`script.execute`).

## 📜 Nouvelles Commandes Avancées

| Commande | Rôle |
|----------|------|
| `page.annotate` | Annote visuellement la page et retourne la liste des éléments interactifs numérotés |
| `agent.click` | Clique sur un élément par référence (`ref`) |
| `agent.type` | Saisit du texte dans un élément par référence |
| `script.execute` | Exécute un batch de commandes (supporte l'interpolation `${stepX...}`) |
| `session.create` | Ouvre une nouvelle session isolée |
| `browser.status`| Retourne l'état de la page |
| `agent.task` | MVP autonome : analyse et accomplit un objectif haut niveau |

## 🖼️ Captures d'écran

Les images annotées et les captures sont accessibles en HTTP statique via `http://localhost:8080/captures/`. Plus besoin de jongler avec du base64 !

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

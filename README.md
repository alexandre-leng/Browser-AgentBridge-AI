# 🦾 OpenClaw Browser Bridge v3.0

Pont de contrôle navigateur haute performance conçu pour les **Agents IA** et l'automatisation avancée.

## 🚀 Installation & Démarrage

```bash
npm install
npx playwright install chromium
npm start
```

Le serveur tourne sur `http://localhost:8080`.
- **Viewer interactif** : `http://localhost:8080/viewer` (visionne le navigateur en temps réel).
- **Endpoint WS** : `ws://localhost:8080/ws/browser-bridge`.

---

## 🛠️ CLI `bridge` (L'outil ultime pour les agents)

Le bridge inclut un utilitaire puissant situé à la racine : `bridge.cmd` (Windows) ou `./bridge` (Linux).

### 1. Mode Batch (Gagnez 80% de latence)
Enchaînez plusieurs commandes en un seul appel CLI. C'est 10x plus rapide que de faire des appels individuels.

```bash
# Workflow complet en 3 secondes :
.\bridge.cmd run "navigate https://google.com" "annotate" "click 7" "type 7 'météo paris'" "press Enter" "summary"
```

### 2. Mode REPL (Interactif)
Idéal pour tester ou pour un dialogue continu avec le navigateur.
```bash
.\bridge.cmd repl
bridge> navigate https://google.com
bridge> annotate
bridge> click 7
```

### 3. Commandes "Agent-Ready"
- `bridge search "votre recherche"` : Recherche Google + Extraction structurée des résultats.
- `bridge summary` : Résumé textuel de la page (URL, titre, éléments interactifs).
- `bridge annotate` : Capture une image annotée avec des IDs numériques pour chaque bouton/lien.
- `bridge extract --type=article|form|table` : Extraction structurée de données.

---

## 🤖 Guide pour les Agents IA

Si vous êtes un agent IA pilotant ce bridge, consultez le **[GUIDE DE L'AGENT](AGENT-GUIDE.md)** pour apprendre à :
- Utiliser le système d'IDs numériques (`ref`) plutôt que les sélecteurs CSS.
- Optimiser vos tokens avec `summary` et `extract`.
- Gérer les erreurs avec les suggestions automatiques.

---

## 🎮 Commandes API (WebSocket)

| Catégorie | Commandes Clés | Description |
|-----------|----------------|-------------|
| **Agent** | `agent.click`, `agent.type`, `agent.search`, `agent.summary` | Utilise les IDs (`ref`) de l'annotation. |
| **Vision**| `page.annotate`, `vision.start` | Génère les IDs et le flux vidéo. |
| **DOM**   | `dom.extract`, `dom.waitFor`, `dom.scroll` | Manipulation bas niveau. |
| **Tabs**  | `tab.new`, `tab.switch`, `tab.close` | Gestion multi-onglets. |

### Sélecteur universel (`ref` ou `query`)
Toutes les commandes `agent.*` acceptent un ID numérique fourni par `page.annotate`.
Toutes les commandes `dom.*` acceptent XPath, CSS ou texte brut.

---

## 🏗️ Architecture

```
Agent / CLI / REPL
       │ JSON / WebSocket
       ▼
[ Transport: WS ]  ──▶ [ Controller: Playwright ]
       │                      │
       │                      ▼
[ Handlers: v3 ]   ◀── [ Human Logic: Bézier/Jitter ]
       │                      │
       └──────────────────────┴──▶ [ Vision Stream ]
```

---

## 📁 Fichiers Clés
- `src/browser/handlers.ts` : Le cœur de l'intelligence (tous les types de commandes).
- `src/cli/bridge.ts` : Logique du CLI batch et REPL.
- `src/browser/agent.ts` : Système d'annotation et arbre d'accessibilité.

---

## 📄 License
MIT

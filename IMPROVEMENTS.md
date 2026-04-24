# Améliorations nécessaires — OpenClaw Browser Bridge

> Document rédigé après analyse complète du codebase (24 avril 2026)
> Ce qui suit est basé sur la lecture réelle du code, pas sur des hypothèses.

---

## 🔴 Critique — Bloquant pour la fiabilité

### 1. Cache d'éléments global (pas session-aware)

**Problème** (`src/browser/agent.ts:9-11`) :
```typescript
let _cache: AgentElement[] = [];
```
Le cache des éléments annotés est une variable globale. Si deux sessions annotent en parallèle, le cache de la session A est écrasé par celui de la session B. `agent.click {ref: 3}` dans la session A cliquera sur l'élément #3 de la session B.

**Solution** : Remplacer `_cache` par une `Map<string, AgentElement[]>` indexée par `sessionId`.

```typescript
const _cache = new Map<string, AgentElement[]>();

export function getAgentElements(sessionId?: string) {
  return _cache.get(sessionId || 'default') ?? [];
}

export function findByRef(ref: string | number, sessionId?: string): AgentElement | null {
  const cache = getAgentElements(sessionId);
  // ...
}
```

**Impact** : Permet l'utilisation multi-session sans collision.

---

### 2. `script.execute` ne gère pas la navigation

**Problème** (`src/cli/bridge.ts:78`) :
```typescript
case 'press': return { type: 'agent.press', payload: { key: pParts[0] } };
```
Quand `press Enter` déclenche une navigation (ex: soumission de formulaire), la page change mais le batch continue immédiatement. Le step suivant (`annotate`) échoue ou retourne la page précédente.

**Solution** : Détecter la navigation dans `agent.press` et attendre `domcontentloaded` avant de retourner :

```typescript
'agent.press': async ({ key }: any) => {
  const page = await p();
  const beforeUrl = page.url();
  await page.keyboard.press(key);
  
  // Si la touche peut déclencher une navigation, attendre
  if (key === 'Enter') {
    try {
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 });
    } catch { /* pas de navigation, c'est OK */ }
  }
  
  return { key, navigated: page.url() !== beforeUrl, url: page.url() };
}
```

**Impact** : Le batch `run "navigate..." "annotate" "click 7" "type 7 text" "press Enter" "annotate"` fonctionnera sans intervention manuelle.

---

### 3. Pas de `wait` dans le CLI `run`

**Problème** (`src/cli/bridge.ts:72`) :
```typescript
case 'wait': return { type: 'wait', payload: { ms: Number(pParts[0]) } };
```
Le parsing existe mais le handler `wait` (`src/browser/handlers.ts`) fait juste `await sleep(ms)`. Ça ne résout pas le problème de navigation — on veut attendre que la page soit *prête*, pas juste attendre un délai fixe.

**Solution** : Implémenter `wait` intelligent :
- `wait` → attend `domcontentloaded`
- `wait --for url <pattern>` → attend que l'URL match
- `wait --for text <text>` → attend que le texte apparaisse
- `wait <ms>` → délai fixe (comportement actuel, fallback)

---

## 🟠 Important — Manquant pour l'agent IA

### 4. `agent.task` est un stub inutile

**Problème** (`src/browser/handlers.ts:80-94`) :
```typescript
'agent.task': async ({ goal, url, maxSteps = 10, onAmbiguity = 'ask' }: any) => {
  // Simple MVP: we just annotate and return...
  return {
    success: true,
    summary: `Goal received: "${goal}". This is a MVP agent task...`
  };
}
```

Cette fonction est un placeholder qui ne fait rien. Elle devrait soit :
- **Option A** : Être supprimée (l'agent IA est externe, pas dans le bridge)
- **Option B** : Devenir un vrai mini-agent avec boucle LLM côté serveur

**Recommandation** : Option A. Le bridge est un outil, pas un agent. L'agent est OpenClaw. Garder le bridge stateless et déterministe.

---

### 5. Pas de gestion d'erreur de retry

**Problème** : Si `agent.click {ref: 3}` échoue (élément disparu), l'erreur remonte immédiatement. L'agent doit gérer ça manuellement.

**Solution** : Ajouter un mécanisme de retry avec re-annotate automatique :

```typescript
'agent.click': async ({ ref, retry = true }: any) => {
  const page = await p();
  const sessionId = sessionStore.getStore();
  let el = findByRef(ref, sessionId);
  
  if (!el && retry) {
    // Re-annotate automatiquement si l'élément n'est pas dans le cache
    await annotateInteractive(page, sessionId);
    el = findByRef(ref, sessionId);
  }
  
  if (!el) throw new Error(`Element ref:${ref} not found (cache expired?)`);
  // ... clic
}
```

**Impact** : L'agent peut cliquer sur des éléments même après une navigation sans refaire `annotate` manuellement.

---

### 6. `dom.extract` retourne du texte brut — aucune structure

**Problème** (`src/browser/handlers.ts`) :
```typescript
'dom.extract': async () => {
  const page = await p();
  return { text: await page.evaluate(() => document.body.innerText) };
}
```

Pour une page de résultats Google, on obtient un mur de texte de 10 000 caractères. L'agent doit parser ça lui-même.

**Solution** : Implémenter `dom.extract --type <type>` avec des extracteurs spécialisés :

```typescript
const EXTRACTORS = {
  'search-results': async (page) => {
    // Extrait les blocs de résultats Google/Bing
    return page.evaluate(() => {
      return Array.from(document.querySelectorAll('h3')).map(h => ({
        title: h.innerText,
        url: h.closest('a')?.href || h.parentElement?.querySelector('a')?.href,
        snippet: h.parentElement?.innerText?.slice(0, 300)
      }));
    });
  },
  'form': async (page) => {
    // Extrait les champs de formulaire
    return page.evaluate(() => {
      return Array.from(document.querySelectorAll('input, select, textarea')).map(el => ({
        tag: el.tagName,
        type: el.type,
        name: el.name,
        placeholder: el.placeholder,
        required: el.required,
        label: document.querySelector(`label[for="${el.id}"]`)?.innerText
      }));
    });
  },
  'table': async (page) => {
    // Extrait les données tabulaires
    // ...
  },
  'article': async (page) => {
    // Extrait titre, auteur, date, corps
    // ...
  }
};
```

**Impact** : L'agent obtient des données structurées immédiatement exploitables.

---

### 7. CLI `run` — parsing fragile des arguments

**Problème** (`src/cli/bridge.ts:64-79`) :
```typescript
const parts = rawCmd.split(' ');
const c = parts[0];
const pParts = parts.slice(1);
```

Si un texte contient des espaces (ex: `type 7 "hello world"`), le parsing échoue. Les guillemets ne sont pas gérés.

**Solution** : Parser les arguments shell-style :

```typescript
function parseArgs(str: string): string[] {
  const args = [];
  let current = '';
  let inQuotes = false;
  for (const char of str) {
    if (char === '"') { inQuotes = !inQuotes; continue; }
    if (char === ' ' && !inQuotes) {
      if (current) args.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  if (current) args.push(current);
  return args;
}
```

---

### 8. Pas de persistance des cookies / auth entre sessions

**Problème** (`src/browser/controller.ts`) : Chaque `session.create` crée un nouveau `BrowserContext`. Les cookies, localStorage, et authentifications sont perdus quand la session se ferme.

**Solution** : Option `profileDir` par session :

```typescript
'session.create': async ({ sessionId, headless, profileDir }: any) => {
  await controller.launch({ headless, profileDir: profileDir || `./profiles/${sessionId}` }, sessionId);
  return { sessionId, ok: true };
}
```

**Impact** : L'agent peut rester connecté à Gmail, LinkedIn, etc. entre les sessions.

---

### 9. Vision stream envoie tout le temps — pas de diff

**Problème** (`src/browser/vision.ts`) : Le stream envoie un screenshot complet à intervalle fixe, même si rien n'a changé. C'est un gaspillage de bande passante.

**Solution** : Détecter les changements visuels avant d'envoyer :

```typescript
let lastHash: string | null = null;

// Dans tick():
const buf = await page.screenshot({ type: 'jpeg', quality: 60 });
const hash = crypto.createHash('md5').update(buf).digest('hex');
if (hash === lastHash) return; // Pas de changement, skip
lastHash = hash;
onFrame(buf.toString('base64'), meta);
```

Ou mieux : détecter les changements DOM (`MutationObserver` côté navigateur) et ne screenshotter que quand le DOM a changé.

---

### 10. Pas de gestion des dialogs (alert, confirm, prompt)

**Problème** : Si une page déclenche `window.alert()`, le script bloque indéfiniment.

**Solution** (`src/browser/controller.ts`, dans `launch`) :

```typescript
page.on('dialog', async dialog => {
  console.log(`[bridge] dialog: ${dialog.type()} — ${dialog.message()}`);
  await dialog.accept(); // ou dismiss, selon la config
});
```

Ou mieux : exposer un handler `dialog.handle` pour que l'agent décide.

---

## 🟡 Moyen — Confort et robustesse

### 11. `findByRef` — recherche trop basique

**Problème** (`src/browser/agent.ts:14-24`) :
```typescript
export function findByRef(ref: string | number): AgentElement | null {
  if (typeof ref === 'number') {
    return _cache.find((e) => e.id === ref) ?? null;
  }
  const q = ref.toLowerCase().trim();
  return (
    _cache.find((e) => e.name.toLowerCase() === q) ??
    _cache.find((e) => e.name.toLowerCase().includes(q)) ??
    _cache.find((e) => e.role.toLowerCase() === q) ??
    null
  );
}
```

La recherche textuelle est exacte/substring. Pas de fuzzy match, pas de Levenshtein, pas de recherche par role+name combiné.

**Solution** : Implémenter un scoring :

```typescript
function scoreMatch(el: AgentElement, query: string): number {
  const q = query.toLowerCase();
  const name = el.name.toLowerCase();
  const role = el.role.toLowerCase();
  
  if (name === q) return 100;
  if (name.includes(q)) return 80;
  if (role === q) return 60;
  
  // Levenshtein distance pour les fautes de frappe
  const dist = levenshtein(name, q);
  if (dist <= 2) return 70 - dist * 10;
  
  return 0;
}
```

---

### 12. Pas de logs structurés

**Problème** : Le serveur logue avec `console.log`. Pas de timestamps, pas de niveaux, pas de rotation.

**Solution** : Remplacer par un logger structuré :

```typescript
import { createWriteStream } from 'fs';

function log(level: string, msg: string, meta?: any) {
  const entry = { t: new Date().toISOString(), level, msg, ...meta };
  console.log(JSON.stringify(entry));
}
```

---

### 13. Pas de health check complet

**Problème** (`src/transport/ws.ts:74`) :
```typescript
if (url === '/health') {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, clients: clients.size }));
}
```

Le health check ne vérifie pas que le navigateur est réellement prêt.

**Solution** :

```typescript
if (url === '/health') {
  const status = {
    ok: true,
    wsClients: clients.size,
    browserReady: !!controller['defaultContext'],
    sessions: controller.listSessions().length,
    uptime: process.uptime()
  };
}
```

---

### 14. `bridge.cmd` ne gère pas les chemins avec espaces

**Problème** : Le script `bridge.cmd` appelle `node bridge.js`. Si le chemin contient des espaces, ça casse.

**Solution** : Encadrer avec des guillemets dans `bridge.cmd` et `bridge.ps1`.

---

### 15. Pas de rate limiting sur le WebSocket

**Problème** : Un client peut spammer des commandes et surcharger le navigateur.

**Solution** : Ajouter un rate limiter par client :

```typescript
const clientLimits = new Map<WebSocket, { count: number; resetAt: number }>();

// Dans wss.on('connection'):
ws.on('message', async (raw) => {
  const limit = clientLimits.get(ws);
  const now = Date.now();
  if (limit && now < limit.resetAt && limit.count > 50) {
    ws.send(JSON.stringify({ ok: false, error: 'rate limited' }));
    return;
  }
  // ...
});
```

---

## 🟢 Nice-to-have — Démarrage rapide

### 16. Auto-annotate après navigation

**Problème** : Après chaque `navigate`, l'agent doit appeler `annotate` manuellement.

**Solution** : Option `autoAnnotate` sur `navigate` :

```typescript
navigate: async ({ url, autoAnnotate = false }) => {
  const page = await p();
  await page.goto(url, { waitUntil });
  const result = { url: page.url(), title: await page.title() };
  if (autoAnnotate) {
    const ann = await annotateInteractive(page);
    return { ...result, ...ann };
  }
  return result;
}
```

---

### 17. `agent.type` efface le champ automatiquement

**Problème** : `agent.type` utilise `humanType` qui tape à la suite du texte existant. Pas de `Ctrl+A` préalable.

**Solution** : Option `clear` (défaut: true) :

```typescript
'agent.type': async ({ ref, text, clear = true }: any) => {
  // ... focus l'élément
  if (clear) {
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
  }
  await humanType(page, text);
}
```

---

### 18. Pas de support pour les iframes

**Problème** : `collectElements` ne scanne que le document principal. Les éléments dans les iframes sont invisibles.

**Solution** : Parcourir récursivement les frames :

```typescript
async function collectElements(page: Page, frame?: Frame): Promise<AgentElement[]> {
  const target = frame || page;
  const elements = await target.evaluate((sel) => { /* ... */ }, INTERACTIVE_SEL);
  
  // Ajouter un préfixe d'iframe aux IDs ? Ou retourner séparément ?
  
  for (const child of await target.childFrames()) {
    elements.push(...await collectElements(page, child));
  }
  return elements;
}
```

---

### 19. Le viewer ne montre pas les éléments annotés

**Problème** : Le viewer (`src/viewer/index.html`) montre le screenshot brut, pas la version avec les numéros verts.

**Solution** : Quand `vision.frame` est actif, utiliser `annotateInteractive` au lieu de `screenshot` simple, ou superposer les numéros côté client avec les données `top[]`.

---

### 20. Pas de gestion des téléchargements

**Problème** : Si un clic déclenche un téléchargement, Playwright le gère silencieusement mais le bridge ne notifie pas l'agent.

**Solution** (`src/browser/controller.ts`) :

```typescript
page.on('download', async download => {
  const path = await download.path();
  broadcast({ type: 'browser.download', payload: { filename: download.suggestedFilename(), path } });
});
```

---

## 📋 Priorisation

| Priorité | Issue | Effort | Impact agent |
|---|---|---|---|
| 🔴 P0 | Cache session-aware | ✅ Fait | Bloquant multi-session |
| 🔴 P0 | Navigation dans batch | ✅ Fait | Fiabilité scripts |
| 🔴 P0 | Gestion dialogs | ✅ Fait | Bloquant sites legacy |
| 🟠 P1 | Extract structuré | ✅ Fait | Productivité agent |
| 🟠 P1 | Retry auto + re-annotate | ✅ Fait | Robustesse |
| 🟠 P1 | Parsing CLI robuste | ✅ Fait | Confort |
| 🟠 P1 | Persistance cookies | ✅ Fait | Auth inter-sessions |
| 🟡 P2 | Vision diff | ✅ Fait | Perf réseau |
| 🟡 P2 | Fuzzy findByRef | ✅ Fait | Tolérance erreur |
| 🟢 P3 | Auto-annotate | ✅ Fait | Confort |
| 🟢 P3 | Type avec clear | ✅ Fait | Confort |
| 🟢 P3 | Support iframes | ✅ Fait | Couverture |

---

## Architecture cible (post-fix)

```
┌─────────────────────────────────────────────────────┐
│  Agent IA (OpenClaw)                                 │
│  → "bridge run navigate... click 7 type 7 text"     │
└─────────────────┬───────────────────────────────────┘
                  │ CLI
┌─────────────────▼───────────────────────────────────┐
│  bridge.cmd                                          │
│  → parse args robuste                                │
│  → WebSocket → serveur                               │
└─────────────────┬───────────────────────────────────┘
                  │ WS
┌─────────────────▼───────────────────────────────────┐
│  Serveur (port 8080)                                 │
│                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐ │
│  │ script.exec │  │  annotate   │  │   extract    │ │
│  │  (batch)    │  │  (cache     │  │  (structured)│ │
│  │  + wait     │  │   par       │  │              │ │
│  │  + retry)   │  │   session)  │  │              │ │
│  └─────────────┘  └─────────────┘  └──────────────┘ │
│         │                │                  │        │
│         └────────────────┼──────────────────┘        │
│                          ▼                          │
│              ┌─────────────────────┐                │
│              │  Playwright Controller│               │
│              │  - Multi-session      │               │
│              │  - Profile persistance│               │
│              │  - Dialog handling    │               │
│              │  - Download events    │               │
│              └─────────────────────┘                │
└─────────────────────────────────────────────────────┘
```

---

*Ce document doit être mis à jour au fur et à mesure que les issues sont corrigées.*

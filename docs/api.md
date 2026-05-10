### `agent`

| Commande | Paramètres | Description |
|---|---|---|
| `agent.click` | `{ref, double?: false, retry?: true}` | Clic humain sur élément #ref |
| `agent.discoverScroll` | `{direction?, amount?}` | Scroll avec détection de contenu |
| `agent.hover` | `{ref}` | Survol humain |
| `agent.press` | `{key, ref?}` | Touche clavier |
| `agent.scroll` | `{direction?, amount?}` | Scroll fluide |
| `agent.search` | `{query, engine?}` | Recherche web |
| `agent.select` | `{ref}` | Focus élément |
| `agent.summary` | `{}` | Résumé page |
| `agent.task` | `{goal}` | Tâche LLM |
| `agent.tree` | `{}` | Arbre accessibilité |
| `agent.type` | `{ref, text, clearFirst?: true}` | Saisie avec effacement préalable |
| `agent.waitFor` | `{ref, timeout?}` | Attente élément

### `browser`

- `browser.close`
- `browser.status`

### `cookie`

- `cookie.get`
- `cookie.set`

### `dom`

| Commande | Paramètres | Description |
|---|---|---|
| `dom.click` | `{query?, selector?, text?}` | Clic sur élément par sélecteur CSS, XPath ou texte |
| `dom.doubleClick` | `{query?, selector?, text?}` | Double-clic |
| `dom.extract` | `{type?, schema?, llm?}` | Extraction structurée |
| `dom.fillForm` | `{query?, selector?}` | Remplit un formulaire |
| `dom.goto` | `{url}` | Naviguer vers URL (simplifié) |
| `dom.hover` | `{query?, selector?, text?}` | Survole un élément |
| `dom.html` | `{query?, selector?}` | HTML interne d'un élément |
| `dom.inspect` | `{query?, selector?}` | Inspecte un élément (tag, classes, attributs) |
| `dom.press` | `{key, waitForNavigation?, timeout?: 10000}` | Presse une touche. `waitForNavigation` auto si Enter |
| `dom.scrollDown` | `{amount?: number}` | Scroll vers le bas |
| `dom.scrollUp` | `{amount?: number}` | Scroll vers le haut |
| `dom.search` | `{query}` | Recherche sur le moteur actuel |
| `dom.select` | `{query?, selector?, text?, value?}` | Sélectionne une option dans un `<select>` |
| `dom.submit` | `{query?, selector?, timeout?: 10000}` | Soumet un formulaire |
| `dom.type` | `{query?, selector?, value?, text?}` | Tape du texte dans un champ |
| `dom.visibleText` | `{query?, textFilter?, filterAny?, filterLines?, limit?: 300, includeHidden?}` | Extrait le texte visible |
| `dom.waitFor` | `{query?, selector?, text?, state?: "visible"\|"hidden"\|"attached", timeout?: 10000}` | Attend un état DOM |

### `exec`

- `exec.script`

### `human`

- `human.antispam.check`
- `human.backtrack`
- `human.clickText`
- `human.explore`
- `human.findText`
- `human.focusCycle`
- `human.goBack`
- `human.goForward`
- `human.idle`
- `human.jitter`
- `human.read`
- `human.scan`
- `human.skim`
- `human.timing.get`
- `human.timing.reset`
- `human.timing.set`

### `input`

- `input.focus`
- `input.keyDown`
- `input.keyUp`
- `input.mouseDown`
- `input.mouseMove`
- `input.mouseUp`
- `input.text`
- `input.wheel`

### `page`

| Commande | Paramètres | Description |
|---|---|---|
| `page.annotate` | `{noImage?: boolean}` | Capture + éléments. `noImage` = 10x plus rapide |

### `misc`

| Commande | Paramètres | Description |
|---|---|---|
| `misc.search` | `{query, engine?: "google"\|"bing"}` | Cherche sur un moteur |
| `misc.wait` | `{ms}` | Pause |

### `combo`

| Commande | Paramètres | Description |
|---|---|---|
| `combo.searchAndClick` | `{query, engine?: "google"\|"bing"}` | Cherche + clique premier résultat |

### `script`

| Commande | Paramètres | Description |
|---|---|---|
| `script.execute` | `{commands: [], sessionId?}` | Exécute plusieurs commandes batch |
| `exec.script` | `{code, adminToken}` | Exécute du JS arbitraire (si autorisé) |

### `session`

| Commande | Paramètres | Description |
|---|---|---|
| `session.create` | `{sessionId, headless?: boolean, profileDir?: string}` | Crée un contexte navigateur isolé |
| `session.list` | `{}` | Liste les sessions actives |
| `browser.status` | `{}` | Statut du navigateur (sessions, mémoire) |
| `browser.close` | `{}` | Ferme le navigateur |
| `screenshot` | `{format?: "png"\|"jpg", fullPage?: boolean}` | Capture d'écran (URL + dataUrl) |
| `cookie.get` | `{urls?: string[]}` | Récupère les cookies |
| `cookie.set` | `{cookies}` | Définit des cookies |

### `tab`

| Commande | Paramètres | Description |
|---|---|---|
| `tab.close` | `{index}` | Ferme un onglet |
| `tab.list` | `{}` | Liste les onglets ouverts |
| `tab.new` | `{url?: string}` | Nouvel onglet (optionnellement navigue) |
| `tab.switch` | `{index}` | Change d'onglet |

### `trace`

| Commande | Paramètres | Description |
|---|---|---|
| `trace.artifacts` | `{}` | Liste les artifacts de trace disponibles |
| `trace.list` | `{sessionId?: string}` | Liste les événements de trace d'une session |
| `trace.save` | `{sessionId?: string}` | Sauvegarde la trace sur disque |

### `viewport`

| Commande | Paramètres | Description |
|---|---|---|
| `viewport.set` | `{width, height}` | Redimensionne le viewport |

### `batch`

| Commande | Paramètres | Description |
|---|---|---|
| `batch` | `{commands: [], stopOnError?: boolean}` | Exécute plusieurs commandes en séquence |
| `wait` | `{ms: number}` | Pause en millisecondes |

### `vision`

- `vision.screenshot` — capture d'écran en base64 (`{}`)
- `vision.start` — démarre le streaming temps réel (`{fps: number, annotate?: boolean}`)
- `vision.stop` — arrête le streaming (`{}`)
- `vision.frame` (event serveur) — image diffusée pendant le streaming (`{frame: base64, timestamp, md5}`)

## Commandes utiles

### `dom.visibleText`

Extrait le texte réellement visible dans le DOM, élément par élément, même quand le contenu n'est pas exposé comme lien, bouton ou article. Utile pour des pages JavaScript comme Google Maps où un téléphone peut apparaître dans un simple `div` visible.

Payload :

```json
{
  "query": ".optional-root-css-selector",
  "textFilter": "Numéro|06|Adresse",
  "filterAny": ["Numéro", "06", "Adresse"],
  "filterLines": true,
  "limit": 100,
  "includeHidden": false
}
```

`textFilter` reste une expression régulière. Sur Windows/PowerShell, préférez `filterAny` ou `--filter-any=a,b,c` pour éviter que `cmd.exe` interprète `|` comme un pipeline avant que Node reçoive l'argument. `filterLines` filtre ligne par ligne après extraction.

Réponse :

```json
{ "type": "visible-text", "count": 1, "items": [{ "text": "06 58 47 70 24", "tag": "div", "selector": "div.Io6YTe.fontBodyMedium.kR99db", "box": { "x": 500, "y": 662, "w": 402, "h": 40 } }] }
```

CLI :

```bash
node bridge-cli.cjs visibleText --filter-any=Numéro,06,Adresse --filter-lines --limit=50
# alias accepté
node bridge-cli.cjs visible-text --filter-any=Numéro,06,Adresse --filter-lines --limit=50
```

### `dom.extract` avec `type: "listings"`

Extrait une liste structurée depuis des cartes de résultats, annuaires, Google Maps, Pages Jaunes ou pages de listings génériques.

Payload :

```json
{ "type": "listings" }
```

Réponse :

```json
{
  "type": "listings",
  "listings": [
    {
      "name": "Ottho - Formation No Code et IA",
      "rating": 5,
      "reviews": 186,
      "address": "11 Rue Montgrand, Marseille",
      "phone": "07 57 59 77 84",
      "website": "https://...",
      "hours": "Ouvert · Ferme à 18:00",
      "summary": "Excellente expérience..."
    }
  ]
}
```

CLI :

```bash
node bridge-cli.cjs extract listings
```

### Capacités humaines

- `human.timing.get` retourne le profil de timings de consultation actif.
- `human.timing.set` ajuste à chaud les timings (`consultSpeed`, WPM, min/max, cadence de feedback) pour ralentir ou accélérer les consultations sans redémarrage.
- `human.timing.reset` restaure le profil par défaut.
- `human.antispam.check` inspecte la page et renvoie un warning structuré au lieu de lancer une erreur.
- `human.scan` lit le texte visible, scrolle lentement, puis relit. Il accepte `textFilter`, `filterAny`, et `filterLines`.
- `human.findText` cherche un texte visible et scrolle si besoin, avec un timeout global borné via `timeoutMs`.
- `human.clickText` cherche un texte visible, logue les étapes (`finding`, `coordinates`, `clicking`) et clique au centre de l'élément trouvé. Si le clic coordonné échoue, il tente un fallback par `agent.click` sur un ref annoté.
- `human.idle` déplace doucement la souris et marque des pauses de lecture.
- `human.jitter` ajoute de petites hésitations autour de la position courante.
- `human.skim` parcourt une page avec scrolls progressifs, pauses et petits retours en arrière.
- `human.backtrack` remonte légèrement, utile quand un humain relit une zone.
- `human.focusCycle` parcourt les éléments focusables au clavier avec `Tab`.
- `human.goBack` / `human.goForward` utilisent l'historique avec pause humaine.

CLI :

```bash
node bridge-cli.cjs scan --steps=4 --filter-any=Restaurant,Adresse,Numéro
node bridge-cli.cjs find-text "Le Ramus"
node bridge-cli.cjs click-text "Le Ramus" --timeout-ms=15000
node bridge-cli.cjs idle 2500
node bridge-cli.cjs jitter 18 4
node bridge-cli.cjs skim 4 420
node bridge-cli.cjs backtrack
node bridge-cli.cjs focus-cycle 3
node bridge-cli.cjs timing get
node bridge-cli.cjs timing set consultSpeed=1.6 minFocusedMs=3500 feedbackIntervalMs=800
node bridge-cli.cjs antispam
```

### Profil de timing humain

Le profil de timing contrôle uniquement les temps de consultation : lecture, scan, relecture d'un résultat trouvé. Les mouvements de souris, clics et saisies gardent leurs propres modèles humains.

Payload `human.timing.set` :

```json
{
  "consultSpeed": 1.6,
  "focusedWpmMin": 150,
  "focusedWpmMax": 210,
  "skimWpmMin": 190,
  "skimWpmMax": 280,
  "minFocusedMs": 3500,
  "maxFocusedMs": 60000,
  "minSkimMs": 1500,
  "maxSkimMs": 25000,
  "feedbackIntervalMs": 800
}
```

| Champ | Effet | Conseil |
|---|---|---|
| `consultSpeed` | Multiplie tous les temps de consultation | `1` normal, `1.5` plus lent, `0.75` plus rapide |
| `focusedWpmMin` / `focusedWpmMax` | Vitesse de lecture attentive | Baisser les WPM allonge les pauses |
| `skimWpmMin` / `skimWpmMax` | Vitesse de scan rapide | À garder plus haut que le focused WPM |
| `minFocusedMs` / `maxFocusedMs` | Bornes de pause pour `human.read` focalisé | Augmenter sur les sites sensibles |
| `minSkimMs` / `maxSkimMs` | Bornes de pause pour scan et recherche textuelle | Utile pour listes longues |
| `feedbackIntervalMs` | Fréquence des événements `human.feedback` | 500-1500 ms donne un bon retour temps réel |

Réponse typique :

```json
{
  "ok": true,
  "timing": {
    "consultSpeed": 1.6,
    "focusedWpmMin": 150,
    "focusedWpmMax": 210,
    "feedbackIntervalMs": 800
  }
}
```

### Feedback temps réel

Pendant `human.read`, `human.scan` et `human.findText`, le bridge diffuse des événements WebSocket `human.feedback`. Ils ne remplacent pas la réponse finale de la commande : ils servent à piloter une boucle d'agent pendant que la consultation est encore en cours.

Exemple d'événement :

```json
{
  "type": "human.feedback",
  "payload": {
    "phase": "consulting",
    "reason": "human.scan.step.2",
    "elapsedMs": 2400,
    "remainingMs": 5200,
    "progress": 0.31,
    "step": 2,
    "totalSteps": 4,
    "timing": { "consultSpeed": 1.6, "feedbackIntervalMs": 800 }
  }
}
```

Phases courantes :

- `consulting` : pause de lecture ou relecture en cours.
- `consulted` : consultation terminée.
- `scrolling` : déplacement de page avant une nouvelle lecture.
- `timing.updated` / `timing.reset` : profil modifié à chaud.
- `antispam.ok` / `antispam.warning` : résultat d'un check anti-spam.

### Boucle agent recommandée

1. Lire le profil avec `human.timing.get` au début d'une session longue.
2. Après une navigation, préférer `human.read` ou `human.scan` avant de cliquer à nouveau.
3. Sur plusieurs `human.feedback` rapides ou une page sensible, appeler `human.timing.set` avec `consultSpeed` plus élevé et des minimums plus longs.
4. Appeler `human.antispam.check` après les recherches répétées, les pages de résultats, ou tout comportement inhabituel.
5. Si `blocked: true`, arrêter l'automation et passer en intervention humaine. Le bridge n'est pas conçu pour contourner les protections.

Exemple WebSocket complet :

```json
{ "id": "t1", "type": "human.timing.set", "payload": { "consultSpeed": 1.8, "minFocusedMs": 4000 } }
{ "id": "r1", "type": "human.read", "payload": { "focused": true } }
{ "id": "a1", "type": "human.antispam.check", "payload": {} }
```

## Variables d'environnement

| Variable | Rôle | Défaut |
|---|---|---|
| `PORT` | port HTTP/WS | 8080 |
| `BRIDGE_HOST` | host de bind | 127.0.0.1 |
| `BRIDGE_URL` | URL WebSocket utilisée par le CLI TypeScript | `ws://localhost:8080/ws/browser-bridge` |
| `BRIDGE_TOKEN` | token d'auth WS, obligatoire hors localhost | (vide autorisé localement) |
| `BRIDGE_ADMIN_TOKEN` | token pour `exec.script` | (vide = commande désactivée) |
| `BRIDGE_ALLOW_EXEC_SCRIPT` | active `exec.script` si `1` | 0 |
| `BRIDGE_ALLOW_FILE_URLS` | active navigation `file:` si `1` | 0 |
| `BRIDGE_ALLOWED_FILE_ROOTS` | CSV de racines autorisées pour `file:` | (vide) |
| `CHROME_CHANNEL` | canal navigateur Playwright (`chrome`, `chromium`, `msedge`) | chrome |
| `CHROME_PROFILE` | dossier de profil persistant Chromium/Chrome | (vide = contexte neuf) |
| `CHROME_CDP_URL` | endpoint CDP pour se connecter à un navigateur existant | (vide) |
| `BRIDGE_PLAYWRIGHT_SLOWMO_MS` | ralentissement Playwright appliqué aux actions bas niveau | 0 |
| `BRIDGE_BRING_TO_FRONT` | remet la page active au premier plan (`0` désactive) | 1 |
| `BRIDGE_POLITE_MODE` | ralentissement par domaine + détection anti-bot (`0` désactive) | 1 |
| `BRIDGE_POLITE_MIN_DELAY_MS` | délai minimum entre navigations vers le même host | 12000 |
| `BRIDGE_AUTO_COOKIES` | gestion automatique des bannières cookies connues (`0` désactive) | 1 |
| `BRIDGE_HUMAN_WARMUP` | mouvements/pauses humaines après navigation (`0` désactive) | 1 |
| `BRIDGE_PAGE_WARMUP_MS` | durée du warmup humain après navigation | 2500 |
| `BRIDGE_HUMAN_CONSULT_SPEED` | multiplicateur initial des temps de consultation humaine | `BRIDGE_DEMO_SPEED` ou 1 |
| `BRIDGE_DEMO_SPEED` | multiplicateur général des mouvements/pauses de démonstration | 1 |
| `BRIDGE_VISIBLE_CURSOR` | affiche le curseur visuel injecté (`0` désactive) | 1 |
| `BRIDGE_ALLOWED_ORIGINS` | CSV origines autorisées | (vide = toutes) |
| `BRIDGE_DEFAULT_TIMEOUT_MS` | timeout défaut Playwright | 15000 |
| `BRIDGE_DEFAULT_NAV_TIMEOUT_MS` | timeout nav défaut | 20000 |
| `BRIDGE_LOG_JSON` | logs JSON si `1` | 0 |
| `BRIDGE_LOG_LEVEL` | niveau min logs | info |
| `BRIDGE_MCP_ALLOW_RAW` | expose l'outil MCP brut `browser_command` si `1` | 0 |


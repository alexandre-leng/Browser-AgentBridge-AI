# 🚀 Guide d'Installation — OpenClaw Browser Bridge

## Étape 1 : Lancer le serveur de test

```bash
cd openclaw-browser-bridge
npm install  # Déjà fait
npm start    # Lance le serveur sur localhost:8080
```

Le serveur affiche :
- Interface web : http://localhost:8080
- WebSocket : ws://localhost:8080/ws/browser-bridge

## Étape 2 : Installer l'extension dans Firefox

### Méthode A : Mode Développeur (Recommandé)

1. Ouvrir Firefox
2. Aller sur `about:debugging` (taper dans la barre d'adresse)
3. Cliquer sur "Ce Firefox" (This Firefox)
4. Cliquer sur "Charger un module complémentaire temporaire"
5. Sélectionner le fichier `manifest.json` dans le dossier `openclaw-browser-bridge/`
6. L'extension apparaît dans la barre d'outils (icône 🦾)

### Méthode B : Mode permanent (pour usage régulier)

1. Zipper le dossier `openclaw-browser-bridge/` (sans node_modules)
2. Renommer en `.xpi`
3. Glisser-déposer dans Firefox
4. Accepter les permissions

## Étape 3 : Tester la connexion

1. Cliquer sur l'icône 🦾 dans la barre Firefox
2. Le popup s'affiche avec :
   - Status de connexion (Connecté/Déconnecté)
   - Recherche rapide
   - Actions (Screenshot, Extract, etc.)
   - Journal des événements

## Étape 4 : Tester les commandes

### Depuis le popup
1. Entrer "formateur IA marseille" dans la barre de recherche
2. Cliquer 🔍 ou Enter
3. Un nouvel onglet s'ouvre avec Google

### Depuis le serveur de test
1. Ouvrir http://localhost:8080 dans un onglet
2. Cliquer sur "🔍 Google" — la commande est envoyée à l'extension
3. Vérifier dans Firefox qu'un nouvel onglet s'ouvre

## Étape 5 : Vérifier le fonctionnement

### Checklist de validation

- [ ] L'icône 🦾 apparaît dans la barre Firefox
- [ ] Le popup s'affiche avec "Connecté à OpenClaw"
- [ ] La recherche rapide ouvre un nouvel onglet
- [ ] Le screenshot télécharge un fichier
- [ ] Les logs s'affichent dans le popup

## 🔧 Dépannage

### "Déconnecté" dans le popup
- Vérifier que le serveur tourne (`npm start`)
- Vérifier que `ws://localhost:8080/ws/browser-bridge` est accessible
- Regarder la console Firefox (F12 → Console) pour les erreurs

### L'extension ne s'installe pas
- Vérifier que `manifest.json` est valide
- Vérifier que tous les fichiers sont présents
- Firefox doit être en version 57+ (WebExtension)

### Pas de réponse aux commandes
- Vérifier la connexion WebSocket dans la console
- Vérifier que le content script est injecté (F12 → Debugger)
- Redémarrer le serveur et recharger l'extension

## 📝 Architecture en détail

```
[Utilisateur]
    ↓ (clique icône)
[Popup HTML/JS]
    ↓ (envoie message)
[Background Script]
    ↓ (WebSocket)
[OpenClaw Gateway]
    ↓ (envoie commande)
[Background Script]
    ↓ (exécute)
[Content Script] ←→ [Page Web]
    ↓ (retourne résultats)
[Background Script]
    ↓ (WebSocket)
[OpenClaw Gateway]
    ↓ (affiche)
[OpenClaw Agent]
```

## 🎯 Commandes disponibles

### Recherche
```json
{
  "type": "search",
  "payload": {
    "engine": "google|bing|duckduckgo",
    "query": "votre recherche",
    "options": { "closeAfter": false }
  }
}
```

### Navigation
```json
{
  "type": "navigate",
  "payload": {
    "url": "https://example.com",
    "options": { "humanBehavior": true, "scrollCount": 3 }
  }
}
```

### Extraction
```json
{
  "type": "extract",
  "payload": {
    "selector": "h1, h2, h3",
    "attribute": "href",
    "options": { "multiple": true }
  }
}
```

### Screenshot
```json
{
  "type": "screenshot",
  "payload": {
    "format": "png",
    "fullPage": false
  }
}
```

### Formulaire
```json
{
  "type": "form.fill",
  "payload": {
    "fields": {
      "#email": "test@example.com",
      "#password": "secret"
    },
    "submit": true
  }
}
```

### Téléchargement
```json
{
  "type": "file.download",
  "payload": {
    "url": "https://example.com/file.pdf",
    "filename": "document.pdf"
  }
}
```

## 🛡️ Sécurité

- L'extension ne communique qu'avec `localhost:8080`
- Aucune donnée n'est envoyée à des tiers
- Code 100% open-source et vérifiable
- Permissions minimales (pas d'accès aux mots de passe)

## 🎉 Tu es prêt !

L'extension est installée et fonctionnelle. Tu peux maintenant :
1. Rechercher sur Google sans captcha
2. Scraper des données structurées
3. Automatiser des formulaires
4. Capturer des screenshots
5. Télécharger des fichiers

Tout ça contrôlé par OpenClaw ! 🤖

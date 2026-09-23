# CLAUDE.md — Codex

Guide de travail pour `codex/`, sur la branche **`codex`**. Les règles de sécurité et de commit
communes à tout le dépôt sont dans `../CLAUDE.md` : les lire d'abord. Mise en route et usage :
`README.md`.

---

## 1. Architecture

Site statique (GitHub Pages) + Supabase. Pas de build, JS vanilla en IIFE sur un espace de noms
`window.Codex` (même style que le portfolio). Commentaires en français, qui expliquent *pourquoi*.

| Fichier | Rôle |
|---|---|
| `supabase/schema.sql` | **Toute la sécurité.** Tables, RLS, déclencheur d'historique, `rechercher()`, `graphe()`, `stockage()`, `ping()`, bucket privé. Rejouable. |
| `assets/js/config.js` | URL + clé anon. Publiques par conception. |
| `commun.js` | `h()` (construction DOM sûre), dialogues, menus, toasts, dates, `plier()`, types de ressources. |
| `rendu.js` | Markdown → HTML : marked + formules KaTeX + encadrés `:::` + liens `[[…]]` + code, puis **DOMPurify**. |
| `api.js` | **Seul fichier qui parle à Supabase.** Erreurs traduites en français. |
| `compression.js` / `pdf-worker.js` | Compression des PDF (pdf-lib puis Ghostscript WASM) dans un worker module. |
| `navigation.js` | Arborescence de la barre latérale. |
| `graphe.js` | Graphe par forces sur canvas (maison, sans d3). |
| `lecture.js` / `editeur.js` / `admin.js` | Les vues. |
| `app.js` | Démarrage, session, routeur par `#`, recherche, accueil, graphe complet. |
| `tools/versionner.py` | `?v=<hash>` sur les assets + régénère le banc. **Après chaque modif CSS/JS.** |
| `tools/banc.html` | **Généré.** La vraie page avec `faux-supabase.js` à la place de supabase-js. |
| `tests/rls.test.mjs` | RLS sur PGlite (vrai Postgres en WASM). |
| `tests/e2e.test.mjs` | Toute l'interface dans Chrome headless, sur le banc. |

## 2. Invariants de sécurité

- **Une règle d'accès vit en SQL.** Masquer un bouton côté JS est du confort, pas une protection. Toute
  table nouvelle : RLS activée, règles par opération, `revoke` pour `anon`, cas dans `rls.test.mjs`.
- Les fonctions `security definer` ont `set search_path = ''` et des noms qualifiés.
- L'identité vient de `auth.users` (e-mail **confirmé**), pas du jeton : un e-mail non confirmé n'a
  aucun droit, même s'il est dans `membres`.
- `maj_le` / `maj_par` sont posés par le déclencheur, jamais par le client.
- L'admin ne peut ni se retirer ni se rétrograder (impossible de s'enfermer dehors).
- Seul HTML injecté : celui de `rendu.js`, après DOMPurify. Partout ailleurs `h()` / `textContent`.
- Scripts CDN : **version épinglée + SRI**, et domaines autorisés par la CSP d'`index.html`. Les
  bibliothèques du worker (pas d'attribut `integrity` possible sur un `import()`) sont téléchargées
  par `fetch(url, { integrity })`, vérifiées, puis importées depuis un blob.

## 3. Pièges déjà payés

- **L'outil d'écriture de fichiers décode les échappements unicode** (barre oblique inverse + `u` +
  4 chiffres hexa) en caractères réels. Une regex d'accents devient une plage de caractères
  combinants invisibles, un espace insécable devient indiscernable d'un espace. Après une écriture
  de fichier contenant de tels échappements, vérifier : aucun caractère de catégorie Unicode
  `Mn`/`Cf` ni `U+00A0` ne doit apparaître dans les `.js` (petit script Python avec `unicodedata`).
- **Ghostscript depuis un blob** : `gs.js` fait `new URL(…, import.meta.url)` ; depuis un blob, cette
  base est `blob:…` et lève « Invalid URL ». `pdf-worker.js` remplace `import.meta.url` par l'URL
  CDN dans le texte vérifié. Sans ça, la compression forte échoue **en silence** (le fichier part
  quand même, non compressé) : regarder le `journal` renvoyé par le worker.
- **supabase-js n'expose pas la progression d'envoi** (fetch). `api.js` envoie en XHR direct sur
  l'API Storage avec la session de l'utilisateur ; la RLS de `storage.objects` s'applique pareil.
- **Lien magique et routeur par `#`** : supabase-js (flux implicite) revient avec les jetons dans le
  `#`. Le routeur ne démarre qu'après `getSession()`, qui les a lus et effacés. En cas d'échec
  (`#error=…`), Supabase laisse l'adresse telle quelle : `erreurDansUrl()` la lit et la nettoie.
- **`plier()` existe en SQL et en JS** (accents + casse). Les deux doivent apparier les titres de la
  même façon, sinon un `[[lien]]` est résolu dans la page mais absent du graphe, ou l'inverse.
- Le **verrou optimiste** repose sur `update … where maj_le = <valeur lue>`. Ne pas le retirer : sans
  lui, deux éditeurs s'écrasent en silence.
- Le banc est **généré** depuis `index.html` : ne jamais l'éditer, relancer `versionner.py`.
- Tests Chrome : profil jetable à chaque lancement (sinon le cache HTTP sert d'anciens fichiers),
  `--no-sandbox` sous Windows.

## 4. Avant de commiter

1. `python codex/tools/versionner.py`
2. `schema.sql` touché → `cd codex/tests && npm test`
3. JS/CSS/HTML touché → `npm run e2e` (48 vérifications, console propre attendue)
4. Les contrôles de `../CLAUDE.md` §3 (hook, identité, rien hors de `codex/`).

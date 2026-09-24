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
| `supabase/accueil.sql` | La note d'accueil (page d'arrivée, premier nœud du graphe). |
| `supabase/exemple.sql` / `exemple-retirer.sql` | Cours fictif pour la démo, et son retrait (tout est sous le dossier « Exemple »). |
| `supabase/schema.sql` | **Toute la sécurité.** Tables, RLS, déclencheur d'historique, `rechercher()`, `graphe()`, `etiquettes()`, `stockage()`, `ping()`, comptes (`admin_creer_compte`, `admin_mot_de_passe`, `admin_supprimer_compte`), `progression` (exercices faits, « chacun ses lignes »), bucket privé. Rejouable. |
| `assets/js/config.js` | URL + clé anon. Publiques par conception. |
| `commun.js` | `h()` (construction DOM sûre), dialogues, menus, toasts, dates, `plier()`, types de ressources. |
| `rendu.js` | Markdown → HTML : marked + formules KaTeX + encadrés `:::` (titres en Markdown) + liens `[[…]]` + code, puis **DOMPurify**. |
| `diagrammes.js` | Blocs ```` ```mermaid ```` : Mermaid chargé à la demande (SRI), dessin converti en **image** `data:` inerte. |
| `pages.js` | Pages transversales : **Documents** (tous les supports par matière, filtres par type) et **Exercices** (progression par matière), cartes des matières de l'accueil. |
| `import.js` | Page Importer : fiches `.md` / dossier / lot Codex (`@@`, `+++`), et fichiers en lot rangés par un CSV. Analyse pure exposée en `C.importer`. |
| `api.js` | **Seul fichier qui parle à Supabase.** Erreurs traduites en français. |
| `compression.js` / `pdf-worker.js` | Compression des PDF (pdf-lib puis Ghostscript WASM) dans un worker module. |
| `navigation.js` | Arborescence de la barre latérale : ordre de lecture (`ordre`, puis titre), matières et leurs couleurs (partagées avec le graphe), dossiers pliés mémorisés, tronc commun (« SI3 › Harmonisation ») replié en une ligne. |
| `graphe.js` | Graphe sur canvas avec d3-force / d3-zoom / d3-drag (comme Quartz). |
| `lecture.js` / `editeur.js` / `admin.js` | Les vues. `lecture.js` porte aussi la révision (bouton « fait » sous chaque corrigé, carte Révision), les documents (« Ouvrir » + « Télécharger » : URL signée avec `&download=<titre>.pdf`, re-signée au clic si périmée ; bloc « Documents du cours » sous le titre sur mobile) et « Reprendre ma lecture » (`localStorage` `codex.derniere`). |
| `app.js` | Démarrage, session, routeur par `#`, recherche, accueil, graphe complet. |
| `tools/versionner.py` | `?v=<hash>` sur les assets + régénère le banc. **Après chaque modif CSS/JS.** |
| `tools/banc.html` | **Généré.** La vraie page avec `faux-supabase.js` à la place de supabase-js. |
| `tests/rls.test.mjs` | RLS et fonctions de comptes sur PGlite (vrai Postgres en WASM, avec pgcrypto). |
| `tests/e2e.test.mjs` | Toute l'interface dans Chrome headless, sur le banc. |
| `SECURITE.md` | Audit : ce qui est vérifié, corrigé, accepté ; réglages Supabase. |

## 2. Invariants de sécurité

- **Une règle d'accès vit en SQL.** Masquer un bouton côté JS est du confort, pas une protection. Toute
  table nouvelle : RLS activée, règles par opération, `revoke` pour `anon`, cas dans `rls.test.mjs`.
- Les fonctions `security definer` ont `set search_path = ''` et des noms qualifiés.
- L'identité vient de `auth.users` (e-mail **confirmé**), pas du jeton : un e-mail non confirmé n'a
  aucun droit, même s'il est dans `membres`.
- `maj_le` / `maj_par` sont posés par le déclencheur, jamais par le client.
- L'admin ne peut ni se retirer ni se rétrograder (impossible de s'enfermer dehors).
- Comptes sans e-mail : adresse technique `identifiant@codex.invalid` (domaine réservé, aucun e-mail
  ne peut y partir). Créés par les fonctions SQL `admin_*`, qui écrivent `auth.users` +
  `auth.identities` (jetons à chaîne vide, pas NULL : sinon Supabase Auth refuse la connexion).
  Aucune clé secrète nulle part.
- Le HTML des fiches ne garde `style` que dans les formules KaTeX, ni `id` ni `name`, et seulement
  des cases à cocher comme champs : voir `SECURITE.md` pour le pourquoi.
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
- **Les scripts Python en heredoc mangent les barres obliques inverses** (`\s`, `\|`, `'\'`) :
  une regex JS ou une chaîne SQL ressort fausse sans erreur. Pour du code qui en contient, utiliser
  l'outil d'édition directe, puis relire la ligne produite.
- **Le graphe maison oscillait** : remplacé par d3-force, 300 pas pré-calculés puis cadrage ; il
  arrive posé et ne bouge que quand on le touche.
- **Un canvas ne doit jamais peser sur la mise en page** : `graphe.js` le met en position absolue et
  mesure `clientWidth`. Dans le flux, il élargissait sa colonne, l'observateur de taille le voyait,
  agrandissait le canvas… (304 → 550 → 1178 px en trois secondes, graphe dessiné hors cadre).
- **`$$` dans un bloc `do $$ … $$`** : les formules LaTeX le ferment en plein milieu. Les scripts
  SQL qui insèrent du contenu utilisent un délimiteur nommé (`$exemple$`, `$md$`).
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
- **Le SVG de Mermaid ne doit jamais entrer dans le DOM** : il est converti en `<img src="data:…">`
  (`diagrammes.js`). Mermaid tourne sans étiquettes HTML (`htmlLabels: false`) et avec les polices
  système : une image SVG ne charge ni `foreignObject` fiable ni polices web, et le texte doit y
  avoir la largeur mesurée au dessin. `parse()` avant `render()`, sinon un dessin « Syntax error »
  reste orphelin au bas de la page.
- **Clé d'un exercice** (suivi « fait ») = ancre de la section qui précède + rang dans la section.
  Renommer la section fait oublier les exercices déjà cochés : ne pas changer ce calcul sans
  migrer la table `progression`.
- `versionner.py` hache les fichiers **fins de ligne ramenées à LF** : sous Windows, git extrait en
  CRLF, et sans cela chaque machine produisait d'autres `?v=` pour des fichiers identiques.
- Tests Chrome : profil jetable à chaque lancement (sinon le cache HTTP sert d'anciens fichiers),
  `--no-sandbox` sous Windows.

## 4. Avant de commiter

1. `python codex/tools/versionner.py`
2. `schema.sql` touché → `cd codex/tests && npm test`
3. JS/CSS/HTML touché → `npm run e2e` (96 vérifications, console propre attendue)
4. Les contrôles de `../CLAUDE.md` §3 (hook, identité, rien hors de `codex/`).

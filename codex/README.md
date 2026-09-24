# Codex

Les cours de la promo au même endroit, à la manière d'un jardin de notes Quartz : **une fiche par
chapitre** (résumé généré par IA, relu, en Markdown avec formules LaTeX), **toutes ses ressources à
côté** (polys, TD, annales, slides, vidéos, code), et des liens entre fiches qui dessinent le graphe
du cours. Privé, avec des comptes.

`https://bibwann.github.io/codex/`

- **Site statique** (GitHub Pages), HTML/CSS/JS vanilla, aucun build.
- **Supabase** (offre gratuite) pour les comptes, la base et les fichiers.
- **La sécurité est dans la base** (`supabase/schema.sql` : Row Level Security et fonctions réservées
  aux admins) : l'interface n'affiche que ce que la base accepte de donner. Détail et audit :
  `SECURITE.md`.

| Rôle | Lit | Écrit, dépose des fichiers | Gère les comptes |
|---|---|---|---|
| Lecteur | ✔ | | |
| Éditeur | ✔ | ✔ | |
| Admin | ✔ | ✔ | ✔ |

---

## Mise en route (une seule fois)

### 1. La base

*Supabase → SQL Editor → New query*, coller puis *Run*, dans cet ordre :

1. `supabase/schema.sql` — tables, règles d'accès, fonctions (dont la gestion des comptes).
   **Rejouable** : à relancer après chaque mise à jour de Codex, sans risque pour les données. Si
   le site affiche « La base n'est pas à jour », c'est ce fichier qu'il faut relancer.
2. Ton compte admin, avec l'adresse que tu utilises déjà pour te connecter :
   ```sql
   insert into public.membres (email, role) values ('ton.adresse@exemple.fr', 'admin')
   on conflict (email) do update set role = 'admin';
   ```
3. `supabase/accueil.sql` — la note d'accueil : l'introduction du site, premier nœud du graphe.
   Modifiable ensuite depuis le site (bouton *Modifier* sur l'accueil).
4. (Optionnel) `supabase/exemple.sql` — un petit cours fictif (maths, info) pour voir Codex avec du
   contenu. Pour l'effacer : `supabase/exemple-retirer.sql`.

### 2. Les réglages de connexion

- *Authentication → Sign In / Providers* : **désactiver « Allow new users to sign up »**. Les comptes
  ne se créent plus que depuis la page Membres. Laisser le fournisseur **Email** activé (il sert
  aussi aux mots de passe).
- *Authentication → Providers → Email* : **Minimum password length : 10**.
- *Authentication → URL Configuration* (pour la connexion par lien, facultative) : **Site URL**
  `https://bibwann.github.io/codex/`, **Redirect URLs** `https://bibwann.github.io/codex/` et
  `http://localhost:8000/codex/`.

### 3. Le site

`assets/js/config.js` : l'**URL** du projet et la clé **publishable** (*Project Settings → API*).
Elles sont publiques par conception. **Jamais la clé `sb_secret_…` / `service_role`** : le hook de
pré-commit la bloque de toute façon.

Si l'URL du projet change, la mettre aussi dans la `Content-Security-Policy` d'`index.html`
(`connect-src`) : la page refuse de parler à tout autre serveur.

### 4. Keep-alive (anti-mise en veille)

Un projet gratuit est mis en pause après **7 jours sans activité**. Le workflow
`.github/workflows/keep-alive.yml` appelle la base tous les 3 jours. Secrets à créer dans GitHub
(*Settings → Secrets and variables → Actions → New repository secret*) :

| Nom | Valeur |
|---|---|
| `SUPABASE_URL` | l'URL du projet |
| `SUPABASE_ANON_KEY` | la clé publishable |

Le cron ne tourne que depuis **`main`**. GitHub suspend les crons d'un dépôt public resté 60 jours
sans commit (il prévient par e-mail).

### 5. Créer les comptes de la promo

Page **Membres** : un identifiant par ligne (`lea.martin`, `hugo.petit`… ou une adresse e-mail),
choisir le rôle, *Créer les comptes*. Un mot de passe est généré pour chacun et affiché **une seule
fois** : *Tout copier* ou *Télécharger (.txt)*, puis transmets à chacun son identifiant, son mot de
passe et l'adresse du site. Personne ne choisit son mot de passe, pour que personne n'y mette celui
qu'il utilise ailleurs : seul un admin en tire un nouveau, pour quelqu'un d'autre (le déclencheur `mdp_verrouille` de `schema.sql`
refuse tout le reste, même un appel direct à Supabase Auth). Un mot de passe oublié : menu « ⋯ » de
la ligne → *Nouveau mot de passe*.

---

## Lire et naviguer (comme Quartz)

- **Explorateur** à gauche : le chevron plie un dossier, son nom ouvre la page du dossier.
- **Recherche** : `/` ou `Ctrl K`, avec l'aperçu du résultat à droite.
- **Documents** : chaque document s'ouvre dans un onglet ou se **télécharge** (bouton « Télécharger »,
  enregistré sous son titre). Sur téléphone, les documents du cours sont juste sous le titre.
- **Reprendre ma lecture** : l'accueil propose la dernière fiche ouverte.
- **À droite de chaque fiche** : ses ressources, le graphe des fiches voisines, le sommaire (les
  titres à l'écran restent nets) et « Cité par ».
- **Survoler** un lien vers une fiche en montre l'aperçu. **Mode lecture** (icône livre) : il ne reste
  que le texte, Échap pour revenir.
- **Tags** : `#mot` dans une fiche ; page *Tags* dans la colonne de gauche.
- **Réviser** : sous chaque corrigé, « Marquer comme fait » ; la carte *Révision* à droite compte les
  exercices faits et ouvre ou referme tous les corrigés. Le suivi est personnel : personne d'autre,
  admin compris, ne le voit.

## Importer (admins et éditeurs)

Page **Importer** (colonne de gauche), sans passer par Supabase :

- **Des fiches** : des fichiers `.md` (une fiche chacun ; titre tiré du `# Titre` ou de l'en-tête
  `title:` d'Obsidian, dont les `tags:` deviennent des #tags), un **dossier entier** (ses
  sous-dossiers deviennent des dossiers), ou un **lot Codex** (`@@ Matière / Sous-dossier`, puis des
  fiches `+++ Titre`, avec leurs liens `+ type | titre | https://…`). Un aperçu montre ce qui sera
  créé, gardé ou remplacé, et les liens `[[…]]` sans fiche ; rien n'est écrit avant « Importer ».
- **Des fichiers en lot** : PDF, TD, archives… Chacun est rattaché à une fiche, devinée d'après son
  nom ou donnée par un fichier de correspondance `.csv` choisi avec eux
  (`fichier;fiche;type;titre`). Compression et envoi comme depuis l'éditeur ; un fichier déjà présent
  dans la fiche (même titre) est ignoré.

## Écrire une fiche

1. Dans ton IA : bouton **Consigne IA** de l'éditeur → coller la consigne, puis le cours.
2. Coller la réponse dans l'éditeur (ou glisser un `.md`). Un `# Titre` en tête devient le titre.
3. Ajouter les ressources sous l'éditeur : les PDF sont compressés avant l'envoi.

| Syntaxe | Rendu |
|---|---|
| `$e^{i\pi}+1=0$` | formule dans le texte |
| `$$\int_0^1 f$$` (seule sur sa ligne) | formule centrée |
| `> [!definition] Titre` puis `> …` | callout Obsidian ; `> [!note]- Titre` le replie |
| `::: theoreme Titre` … `:::` | même chose, en bloc |
| `[[Titre d'une fiche]]` | lien vers une fiche (+ `[[Titre\|texte]]`, `[[Titre#section]]`) |
| `#maths` | tag |
| ```` ```python ```` | code coloré, lignes numérotées |
| ```` ```mermaid ```` | diagramme (flowchart, séquence, classes, états…) |
| `::: exercice Titre` … `:::` puis `::: corrige- Corrigé` … `:::` | énoncé, puis corrigé replié avec son bouton « fait » |

Le titre d'un encadré accepte du Markdown : `` ::: attention `=` n'est pas `==` ``.

Genres de callouts : `note`, `definition`, `theoreme`, `propriete`, `methode`, `exemple`, `astuce`,
`info`, `attention`, `danger`, `question`, `succes`, `echec`, `citation`, `resume`, `todo`,
`exercice`, `corrige` (et leurs
équivalents anglais d'Obsidian : `tip`, `warning`, `example`…). Raccourcis LaTeX : `\R \N \Z \Q \C \K
\P \E \Ker \Im \Vect \rg \tr \Card \ch \sh \th`.

Chaque enregistrement garde la version précédente (**Historique**, 50 versions par fiche). Si
quelqu'un a modifié la fiche entre-temps, Codex le signale au lieu d'écraser son travail.

## Fichiers et stockage

Offre gratuite : **1 Go** en tout, **50 Mo** par fichier. Avant l'envoi, dans le navigateur :
pdf-lib efface les métadonnées, puis Ghostscript (WebAssembly) réécrit le PDF avec des images à
150 dpi — mesuré : **611 Ko → 156 Ko (−75 %)** sur un rapport de 10 pages. Un fichier encore
au-dessus de 50 Mo est refusé avant l'envoi. Les fichiers sont dans un bucket **privé**, ouverts par
des liens signés d'une heure.

---

## Développement

```bash
# depuis la racine du dépôt
python -m http.server 8000
# → http://localhost:8000/codex/                       (vraie page)
# → http://localhost:8000/codex/tools/banc.html        (banc d'essai, sans Supabase)
#      ?role=admin|editeur|lecteur|intrus|deconnecte   &vide
#      mot de passe des comptes du banc : motdepasse-banc
```

Après **chaque** modification de CSS ou de JS : `python codex/tools/versionner.py`.

```bash
cd codex/tests && npm install
npm test        # RLS et comptes (vrai Postgres, PGlite)
npm run e2e     # interface complète dans Chrome headless, sur le banc
```

Guide de travail et pièges déjà rencontrés : `CLAUDE.md`. Sécurité : `SECURITE.md`.

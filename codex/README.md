# Codex

Les cours de la promo au même endroit : **un résumé par chapitre** (généré par IA, relu, en Markdown
avec formules LaTeX) au centre, et **toutes ses ressources à côté** (polys, TD, annales, slides,
vidéos, code). Réservé aux membres, avec trois rôles.

`https://bibwann.github.io/codex/`

- **Site statique** (GitHub Pages), HTML/CSS/JS vanilla, aucun build.
- **Supabase** (offre gratuite) pour les comptes, la base et les fichiers.
- **La sécurité est dans la base** (`supabase/schema.sql`, Row Level Security) : l'interface ne fait
  qu'afficher ce que la base accepte de donner.

| Rôle | Lit | Écrit, dépose des fichiers | Gère les membres |
|---|---|---|---|
| Lecteur | ✔ | | |
| Éditeur | ✔ | ✔ | |
| Admin | ✔ | ✔ | ✔ |

Un compte dont l'e-mail n'est pas dans la liste des membres ne voit **rien**, même connecté.

---

## Mise en route (une seule fois, ~15 min)

### 1. Créer le projet Supabase

1. [supabase.com](https://supabase.com) → *New project*. Région : **Europe** (Paris ou Francfort), pour
   le RGPD. Garde le mot de passe de la base dans un gestionnaire de mots de passe : Codex n'en a
   jamais besoin.
2. *SQL Editor* → *New query* → coller tout `supabase/schema.sql` → *Run*.
3. Nouvelle requête, avec **ta** vraie adresse (celle avec laquelle tu te connecteras) :
   ```sql
   insert into public.membres (email, role) values ('ton.adresse@exemple.fr', 'admin');
   ```

### 2. Régler la connexion

*Authentication → URL Configuration* :
- **Site URL** : `https://bibwann.github.io/codex/`
- **Redirect URLs** : `https://bibwann.github.io/codex/` et, pour tester en local,
  `http://localhost:8000/codex/`

*Authentication → Providers → Email* : laisser activé, avec *Confirm email*.

> ⚠️ **Limite d'envoi d'e-mails.** Le service d'e-mail intégré à Supabase n'envoie que quelques liens
> par heure : suffisant pour toi, pas pour toute une promo qui se connecte le même soir. Deux
> solutions, cumulables :
> - brancher un SMTP gratuit (Brevo, Resend…) dans *Authentication → SMTP Settings* ;
> - activer la connexion Google (voir plus bas), qui n'envoie aucun e-mail.
>
> Une fois connecté, on le reste sur cet appareil : le lien ne sert qu'à la première connexion.

### 3. Brancher le site

*Project Settings → API* : copier l'**URL** du projet et la clé **anon** (ou *publishable*) dans
`assets/js/config.js`.

La clé anon est publique par conception : c'est normal qu'elle soit dans le dépôt. **Jamais la clé
`service_role` / `secret`** : elle contourne toutes les règles. Le hook de pré-commit la bloque.

### 4. Keep-alive (anti-mise en veille)

Un projet gratuit est mis en pause après **7 jours sans activité**. Le workflow
`.github/workflows/keep-alive.yml` appelle la base tous les 3 jours.

Dans GitHub : *Settings → Secrets and variables → Actions → New repository secret*, créer :

| Nom | Valeur |
|---|---|
| `SUPABASE_URL` | l'URL du projet, ex. `https://abcdefghijkl.supabase.co` |
| `SUPABASE_ANON_KEY` | la clé anon / publishable |

Puis *Actions → Keep-alive Codex → Run workflow* pour vérifier (réponse attendue : `"ok"`).

- Le cron ne tourne que depuis **`main`** : il s'active quand la branche `codex` y est fusionnée.
- GitHub **suspend les crons** d'un dépôt public resté 60 jours sans commit (il prévient par
  e-mail avant). Un job qui échoue envoie aussi un e-mail : c'est l'alerte « projet en pause ».

### 5. (Optionnel) Connexion Google

1. [Google Cloud Console](https://console.cloud.google.com) → *APIs & Services → Credentials →
   Create OAuth client ID* (type *Web application*). *Authorized redirect URI* : l'URL de callback
   affichée par Supabase dans *Authentication → Providers → Google*.
2. Coller l'ID et le secret client **dans Supabase** (pas dans le dépôt).
3. `connexionGoogle: true` dans `assets/js/config.js`.

Le compte Google doit utiliser une adresse présente dans la liste des membres.

### 6. Inviter la promo

Page **Membres** (menu du compte) : coller la liste des adresses, une par ligne ou séparées par des
virgules, choisir le rôle, *Ajouter*. Personne ne reçoit d'e-mail : envoie-leur le lien du site, ils
se connectent avec leur adresse.

---

## Écrire une fiche

1. Dans ton IA : bouton **Consigne IA** de l'éditeur → coller la consigne, puis le cours.
2. Coller la réponse dans l'éditeur (ou glisser un `.md`). Un `# Titre` en tête devient le titre de
   la fiche.
3. Ajouter les ressources sous l'éditeur.

| Syntaxe | Rendu |
|---|---|
| `$e^{i\pi}+1=0$` | formule dans le texte |
| `$$\int_0^1 f$$` (seule sur sa ligne) | formule centrée |
| `::: definition Titre` … `:::` | encadré (aussi `theoreme`, `propriete`, `methode`, `exemple`, `astuce`, `attention`, `danger`) |
| `[[Titre d'une fiche]]` | lien vers une autre fiche (+ `[[Titre\|texte]]`, `[[Titre#section]]`) |
| ```` ```python ```` | code coloré avec bouton Copier |

Raccourcis LaTeX disponibles : `\R \N \Z \Q \C \K \P \E \Ker \Im \Vect \rg \tr \Card \ch \sh \th`.

Les liens `[[…]]` alimentent le **graphe** (page *Graphe des cours*, et mini-graphe à côté de chaque
fiche), la rubrique **Cité par**, et l'**aperçu au survol**. Un lien vers une fiche qui n'existe pas
encore s'affiche en rouge.

Chaque enregistrement garde la version précédente (**Historique**, 50 versions par fiche). Si
quelqu'un a modifié la fiche pendant que tu l'éditais, Codex le détecte et te demande quoi faire au
lieu d'écraser son travail.

## Fichiers et stockage

Offre gratuite : **1 Go** de fichiers au total, **50 Mo** par fichier.

Avant l'envoi, dans le navigateur :
1. **pdf-lib** efface les métadonnées (auteur, logiciel) et compacte la structure du PDF.
2. **Ghostscript** (WebAssembly, ~15 Mo chargés une fois) réécrit le PDF avec des images à 150 dpi.
   Mesuré sur un rapport de 10 pages : **611 Ko → 156 Ko (−75 %)**. Désactivable (case
   *Compression forte*).

Le résultat n'est gardé que s'il est plus léger. Un fichier encore au-dessus de 50 Mo est refusé
avant l'envoi ; une jauge montre le remplissage du Go. Pour les très gros documents : un lien Drive.

Les fichiers sont dans un bucket **privé** : ils ne s'ouvrent que par des liens signés valables une
heure, que seul un membre peut obtenir.

---

## Développement

```bash
# depuis la racine du dépôt
python -m http.server 8000
# → http://localhost:8000/codex/                       (vraie page, config.js requis)
# → http://localhost:8000/codex/tools/banc.html        (banc d'essai, sans Supabase)
#      ?role=admin|editeur|lecteur|intrus|deconnecte   &vide
```

Après **chaque** modification de CSS ou de JS : `python codex/tools/versionner.py` (cache navigateur
+ régénération du banc).

Tests :
```bash
cd codex/tests && npm install
npm test        # RLS sur un vrai Postgres (PGlite) — après toute modif de schema.sql
npm run e2e     # interface complète dans Chrome headless, sur le banc
```

Guide de travail détaillé (pièges déjà rencontrés) : `CLAUDE.md`.

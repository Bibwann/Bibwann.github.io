# CLAUDE.md — règles du dépôt

Dépôt `Bibwann.github.io` : le site de Bastien Nieto, servi par **GitHub Pages** depuis `main`.
Chaque projet vit dans son dossier et chaque projet a **sa branche**. Chaque dossier a son propre
`CLAUDE.md` pour le détail technique ; ce fichier-ci ne contient que ce qui vaut partout.

| Dossier | Branche | URL | Guide |
|---|---|---|---|
| `portfolio/` | `portfolio` | `bibwann.github.io/portfolio/` | `portfolio/CLAUDE.md` |
| `codex/` | `codex` | `bibwann.github.io/codex/` | `codex/CLAUDE.md` |
| `index.html`, `.githooks/`, `.github/`… | `depot` | redirige vers `portfolio/` | ce fichier |

---

## 1. Le fait qui commande tout le reste

**Le dépôt est public, et GitHub Pages publie tout ce qui est sur `main`.** Tout ce qui est commité
est lisible par n'importe qui, **pour toujours** : supprimer un fichier dans un commit suivant ne
le retire pas de l'historique. Un secret poussé doit être **révoqué**, pas seulement effacé.

---

## 2. Règles de sécurité — à vérifier avant CHAQUE commit

### Ne jamais commiter

- **La clé `service_role` / `sb_secret_…` de Supabase.** Elle contourne toute la Row Level Security :
  avec elle, n'importe qui lit, modifie et efface toute la base de Codex. Elle ne sert à rien côté
  navigateur ; si une tâche semble en avoir besoin, c'est que la conception est fausse.
- Aucun `.env`, clé privée, jeton (GitHub, OpenAI, Anthropic, Google…), mot de passe réel, URL de
  base de données avec identifiants.
- **Aucun document de cours** (polys, annales, slides des profs) : ils sont sous droit d'auteur et
  vont dans le bucket **privé** de Codex, jamais dans le dépôt.
- **Aucune donnée personnelle de tiers** : les e-mails des membres de la promo vivent dans la table
  `membres` de Supabase, jamais dans un fichier, un test, un exemple ou un message de commit.
- Aucun fichier de plus de 50 Mo.

### Ce qui est public par construction (et c'est normal)

- L'URL du projet Supabase et la clé **anon / publishable** (`codex/assets/js/config.js`). Elles
  identifient le projet ; ce qui protège les données, c'est la RLS de `codex/supabase/schema.sql`.

### Où vit la sécurité de Codex

- **Toute règle d'accès est en SQL (RLS), jamais seulement en JS.** Masquer un bouton ne protège
  rien : un utilisateur peut appeler l'API à la main avec sa session.
- Toute nouvelle table : `enable row level security` + règles explicites par opération + `revoke`
  pour `anon`, et un cas de test dans `codex/tests/rls.test.mjs`. Lancer ce test avant de commiter
  une modification de `schema.sql`.
- Toute fonction SQL `security definer` : `set search_path = ''` et noms entièrement qualifiés.
- Le seul HTML injecté dans la page est celui des fiches, et il passe par DOMPurify
  (`codex/assets/js/rendu.js`). Partout ailleurs : `textContent`, jamais `innerHTML` avec une donnée.
- Scripts externes : **version épinglée + `integrity` SRI + domaine autorisé par la CSP** de
  `codex/index.html`. Pas de script chargé depuis un domaine non listé.

### Identité des commits

- `git config user.email` doit être l'adresse **noreply** GitHub
  (`156775586+Bibwann@users.noreply.github.com`). L'adresse de la fac apparaît déjà dans d'anciens
  commits publics : ne pas en ajouter.

### Le contrôle automatique

- Hook de pré-commit : `.githooks/pre-commit` → `.githooks/scan-secrets.sh`. **À activer une fois par
  clone** : `git config core.hooksPath .githooks`. Il bloque les secrets connus, les jetons JWT
  autres que la clé anon (décodés pour lire leur rôle), les fichiers sensibles et les fichiers
  trop lourds.
- **Ne jamais utiliser `--no-verify`.** Si le hook signale un faux positif, vérifier que ce n'en est
  vraiment pas un, puis l'ajouter à `.githooks/faux-positifs.txt` avec un commentaire qui explique
  pourquoi.
- La CI (`.github/workflows/securite.yml`) rejoue le même contrôle sur chaque push et chaque PR.
- Workflows GitHub : `permissions:` minimales, actions tierces **épinglées par SHA**, secrets
  uniquement via *Settings → Secrets and variables → Actions*, jamais en clair dans le YAML.

---

## 3. Branches et commits

- **`main` = production.** Tout ce qui y arrive est en ligne dans la minute. On n'y commite pas
  directement : on travaille sur la branche du projet, puis on fusionne (PR de préférence).
- **Une branche par projet**, du nom du dossier : `portfolio`, `codex`. Un nouveau projet = un
  nouveau dossier à la racine + une nouvelle branche du même nom + une ligne dans le tableau
  ci-dessus. Une branche ne touche **que son dossier**.
- **Ce qui concerne tout le dépôt** (ce fichier, `.githooks/`, `.github/workflows/securite.yml`,
  `.gitignore`, `.gitattributes`, la redirection racine) se fait sur la branche **`depot`**,
  fusionnée dans `main`, puis récupérée par les branches de projet (`git merge main`).
  Exception : un workflow propre à un projet vit sur la branche de ce projet (ex. `keep-alive.yml`, le keep-alive de Codex).
- Les workflows planifiés (`schedule:`) ne tournent que depuis `main` : un cron sur une branche
  de projet reste inactif tant qu'il n'est pas fusionné.
- Chemins **relatifs** partout : chaque site vit dans un sous-dossier, un `/assets/...` absolu casse.
- Messages de commit en français, au format de l'historique : `projet vX.Y : résumé` ou
  `fix : …` / `doc : …`, puis le détail en puces.
- Pas de `push --force` sur `main`. Pas de réécriture d'historique sans accord explicite de Bastien.
- Ne commiter et ne pousser que sur demande.

### Avant chaque commit

1. `git status` et `git diff --cached` relus : aucun fichier hors du projet, aucun fichier de test
   ou de capture oublié.
2. Le hook passe (il tourne tout seul — s'il ne s'affiche pas, `core.hooksPath` n'est pas réglé).
3. Codex : `schema.sql` modifié → `node codex/tests/rls.test.mjs` passe.
4. CSS ou JS modifié → le script de versionnage du projet a été relancé (cache navigateur).

# Audit de sécurité de Codex

Date : 23 septembre 2026 · Périmètre : `codex/` (front, `supabase/schema.sql`),
réglages Supabase recommandés, workflows GitHub du dépôt.

## Modèle de menace, en bref

- **Ce qu'on protège** : le contenu des cours (dont des documents sous droit d'auteur), la liste des
  comptes de la promo, l'intégrité des fiches.
- **Qui peut attaquer** : n'importe qui sur Internet (le site et le dépôt sont publics, la clé
  publishable aussi) ; un compte lecteur curieux ; un contenu piégé collé dans une fiche.
- **Ce qui est fait confiance** : les admins et, dans une moindre mesure, les éditeurs (ils écrivent
  le contenu que les autres lisent).
- **Principe** : toute règle d'accès est vérifiée par la base (Row Level Security et fonctions qui
  contrôlent l'appelant), jamais seulement par l'interface.

## Vérifié et couvert par des tests

| Point | Où | Test |
|---|---|---|
| Un visiteur non connecté ne lit rien (tables, fonctions, fichiers) | RLS + `revoke … from anon` | `rls.test.mjs` |
| Un compte non autorisé ne voit rien, même connecté | `role_courant()` + RLS | `rls.test.mjs` |
| Un e-mail non confirmé n'hérite d'aucun droit | `email_courant()` lit `auth.users` | `rls.test.mjs` |
| Lecteur : lecture seule, pas d'historique, pas de dépôt de fichier | RLS | `rls.test.mjs` |
| Personne ne peut signer une modification au nom d'un autre | déclencheur `maj_par` | `rls.test.mjs` |
| L'historique ne peut pas être falsifié | aucune règle d'écriture sur `revisions` | `rls.test.mjs` |
| Un admin ne peut pas se retirer ni se rétrograder | RLS de `membres` | `rls.test.mjs` |
| Deux éditeurs ne s'écrasent pas en silence | verrou optimiste sur `maj_le` | `rls.test.mjs`, `e2e` |
| Comptes créés, réinitialisés, supprimés par un admin seulement | fonctions `admin_*` (`security definer`, appelant vérifié) | `rls.test.mjs` |
| Mots de passe hachés en bcrypt coût 10, jamais stockés ni renvoyés en clair | `admin_creer_compte`, `admin_mot_de_passe` | `rls.test.mjs` |
| `auth.users` illisible depuis une session | droits Supabase | `rls.test.mjs` |
| Aucune clé secrète nulle part : ni navigateur, ni dépôt, ni fonction serveur | conception + hook de pré-commit | `.githooks` |
| Contenu de fiche : pas de script, de `on*`, de `javascript:`, d'iframe | DOMPurify + KaTeX `trust: false` | `e2e` |
| Scripts CDN intègres | versions épinglées + SRI, bibliothèques du worker vérifiées par `fetch(…, { integrity })` | `e2e` (chargement sous CSP) |

## Corrigé lors de cet audit

| # | Gravité | Problème | Correction |
|---|---|---|---|
| 1 | Moyenne | Un attribut `style` dans une fiche pouvait poser un bloc `position: fixed` par-dessus l'interface (faux écran de connexion, faux bouton). | `style` n'est gardé que dans les formules KaTeX (`rendu.js`, crochet DOMPurify). Testé. |
| 2 | Moyenne | Le bucket acceptait tout type de fichier, dont HTML et SVG, qui peuvent exécuter du script quand on ouvre le lien. | Liste blanche de types MIME sur le bucket (`schema.sql`). Testé. |
| 3 | Faible | Le lien magique créait un compte pour n'importe quelle adresse saisie (sans accès aux cours, mais en remplissant `auth.users`). | `shouldCreateUser: false` ; les comptes ne se créent plus que par un admin. Désactiver aussi les inscriptions dans Supabase (voir plus bas). |
| 4 | Faible | CSP : `connect-src` autorisait n'importe quel projet `*.supabase.co`. | Restreint au seul projet de Codex, `worker-src 'self'` ajouté. |
| 5 | Faible | Clickjacking : GitHub Pages ne permet pas l'en-tête `frame-ancestors`. | Détection d'encadrement dans `theme.js` : la page se masque et sort du cadre. |
| 6 | Faible | « DOM clobbering » : un `id`/`name` dans une fiche pouvait masquer un élément de l'application. | `id` et `name` retirés du HTML des fiches ; les ancres des titres sont posées après. Testé. |
| 7 | Faible | Champs de saisie (`<input type=text>`) admis dans une fiche : faux formulaire possible. | Seules les cases à cocher restent, désactivées. Testé. |
| 8 | Info | Mots de passe générés avec un léger biais (modulo). | Tirage par rejet, sans biais. |

## Risques acceptés (et pourquoi)

- **Jetons de session dans `localStorage`** (comportement de supabase-js) : une faille XSS les
  exposerait. Défense : DOMPurify, CSP stricte sur les scripts, pas d'`innerHTML` hors du rendu.
- **Images externes dans les fiches** (`img-src https:`) : un éditeur pourrait insérer une image-espion
  qui révèle l'adresse IP des lecteurs. Les éditeurs sont des personnes de confiance ; restreindre
  casserait les schémas pris sur le web.
- **Quota de 1 Go non imposé côté serveur** : un éditeur pourrait remplir le stockage (50 Mo par
  fichier au plus). La jauge de la page Membres le rend visible.
- **Police Google Fonts sans SRI** : impossible (feuille générée à la volée). Une feuille CSS ne peut
  pas exécuter de script sous cette CSP.
- **Dépôt public** : le banc d'essai et les tests y sont visibles ; ils ne contiennent que des données
  fictives. Aucune clé secrète n'est dans le dépôt (hook + CI).
- **Écriture directe dans `auth.users`** par les fonctions `admin_*` : c'est la méthode des scripts de
  « seed » de Supabase, mais elle dépend de la structure interne de Supabase Auth. Si une mise à jour
  de Supabase la change, la création de comptes échouera avec un message d'erreur (sans rien casser
  d'autre) et `schema.sql` sera à adapter. Alternative sans cette dépendance : une Edge Function avec
  la clé secrète, écartée pour ne rien avoir à déployer.
- **Adresse de la fac** dans d'anciens commits publics : effaçable seulement en réécrivant
  l'historique.

## Réglages Supabase à faire (tableau de bord)

1. **Authentication → Sign In / Providers → « Allow new users to sign up » : désactivé.** Les comptes
   ne se créent plus que depuis la page Membres. Laisser le fournisseur
   **Email** activé : il sert aussi à la connexion par mot de passe.
2. **Authentication → Providers → Email → Minimum password length : 10.**
3. **Compte GitHub** (qui ouvre le tableau de bord Supabase) : double authentification activée.
4. Ne jamais copier la clé `service_role` / `sb_secret_…` nulle part : Codex n'en a pas besoin.

## À refaire après chaque évolution

`cd codex/tests && npm test` (RLS + comptes) puis `npm run e2e`. Toute nouvelle table ou
fonction SQL : un cas de test dans `rls.test.mjs` avant de commiter.

# CLAUDE.md

Guide de travail pour ce dépôt. Écrit en français, comme les commentaires du code et
`tools/README.md`.

---

## 1. Ce que c'est

Portfolio personnel de **Bastien Nieto** (`bibwann.github.io/portfolio/`) — développeur fullstack et
intégrateur d'IA.

**Le site vit dans `portfolio/`**, pas à la racine du dépôt. La racine ne contient qu'un
`index.html` qui redirige vers `portfolio/`. Tous les chemins du site sont relatifs : ne jamais
introduire de chemin absolu (`/assets/...`), il casserait sous `/portfolio/`. Les commandes
ci-dessous se lancent **depuis `portfolio/`**.

**Site statique** : pas de build, pas de bundler, pas de `package.json` à la racine. Du HTML, du CSS
et du JS vanilla, servis tels quels. La signature du site est un **système solaire Three.js** que le
visiteur traverse au scroll pendant qu'il lit le portfolio. Bilingue **FR (défaut) / EN**. Esthétique
cyberpunk / spatiale.

```bash
python -m http.server 8000      # depuis portfolio/, puis http://localhost:8000
# ou depuis la racine du dépôt, pour reproduire l'URL de prod : http://localhost:8000/portfolio/
```

Ouvrir `index.html` en `file://` casse l'i18n : le `fetch()` des JSON de langue exige une origine
HTTP. Toujours passer par un serveur.

---

## 2. Les trois réflexes qui évitent de perdre une soirée

Ces trois scripts ne sont pas optionnels. Chacun existe parce que son absence a déjà coûté du temps.

### `python tools/versionner.py` — après CHAQUE modification de CSS ou de JS

Estampille les CSS/JS locaux d'`index.html` avec `?v=<hash de contenu>`. Sans ça, le navigateur sert
l'**ancienne** feuille de style et on croit que le travail n'a pas été fait : styles absents,
animations muettes, alors que le fichier sur le disque est bon. C'est exactement ce qui s'est passé
avec la section Ambition et le système d'entrées — du temps perdu à chercher un bug de CSS qui
n'existait pas.

Même logique pour les images : quand on remplace une photo, **on la renomme** (`portrait-2026.jpg`)
au lieu d'écraser le fichier existant.

### `python tools/generer_langues.py` — après toute chaîne visible ajoutée ou modifiée

`fr.json` et `en.json` sont **générés** depuis un dictionnaire unique dans le script. On ne les édite
jamais à la main. Le script refuse d'écrire si le jeu de clés ne correspond pas exactement aux
`data-i18n` d'`index.html` (plus `typed-items` et `archive_close`, que seul le JS lit) et liste les
clés manquantes et orphelines. **233 clés** aujourd'hui.

Le texte écrit en dur dans le HTML sert de repli si le JS échoue : il doit rester cohérent avec le
dictionnaire, pas être un résidu de la version précédente.

### `python tools/generer_vignettes.py` — après tout ajout de projet

Produit les **18 vignettes SVG** de `assets/img/thumbs/`. Toutes partagent le même squelette (fond
spatial, grille fine, halo d'accent, arc d'horizon, équerres d'angle) ; seules la couleur d'accent et
la figure centrale changent. C'est ce squelette commun qui fait tenir la grille de projets ensemble —
**en ajouter une à la main casserait l'harmonie**. Pour un nouveau projet : écrire `m_<nom>(a)`,
l'ajouter à `PROJECTS`, relancer.

---

## 3. Structure

```
index.html              page unique, toutes les sections
assets/
  css/main.css          tous les styles
  js/                   ~3 000 lignes, détail ci-dessous
  lang/fr.json en.json  GÉNÉRÉS — ne pas éditer à la main
  showcase/             8 démos autonomes (section Créations)
  img/thumbs/           18 vignettes SVG GÉNÉRÉES
  img/space/            textures des planètes, Voie lactée, étoiles
  files/                CV, archives téléchargeables des projets
  vendor/               Bootstrap, Bootstrap Icons, Typed.js, Waypoints, PureCounter
tools/                  les trois générateurs + deux harnais de capture
(racine du dépôt)       index.html de redirection vers portfolio/ — rien d'autre
```

Dans `index.html`, tout est sur une seule page. Le canvas 3D, la couche d'étiquettes spatiales
(`#space-labels`), le HUD (`#stellar-hud`), le chat de Nano (`#nano-chat`) et les deux modales
(`#modale-projet`, `#modale-site`) sont regroupés en bas du fichier.

### Les fichiers JS, par poids

| Fichier | Lignes | Rôle |
|---|---|---|
| `solar-system.js` | 1814 | **Le gros morceau.** Scène Three.js : Soleil et planètes texturés, anneaux d'orbite, ceintures d'astéroïdes et de Kuiper, champ d'étoiles et Voie lactée, navigation de caméra, clic par raycast, télémétrie du HUD, étiquettes 2D. |
| `ai-console.js` | 467 | **Nano**, le micro-chat du drone. Base de faits + petit LLM local. Voir §7. |
| `gallery.js` | 294 | Filtres de la grille de projets, dépliage de l'archive, fiche projet en modale, aperçus des créations (recyclés) et visionneuse plein écran. |
| `main.js` | 158 | Interactions de page (menu, scroll-top, Typed.js, compteurs). |
| `cyber.js` | 113 | Effets cosmétiques. |
| `lang.js` | 78 | Chargeur i18n : lit `localStorage.lang` (défaut `fr`), va chercher le JSON, remplace tous les `[data-i18n]`. |
| `reveal.js` | 71 | Entrées de contenu. Voir §6. |

**Vendors** : seuls Bootstrap (CSS + JS), Bootstrap Icons, Typed.js, Waypoints et PureCounter sont
chargés. AOS, Isotope, imagesLoaded, glightbox, swiper et php-email-form ont été **supprimés** (ils
n'étaient plus appelés) — ne pas les réintroduire. Three.js r128 et OrbitControls
viennent d'un CDN.

---

## 4. Le système solaire

### Correspondance section ↔ planète

`Soleil = Accueil`, puis Mercure→À propos, Vénus→Parcours, Terre→Chiffres, **Mars→Ambition**,
Jupiter→Projets, Saturne→Créations, Uranus→Passions, Neptune→Contact. **Pluton n'est pas une
station** du voyage.

⚠️ Trois tableaux doivent rester cohérents dans `solar-system.js` :
- `sectionIds` — accueil + les sections visitées, dans l'ordre du DOM (**9** aujourd'hui) ;
- `planetStationIndices` — une planète par section hors accueil (**8**), en distance croissante ;
- `sectionSelectors` — une entrée par planète cliquable.

`sectionIds` fait toujours **un de plus** que `planetStationIndices`. Ajouter ou retirer une section
impose de toucher aux trois.

### Conventions du modèle

- **L'échelle n'est volontairement pas physique.** Les tailles et distances (`r`, `d` dans
  `planetDefs`) sont compactes et artistiques pour que les corps restent visibles et cliquables. Ne
  pas « corriger » ça vers une échelle en UA réelles : c'est une décision produit.
- **Deux contextes seulement** : le `voyage` piloté au scroll, et l'explorateur libre qui cadre tout
  le système. Un bouton du HUD entre dans l'explorateur, un bouton retour remonte d'un cran
  (inspection → vue d'ensemble → voyage).
- **Le voisinage stellaire a été retiré** (Alpha Centauri, Sirius, Barnard, TRAPPIST-1 aux vraies
  distances interstellaires) : il faisait inachevé à côté du reste, −957 lignes. Son retrait a permis
  de ramener le plan lointain de la caméra de **130 000 à 24 000 unités** et `maxDistance` de 130 000
  à 16 000. C'est de cette marge que dépend la précision du depth buffer, donc la stabilité du fond
  étoilé : **ne pas la remonter** sans raison.
- **La caméra est une seule interpolation adoucie.** Position, cible de regard et FOV sont
  interpolés ensemble avec un unique `t` sur une durée fixe. Les orbites sont figées pendant une
  inspection pour que la caméra se pose. C'est ce qui empêche le site de donner la nausée : **ne pas
  réintroduire** des vitesses séparées pour la position et le regard, ni un reciblage à chaque frame
  contre une planète qui continue de tourner.
- `prefers-reduced-motion` est respecté (coupes franches au lieu de longs panoramiques).
- Le HUD démarre **replié** : une petite pastille radar en bas à gauche, qui se déplie au clic.
  Déplié par défaut, il mangeait tout le coin de l'écran.

### Le fond étoilé, mesuré

- **Les halos sont en cloche, pas linéaires.** `texHalo(rgb, alphaCoeur, alphaTraine)` construit un
  dégradé radial à cœur exponentiel serré et longue traîne en loi de puissance. L'ancien
  `radialTexture()` à trois arrêts avait un bord visible à mi-rayon : c'est ce qui faisait lire le
  Soleil et les nébuleuses comme des pastilles collées sur le ciel.
- Le Soleil porte en plus un sprite `limbe` à peine plus large que sa sphère. Un `MeshBasicMaterial`
  donne à la sphère une silhouette mathématiquement nette ; ce halo la dissout et masque au passage
  la couture verticale de la texture.
- **La bande de Voie lactée a besoin de sa couche de brume.** Quatre couches de points, de la plus
  large et diffuse (`bandWidth` 0.52, 16 000 points) à la plus fine et brillante. Retirer la couche
  large et la bande redevient une rayure horizontale nette en travers de l'écran.
- Le Soleil est juste derrière le titre de l'accueil : la couronne externe est gardée **large, faible
  et peu saturée**. Un orange franc étale un voile brun sur le titre.

---

### Budget de rendu

- Densité de rendu plafonnée à **1.5x** (1x sur mobile), MSAA coupé dès 1.5x de densité.
- **Qualité adaptative** (`ajusterQualite`) : toutes les ~2 s, si l'image moyenne dépasse 24 ms la
  densité baisse d'un cran (0.25, plancher 0.75) ; sous 18 ms elle remonte.
- Boucle plafonnée à **~60 i/s** (les écrans 120/144 Hz doublaient le travail) ; le lissage caméra
  est en `dt`, donc indépendant de la cadence.
- Rendu **suspendu** tant que `body.modale-ouverte` : la modale recouvre le canvas.
- Télémétrie du HUD écrite **seulement quand il est déplié** ; classes de section touchées
  seulement quand la section change.
- Sphères en 64 segments (40 sur mobile). Textures en **JPEG** (~1,5 Mo au total contre ~7 Mo en PNG).

## 5. Lisibilité au-dessus du canvas

**Ne jamais mettre de `backdrop-filter` sur un bloc de contenu posé sur le canvas.** Mesuré sur le
panneau À propos : à 94 % d'opacité de fond, le disque du Soleil traversait encore à
`rgb(211,183,105)` — donc *par-dessus* le panneau. Retirer le seul `backdrop-filter` a fait tomber le
même pixel à `rgb(26,24,31)`.

Un élément qui déclare `backdrop-filter` passe dans sa propre couche de composition, et le canvas
WebGL fixe (`z-index:-2`) finit composité au-dessus de son fond. Les blocs de contenu utilisent donc
un fond opaque. Le filtre n'est gardé que sur l'en-tête et la pastille du HUD, où il fonctionne.
Les cartes de contact avaient ce défaut ; elles sont passées en fond opaque.

C'est aussi une question de **coût** : le canvas étant redessiné à chaque image, chaque
`backdrop-filter` visible par-dessus refait un flou gaussien de sa surface à chaque image. Les
derniers (Chiffres, pied de page, logos IA, boutons de l'accueil…) sont coupés dans la section
« PERFORMANCE » en fin de `main.css`. N'animer que `transform`/`opacity`/`translate` : le drone
Nano animait `right` en boucle, ce qui relançait la mise en page à chaque image.

Deuxième piège, corrigé : les blocs de contenu étaient `opacity: 0` tant que leur section n'était pas
la section « active » du voyage. Le moindre décalage dans le calcul du segment de scroll les laissait
invisibles pour de bon. Ils sont visibles par défaut ; seule l'entrée lumineuse de la section active
subsiste.

---

## 6. Les entrées de contenu (`reveal.js`)

AOS a été retiré. Il déclenchait le **même `fade-up` sur les 26 blocs** de la page : tout arrivait du
même côté, au même rythme, et ça finissait par sentir la transition PowerPoint.

À la place, un seul `IntersectionObserver`. Chaque bloc déclare d'où il vient :

```html
<div data-reveal="left | right | up | scale | tilt" data-reveal-delay="90">
```

- Les distances restent courtes (28–54 px) : au-delà, l'œil suit le déplacement au lieu de lire.
- Courbe longue en sortie (.62 s / .72 s) : c'est ce qui donne le glissé.
- L'entrée est jouée **une seule fois** (l'observateur se désabonne) — un bloc déjà vu ne rejoue pas
  quand on remonte. C'est la différence entre « animé » et « agité ».
- Sans délai explicite, les voisins immédiats s'échelonnent pour que les grilles se remplissent en
  cascade, de haut en bas de l'écran et non dans l'ordre du DOM.
- `prefers-reduced-motion` désactive tout : les blocs sont simplement là.

Seuls `transform` et `opacity` sont animés — jamais de `filter: blur()` sur une page qui porte déjà
un canvas WebGL plein écran.

---

## 7. Nano, le micro-chat

Un vrai **Qwen2.5-0.5B** qui tourne dans le navigateur du visiteur via WebLLM / WebGPU. Rien n'est
envoyé à un serveur — ce qui est aussi une démonstration en soi, cohérente avec le discours du site.

### Les faits d'abord, le modèle ensuite

Un modèle de 0,5 B livré à lui-même sur une question factuelle **invente** (« Aegis aide les
entreprises à intégrer de l'IA ») et **perd la troisième personne** (« Je suis Bastien Nieto »). Les
deux ont été observés en conditions réelles. Aucune reformulation de prompt ne règle ça à cette
taille.

Le pipeline est donc :

1. **Salutation ?** → réponse écrite qui présente Nano. Passée au modèle, elle donnait « Bonjour !
   Comment puis-je vous aider ? », la phrase de n'importe quel assistant générique.
2. **Un fait correspond ?** → la fiche est servie **mot pour mot**. `FAITS` contient 13 fiches
   bilingues : Aegis, UnderGears, Cerber, l'entreprise, les créations, la stack, le parcours, les
   projets, les passions, le contact, qui est Bastien, qui est Nano, comment naviguer.
3. **Sinon** → le modèle, avec une `consigne()` de cinq lignes (et non la fiche complète, qu'il
   noyait), deux échanges d'exemple qui l'ancrent à la troisième personne, `temperature 0.2`, et
   `sortieSuspecte()` qui **jette la génération** si elle glisse à la première personne, fait moins
   de 25 caractères, ou répond dans la mauvaise langue.

### Le moteur de recherche de faits mérite sa complexité

Deux corrections venues d'échecs réels :

- **Aplatissement de la saisie** (accents, apostrophes, ponctuation) : les visiteurs tapent « tu est
  qui » et « c koi ». Le mot-clé `"tu es qui"` ne matchait pas « tu est qui », donc la question
  partait au modèle, qui inventait.
- **`PRIORITES` d'abord, puis un score pondéré par la longueur du mot-clé.** Le simple comptage de
  sous-chaînes faisait répondre la biographie de Bastien à « et toi qui est tu ? » : `"qui est"`
  (fiche Bastien) et `"toi"` (fiche Nano) faisaient 1 point chacun, et c'est l'ordre du tableau qui
  tranchait.

Routage vérifié sur 21 formulations : 21/21. **Quand le contenu du site change, mettre `FAITS` à
jour** — c'est la seule source dont Nano parle.

---

## 8. La section Créations

**Huit démos autonomes**, chacune dans un *format* différent — pas seulement une palette différente :

| Fichier | Marque | Format |
|---|---|---|
| `maison-lumiere.html` | Maison Lumière | Vitrine éditoriale + **moteur de réservation** (couverts, jour, service, créneaux réellement disponibles) |
| `ironhaus.html` | IRONHAUS | **Planning de cours** hebdomadaire, places qui décrémentent, liste d'attente |
| `cabinet-verlaine.html` | Verlaine & Associés | **Parcours de qualification** en 4 étapes : oriente le dossier, motive une fourchette d'honoraires, pose le RDV |
| `nova-studio.html` | NOVA | **Boutique** : filtres, tailles en rupture, panier, seuil de livraison, tunnel en 3 étapes |
| `flux-saas.html` | Flux | **Tableau de bord** : KPI, graphes SVG, table triable, sélecteur de période qui recalcule tout |
| `atelier-mesure.html` | Atelier Mesure | **Configurateur** : aperçu SVG paramétré + devis ligne à ligne + délai de fabrication |
| `revue-latitude.html` | Latitude | **Lecture longue** : progression, sommaire qui suit la section lue, notes en marge |
| `clef-immobilier.html` | CLEF | **Recherche d'annonces** : filtres combinables, tri, favoris, carte liée à la liste |

Règles :
- **Un fichier HTML, zéro librairie.** Les visuels sont du SVG inline, jamais des bitmaps.
- **Tout est inventé** et la copie du site le dit : marques, textes, prix, disponibilités. Aucune de
  ces entreprises n'existe.
- **Le but de la section est l'étendue.** En ajouter une n'a de sens que si elle apporte un format
  que les autres ne couvrent pas. Une collection de plaquettes dans des couleurs différentes est
  exactement ce que cette section a été refaite deux fois pour cesser d'être.
- **Maths de la grille** : 6 colonnes, les cartes normales occupent 2, les larges 3. Un compte qui
  tombe juste est donc 6 normales + 2 larges (trois lignes pleines).

### Les aperçus sont recyclés, pas seulement paresseux

Les vignettes sont les **vrais sites**, rendus en 1280 × 860 dans une iframe puis mis à l'échelle.
Huit documents complets, chacun avec ses propres polices distantes et son propre JS, par-dessus une
scène WebGL à 60 i/s : la page entière ramait.

`gallery.js` n'en garde donc que **`PLAFOND` = 3 allumées** à la fois, les plus proches du centre de
l'écran. Les autres voient leur `src` retiré — ce qui détruit le document, arrête son JS et libère
ses polices — et se rallument seules au retour. Une carte éteinte reçoit `.en-veille` et affiche un
fond teinté de sa couleur, sinon elle vire au blanc franc au milieu d'une page noire.

---

## 9. La section Projets

**Trois rangs, et seulement trois.** Un nouveau projet appartient à l'un des trois : résister à
l'envie d'inventer une quatrième forme.

1. **Les phares** (3) — Aegis, UnderGears, Cerber, en grand format avec points détaillés.
2. **Les aboutis** (10) — grille strictement uniforme.
3. **L'archive** (5) — travaux d'école, repliée par défaut, le plus ancien date de 2018.

---

## 10. Le contenu : ce qui est vrai, ce qui ne l'est pas encore

Deux endroits où la formulation doit rester exacte. C'est le genre de dérive qui se répare mal une
fois qu'un recruteur a lu la page.

- **Cerber est un cahier des charges, pas un produit.** C'est un outil de vie privée conçu mais pas
  écrit. La page le dit dans sa propre copie (badge `EN CONCEPTION`, « ce n'est pas encore du code »)
  et la fiche de Nano porte la même consigne. **Ne jamais laisser la copie glisser vers le passé
  composé.**
- **L'entreprise est en préparation, pas immatriculée.** La section Ambition (Mars) porte le projet :
  conseil en IA locale et souveraine pour les entreprises, le conseil d'abord puis la construction,
  le RGPD comme contrainte d'architecture de départ. Même règle sur les temps.

Trois endroits doivent rester cohérents entre eux : la copie HTML/JSON, la table `FAITS` de
`ai-console.js`, et les compteurs de la section Chiffres.

Le compteur « Projets réalisés » vaut **18** : 3 phares + 10 aboutis + 5 archivés. Tranché avec
Bastien — le périmètre est la section Projets seule, les 8 démos de Créations ont leur propre
compteur et ne s'y ajoutent pas. Ajouter un projet à l'un des trois rangs impose donc d'incrémenter
`data-purecounter-end` dans la section Chiffres.

---

## 11. Conventions de code

- **JS vanilla, aucun framework, aucune transpilation.** Coller au style existant : IIFE + DOM brut.
- **Commentaires en français**, et ils expliquent *pourquoi*, pas *quoi*. Les commentaires qui
  comptent dans ce dépôt sont ceux qui documentent un piège mesuré (le `backdrop-filter`, le plan
  lointain de la caméra, le plafond d'iframes). Ne pas les supprimer en refactorisant.
- **Toute chaîne visible** passe par le dictionnaire de `generer_langues.py` et un `data-i18n` — et
  jamais par une édition directe des JSON.
- Les couleurs et les rayons viennent des variables CSS de `:root`. Pas de valeur en dur quand un
  token existe.

---

## 12. Les outils (`tools/`)

Détail complet dans `tools/README.md`. En résumé :

| Fichier | Rôle |
|---|---|
| `versionner.py` | Estampille `?v=<hash>` sur les CSS/JS. **Après chaque modif.** |
| `generer_langues.py` | Génère `fr.json` + `en.json` et vérifie l'alignement avec le HTML. |
| `generer_vignettes.py` | Génère les 18 vignettes SVG des projets. |
| `apercu.html` | Cadre une section précise pour une capture (le site est un long scroll, une ancre `#` ne suffit pas). |
| `essai.html` | Rejoue une séquence de clics dans une démo, pour vérifier qu'un panier ou une réservation marche vraiment. |

---

## 13. Tester en Chrome headless : quatre pièges mesurés

1. **`--user-data-dir` garde le cache HTTP entre deux lancements.** Après une modif de CSS ou d'une
   démo, on re-capture l'ancienne version sans s'en apercevoir. Utiliser un profil jetable par
   capture, puis le supprimer.
2. **`--virtual-time-budget` n'avance pas les transitions CSS** : les captures attrapent les éléments
   à mi-fondu. Injecter `*{transition:none!important;animation:none!important}` avant de capturer,
   ou chasser des bugs d'opacité fantômes.
3. **Le même `--virtual-time-budget` avale le temps bien plus vite que l'horloge** : un `setTimeout`
   de 900 ms peut s'exécuter *avant* qu'un événement `scroll` natif ne soit distribué, et un
   garde-fou basé sur `Date.now()` expire instantanément. Avant de conclure qu'un code lié au scroll
   est cassé, émettre l'événement à la main (`window.dispatchEvent(new Event('scroll'))`) — c'est ce
   qui faisait croire que les aperçus des créations ne se chargeaient jamais.
4. **Sous Windows la fenêtre a une largeur minimale d'environ 500 px** : `--window-size=390,844` rend
   en réalité à `clientWidth = 494`, ce qui ressemble exactement à un débordement horizontal. Pour
   tester les petits écrans, mettre la page dans une iframe de largeur fixe à l'intérieur d'une
   fenêtre plus large, et recadrer la capture.

Ajouter `--no-sandbox` : sans ce drapeau, Chrome headless échoue à écrire le fichier de capture
(« Accès refusé ») dans cet environnement.

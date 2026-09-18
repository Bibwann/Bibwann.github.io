# Outils

Tous à lancer **depuis la racine du dépôt**.

## `versionner.py` — à relancer après CHAQUE modif de CSS ou de JS

```bash
python tools/versionner.py
```

Estampille les `assets/css/*.css` et `assets/js/*.js` d'`index.html` avec un
`?v=<hash de contenu>`. Le site est servi en statique (serveur local puis
GitHub Pages) : sans cette estampille, le navigateur garde `main.css` en cache
et continue d'afficher l'**ancienne** feuille de style après une modification.
On croit alors que le style est cassé, ou qu'une animation ne marche pas, alors
que le fichier sur le disque est bon — ça a déjà coûté une soirée.

Le hash vient du contenu : un fichier inchangé garde son `?v=`, donc le cache
continue de servir ce qui n'a pas bougé. Même logique pour les images : quand
on remplace une photo, **on la renomme** (`portrait-2026.jpg`) plutôt que
d'écraser le fichier existant.

## `generer_vignettes.py`

Produit `assets/img/thumbs/*.svg`, une vignette par projet.

```bash
python tools/generer_vignettes.py
```

Toutes les vignettes partagent le même squelette (fond spatial, grille fine,
halo d'accent, arc d'horizon, équerres d'angle) ; seules la couleur d'accent et
la figure centrale changent. C'est ce squelette commun qui fait tenir la grille
de projets ensemble — **ajouter une vignette à la main casserait l'harmonie**.
Pour un nouveau projet : écrire une fonction `m_<nom>(a)` et l'ajouter à la
liste `PROJECTS`, puis relancer le script.

## `generer_langues.py`

Produit `assets/lang/fr.json` et `assets/lang/en.json` depuis un dictionnaire
unique.

```bash
python tools/generer_langues.py
```

Les deux fichiers sortent forcément avec le même jeu de clés. Le script
**refuse d'écrire** si ce jeu ne correspond pas exactement aux attributs
`data-i18n` d'`index.html` (plus `typed-items` et `archive_close`, que seul le
JS lit) : il liste alors les clés manquantes et les clés orphelines. Toute
nouvelle chaîne visible passe donc par ce dictionnaire, jamais par une édition
directe des JSON.

## `apercu.html` — capturer une section précise

Le site est un long voyage scrollé : un `#ancre` ne suffit pas à cadrer une
section pour une capture. Cette page charge `index.html` dans une iframe de
taille fixe, coupe les transitions, force les blocs à leur état révélé, puis
défile jusqu'à la section demandée.

```
http://localhost:8000/tools/apercu.html?s=ambition&h=1400&w=1440
```

`s` = id de section, `h`/`w` = taille de l'iframe. Capturer ensuite la page avec
Chrome headless. Elle journalise aussi l'état des iframes de vitrines, ce qui
sert à vérifier que les aperçus se chargent bien.

## `essai.html` — rejouer une séquence de clics dans une démo

Pour vérifier qu'une démo de `assets/showcase/` fonctionne vraiment (panier,
réservation, parcours) sans cliquer à la main.

```
http://localhost:8000/tools/essai.html?p=assets/showcase/nova-studio.html&c=[data-ajout="t1"]|%23commander
```

`p` = la démo, `c` = des sélecteurs CSS séparés par `|`, cliqués dans l'ordre
avec une pause entre chaque. La page reste dans l'état final, prête à être
capturée.

### Deux pièges du headless, mesurés

- `--user-data-dir` **garde le cache entre deux lancements** : après une modif
  de CSS ou d'une démo, on re-capture l'ancienne version sans s'en rendre
  compte. Utiliser un profil neuf à chaque capture (`--user-data-dir=...$(rand)`
  puis suppression), ou vérifier le `?v=`.
- `--virtual-time-budget` avale le temps beaucoup plus vite que l'horloge : un
  `setTimeout` de 900 ms peut s'exécuter **avant** qu'un événement `scroll`
  natif ne soit distribué, et un garde-fou basé sur `Date.now()` expire
  instantanément. Si un comportement lié au scroll ne se déclenche pas en
  capture, émettre l'événement à la main (`window.dispatchEvent(new
  Event('scroll'))`) avant de conclure au bug — c'est ce que fait `apercu.html`.

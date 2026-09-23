/* ============================================================
   CODEX — arborescence des cours (barre latérale)
   Dossiers sur autant de niveaux que voulu, fiches dedans, tri
   « naturel » (Chapitre 2 avant Chapitre 10). L'état replié de chaque
   dossier est retenu dans le navigateur.
   ============================================================ */
(function (C) {
  "use strict";
  var h = C.h, icone = C.icone;

  // Dossiers ouverts ou fermés à la main : { id: true | false }. Sans
  // choix, seuls les deux premiers niveaux sont ouverts (SI3 › Harmonisation
  // › les matières) : 89 fiches dépliées d'un coup ne se lisent pas.
  var CLE_ETAT = "codex.nav-etat";
  var etatDossiers = {};
  try { etatDossiers = JSON.parse(localStorage.getItem(CLE_ETAT)) || {}; } catch (e) { /* rien */ }
  function memoriser() {
    try { localStorage.setItem(CLE_ETAT, JSON.stringify(etatDossiers)); } catch (e) { /* stockage bloqué */ }
  }
  function estOuvert(d, profondeur) {
    return Object.prototype.hasOwnProperty.call(etatDossiers, d.id) ? !!etatDossiers[d.id] : profondeur < 2;
  }

  var racine = null, actif = null;

  // ---- Lecture de l'arbre (C.etat, rempli par app.js) ----

  // Ordre de lecture d'abord (colonne `ordre`), puis le titre.
  function comparer(a, b) {
    var oa = a.ordre == null ? Infinity : a.ordre, ob = b.ordre == null ? Infinity : b.ordre;
    if (oa !== ob) return oa < ob ? -1 : 1;
    return C.collator.compare(a.titre, b.titre);
  }
  function ranger(liste) { return liste.slice().sort(comparer); }

  function sousDossiers(parentId) {
    return ranger(C.etat.dossiers.filter(function (d) { return (d.parent_id || null) === (parentId || null); }));
  }
  // La note d'accueil n'apparaît dans aucune liste : on y va par le logo.
  function fichesDe(dossierId) {
    return ranger(C.etat.fiches.filter(function (f) {
      return (f.dossier_id || null) === (dossierId || null) && !f.accueil;
    }));
  }
  // Toutes les fiches d'un dossier et de ses sous-dossiers, dans l'ordre de lecture.
  function fichesSous(dossierId) {
    var l = fichesDe(dossierId);
    sousDossiers(dossierId).forEach(function (d) { l = l.concat(fichesSous(d.id)); });
    return l;
  }

  // ---- Matières ----
  // La « matière » d'un dossier : son ancêtre au 3e niveau (SI3 ›
  // Harmonisation › Réseaux), ou le plus profond s'il y en a moins. Sert
  // aux couleurs du graphe et aux regroupements des pages Exercices et
  // Documents.
  // Niveau des matières : le 3e (index 2) si l'arbre est assez profond,
  // sinon le plus profond (Semestre 1 › Maths : les matières sont au 2e).
  function niveauMatiere() {
    var max = 0;
    C.etat.dossiers.forEach(function (d) { max = Math.max(max, chemin(d.id).length - 1); });
    return Math.min(2, max);
  }
  function matiere(dossierId) {
    var c = chemin(dossierId), n = niveauMatiere();
    return c.length > n ? c[n] : null;
  }
  // Toutes les matières, dans l'ordre de l'arbre, avec leur couleur.
  var PALETTE = ["#4e79a7", "#e15759", "#59a14f", "#f28e2b", "#76b7b2", "#b07aa1", "#c9a227", "#9c755f", "#ff9da7", "#8cd17d"];
  function matieres() {
    var n = niveauMatiere(), sortie = [];
    (function parcourir(parent, p) {
      sousDossiers(parent).forEach(function (d) {
        if (p === n) sortie.push({ dossier: d, couleur: PALETTE[sortie.length % PALETTE.length] });
        else parcourir(d.id, p + 1);
      });
    })(null, 0);
    return sortie;
  }
  function couleurMatiere(dossierId) {
    var m = matiere(dossierId);
    if (!m) return null;
    var l = matieres().filter(function (x) { return x.dossier.id === m.id; })[0];
    return l ? l.couleur : null;
  }
  function nbFiches(dossierId) {
    return fichesDe(dossierId).length + sousDossiers(dossierId).reduce(function (n, d) { return n + nbFiches(d.id); }, 0);
  }
  function estVide(dossierId) {
    return !fichesDe(dossierId).length && !sousDossiers(dossierId).length;
  }

  // Dossiers de la racine jusqu'à `dossierId` inclus.
  function chemin(dossierId) {
    var c = [], d = C.etat.dossierParId[dossierId], garde = 0;
    while (d && garde++ < 50) { c.unshift(d); d = C.etat.dossierParId[d.parent_id]; }
    return c;
  }

  // Liste à plat pour un <select>, indentée par profondeur.
  function optionsDossiers() {
    var sortie = [];
    (function parcourir(parentId, profondeur) {
      sousDossiers(parentId).forEach(function (d) {
        sortie.push({ id: d.id, libelle: d.titre, profondeur: profondeur, chemin: chemin(d.id).map(function (x) { return x.titre; }).join(" › ") });
        parcourir(d.id, profondeur + 1);
      });
    })(null, 0);
    return sortie;
  }

  // ---- Actions sur les dossiers ----

  function nouveauDossier(parentId) {
    var parent = parentId ? C.etat.dossierParId[parentId] : null;
    C.dialogue({
      titre: parent ? "Nouveau sous-dossier" : "Nouveau dossier",
      texte: parent ? "Dans « " + parent.titre + " »." : "Un semestre, une matière… tu pourras y ranger des sous-dossiers.",
      champ: { indice: parent ? "ex. Algèbre linéaire" : "ex. Semestre 1", max: 120 },
      confirmer: "Créer"
    }).then(function (titre) {
      if (!titre) return;
      C.api.creerDossier(titre, parentId).then(function (d) {
        if (parentId) etatDossiers[parentId] = true;
        memoriser();
        C.toast("Dossier « " + d.titre + " » créé.", "ok");
        return C.recharger();
      }).catch(function (e) { C.toast(e.message, "erreur"); });
    });
  }

  function renommer(d) {
    C.dialogue({ titre: "Renommer le dossier", champ: { valeur: d.titre, max: 120 }, confirmer: "Renommer" }).then(function (titre) {
      if (!titre || titre === d.titre) return;
      C.api.renommerDossier(d.id, titre).then(function () { return C.recharger(); })
        .catch(function (e) { C.toast(e.message, "erreur"); });
    });
  }

  function supprimer(d) {
    C.dialogue({ titre: "Supprimer « " + d.titre + " » ?", texte: "Le dossier est vide, rien d'autre ne sera supprimé.", confirmer: "Supprimer", danger: true })
      .then(function (ok) {
        if (!ok) return;
        C.api.supprimerDossier(d.id).then(function () {
          C.toast("Dossier supprimé.", "ok");
          return C.recharger();
        }).catch(function (e) { C.toast(e.message, "erreur"); });
      });
  }

  function menuDossier(bouton, d) {
    var vide = estVide(d.id);
    C.menu(bouton, [
      { icone: "file-earmark-plus", texte: "Nouvelle fiche ici", action: function () { location.hash = "#/nouvelle/" + d.id; } },
      { icone: "folder-plus", texte: "Nouveau sous-dossier", action: function () { nouveauDossier(d.id); } },
      { icone: "pencil", texte: "Renommer", action: function () { renommer(d); } },
      { icone: "trash3", texte: "Supprimer", danger: true, desactive: !vide,
        aide: vide ? null : "Vide d'abord le dossier : déplace ou supprime ses fiches.", action: function () { supprimer(d); } }
    ]);
  }

  // ---- Rendu ----
  // Comme l'explorateur de Quartz : le chevron plie/déplie, le nom du
  // dossier ouvre sa page (la liste de ce qu'il contient).

  function brancheDossier(d, profondeur) {
    profondeur = profondeur || 0;
    var ouvert = estOuvert(d, profondeur);
    var fiches = fichesDe(d.id);
    // Numéros 1, 2, 3… quand le dossier a un ordre de lecture.
    var numerote = fiches.length > 1 && fiches.every(function (f) { return f.ordre != null; });
    // Les fiches du dossier d'abord : le « plan du cours » d'une matière
    // se lit avant ses chapitres.
    var enfants = h("ul.arbre-enfants", { hidden: !ouvert },
      fiches.map(function (f, i) { return feuille(f, numerote ? i + 1 : null); }),
      sousDossiers(d.id).map(function (s) { return brancheDossier(s, profondeur + 1); }));
    var bascule = h("button.arbre-bascule", {
      type: "button", "aria-expanded": String(ouvert), "aria-label": (ouvert ? "Replier " : "Déplier ") + d.titre
    }, icone("chevron-right"));
    bascule.addEventListener("click", function () {
      var o = bascule.getAttribute("aria-expanded") !== "true";
      bascule.setAttribute("aria-expanded", String(o));
      bascule.setAttribute("aria-label", (o ? "Replier " : "Déplier ") + d.titre);
      enfants.hidden = !o;
      etatDossiers[d.id] = o;
      memoriser();
    });
    var n = nbFiches(d.id);
    var couleur = profondeur === niveauMatiere() ? couleurMatiere(d.id) : null;
    var ligne = h("div.arbre-ligne", bascule,
      h("a.arbre-dossier", { href: "#/dossier/" + d.id, dataset: { dossier: d.id } },
        couleur ? h("span.arbre-pastille", { style: "background:" + couleur, "aria-hidden": "true" }) : null,
        h("span.arbre-titre", d.titre),
        n ? h("span.arbre-compte", { title: n + " fiche" + (n > 1 ? "s" : "") }, String(n)) : null));
    if (C.peutEcrire()) {
      var plus = h("button.arbre-plus", { type: "button", "aria-label": "Actions sur « " + d.titre + " »", title: "Actions" }, icone("three-dots"));
      plus.addEventListener("click", function (e) { e.stopPropagation(); menuDossier(plus, d); });
      ligne.appendChild(plus);
    }
    return h("li.arbre-noeud", ligne, enfants);
  }

  function feuille(f, numero) {
    return h("li.arbre-noeud",
      h("a.arbre-fiche", { href: "#/fiche/" + f.id, dataset: { fiche: f.id } },
        numero ? h("span.arbre-num", numero + ".") : null,
        h("span.arbre-titre", f.titre)));
  }

  function rendre() {
    if (!racine) return;
    C.vider(racine);
    var liste = h("div.explorateur-liste");
    var repli = h("button.explorateur-titre", { type: "button", "aria-expanded": "true" }, "Explorateur", icone("chevron-down"));
    repli.addEventListener("click", function () {
      var o = repli.getAttribute("aria-expanded") !== "true";
      repli.setAttribute("aria-expanded", String(o));
      liste.hidden = !o;
    });
    var entete = h("div.nav-entete", repli);
    if (C.peutEcrire()) {
      entete.appendChild(h("button.btn-icone.btn-petit", {
        type: "button", title: "Nouveau dossier", "aria-label": "Nouveau dossier",
        on: { click: function () { nouveauDossier(null); } }
      }, icone("folder-plus")));
    }
    racine.appendChild(entete);

    var dossiers = sousDossiers(null), libres = fichesDe(null);
    if (!dossiers.length && !libres.length) {
      liste.appendChild(h("p.nav-vide", C.peutEcrire()
        ? "Aucun cours pour l'instant. Commence par un dossier : un semestre ou une matière."
        : "Aucun cours pour l'instant."));
    } else {
      // Tronc commun (« SI3 › Harmonisation ») : une chaîne de dossiers
      // uniques sans fiche propre. On l'affiche en une ligne au lieu de deux
      // niveaux d'indentation qui mangent la largeur de la colonne.
      var tronc = [], profondeur = 0;
      while (dossiers.length === 1 && !fichesDe(dossiers[0].id).length && sousDossiers(dossiers[0].id).length) {
        tronc.push(dossiers[0]);
        dossiers = sousDossiers(dossiers[0].id);
        profondeur++;
      }
      if (tronc.length) {
        var dernier = tronc[tronc.length - 1];
        liste.appendChild(h("a.arbre-tronc", { href: "#/dossier/" + dernier.id, dataset: { dossier: dernier.id } },
          tronc.map(function (d) { return d.titre; }).join(" › ")));
      }
      liste.appendChild(h("ul.arbre", { "aria-label": "Cours" },
        dossiers.map(function (d) { return brancheDossier(d, profondeur); }),
        libres.map(function (f) { return feuille(f, null); })));
    }
    racine.appendChild(liste);
    activer(actif);
  }

  // Met en évidence la fiche ouverte et déplie ses dossiers parents.
  function activer(ficheId) {
    actif = ficheId || null;
    if (!racine) return;
    racine.querySelectorAll(".arbre-fiche.actif").forEach(function (a) { a.classList.remove("actif"); a.removeAttribute("aria-current"); });
    if (!actif) return;
    var lien = racine.querySelector('.arbre-fiche[data-fiche="' + CSS.escape(actif) + '"]');
    if (!lien) return;
    lien.classList.add("actif");
    lien.setAttribute("aria-current", "page");
    var n = lien.parentNode;
    while (n && n !== racine) {
      if (n.classList && n.classList.contains("arbre-enfants") && n.hidden) {
        var b = n.previousElementSibling.querySelector(".arbre-bascule");
        if (b) b.click();
      }
      n = n.parentNode;
    }
    if (lien.scrollIntoViewIfNeeded) lien.scrollIntoViewIfNeeded(false);
  }

  function monter(el) { racine = el; rendre(); }

  C.nav = {
    monter: monter, rendre: rendre, activer: activer, chemin: chemin,
    optionsDossiers: optionsDossiers, nouveauDossier: nouveauDossier, fichesDe: fichesDe,
    sousDossiers: sousDossiers, nbFiches: nbFiches, fichesSous: fichesSous, ranger: ranger,
    matiere: matiere, matieres: matieres, couleurMatiere: couleurMatiere
  };
})(window.Codex);

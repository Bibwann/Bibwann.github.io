/* ============================================================
   CODEX — arborescence des cours (barre latérale)
   Dossiers sur autant de niveaux que voulu, fiches dedans, tri
   « naturel » (Chapitre 2 avant Chapitre 10). L'état replié de chaque
   dossier est retenu dans le navigateur.
   ============================================================ */
(function (C) {
  "use strict";
  var h = C.h, icone = C.icone;

  var CLE_FERMES = "codex.dossiers-fermes";
  var fermes = {};
  try { (JSON.parse(localStorage.getItem(CLE_FERMES)) || []).forEach(function (id) { fermes[id] = true; }); } catch (e) { /* rien */ }
  function memoriser() {
    try { localStorage.setItem(CLE_FERMES, JSON.stringify(Object.keys(fermes))); } catch (e) { /* stockage bloqué */ }
  }

  var racine = null, actif = null;

  // ---- Lecture de l'arbre (C.etat, rempli par app.js) ----

  function sousDossiers(parentId) {
    return C.trier(C.etat.dossiers.filter(function (d) { return (d.parent_id || null) === (parentId || null); }), "titre");
  }
  // La note d'accueil n'apparaît dans aucune liste : on y va par le logo.
  function fichesDe(dossierId) {
    return C.trier(C.etat.fiches.filter(function (f) {
      return (f.dossier_id || null) === (dossierId || null) && !f.accueil;
    }), "titre");
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
        delete fermes[parentId];
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

  function brancheDossier(d) {
    var ouvert = !fermes[d.id];
    var enfants = h("ul.arbre-enfants", { hidden: !ouvert },
      sousDossiers(d.id).map(brancheDossier),
      fichesDe(d.id).map(feuille));
    var bascule = h("button.arbre-bascule", {
      type: "button", "aria-expanded": String(ouvert), "aria-label": (ouvert ? "Replier " : "Déplier ") + d.titre
    }, icone("chevron-right"));
    bascule.addEventListener("click", function () {
      var o = bascule.getAttribute("aria-expanded") !== "true";
      bascule.setAttribute("aria-expanded", String(o));
      bascule.setAttribute("aria-label", (o ? "Replier " : "Déplier ") + d.titre);
      enfants.hidden = !o;
      if (o) delete fermes[d.id]; else fermes[d.id] = true;
      memoriser();
    });
    var ligne = h("div.arbre-ligne", bascule,
      h("a.arbre-dossier", { href: "#/dossier/" + d.id, dataset: { dossier: d.id } }, h("span.arbre-titre", d.titre)));
    if (C.peutEcrire()) {
      var plus = h("button.arbre-plus", { type: "button", "aria-label": "Actions sur « " + d.titre + " »", title: "Actions" }, icone("three-dots"));
      plus.addEventListener("click", function (e) { e.stopPropagation(); menuDossier(plus, d); });
      ligne.appendChild(plus);
    }
    return h("li.arbre-noeud", ligne, enfants);
  }

  function feuille(f) {
    return h("li.arbre-noeud",
      h("a.arbre-fiche", { href: "#/fiche/" + f.id, dataset: { fiche: f.id } }, h("span.arbre-titre", f.titre)));
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
      liste.appendChild(h("ul.arbre", { "aria-label": "Cours" }, dossiers.map(brancheDossier), libres.map(feuille)));
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
    sousDossiers: sousDossiers, nbFiches: nbFiches
  };
})(window.Codex);

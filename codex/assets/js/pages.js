/* ============================================================
   CODEX — pages transversales : Documents et Exercices

   #/documents[/<matière>]  tous les polys, slides, TD, liens… rangés par
                            matière puis par fiche, dans l'ordre du cours
   #/exercices[/<matière>]  toutes les fiches qui ont des exercices
                            corrigés, avec ma progression

   Et deux morceaux réutilisés ailleurs : la liste de documents d'un
   dossier (page de dossier) et les cartes des matières (accueil).
   ============================================================ */
(function (C) {
  "use strict";
  var h = C.h, icone = C.icone;

  // Les matières et leurs fiches, dans l'ordre de lecture. Les fiches hors
  // de toute matière (accueil exclu) vont dans « Autres ».
  function parMatiere() {
    var groupes = C.nav.matieres().map(function (m) {
      return { dossier: m.dossier, couleur: m.couleur, fiches: C.nav.fichesSous(m.dossier.id) };
    });
    var rangees = {};
    groupes.forEach(function (g) { g.fiches.forEach(function (f) { rangees[f.id] = true; }); });
    var autres = C.nav.ranger(C.etat.fiches.filter(function (f) { return !f.accueil && !rangees[f.id]; }));
    if (autres.length) groupes.push({ dossier: null, couleur: null, fiches: autres });
    return groupes;
  }

  function titreMatiere(g, balise) {
    return h(balise || "h2.page-matiere", { id: g.dossier ? "m-" + g.dossier.id : "m-autres" },
      h("span.pastille-matiere", { style: g.couleur ? "background:" + g.couleur : null, "aria-hidden": "true" }),
      g.dossier ? h("a", { href: "#/dossier/" + g.dossier.id }, g.dossier.titre) : "Autres fiches");
  }

  function allerA(id) {
    if (!id) return;
    requestAnimationFrame(function () {
      var cible = document.getElementById("m-" + id);
      if (cible) cible.scrollIntoView();
    });
  }

  // ---------------------------------------------------------------
  // Documents
  // ---------------------------------------------------------------

  // Une liste de documents, fiche par fiche, avec des liens de fichiers
  // signés en un seul appel. `fiches` dans l'ordre voulu.
  function blocDocuments(fiches, ressources, options) {
    options = options || {};
    var parFiche = {};
    ressources.forEach(function (r) { (parFiche[r.fiche_id] = parFiche[r.fiche_id] || []).push(r); });
    var ordreTypes = {};
    C.TYPES.forEach(function (t, i) { ordreTypes[t.id] = i; });
    var zone = h("div.documents");
    var avec = fiches.filter(function (f) { return parFiche[f.id]; });
    if (!avec.length) return null;
    var chemins = ressources.filter(function (r) { return r.fichier; }).map(function (r) { return r.fichier; });
    var signes = {}, signesLe = Date.now();
    var lignes = avec.map(function (f) {
      var liste = parFiche[f.id].slice().sort(function (a, b) {
        return (ordreTypes[a.type] - ordreTypes[b.type]) || C.collator.compare(a.titre, b.titre);
      });
      var corps = h("div.documents-liens");
      var bloc = h("section.documents-fiche",
        h("h3.documents-titre", h("a", { href: "#/fiche/" + f.id }, f.titre)), corps);
      bloc._remplir = function () {
        C.vider(corps);
        liste.forEach(function (r) {
          var a = C.vues.lienRessource(r, signes, signesLe);
          a.dataset.type = r.type;
          a.dataset.texte = C.plier(r.titre + " " + f.titre);
          corps.appendChild(a);
        });
      };
      bloc._remplir();
      zone.appendChild(bloc);
      return bloc;
    });
    // Les liens de fichiers arrivent signés un peu après : on redessine.
    if (chemins.length) {
      C.api.liensSignes(chemins).then(function (m) {
        Object.assign(signes, m);
        signesLe = Date.now();
        lignes.forEach(function (b) { b._remplir(); });
        if (options.apresSignature) options.apresSignature();
      }).catch(function () { /* le clic redemandera un lien */ });
    }
    return zone;
  }

  function vueDocuments(el, matiereId) {
    document.title = "Documents · Codex";
    C.nav.activer(null);
    el.appendChild(C.chargement("Chargement des documents…"));
    C.api.toutesRessources().then(function (ressources) {
      if (!el.isConnected) return;
      C.vider(el);
      var page = h("div.page-transversale");
      el.appendChild(page);
      var nFichiers = ressources.filter(function (r) { return r.fichier; }).length;
      page.appendChild(h("header.page-entete",
        h("h1", "Documents"),
        h("p.page-intro", "Les documents fournis par les enseignants — polycopiés, slides, sujets de TD — rangés par matière, dans l'ordre du cours. " +
          "Clique sur un titre pour l'ouvrir, ou sur « Télécharger » pour l'enregistrer. " +
          nFichiers + " document" + (nFichiers > 1 ? "s" : "") +
          (ressources.length > nFichiers ? ", " + (ressources.length - nFichiers) + " lien" + (ressources.length - nFichiers > 1 ? "s" : "") : "") + ".")));
      if (!ressources.length) {
        page.appendChild(C.etatVide("folder2-open", "Aucun document pour l'instant", "Les documents s'ajoutent sous chaque fiche, depuis l'éditeur, ou en lot depuis la page Importer.",
          C.peutEcrire() ? h("a.btn", { href: "#/importer" }, icone("box-arrow-in-down"), "Importer des fichiers") : null));
        return;
      }

      // Filtres : type de document et texte.
      var type = "tous", texte = "";
      var champ = h("input.champ.champ-filtre", { type: "search", placeholder: "Filtrer : « TD 5 », « RSA », « slides »…", "aria-label": "Filtrer les documents" });
      var puces = h("div.puces", { role: "group", "aria-label": "Type de document" },
        [{ id: "tous", plusieurs: "Tous" }].concat(C.TYPES).map(function (t) {
          if (t.id !== "tous" && !ressources.some(function (r) { return r.type === t.id; })) return null;
          var b = h("button.filtre-type", { type: "button", "aria-pressed": String(t.id === "tous"), dataset: { type: t.id } }, t.plusieurs);
          b.addEventListener("click", function () {
            type = t.id;
            puces.querySelectorAll(".filtre-type").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
            filtrer();
          });
          return b;
        }));
      page.appendChild(h("div.filtres", champ, puces));

      var contenu = h("div");
      page.appendChild(contenu);
      parMatiere().forEach(function (g) {
        var bloc = blocDocuments(g.fiches, ressources, { apresSignature: function () { filtrer(); } });
        if (!bloc) return;
        contenu.appendChild(h("section.page-section", titreMatiere(g), bloc));
      });
      var vide = h("p.prose-vide", { hidden: true }, "Aucun document ne correspond au filtre.");
      page.appendChild(vide);

      function filtrer() {
        var q = C.plier(texte.trim()), total = 0;
        contenu.querySelectorAll(".page-section").forEach(function (s) {
          var visiblesSection = 0;
          s.querySelectorAll(".documents-fiche").forEach(function (b) {
            var n = 0;
            b.querySelectorAll(".ressource").forEach(function (a) {
              var ok = (type === "tous" || a.dataset.type === type) && (!q || a.dataset.texte.indexOf(q) >= 0);
              a.hidden = !ok;
              if (ok) n++;
            });
            b.hidden = !n;
            visiblesSection += n;
          });
          s.hidden = !visiblesSection;
          total += visiblesSection;
        });
        vide.hidden = total > 0;
      }
      champ.addEventListener("input", C.retarder(function () { texte = champ.value; filtrer(); }, 120));
      allerA(matiereId);
    }).catch(function (e) {
      C.vider(el).appendChild(C.etatVide("exclamation-octagon", "Documents indisponibles", e.message));
    });
  }

  // ---------------------------------------------------------------
  // Exercices
  // ---------------------------------------------------------------

  function barre(fait, total) {
    return h("span.progres", { role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(total), "aria-valuenow": String(fait), "aria-label": fait + " sur " + total },
      h("span.progres-rempli", { style: "width:" + (total ? Math.round(fait / total * 100) : 0) + "%" }));
  }

  function vueExercices(el, matiereId) {
    document.title = "Exercices · Codex";
    C.nav.activer(null);
    el.appendChild(C.chargement("Chargement des exercices…"));
    Promise.all([C.api.exercices(), C.api.maProgression().catch(function () { return {}; })]).then(function (r) {
      if (!el.isConnected) return;
      var nb = r[0], faits = r[1];
      C.vider(el);
      var page = h("div.page-transversale");
      el.appendChild(page);
      var total = 0, fait = 0;
      Object.keys(nb).forEach(function (id) {
        if (!C.etat.ficheParId[id]) return;
        total += nb[id];
        fait += Math.min(faits[id] || 0, nb[id]);
      });
      var seulementReste = h("input", { type: "checkbox" });
      page.appendChild(h("header.page-entete",
        h("h1", "Exercices"),
        h("p.page-intro", "Toutes les fiches qui ont des exercices corrigés, dans l'ordre du cours. Dans une fiche, essaie d'abord, déplie le corrigé ensuite, puis « Marquer comme fait » : ta progression n'est visible que par toi."),
        total ? h("div.progres-global", h("strong", fait + " / " + total + " exercices faits"), barre(fait, total)) : null,
        total ? h("label.case", seulementReste, h("span", "Seulement ce qu'il me reste à faire")) : null));
      if (!total) {
        page.appendChild(C.etatVide("pencil-square", "Aucun exercice pour l'instant", "Un exercice, c'est un énoncé suivi d'un corrigé replié : « ::: corrige- Corrigé ».", null));
        return;
      }
      var contenu = h("div");
      page.appendChild(contenu);
      parMatiere().forEach(function (g) {
        var fiches = g.fiches.filter(function (f) { return nb[f.id]; });
        if (!fiches.length) return;
        var t = 0, d = 0;
        fiches.forEach(function (f) { t += nb[f.id]; d += Math.min(faits[f.id] || 0, nb[f.id]); });
        contenu.appendChild(h("section.page-section",
          h("div.page-section-tete", titreMatiere(g), h("span.progres-texte", d + " / " + t), barre(d, t)),
          h("ul.liste-exercices", fiches.map(function (f) {
            var n = nb[f.id], k = Math.min(faits[f.id] || 0, n);
            var fini = k === n;
            return h("li" + (fini ? ".exercice-fini" : ""), { dataset: { reste: String(n - k) } },
              icone(fini ? "check-circle-fill" : k ? "circle-half" : "circle"),
              h("a.exercice-titre", { href: "#/fiche/" + f.id }, f.titre),
              h("span.exercice-compte", k + " / " + n),
              barre(k, n));
          }))));
      });
      seulementReste.addEventListener("change", function () {
        contenu.querySelectorAll(".liste-exercices li").forEach(function (li) { li.hidden = seulementReste.checked && li.dataset.reste === "0"; });
        contenu.querySelectorAll(".page-section").forEach(function (s) { s.hidden = !s.querySelector(".liste-exercices li:not([hidden])"); });
      });
      allerA(matiereId);
    }).catch(function (e) {
      C.vider(el).appendChild(C.etatVide("exclamation-octagon", "Exercices indisponibles", e.message));
    });
  }

  // ---------------------------------------------------------------
  // Cartes des matières (accueil)
  // ---------------------------------------------------------------

  function cartesMatieres() {
    var groupes = parMatiere().filter(function (g) { return g.dossier; });
    if (!groupes.length) return null;
    var cartes = groupes.map(function (g) {
      // Le point d'entrée : la fiche « … : plan du cours » si elle existe,
      // sinon la première fiche dans l'ordre de lecture.
      var plan = g.fiches.filter(function (f) { return / : plan du cours$/i.test(f.titre); })[0] || g.fiches[0];
      var chiffres = h("span.matiere-chiffres", g.fiches.length + " fiche" + (g.fiches.length > 1 ? "s" : ""));
      var carte = h("li.matiere-carte", { style: g.couleur ? "--c:" + g.couleur : null },
        h("a.matiere-nom", { href: plan ? "#/fiche/" + plan.id : "#/dossier/" + g.dossier.id }, g.dossier.titre),
        chiffres,
        h("span.matiere-liens",
          h("a", { href: "#/dossier/" + g.dossier.id }, icone("list-ul"), "Fiches"),
          h("a", { href: "#/exercices/" + g.dossier.id }, icone("pencil-square"), "Exercices"),
          h("a", { href: "#/documents/" + g.dossier.id }, icone("folder2-open"), "Documents")));
      carte._g = g;
      carte._chiffres = chiffres;
      return carte;
    });
    // Les nombres d'exercices et de documents arrivent ensuite.
    Promise.all([C.api.exercices().catch(function () { return null; }), C.api.toutesRessources().catch(function () { return null; })]).then(function (r) {
      cartes.forEach(function (c) {
        var ids = {};
        c._g.fiches.forEach(function (f) { ids[f.id] = true; });
        var morceaux = [c._g.fiches.length + " fiche" + (c._g.fiches.length > 1 ? "s" : "")];
        if (r[0]) {
          var n = 0;
          Object.keys(r[0]).forEach(function (id) { if (ids[id]) n += r[0][id]; });
          morceaux.push(n + " exercice" + (n > 1 ? "s" : ""));
        }
        if (r[1]) {
          var d = r[1].filter(function (x) { return ids[x.fiche_id]; }).length;
          morceaux.push(d + " document" + (d > 1 ? "s" : ""));
        }
        c._chiffres.textContent = morceaux.join(" · ");
      });
    });
    return h("ul.matieres", cartes);
  }

  C.vues = C.vues || {};
  C.vues.documents = vueDocuments;
  C.vues.exercices = vueExercices;
  C.pages = { blocDocuments: blocDocuments, cartesMatieres: cartesMatieres, parMatiere: parMatiere };
})(window.Codex);

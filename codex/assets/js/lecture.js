/* ============================================================
   CODEX — lecture d'une fiche
   Le résumé au centre ; à côté, les ressources, le graphe local, les
   fiches qui citent celle-ci et le sommaire qui suit la lecture.
   ============================================================ */
(function (C) {
  "use strict";
  var h = C.h, icone = C.icone;

  // ---- Liens de fichiers signés ----
  // Signés en un seul appel à l'ouverture de la fiche, valables une
  // heure. Si la page reste ouverte plus longtemps, le clic en redemande
  // un au lieu d'ouvrir un lien mort.
  function lienRessource(r, signes, signesLe) {
    var t = C.TYPE[r.type] || C.TYPE.lien;
    var meta = r.fichier
      ? [/\.(\w{2,5})$/.exec(r.fichier) ? /\.(\w{2,5})$/.exec(r.fichier)[1].toUpperCase() : "Fichier", C.taille(r.taille)].filter(Boolean).join(" · ")
      : C.domaine(r.url);
    var a = h("a.ressource", {
      href: r.url || signes[r.fichier] || "#", target: "_blank", rel: "noopener noreferrer"
    }, h("span.ressource-icone", icone(t.icone)),
      h("span.ressource-texte", h("span.ressource-titre", r.titre), h("span.ressource-meta", meta)),
      icone(r.fichier ? "download" : "box-arrow-up-right"));
    if (r.fichier) {
      a.addEventListener("click", function (e) {
        var perime = Date.now() - signesLe > (C.api.DUREE_LIEN - 300) * 1000;
        if (signes[r.fichier] && !perime) return;
        e.preventDefault();
        // Fenêtre ouverte tout de suite, dans le geste de l'utilisateur :
        // ouverte après l'attente réseau, le bloqueur de pop-up la tuerait.
        var w = window.open("", "_blank");
        C.api.liensSignes([r.fichier]).then(function (m) {
          if (!m[r.fichier]) throw new Error("Fichier introuvable dans le stockage.");
          signes[r.fichier] = m[r.fichier];
          if (w) { w.opener = null; w.location.href = m[r.fichier]; } else location.href = m[r.fichier];
        }).catch(function (err) { if (w) w.close(); C.toast(err.message, "erreur"); });
      });
    }
    return a;
  }

  function carteRessources(fiche, signes, signesLe) {
    // Sur petit écran le panneau passe AU-DESSUS du résumé : au-delà de
    // trois ressources il démarre replié, sinon il repousse la lecture
    // d'un écran entier.
    var etroit = window.matchMedia("(max-width: 1180px)").matches;
    var replie = etroit && fiche.ressources.length > 3;
    var bascule = h("button.carte-bascule", { type: "button", "aria-expanded": String(!replie), "aria-controls": "liste-ressources" },
      icone("box-seam"), h("span", "Ressources"), h("span.pastille", String(fiche.ressources.length)), icone("chevron-down"));
    var corps = h("div", { id: "liste-ressources", hidden: replie });
    bascule.addEventListener("click", function () {
      var o = bascule.getAttribute("aria-expanded") !== "true";
      bascule.setAttribute("aria-expanded", String(o));
      corps.hidden = !o;
    });
    var carte = h("section.carte.carte-ressources", { "aria-labelledby": "titre-ressources" },
      h("h2.carte-titre", { id: "titre-ressources" }, bascule), corps);
    if (!fiche.ressources.length) {
      corps.appendChild(h("p.carte-vide", "Aucune ressource pour cette fiche."));
      if (C.peutEcrire()) corps.appendChild(h("a.btn.btn-mini", { href: "#/editer/" + fiche.id + "/ressources" }, icone("plus-lg"), "Ajouter"));
      return carte;
    }
    C.TYPES.forEach(function (t) {
      var liste = C.trier(fiche.ressources.filter(function (r) { return r.type === t.id; }), "titre");
      if (!liste.length) return;
      corps.appendChild(h("div.groupe-ressources",
        h("h3.groupe-titre", t.plusieurs),
        liste.map(function (r) { return lienRessource(r, signes, signesLe); })));
    });
    return carte;
  }

  function carteCitePar(fiche) {
    var sources = C.etat.aretes.filter(function (a) { return a.cible === fiche.id; })
      .map(function (a) { return C.etat.ficheParId[a.source]; }).filter(Boolean);
    if (!sources.length) return null;
    return h("section.carte", { "aria-labelledby": "titre-cite" },
      h("h2.carte-titre", { id: "titre-cite" }, icone("arrow-return-left"), "Cité par",
        h("span.pastille", String(sources.length))),
      h("ul.liste-liens", C.trier(sources, "titre").map(function (f) {
        return h("li", h("a.lien-fiche", { href: "#/fiche/" + f.id, dataset: { fiche: f.id } }, f.titre));
      })));
  }

  function carteGraphe(fiche, nettoyages) {
    var zone = h("div.graphe-local");
    var carte = h("section.carte.carte-graphe", { "aria-labelledby": "titre-graphe" },
      h("div.carte-titre-ligne",
        h("h2.carte-titre", { id: "titre-graphe" }, icone("diagram-3"), "Graphe"),
        h("a.btn.btn-mini.btn-fantome", { href: "#/graphe", title: "Graphe complet" }, icone("arrows-fullscreen"))),
      zone);
    // Monté après insertion dans la page : il lui faut une taille.
    requestAnimationFrame(function () {
      if (!zone.isConnected) return;
      var g = C.graphe.monter(zone, { centre: fiche.id, profondeur: 2, compact: true });
      nettoyages.push(g.detruire);
    });
    return carte;
  }

  function sommaire(plan, ficheId, nettoyages) {
    if (plan.length < 2) return null;
    var liens = {};
    var nav = h("nav.carte.carte-sommaire", { "aria-labelledby": "titre-sommaire" },
      h("h2.carte-titre", { id: "titre-sommaire" }, icone("list-nested"), "Sur cette page"),
      h("ol.sommaire", plan.map(function (p) {
        var a = h("a", {
          href: "#/fiche/" + ficheId + "/" + p.section, class: "niveau-" + p.niveau,
          on: {
            click: function (e) {
              e.preventDefault();
              var cible = document.getElementById(p.id);
              if (cible) cible.scrollIntoView({ behavior: C.mouvementReduit ? "auto" : "smooth" });
              // replaceState : l'adresse devient partageable sans relancer le routeur.
              history.replaceState(null, "", "#/fiche/" + ficheId + "/" + p.section);
            }
          }
        }, p.texte);
        liens[p.id] = a;
        return h("li", a);
      })));

    // Le titre actif est le dernier passé sous le haut de l'écran.
    var visibles = {};
    var obs = new IntersectionObserver(function (entrees) {
      entrees.forEach(function (e) { visibles[e.target.id] = e.isIntersecting; });
      var actif = null;
      for (var i = 0; i < plan.length; i++) {
        if (visibles[plan[i].id]) { actif = plan[i].id; break; }
      }
      if (!actif) return;
      Object.keys(liens).forEach(function (id) { liens[id].classList.toggle("actif", id === actif); });
    }, { rootMargin: "-72px 0px -65% 0px" });
    requestAnimationFrame(function () {
      plan.forEach(function (p) { var el = document.getElementById(p.id); if (el) obs.observe(el); });
    });
    nettoyages.push(function () { obs.disconnect(); });
    return nav;
  }

  // ---- Aperçu au survol d'un lien [[fiche]] ----
  var cache = {};
  function brancherApercus(racine, nettoyages) {
    var bulle = null, minuterie = 0, courant = null;
    function fermer() {
      clearTimeout(minuterie);
      courant = null;
      if (bulle) { bulle.remove(); bulle = null; }
    }
    function ouvrir(a) {
      var id = a.dataset.fiche;
      courant = a;
      var p = cache[id] || (cache[id] = C.api.fiche(id));
      p.then(function (f) {
        if (courant !== a || !f) return;
        fermer();
        courant = a;
        var corps = h("div.prose.prose-apercu");
        // Le début suffit : on coupe au 4e titre ou à ~1800 caractères.
        var extrait = f.contenu.split(/\n(?=#{1,3} )/).slice(0, 3).join("\n").slice(0, 1800);
        C.rendu.rendre(corps, extrait, { titre: f.titre });
        bulle = h("div.apercu", { role: "tooltip" }, h("p.apercu-titre", f.titre), corps);
        document.body.appendChild(bulle);
        var r = a.getBoundingClientRect(), bw = bulle.offsetWidth, bh = bulle.offsetHeight;
        var x = Math.min(Math.max(8, r.left), window.innerWidth - bw - 8);
        var y = r.bottom + 8 + bh > window.innerHeight ? r.top - bh - 8 : r.bottom + 8;
        bulle.style.left = x + "px"; bulle.style.top = Math.max(8, y) + "px";
      }).catch(function () { delete cache[id]; });
    }
    function entree(e) {
      var a = e.target.closest && e.target.closest("a.lien-fiche[data-fiche]");
      if (!a || a === courant) return;
      clearTimeout(minuterie);
      minuterie = setTimeout(function () { ouvrir(a); }, 350);
    }
    function sortie(e) {
      var a = e.target.closest && e.target.closest("a.lien-fiche[data-fiche]");
      if (a) { clearTimeout(minuterie); if (a === courant) fermer(); }
    }
    // Pas d'aperçu au toucher : sur mobile, le tap doit naviguer.
    if (!window.matchMedia("(hover: hover)").matches) return;
    racine.addEventListener("mouseover", entree);
    racine.addEventListener("mouseout", sortie);
    window.addEventListener("scroll", fermer, { passive: true });
    nettoyages.push(function () {
      fermer();
      window.removeEventListener("scroll", fermer);
    });
  }

  // ---- La vue ----
  function vue(el, id, section) {
    var nettoyages = [];
    el.appendChild(C.chargement("Ouverture de la fiche…"));
    C.nav.activer(id);

    C.api.fiche(id).then(function (fiche) {
      if (!el.isConnected) return;
      C.vider(el);
      if (!fiche) {
        el.appendChild(C.etatVide("file-earmark-x", "Fiche introuvable", "Elle a peut-être été supprimée ou déplacée.",
          h("a.btn", { href: "#/" }, "Retour à l'accueil")));
        return;
      }
      cache[id] = Promise.resolve(fiche);
      var chemins = fiche.ressources.filter(function (r) { return r.fichier; }).map(function (r) { return r.fichier; });
      var signesLe = Date.now();
      return C.api.liensSignes(chemins).catch(function () { return {}; }).then(function (signes) {
        if (!el.isConnected) return;
        construire(el, fiche, section, signes, signesLe, nettoyages);
      });
    }).catch(function (e) {
      C.vider(el);
      el.appendChild(C.etatVide("wifi-off", "Impossible d'ouvrir la fiche", e.message,
        h("button.btn", { type: "button", on: { click: function () { C.routeur(); } } }, "Réessayer")));
    });

    return function () { nettoyages.forEach(function (f) { f(); }); };
  }

  function construire(el, fiche, section, signes, signesLe, nettoyages) {
    document.title = fiche.titre + " · Codex";
    var fil = C.nav.chemin(fiche.dossier_id);
    var prose = h("div.prose", { id: "prose" });
    var plan = C.rendu.rendre(prose, fiche.contenu, { titre: fiche.titre });
    if (!fiche.contenu.trim()) {
      prose.appendChild(h("p.prose-vide", "Cette fiche est encore vide."));
    }

    var entete = h("header.fiche-entete",
      h("nav.fil", { "aria-label": "Emplacement" }, fil.map(function (d, i) {
        return [i ? h("span.fil-sep", { "aria-hidden": "true" }, "›") : null, h("span", d.titre)];
      })),
      h("div.fiche-titre-ligne",
        h("h1.fiche-titre", fiche.titre),
        C.peutEcrire() ? h("a.btn", { href: "#/editer/" + fiche.id }, icone("pencil-square"), "Modifier") : null),
      h("p.fiche-meta", icone("clock-history"),
        h("span", { title: C.dateComplete(fiche.maj_le) }, "Mis à jour " + C.dateRelative(fiche.maj_le)),
        fiche.maj_par ? h("span", "par " + C.prenom(fiche.maj_par)) : null,
        h("span.fiche-meta-sep", "·"),
        h("span", Math.max(1, Math.round(fiche.contenu.split(/\s+/).length / 220)) + " min de lecture")));

    var panneau = h("aside.panneau", { "aria-label": "Ressources et navigation" },
      carteRessources(fiche, signes, signesLe),
      carteCitePar(fiche),
      carteGraphe(fiche, nettoyages),
      sommaire(plan, fiche.id, nettoyages));

    el.appendChild(h("div.lecture", entete, panneau, h("article.fiche-corps", prose)));
    brancherApercus(el, nettoyages);

    if (section) {
      var cible = document.getElementById("h-" + section);
      if (cible) requestAnimationFrame(function () { cible.scrollIntoView(); });
    } else {
      window.scrollTo(0, 0);
    }
  }

  C.vues = C.vues || {};
  C.vues.lecture = vue;
})(window.Codex);

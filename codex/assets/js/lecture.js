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
  // Nom proposé à l'enregistrement : le titre du document (lisible),
  // pas le nom technique du stockage (« a1b2c3-poly-reduction.pdf »).
  function nomTelechargement(r) {
    var ext = /\.(\w{2,5})$/.exec(r.fichier || "");
    var base = String(r.titre || "document").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 120) || "document";
    return ext && base.toLowerCase().slice(-ext[0].length) !== ext[0].toLowerCase() ? base + ext[0].toLowerCase() : base;
  }

  // Supabase Storage renvoie le fichier « en pièce jointe » quand le lien
  // signé porte `download=<nom>` : le navigateur l'enregistre au lieu de
  // l'afficher. (Les liens `blob:` du banc d'essai n'acceptent pas de
  // paramètre : l'attribut `download` du lien suffit.)
  function urlTelechargement(url, nom) {
    if (!url || /^(blob|data):/.test(url)) return url;
    return url + (url.indexOf("?") >= 0 ? "&" : "?") + "download=" + encodeURIComponent(nom);
  }

  function lienRessource(r, signes, signesLe) {
    var t = C.TYPE[r.type] || C.TYPE.lien;
    var meta = r.fichier
      ? [/\.(\w{2,5})$/.exec(r.fichier) ? /\.(\w{2,5})$/.exec(r.fichier)[1].toUpperCase() : "Fichier", C.taille(r.taille)].filter(Boolean).join(" · ")
      : C.domaine(r.url);
    var texte = h("span.ressource-texte", h("span.ressource-titre", r.titre), h("span.ressource-meta", meta));
    if (!r.fichier) {
      return h("a.ressource", { href: r.url || "#", target: "_blank", rel: "noopener noreferrer" },
        h("span.ressource-icone", icone(t.icone)), texte, icone("box-arrow-up-right"));
    }

    var perime = function () { return Date.now() - signesLe > (C.api.DUREE_LIEN - 300) * 1000; };
    var nom = nomTelechargement(r);
    var ouvrir = h("a.ressource-ouvrir", {
      href: signes[r.fichier] || "#", target: "_blank", rel: "noopener noreferrer",
      title: "Ouvrir « " + r.titre + " » dans un nouvel onglet"
    }, h("span.ressource-icone", icone(t.icone)), texte);
    var telecharger = h("a.ressource-dl", {
      href: urlTelechargement(signes[r.fichier], nom) || "#", download: nom,
      title: "Télécharger « " + nom + " »", "aria-label": "Télécharger « " + r.titre + " »"
    }, icone("download"), h("span.ressource-dl-texte", "Télécharger"));

    // Lien absent ou bientôt périmé (page restée ouverte) : on en redemande
    // un au moment du clic, au lieu d'ouvrir un lien mort.
    function resigner() {
      return C.api.liensSignes([r.fichier]).then(function (m) {
        if (!m[r.fichier]) throw new Error("Fichier introuvable dans le stockage.");
        signes[r.fichier] = m[r.fichier];
        signesLe = Date.now();
        ouvrir.href = m[r.fichier];
        telecharger.href = urlTelechargement(m[r.fichier], nom);
        return m[r.fichier];
      });
    }
    ouvrir.addEventListener("click", function (e) {
      if (signes[r.fichier] && !perime()) return;
      e.preventDefault();
      // Fenêtre ouverte tout de suite, dans le geste de l'utilisateur :
      // ouverte après l'attente réseau, le bloqueur de pop-up la tuerait.
      var w = window.open("", "_blank");
      resigner().then(function (url) {
        if (w) { w.opener = null; w.location.href = url; } else location.href = url;
      }).catch(function (err) { if (w) w.close(); C.toast(err.message, "erreur"); });
    });
    telecharger.addEventListener("click", function (e) {
      if (signes[r.fichier] && !perime()) return;
      e.preventDefault();
      resigner().then(function () { telecharger.click(); })
        .catch(function (err) { C.toast(err.message, "erreur"); });
    });
    return h("div.ressource.ressource-fichier", ouvrir, telecharger);
  }

  // Sur petit écran, le panneau passe après le cours : les documents du
  // cours restent accessibles tout de suite, sous le titre.
  function docsRapides(fiche, signes, signesLe) {
    var fichiers = C.trier(fiche.ressources.filter(function (r) { return r.fichier; }), "titre");
    if (!fichiers.length) return null;
    return h("div.docs-rapides", { "aria-label": "Documents du cours" },
      h("p.docs-rapides-titre", icone("file-earmark-arrow-down"), "Documents du cours"),
      fichiers.map(function (r) { return lienRessource(r, signes, signesLe); }));
  }

  // « Reprendre » sur l'accueil : la dernière fiche lue, sur cet appareil.
  function memoriserLecture(fiche) {
    try { localStorage.setItem("codex.derniere", fiche.id); } catch (e) { /* stockage indisponible : tant pis */ }
  }
  function derniereLecture() {
    var id = null;
    try { id = localStorage.getItem("codex.derniere"); } catch (e) { return null; }
    return id && C.etat.ficheParId[id] && !C.etat.ficheParId[id].accueil ? C.etat.ficheParId[id] : null;
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
    zone.appendChild(h("a.graphe-global", { href: "#/graphe", title: "Graphe complet", "aria-label": "Graphe complet" }, icone("arrows-angle-expand")));
    var carte = h("section.carte.carte-graphe", { "aria-labelledby": "titre-graphe" },
      h("h2.carte-titre", { id: "titre-graphe" }, "Graphe"), zone);
    // Monté après insertion dans la page : il lui faut une taille.
    requestAnimationFrame(function () {
      if (!zone.isConnected) return;
      // Sur l'accueil : tout le cours ; sur une fiche : ses voisins directs (comme Quartz).
      var g = C.graphe.monter(zone, fiche.accueil ? { compact: true } : { centre: fiche.id, profondeur: 1, compact: true });
      nettoyages.push(g.detruire);
    });
    return carte;
  }

  // ---- Révision : corrigés et exercices faits ----
  // Un « exercice » est un corrigé repliable (::: corrige- …, ou le genre
  // succes replié) ou un encadré corrige. Sa clé de suivi : l'ancre de la
  // section qui le précède + son rang dans la section. Renommer la
  // section fait donc « oublier » l'exercice : c'est le prix d'une clé qui
  // ne dépend pas de la position dans toute la fiche.
  function exercicesDe(prose) {
    var liste = [], section = "debut", rang = 0;
    prose.querySelectorAll("h1, h2, h3, h4, details.encadre-succes, .encadre-corrige").forEach(function (n) {
      if (/^H[1-4]$/.test(n.tagName)) {
        section = n.id ? n.id.replace(/^h-/, "") : C.slug(n.textContent);
        rang = 0;
        return;
      }
      if (n.parentElement && n.parentElement.closest(".encadre")) return; // encadré dans un encadré
      rang++;
      liste.push({ el: n, cle: (section + "#" + rang).slice(0, 200) });
    });
    return liste;
  }

  function revision(fiche, exos) {
    if (!exos.length) return null;
    var faits = {};
    var repliables = exos.map(function (x) { return x.el; }).filter(function (el) { return el.tagName === "DETAILS"; });
    var texte = h("span.revision-texte", "Chargement du suivi…");
    var rempli = h("span.revision-rempli");
    var barre = h("span.revision-barre", { role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(exos.length), "aria-label": "Exercices faits" }, rempli);
    var bascule = h("button.btn.btn-mini", { type: "button" });
    var carte = h("section.carte.carte-revision", { "aria-labelledby": "titre-revision" },
      h("h2.carte-titre", { id: "titre-revision" }, icone("check2-square"), "Révision"),
      h("div.revision-etat", texte, barre),
      repliables.length ? bascule : null);

    function majBascule() {
      var fermes = repliables.some(function (d) { return !d.open; });
      C.vider(bascule).appendChild(icone(fermes ? "eye" : "eye-slash"));
      bascule.appendChild(document.createTextNode(fermes ? " Afficher les corrigés" : " Masquer les corrigés"));
      bascule.setAttribute("aria-label", (fermes ? "Afficher" : "Masquer") + " tous les corrigés de la fiche");
    }
    bascule.addEventListener("click", function () {
      var ouvrir = repliables.some(function (d) { return !d.open; });
      repliables.forEach(function (d) { d.open = ouvrir; });
      majBascule();
    });
    repliables.forEach(function (d) { d.addEventListener("toggle", majBascule); });
    majBascule();

    function majCompte() {
      var n = exos.filter(function (x) { return faits[x.cle]; }).length;
      var pl = exos.length > 1 ? "s" : "";
      texte.textContent = n + " / " + exos.length + " exercice" + pl + " fait" + pl;
      rempli.style.width = (n / exos.length * 100) + "%";
      barre.setAttribute("aria-valuenow", String(n));
      carte.classList.toggle("revision-finie", n === exos.length);
    }

    // Un bouton sous chaque corrigé.
    var boutons = exos.map(function (x) {
      var b = h("button.exo-fait", { type: "button", "aria-pressed": "false", disabled: true });
      function dessiner() {
        var fait = !!faits[x.cle];
        b.setAttribute("aria-pressed", String(fait));
        C.vider(b).appendChild(icone(fait ? "check-circle-fill" : "circle"));
        b.appendChild(h("span", fait ? "Fait" : "Marquer comme fait"));
        x.el.classList.toggle("exo-termine", fait);
      }
      b.addEventListener("click", function () {
        var fait = !faits[x.cle];
        if (fait) faits[x.cle] = true; else delete faits[x.cle];
        dessiner();
        majCompte();
        b.disabled = true;
        C.api.marquerFait(fiche.id, x.cle, fait).catch(function (e) {
          if (fait) delete faits[x.cle]; else faits[x.cle] = true;
          dessiner();
          majCompte();
          C.toast(e.message, "erreur");
        }).then(function () { b.disabled = false; });
      });
      x.el.insertAdjacentElement("afterend", b);
      dessiner();
      return { b: b, dessiner: dessiner };
    });

    C.api.progression(fiche.id).then(function (cles) {
      cles.forEach(function (c) { faits[c] = true; });
      boutons.forEach(function (o) { o.b.disabled = false; o.dessiner(); });
      majCompte();
    }).catch(function (e) {
      texte.textContent = "Suivi indisponible : " + e.message;
      boutons.forEach(function (o) { o.b.title = e.message; });
    });
    return carte;
  }

  // Sommaire à la Quartz : repliable, et les titres actuellement à l'écran
  // restent nets tandis que les autres s'estompent — on voit d'un coup
  // d'œil où l'on se trouve dans une longue fiche.
  function sommaire(plan, ficheId, nettoyages) {
    if (plan.length < 2) return null;
    var liens = {};
    var liste = h("ol.sommaire", plan.map(function (p) {
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
    }));
    var bascule = h("button.carte-repli", { type: "button", "aria-expanded": "true" }, "Sommaire", icone("chevron-down"));
    bascule.addEventListener("click", function () {
      var o = bascule.getAttribute("aria-expanded") !== "true";
      bascule.setAttribute("aria-expanded", String(o));
      liste.hidden = !o;
    });
    var nav = h("nav.carte.carte-sommaire", { "aria-label": "Sommaire" }, h("h2.carte-titre", bascule), liste);

    // Une section est « à l'écran » tant qu'une partie de son contenu
    // (du titre jusqu'au titre suivant) est visible.
    var visibles = {};
    var obs = new IntersectionObserver(function (entrees) {
      entrees.forEach(function (e) { visibles[e.target.dataset.section] = e.isIntersecting; });
      var aucun = !Object.keys(visibles).some(function (k) { return visibles[k]; });
      plan.forEach(function (p) { liens[p.id].classList.toggle("dans-vue", aucun || !!visibles[p.id]); });
    });
    requestAnimationFrame(function () {
      plan.forEach(function (p, i) {
        var titre = document.getElementById(p.id);
        if (!titre) return;
        // On observe le titre et ce qui le suit jusqu'au titre suivant.
        var fin = plan[i + 1] ? document.getElementById(plan[i + 1].id) : null;
        for (var n = titre; n && n !== fin; n = n.nextElementSibling) {
          n.dataset.section = p.id;
          obs.observe(n);
        }
      });
    });
    nettoyages.push(function () { obs.disconnect(); });
    return nav;
  }

  // ---- Aperçu au survol d'un lien [[fiche]] ----
  var cache = {};
  function brancherApercus(racine, nettoyages) {
    var bulle = null, minuterie = 0, courant = null, fini = false;
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
        // Fiche arrivée après un changement de page, ou lien retiré entre-temps.
        if (fini || courant !== a || !f || !a.isConnected) return;
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
    // `racine` est le conteneur de la vue, réutilisé par la page suivante : sans
    // ce retrait, les anciens écouteurs ouvraient des bulles que plus rien ne fermait.
    nettoyages.push(function () {
      fini = true;
      fermer();
      racine.removeEventListener("mouseover", entree);
      racine.removeEventListener("mouseout", sortie);
      window.removeEventListener("scroll", fermer);
    });
  }

  // ---- Listes de pages (dossier, tag, récents), comme les pages de
  // dossier de Quartz : date, titre, emplacement, tags. ----
  function listeFiches(fiches, tagsParFiche) {
    if (!fiches.length) return h("p.prose-vide", "Aucune fiche ici pour l'instant.");
    return h("ul.liste-pages", fiches.map(function (f) {
      var chemin = C.nav.chemin(f.dossier_id).map(function (d) { return d.titre; }).join(" › ");
      var tags = (tagsParFiche && tagsParFiche[f.id]) || [];
      return h("li.page-item",
        h("span.page-date", { title: C.dateComplete(f.maj_le) }, C.dateCourte(f.maj_le)),
        h("div.page-desc",
          h("a.page-titre", { href: "#/fiche/" + f.id }, f.titre),
          chemin ? h("span.page-chemin", chemin) : null),
        tags.length ? h("ul.page-tags", tags.map(function (t) { return h("li", h("a.etiquette", { href: "#/tag/" + encodeURIComponent(t) }, "#" + t)); })) : null);
    }));
  }

  // Sous la note d'accueil : les dossiers et les fiches modifiées récemment.
  function indexAccueil() {
    var e = C.etat;
    var racines = C.nav.sousDossiers(null);
    var recentes = e.fiches.filter(function (f) { return !f.accueil; })
      .sort(function (a, b) { return b.maj_le < a.maj_le ? -1 : 1; }).slice(0, 8);
    if (!racines.length && !recentes.length) return null;
    // Quand l'arbre a des matières : une carte par matière (fiches,
    // exercices, documents), plus lisible qu'une arborescence.
    var cartes = C.pages ? C.pages.cartesMatieres() : null;
    var derniere = derniereLecture();
    var reprendre = derniere ? h("a.reprendre", { href: "#/fiche/" + derniere.id },
      icone("bookmark-check"),
      h("span.reprendre-texte", h("span.reprendre-label", "Reprendre ma lecture"), h("span.reprendre-titre", derniere.titre),
        h("span.reprendre-chemin", C.nav.chemin(derniere.dossier_id).map(function (d) { return d.titre; }).join(" › "))),
      icone("arrow-right")) : null;
    if (cartes) {
      return h("div.index-accueil", reprendre,
        h("h2.index-titre", "Les cours"), cartes,
        recentes.length ? h("div.prose", h("h2", "Modifié récemment"), listeFiches(recentes)) : null);
    }
    return h("div.prose.index-accueil",
      racines.length ? h("h2", "Les cours") : null,
      racines.length ? h("ul.index-dossiers", racines.map(function (d) {
        var sous = C.nav.sousDossiers(d.id);
        return h("li.index-dossier",
          h("a.page-titre", { href: "#/dossier/" + d.id }, d.titre),
          h("span.page-chemin", C.nav.nbFiches(d.id) + " fiche" + (C.nav.nbFiches(d.id) > 1 ? "s" : "")),
          sous.length ? h("ul.index-sous", sous.map(function (s) {
            return h("li", h("a", { href: "#/dossier/" + s.id }, s.titre));
          })) : null);
      })) : null,
      recentes.length ? h("h2", "Modifié récemment") : null,
      recentes.length ? listeFiches(recentes) : null);
  }

  // ---- La vue ----
  // options.accueil : c'est la note d'accueil (page d'arrivée) ; on
  // ajoute alors l'index des cours sous son contenu.
  function vue(el, id, section, options) {
    options = options || {};
    // `el` reste dans la page d'une vue à l'autre : `isConnected` ne dit pas si
    // on l'a quittée. `quittee` empêche une fiche lente d'écraser la page suivante.
    var nettoyages = [], quittee = false;
    el.appendChild(C.chargement("Ouverture de la fiche…"));
    C.nav.activer(options.accueil ? null : id);

    C.api.fiche(id).then(function (fiche) {
      if (quittee || !el.isConnected) return;
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
        if (quittee || !el.isConnected) return;
        construire(el, fiche, section, signes, signesLe, nettoyages, options);
      });
    }).catch(function (e) {
      if (quittee) return;
      C.vider(el);
      el.appendChild(C.etatVide("wifi-off", "Impossible d'ouvrir la fiche", e.message,
        h("button.btn", { type: "button", on: { click: function () { C.routeur(); } } }, "Réessayer")));
    });

    return function () { quittee = true; nettoyages.forEach(function (f) { f(); }); };
  }

  function construire(el, fiche, section, signes, signesLe, nettoyages, options) {
    document.title = options.accueil ? "Codex" : fiche.titre + " · Codex";
    var fil = C.nav.chemin(fiche.dossier_id);
    var prose = h("div.prose", { id: "prose" });
    var base = options.accueil ? "#/" : "#/fiche/" + fiche.id + "/";
    var plan = C.rendu.rendre(prose, fiche.contenu, {
      titre: fiche.titre,
      lienSection: options.accueil ? null : function (s) { return base + s; }
    });
    if (!fiche.contenu.trim()) prose.appendChild(h("p.prose-vide", "Cette fiche est encore vide."));

    var entete = h("header.fiche-entete",
      options.accueil ? null : h("nav.fil", { "aria-label": "Emplacement" },
        h("a", { href: "#/" }, "Accueil"),
        fil.map(function (d) {
          return [h("span.fil-sep", { "aria-hidden": "true" }, "›"), h("a", { href: "#/dossier/" + d.id }, d.titre)];
        })),
      h("div.fiche-titre-ligne",
        h("h1.fiche-titre", fiche.titre),
        C.peutEcrire() ? h("a.btn.btn-mini", { href: "#/editer/" + fiche.id, title: "Modifier cette fiche" }, icone("pencil"), "Modifier") : null),
      h("p.fiche-meta",
        h("span", { title: C.dateComplete(fiche.maj_le) }, C.dateCourte(fiche.maj_le)),
        h("span", Math.max(1, Math.round(fiche.contenu.split(/\s+/).length / 220)) + " min de lecture"),
        fiche.maj_par ? h("span", "par " + C.prenom(C.api.identifiantDe(fiche.maj_par))) : null),
      options.accueil ? null : docsRapides(fiche, signes, signesLe));
    if (!options.accueil) memoriserLecture(fiche);

    var panneau = h("aside.panneau", { "aria-label": "Ressources et navigation" },
      options.accueil && !fiche.ressources.length ? null : carteRessources(fiche, signes, signesLe),
      revision(fiche, exercicesDe(prose)),
      carteGraphe(fiche, nettoyages),
      sommaire(plan, fiche.id, nettoyages),
      carteCitePar(fiche));

    var corps = h("article.fiche-corps", prose, options.accueil ? indexAccueil() : null,
      h("footer.pied", h("hr"), h("p", "Codex · les cours de la promo · ",
        h("a", { href: "#/graphe" }, "graphe"), " · ", h("a", { href: "#/" }, "accueil"))));

    el.appendChild(h("div.lecture" + (options.accueil ? ".accueil" : ""), entete, panneau, corps));
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
  C.vues.listeFiches = listeFiches;
  C.vues.lienRessource = lienRessource;
})(window.Codex);

/* ============================================================
   CODEX — démarrage, session, routeur et coquille de l'application

   Routes (tout passe par le # : GitHub Pages ne sert que des fichiers,
   il n'y a pas de serveur pour réécrire les adresses) :
     #/                      la note d'accueil (comme l'index de Quartz)
     #/fiche/<id>[/<titre>]  lecture, éventuellement sur une section
     #/dossier/<id>          page d'un dossier : ce qu'il contient
     #/tag[/<tag>]           tous les tags, ou les fiches d'un tag
     #/editer/<id>[/ressources]
     #/nouvelle[/<dossier>]  nouvelle fiche
     #/graphe                graphe complet
     #/admin                 membres et comptes
   ============================================================ */
(function (C) {
  "use strict";
  var h = C.h, icone = C.icone;
  var cfg = window.CODEX_CONFIG || {};

  C.etat = {
    email: null, role: null,
    dossiers: [], fiches: [], aretes: [],
    dossierParId: {}, ficheParId: {}
  };
  C.peutEcrire = function () { return C.etat.role === "admin" || C.etat.role === "editeur"; };
  C.estAdmin = function () { return C.etat.role === "admin"; };
  C.garde = null; // fonction « modifications non enregistrées ? » de l'éditeur

  var racine = document.getElementById("codex");
  var vueEl = null, nettoyer = null, hashCourant = null, demarre = false;

  function lireStockage(cle) { try { return localStorage.getItem(cle); } catch (e) { return null; } }
  function ecrireStockage(cle, v) { try { localStorage.setItem(cle, v); } catch (e) { /* stockage bloqué */ } }

  // ---- Données partagées : arbre + arêtes du graphe ----
  function recharger() {
    return Promise.all([C.api.arbre(), C.api.graphe().catch(function () { return []; })]).then(function (r) {
      var e = C.etat;
      e.dossiers = r[0].dossiers;
      e.fiches = r[0].fiches;
      e.aretes = r[1];
      e.dossierParId = {}; e.ficheParId = {};
      e.dossiers.forEach(function (d) { e.dossierParId[d.id] = d; });
      e.fiches.forEach(function (f) { e.ficheParId[f.id] = f; });
      var parTitre = {};
      e.fiches.forEach(function (f) { parTitre[C.plier(f.titre)] = f; });
      C.rendu.definirResolveur(function (t) { return parTitre[C.plier(t)] || null; });
      tagsEnCache = null;
      C.nav.rendre();
    });
  }
  C.recharger = recharger;

  // Tags de toutes les fiches, chargés à la première page qui en a besoin.
  var tagsEnCache = null;
  function tags() {
    if (!tagsEnCache) {
      tagsEnCache = C.api.etiquettes().then(function (lignes) {
        var parFiche = {}, parTag = {};
        lignes.forEach(function (l) {
          (parFiche[l.fiche_id] = parFiche[l.fiche_id] || []).push(l.tag);
          (parTag[l.tag] = parTag[l.tag] || []).push(l.fiche_id);
        });
        return { parFiche: parFiche, parTag: parTag };
      }).catch(function (e) { tagsEnCache = null; throw e; });
    }
    return tagsEnCache;
  }

  // ---- Écrans hors application ----
  function ecran(contenu) {
    racine.className = "ecran-seul";
    racine.removeAttribute("aria-busy");
    C.vider(racine).appendChild(h("main.ecran-carte", h("div.logo-grand", C.logo(false)), contenu));
  }

  function ecranConfig() {
    ecran(h("div",
      h("h1.ecran-titre", "Codex n'est pas encore branché"),
      h("p", "Il manque l'adresse du projet Supabase ou sa clé publique dans ", h("code", "assets/js/config.js"), "."),
      h("p", "Les étapes sont dans ", h("code", "codex/README.md"), ".")));
  }

  function ecranConnexion(message) {
    var retour = h("div.ecran-message", { role: "status", "aria-live": "polite" }, message ? h("p.alerte-texte", message) : null);
    function erreurEcran(err) { C.vider(retour).appendChild(h("p.alerte-texte", err.message)); }

    // Identifiant + mot de passe : les comptes créés par un admin.
    var identifiant = h("input.champ", { type: "text", required: true, autocomplete: "username", autocapitalize: "none", spellcheck: "false", id: "identifiant", placeholder: "prenom.nom" });
    var mdp = h("input.champ", { type: "password", required: true, autocomplete: "current-password", id: "mot-de-passe" });
    var bouton = h("button.btn.btn-primaire.btn-large", { type: "submit" }, "Se connecter");
    var form = h("form.ecran-form",
      h("label.champ-label", { for: "identifiant" }, "Identifiant ou e-mail"), identifiant,
      h("label.champ-label", { for: "mot-de-passe" }, "Mot de passe"), mdp,
      bouton);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      bouton.disabled = true;
      bouton.textContent = "Connexion…";
      C.api.connexion(identifiant.value, mdp.value).catch(function (err) {
        erreurEcran(err);
        bouton.disabled = false;
        bouton.textContent = "Se connecter";
        mdp.select();
      });
      // La suite (démarrage) passe par l'événement SIGNED_IN.
    });

    // Lien magique : seulement pour les comptes qui ont un vrai e-mail.
    var email = h("input.champ", { type: "email", required: true, autocomplete: "email", id: "email-connexion", placeholder: "prenom.nom@etu.univ.fr" });
    var boutonLien = h("button.btn.btn-large", { type: "submit" }, "Recevoir un lien de connexion");
    var formLien = h("form.ecran-form", { hidden: true },
      h("label.champ-label", { for: "email-connexion" }, "Ton adresse e-mail"), email, boutonLien);
    formLien.addEventListener("submit", function (e) {
      e.preventDefault();
      boutonLien.disabled = true;
      C.api.envoyerLien(email.value).then(function () {
        C.vider(retour).appendChild(h("div.alerte.alerte-ok", icone("envelope-check"),
          h("div", h("strong", "Si un compte existe pour " + email.value.trim() + ", un lien vient de partir."),
            h("p", "Ouvre-le sur cet appareil ou un autre. Pense aux indésirables."))));
        formLien.hidden = true;
      }).catch(function (err) { erreurEcran(err); boutonLien.disabled = false; });
    });
    var bascule = h("button.lien-discret", { type: "button" }, "Se connecter par un lien e-mail");
    bascule.addEventListener("click", function () {
      var versLien = formLien.hidden;
      formLien.hidden = !versLien;
      form.hidden = versLien;
      bascule.textContent = versLien ? "Se connecter avec un mot de passe" : "Se connecter par un lien e-mail";
      C.vider(retour);
      (versLien ? email : identifiant).focus();
    });

    var google = cfg.connexionGoogle ? h("div",
      h("div.separateur", h("span", "ou")),
      h("button.btn.btn-large.btn-google", { type: "button", on: { click: function () {
        C.api.connexionGoogle().catch(erreurEcran);
      } } }, icone("google"), "Continuer avec Google")) : null;

    ecran(h("div",
      h("p.ecran-intro", "Les cours de la promo. Accès réservé aux membres."),
      form, formLien, retour, google,
      cfg.connexionLien === false ? null : h("p.ecran-pied", bascule),
      h("p.ecran-pied", "Pas encore de compte ? Demande-le à " + (cfg.responsable || "l'admin") + ".")));
    identifiant.focus();
  }

  function ecranNonMembre(email) {
    ecran(h("div",
      h("h1.ecran-titre", "Compte pas encore autorisé"),
      h("p", "Tu es connecté avec ", h("strong", C.api.identifiantDe(email)), ", mais ce compte n'a pas accès aux cours."),
      h("p", "Demande à " + (cfg.responsable || "l'admin") + " de l'ajouter, puis recharge la page."),
      h("div.ecran-actions",
        h("button.btn", { type: "button", on: { click: function () { location.reload(); } } }, icone("arrow-clockwise"), "Recharger"),
        h("button.btn", { type: "button", on: { click: deconnexion } }, icone("box-arrow-right"), "Changer de compte"))));
  }

  function deconnexion() {
    C.api.deconnexion().catch(function () { /* session déjà expirée */ }).then(function () {
      location.hash = "";
      location.reload();
    });
  }

  function changerMotDePasse() {
    C.dialogue({
      titre: "Changer mon mot de passe",
      texte: "10 caractères minimum. Une phrase de quelques mots est plus sûre et plus facile à retenir qu'un mot compliqué.",
      champ: { type: "password", label: "Nouveau mot de passe", max: 200 },
      confirmer: "Changer"
    }).then(function (v) {
      if (!v) return;
      if (v.length < 10) { C.toast("Trop court : 10 caractères minimum.", "erreur"); return; }
      C.api.changerMotDePasse(v).then(function () { C.toast("Mot de passe changé.", "ok"); })
        .catch(function (e) { C.toast(e.message, "erreur"); });
    });
  }

  // ---- Coquille : colonne de gauche (titre, recherche, explorateur,
  // compte) et zone de vue, disposées comme Quartz. L'en-tête ne sert
  // qu'au mobile. ----
  function coquille() {
    racine.className = "app";
    racine.removeAttribute("aria-busy");
    C.vider(racine);
    if (lireStockage("codex.lecture") === "oui") document.body.classList.add("mode-lecture");

    vueEl = h("main.vue", { id: "vue", tabindex: "-1" });
    var voile = h("div.voile", { on: { click: fermerNav } });
    var arbre = h("div.nav-arbre");

    var theme = h("button.btn-icone.btn-theme", { type: "button", title: "Thème clair / sombre", "aria-label": "Changer de thème" },
      icone(document.documentElement.dataset.theme === "sombre" ? "moon" : "sun"));
    theme.addEventListener("click", function () {
      var t = document.documentElement.dataset.theme === "sombre" ? "clair" : "sombre";
      document.documentElement.dataset.theme = t;
      theme.firstChild.className = "bi bi-" + (t === "sombre" ? "moon" : "sun");
      ecrireStockage("codex.theme", t);
    });
    var lecture = h("button.btn-icone.btn-lecture", { type: "button", title: "Mode lecture", "aria-label": "Mode lecture", "aria-pressed": String(document.body.classList.contains("mode-lecture")) }, icone("book"));
    lecture.addEventListener("click", basculerLecture);

    var compte = h("button.compte", { type: "button", "aria-label": "Mon compte" },
      h("span.avatar", C.prenom(C.api.identifiantDe(C.etat.email)).charAt(0) || "?"),
      h("span.compte-role", C.api.identifiantDe(C.etat.email)));
    compte.addEventListener("click", function () {
      C.menu(compte, [
        { icone: "person-circle", texte: C.api.identifiantDe(C.etat.email) + " · " + C.ROLES[C.etat.role], desactive: true, action: function () {} },
        { icone: "key", texte: "Changer mon mot de passe", action: changerMotDePasse },
        { icone: "box-arrow-right", texte: "Se déconnecter", action: deconnexion }
      ]);
    });

    var nav = h("aside.nav", { id: "nav", "aria-label": "Navigation" },
      h("div.nav-marque", C.logo(true)),
      h("div.nav-outils", boutonRecherche(), theme, lecture),
      arbre,
      h("div.nav-pied",
        h("a.nav-lien", { href: "#/graphe" }, icone("diagram-3"), "Graphe des cours"),
        h("a.nav-lien", { href: "#/tag" }, icone("hash"), "Tags"),
        C.estAdmin() ? h("a.nav-lien", { href: "#/admin" }, icone("people"), "Membres") : null,
        h("div.nav-compte", compte)));

    var burger = h("button.btn-icone.burger", { type: "button", "aria-label": "Afficher les cours", "aria-controls": "nav", "aria-expanded": "false" }, icone("list"));
    burger.addEventListener("click", function () {
      var o = !document.body.classList.contains("nav-ouverte");
      document.body.classList.toggle("nav-ouverte", o);
      burger.setAttribute("aria-expanded", String(o));
    });

    racine.appendChild(h("header.entete", burger, C.logo(true),
      h("button.btn-icone", { type: "button", "aria-label": "Rechercher", on: { click: ouvrirRecherche } }, icone("search"))));
    racine.appendChild(nav);
    racine.appendChild(voile);
    racine.appendChild(vueEl);
    racine.appendChild(h("button.sortie-lecture", { type: "button", title: "Quitter le mode lecture (Échap)", "aria-label": "Quitter le mode lecture", on: { click: basculerLecture } }, icone("layout-sidebar")));
    C.nav.monter(arbre);
  }

  // Mode lecture (comme Quartz) : les colonnes disparaissent, il ne reste
  // que la fiche. Échap ou le bouton flottant en sortent.
  function basculerLecture() {
    var o = !document.body.classList.contains("mode-lecture");
    document.body.classList.toggle("mode-lecture", o);
    document.querySelectorAll(".btn-lecture").forEach(function (b) { b.setAttribute("aria-pressed", String(o)); });
    ecrireStockage("codex.lecture", o ? "oui" : "non");
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && document.body.classList.contains("mode-lecture") && !document.querySelector("dialog[open]")) basculerLecture();
  });

  function fermerNav() {
    document.body.classList.remove("nav-ouverte");
    var b = document.querySelector(".burger");
    if (b) b.setAttribute("aria-expanded", "false");
  }

  // ---- Recherche plein texte : une fenêtre, comme celle de Quartz, avec
  // la liste des résultats et l'aperçu de celui qui est sélectionné. ----
  function boutonRecherche() {
    return h("button.recherche-bouton", { type: "button", "aria-label": "Rechercher dans les cours (raccourci /)", on: { click: ouvrirRecherche } },
      icone("search"), h("span", "Rechercher"), h("kbd.raccourci", "/"));
  }

  document.addEventListener("keydown", function (e) {
    var ouvrir = (e.key === "/" && !e.ctrlKey && !e.metaKey) || (e.key && e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey));
    if (!ouvrir || !demarre || !vueEl) return;
    var t = e.target.tagName;
    if (e.key === "/" && (t === "INPUT" || t === "TEXTAREA" || t === "SELECT" || e.target.isContentEditable)) return;
    e.preventDefault();
    ouvrirRecherche();
  });

  var cacheApercu = {};
  function ouvrirRecherche() {
    if (document.querySelector("dialog.recherche-modale")) return;
    var champ = h("input.recherche-champ", { type: "search", placeholder: "Chercher une fiche, une notion, une formule…", "aria-label": "Rechercher dans les cours", autocomplete: "off", role: "combobox", "aria-expanded": "false", "aria-controls": "resultats" });
    var liste = h("ul.resultats", { id: "resultats", role: "listbox" });
    var apercu = h("div.recherche-apercu.prose");
    var d = h("dialog.recherche-modale", { "aria-label": "Recherche" },
      h("div.recherche-tete", icone("search"), champ, h("kbd", "Échap")),
      h("div.recherche-corps", liste, apercu));
    var items = [], index = -1, derniere = "";

    function fermer() { if (d.open) d.close(); d.remove(); }
    d.addEventListener("close", function () { d.remove(); });
    d.addEventListener("click", function (e) { if (e.target === d) fermer(); });

    function surligner(texte, q) {
      var p = C.plier(texte), pq = C.plier(q), i = p.indexOf(pq);
      if (i < 0 || !pq) return [texte];
      return [texte.slice(0, i), h("mark", texte.slice(i, i + q.length)), texte.slice(i + q.length)];
    }
    function choisir(i) {
      index = i;
      items.forEach(function (a, k) { a.classList.toggle("actif", k === i); a.setAttribute("aria-selected", String(k === i)); });
      if (!items[i]) return;
      items[i].scrollIntoView({ block: "nearest" });
      var id = items[i].dataset.fiche;
      var p = cacheApercu[id] || (cacheApercu[id] = C.api.fiche(id));
      p.then(function (f) {
        if (index !== i || !f) return;
        C.vider(apercu).appendChild(h("h1", f.titre));
        var zone = h("div");
        C.rendu.rendre(zone, f.contenu.slice(0, 4000), { titre: f.titre });
        apercu.appendChild(zone);
        // Met en valeur la première occurrence du terme dans l'aperçu.
        var q = C.plier(derniere);
        var marche = document.createTreeWalker(zone, NodeFilter.SHOW_TEXT);
        for (var n = marche.nextNode(); n; n = marche.nextNode()) {
          var k = C.plier(n.nodeValue).indexOf(q);
          if (k >= 0 && q && k + derniere.length <= n.nodeValue.length) {
            var r = document.createRange(); r.setStart(n, k); r.setEnd(n, k + derniere.length);
            var m = document.createElement("mark"); r.surroundContents(m);
            m.scrollIntoView({ block: "center" });
            break;
          }
        }
      }).catch(function () { delete cacheApercu[id]; });
    }
    function afficher(res, q) {
      C.vider(liste);
      items = res.map(function (r) {
        var chemin = C.nav.chemin(r.dossier_id).map(function (x) { return x.titre; }).join(" › ");
        // Extrait lisible : sans balises d'encadré, commandes LaTeX ni signes Markdown.
        var extrait = (r.extrait || "").replace(/:::\s*[\wÀ-ÿ]*|\[![\w-]+\][+-]?/g, " ").replace(/\\[a-zA-Z]+/g, "")
          .replace(/[#*_`>$\[\]{}]/g, "").replace(/\s+/g, " ").trim();
        var a = h("a.resultat", { href: "#/fiche/" + r.id, role: "option", dataset: { fiche: r.id } },
          h("span.resultat-titre", surligner(r.titre, q)),
          chemin ? h("span.resultat-chemin", chemin) : null,
          extrait ? h("span.resultat-extrait", surligner(extrait, q)) : null);
        a.addEventListener("click", fermer);
        a.addEventListener("mouseenter", function () { choisir(items.indexOf(a)); });
        liste.appendChild(h("li", a));
        return a;
      });
      if (!items.length) {
        liste.appendChild(h("li.resultat-vide", "Aucune fiche ne contient « " + q + " »."));
        C.vider(apercu);
      } else choisir(0);
      champ.setAttribute("aria-expanded", String(items.length > 0));
    }
    var lancer = C.retarder(function () {
      var q = champ.value.trim();
      if (q.length < 2) { C.vider(liste); C.vider(apercu); items = []; return; }
      derniere = q;
      C.api.rechercher(q).then(function (res) { if (q === derniere) afficher(res, q); })
        .catch(function (e) { C.toast(e.message, "erreur"); });
    }, 200);
    champ.addEventListener("input", lancer);
    champ.addEventListener("keydown", function (e) {
      // Dans un champ « search », Échap vide d'abord le texte au lieu de
      // fermer la fenêtre : on ferme directement.
      if (e.key === "Escape") { e.preventDefault(); fermer(); return; }
      if (!items.length) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        choisir((index + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        var cible = items[Math.max(0, index)];
        fermer();
        location.hash = cible.getAttribute("href");
      }
    });
    document.body.appendChild(d);
    d.showModal();
    champ.focus();
  }
  C.ouvrirRecherche = ouvrirRecherche;

  // ---- Accueil : la note d'accueil, comme l'index d'un site Quartz ----
  var MODELE_ACCUEIL = "## Bienvenue\n\nÉcris ici l'introduction de tes cours : à qui ils s'adressent, comment ils sont rangés, par où commencer.\n";

  function vueAccueil(el) {
    var note = C.etat.fiches.filter(function (f) { return f.accueil; })[0];
    if (note) return C.vues.lecture(el, note.id, null, { accueil: true });

    // Pas encore de note d'accueil : une page d'attente sobre.
    document.title = "Codex";
    C.nav.activer(null);
    var recentes = C.etat.fiches.slice().sort(function (a, b) { return b.maj_le < a.maj_le ? -1 : 1; }).slice(0, 10);
    var creer = C.peutEcrire() ? h("button.btn.btn-primaire", { type: "button", on: { click: function () {
      C.api.creerFiche({ titre: "Bienvenue sur Codex", contenu: MODELE_ACCUEIL, dossier_id: null, accueil: true })
        .then(function (f) { return C.recharger().then(function () { location.hash = "#/editer/" + f.id; }); })
        .catch(function (e) { C.toast(e.message, "erreur"); });
    } } }, "Créer la note d'accueil") : null;
    el.appendChild(h("div.page-simple",
      h("header.fiche-entete", h("h1.fiche-titre", "Codex"),
        h("p.accueil-intro", "La note d'accueil n'existe pas encore. C'est la page d'arrivée du site : l'introduction de tous les cours."),
        creer),
      recentes.length ? h("div.prose", h("h2", "Modifié récemment"), C.vues.listeFiches(recentes)) : null));
  }

  // ---- Page d'un dossier (comme les pages de dossier de Quartz) ----
  function vueDossier(el, id) {
    var d = C.etat.dossierParId[id];
    if (!d) { el.appendChild(C.etatVide("folder-x", "Dossier introuvable", null, h("a.btn", { href: "#/" }, "Accueil"))); return; }
    document.title = d.titre + " · Codex";
    C.nav.activer(null);
    var fil = C.nav.chemin(d.parent_id);
    var sous = C.nav.sousDossiers(id);
    var fiches = C.nav.fichesDe(id);
    var zone = h("div.prose");
    var n = C.nav.nbFiches(id);
    el.appendChild(h("div.page-simple",
      h("header.fiche-entete",
        h("nav.fil", { "aria-label": "Emplacement" }, h("a", { href: "#/" }, "Accueil"),
          fil.map(function (x) { return [h("span.fil-sep", "›"), h("a", { href: "#/dossier/" + x.id }, x.titre)]; })),
        h("div.fiche-titre-ligne", h("h1.fiche-titre", d.titre),
          C.peutEcrire() ? h("a.btn.btn-mini", { href: "#/nouvelle/" + id }, icone("plus-lg"), "Nouvelle fiche ici") : null),
        h("p.fiche-meta", n + " fiche" + (n > 1 ? "s" : "") + " dans ce dossier")),
      zone));
    if (sous.length) {
      zone.appendChild(h("h2", "Sous-dossiers"));
      zone.appendChild(h("ul.liste-dossiers", sous.map(function (s) {
        var k = C.nav.nbFiches(s.id);
        return h("li", h("a.page-titre", { href: "#/dossier/" + s.id }, s.titre), h("span.page-chemin", k + " fiche" + (k > 1 ? "s" : "")));
      })));
    }
    zone.appendChild(h("h2", "Fiches"));
    var liste = h("div", C.vues.listeFiches(fiches));
    zone.appendChild(liste);
    // Les tags arrivent après : la liste s'affiche d'abord sans eux.
    tags().then(function (t) { if (liste.isConnected) C.vider(liste).appendChild(C.vues.listeFiches(fiches, t.parFiche)); }).catch(function () {});
  }

  // ---- Tags ----
  function vueTag(el, tag) {
    document.title = (tag ? "#" + tag : "Tags") + " · Codex";
    C.nav.activer(null);
    el.appendChild(C.chargement());
    tags().then(function (t) {
      if (!el.isConnected) return;
      C.vider(el);
      var page = h("div.page-simple");
      el.appendChild(page);
      if (!tag) {
        var noms = Object.keys(t.parTag).sort(C.collator.compare);
        page.appendChild(h("header.fiche-entete", h("h1.fiche-titre", "Tags"),
          h("p.fiche-meta", noms.length ? noms.length + " tag" + (noms.length > 1 ? "s" : "") : "Aucun tag pour l'instant. Écris #mot dans une fiche pour en créer un.")));
        page.appendChild(h("ul.nuage-tags", noms.map(function (nom) {
          return h("li", h("a.etiquette", { href: "#/tag/" + encodeURIComponent(nom) }, "#" + nom), h("span.page-chemin", " " + t.parTag[nom].length));
        })));
        return;
      }
      // Un tag « maths » regroupe aussi « maths/algebre », comme dans Obsidian.
      var ids = {};
      Object.keys(t.parTag).forEach(function (nom) {
        if (nom === tag || nom.indexOf(tag + "/") === 0) t.parTag[nom].forEach(function (i) { ids[i] = true; });
      });
      var fiches = C.trier(Object.keys(ids).map(function (i) { return C.etat.ficheParId[i]; }).filter(Boolean), "titre");
      page.appendChild(h("header.fiche-entete",
        h("nav.fil", h("a", { href: "#/" }, "Accueil"), h("span.fil-sep", "›"), h("a", { href: "#/tag" }, "Tags")),
        h("h1.fiche-titre", "#" + tag),
        h("p.fiche-meta", fiches.length + " fiche" + (fiches.length > 1 ? "s" : "") + " avec ce tag")));
      page.appendChild(h("div.prose", C.vues.listeFiches(fiches, t.parFiche)));
    }).catch(function (e) { C.vider(el).appendChild(C.etatVide("exclamation-octagon", "Tags indisponibles", e.message)); });
  }

  // ---- Graphe complet ----
  function vueGraphe(el) {
    document.title = "Graphe · Codex";
    C.nav.activer(null);
    if (!C.etat.fiches.length) {
      el.appendChild(C.etatVide("diagram-3", "Le graphe est vide", "Il se remplit avec les fiches et les liens [[Titre]] écrits dedans."));
      return;
    }
    var zone = h("div.graphe-plein");
    var ctrl = null;
    el.appendChild(h("div.page-graphe",
      h("header.page-entete.page-entete-ligne",
        h("div", h("h1", "Graphe des cours"),
          h("p.page-intro", "Chaque point est une fiche (les plus clairs sont les dossiers), en bleu la note d'accueil. Les traits pleins sont les liens [[Titre]] écrits dans les fiches, les pointillés le rangement. Glisse un point ou le fond, molette pour zoomer, clic pour ouvrir.")),
        h("div.graphe-commandes",
          h("button.btn-icone", { type: "button", "aria-label": "Zoomer", on: { click: function () { ctrl && ctrl.zoomer(1.3); } } }, icone("zoom-in")),
          h("button.btn-icone", { type: "button", "aria-label": "Dézoomer", on: { click: function () { ctrl && ctrl.zoomer(1 / 1.3); } } }, icone("zoom-out")),
          h("button.btn-icone", { type: "button", "aria-label": "Tout voir", on: { click: function () { ctrl && ctrl.recadrer(); } } }, icone("fullscreen")))),
      zone,
      h("ul.legende",
        h("li", h("span.puce.puce-fiche"), "Fiche"),
        h("li", h("span.puce.puce-dossier"), "Dossier"),
        h("li", h("span.trait.trait-lien"), "Lien [[…]]"),
        h("li", h("span.trait"), "Rangement"))));
    requestAnimationFrame(function () { if (zone.isConnected) ctrl = C.graphe.monter(zone, {}); });
    return function () { if (ctrl) ctrl.detruire(); };
  }

  // ---- Routeur ----
  function routeur() {
    var hash = location.hash || "#/";
    var morceaux = hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);

    if (C.garde && C.garde() && hash !== hashCourant) {
      var cible = hash;
      history.replaceState(null, "", hashCourant);
      C.dialogue({
        titre: "Quitter sans enregistrer ?",
        texte: "Tes modifications de la fiche seront perdues.",
        confirmer: "Quitter sans enregistrer", annuler: "Rester", danger: true
      }).then(function (ok) {
        if (!ok) return;
        C.garde = null;
        location.hash = cible;
      });
      return;
    }

    hashCourant = hash;
    if (nettoyer) { try { nettoyer(); } catch (e) { /* vue déjà démontée */ } nettoyer = null; }
    C.fermerMenu();
    fermerNav();
    C.vider(vueEl);
    vueEl.className = "vue";
    var r = null;

    switch (morceaux[0]) {
      case "fiche":
        r = C.vues.lecture(vueEl, morceaux[1], morceaux[2]);
        break;
      case "dossier":
        r = vueDossier(vueEl, morceaux[1]);
        break;
      case "tag":
        r = vueTag(vueEl, morceaux[1] ? morceaux.slice(1).join("/") : null);
        break;
      case "editer":
        vueEl.classList.add("vue-large");
        r = C.vues.editeur(vueEl, { id: morceaux[1], ancre: morceaux[2] });
        break;
      case "nouvelle":
        vueEl.classList.add("vue-large");
        r = C.vues.editeur(vueEl, { dossier: morceaux[1] });
        break;
      case "graphe":
        vueEl.classList.add("vue-large");
        r = vueGraphe(vueEl);
        break;
      case "admin":
        r = C.vues.admin(vueEl);
        break;
      default:
        r = vueAccueil(vueEl);
    }
    nettoyer = typeof r === "function" ? r : null;
    if (morceaux[0] !== "fiche") window.scrollTo(0, 0);
  }
  C.routeur = routeur;

  window.addEventListener("beforeunload", function (e) {
    if (C.garde && C.garde()) { e.preventDefault(); e.returnValue = ""; }
  });

  // ---- Démarrage ----
  function erreurDansUrl() {
    // Lien magique expiré ou déjà utilisé : Supabase revient avec
    // #error=…&error_description=… et ne nettoie pas l'adresse.
    var p = new URLSearchParams(location.hash.replace(/^#/, ""));
    var code = p.get("error_code");
    if (!p.get("error") && !code) return null;
    history.replaceState(null, "", location.pathname + location.search);
    if (code === "otp_expired") return "Ce lien de connexion a expiré ou a déjà servi. Demandes-en un nouveau.";
    return p.get("error_description") || "La connexion a échoué. Réessaie.";
  }

  function demarrer(session) {
    if (demarre) return;
    demarre = true;
    C.etat.email = (session.user.email || "").toLowerCase();
    C.api.monRole().then(function (role) {
      if (!role) { ecranNonMembre(C.etat.email); return; }
      C.etat.role = role;
      coquille();
      vueEl.appendChild(C.chargement("Chargement des cours…"));
      return recharger().then(function () {
        window.addEventListener("hashchange", routeur);
        routeur();
      });
    }).catch(function (e) {
      demarre = false;
      ecran(h("div", h("h1.ecran-titre", "Codex ne répond pas"), h("p", e.message),
        h("div.ecran-actions", h("button.btn", { type: "button", on: { click: function () { location.reload(); } } }, icone("arrow-clockwise"), "Réessayer"))));
    });
  }

  function lancer() {
    if (!C.api.pret) { ecranConfig(); return; }
    var erreur = erreurDansUrl();
    // getSession attend que supabase-js ait lu (et effacé) les jetons du
    // lien magique dans l'adresse : le routeur ne doit pas passer avant.
    C.api.session().then(function (s) {
      if (/access_token|refresh_token/.test(location.hash)) history.replaceState(null, "", location.pathname + location.search);
      if (s) demarrer(s); else ecranConnexion(erreur);
      C.api.surChangement(function (evenement, s2) {
        if (evenement === "SIGNED_OUT") { if (demarre) location.reload(); }
        else if (evenement === "SIGNED_IN" && s2 && !demarre) demarrer(s2);
      });
    }).catch(function (e) { ecranConnexion(e.message); });
  }

  lancer();
})(window.Codex);

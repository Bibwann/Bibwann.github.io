/* ============================================================
   CODEX — démarrage, session, routeur et coquille de l'application

   Routes (tout passe par le # : GitHub Pages ne sert que des fichiers,
   il n'y a pas de serveur pour réécrire les adresses) :
     #/                      accueil
     #/fiche/<id>[/<titre>]  lecture, éventuellement sur une section
     #/editer/<id>[/ressources]
     #/nouvelle/<dossier>    nouvelle fiche
     #/graphe                graphe complet
     #/admin                 membres
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
      C.nav.rendre();
    });
  }
  C.recharger = recharger;

  // ---- Écrans hors application ----
  function ecran(contenu) {
    racine.className = "ecran-seul";
    racine.removeAttribute("aria-busy");
    C.vider(racine).appendChild(h("main.ecran-carte", h("div.logo.logo-grand", "CODEX"), contenu));
  }

  function ecranConfig() {
    ecran(h("div",
      h("h1.ecran-titre", "Codex n'est pas encore branché"),
      h("p", "Il manque l'adresse du projet Supabase ou sa clé publique dans ", h("code", "assets/js/config.js"), "."),
      h("p", "Les étapes sont dans ", h("code", "codex/README.md"), " : créer le projet, exécuter ", h("code", "supabase/schema.sql"), ", puis copier l'URL et la clé anon.")));
  }

  function ecranConnexion(message) {
    var email = h("input.champ", { type: "email", required: true, autocomplete: "email", placeholder: "prenom.nom@etu.univ.fr", id: "email-connexion" });
    var bouton = h("button.btn.btn-primaire.btn-large", { type: "submit" }, icone("envelope"), "Recevoir un lien de connexion");
    var retour = h("div.ecran-message", { role: "status", "aria-live": "polite" }, message ? h("p.alerte-texte", message) : null);
    var form = h("form.ecran-form",
      h("label.champ-label", { for: "email-connexion" }, "Ton adresse e-mail"),
      email, bouton);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var v = email.value.trim();
      if (!v) return;
      bouton.disabled = true;
      bouton.lastChild.textContent = "Envoi…";
      C.api.envoyerLien(v).then(function () {
        C.vider(retour).appendChild(h("div.alerte.alerte-ok", icone("envelope-check"),
          h("div", h("strong", "Lien envoyé à " + v + "."),
            h("p", "Ouvre-le sur cet appareil ou un autre. Pense à regarder dans les indésirables."))));
        form.hidden = true;
      }).catch(function (err) {
        C.vider(retour).appendChild(h("p.alerte-texte", err.message));
        bouton.disabled = false;
        bouton.lastChild.textContent = "Recevoir un lien de connexion";
      });
    });
    var google = cfg.connexionGoogle ? h("div",
      h("div.separateur", h("span", "ou")),
      h("button.btn.btn-large.btn-google", { type: "button", on: { click: function () {
        C.api.connexionGoogle().catch(function (err) { C.vider(retour).appendChild(h("p.alerte-texte", err.message)); });
      } } }, icone("google"), "Continuer avec Google")) : null;
    ecran(h("div",
      h("h1.ecran-titre", "Les cours de la promo"),
      h("p.ecran-intro", "Un résumé par chapitre, toutes ses ressources à côté. Accès réservé aux membres."),
      form, google, retour,
      h("p.ecran-pied", "Pas de mot de passe : un lien à usage unique arrive par e-mail.")));
    email.focus();
  }

  function ecranNonMembre(email) {
    ecran(h("div",
      h("h1.ecran-titre", "Compte pas encore autorisé"),
      h("p", "Tu es connecté avec ", h("strong", email), ", mais cette adresse n'est pas dans la liste des membres."),
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

  // ---- Coquille : en-tête, barre latérale, zone de vue ----
  function coquille() {
    racine.className = "app";
    racine.removeAttribute("aria-busy");
    C.vider(racine);

    var nav = h("aside.nav", { id: "nav", "aria-label": "Cours" });
    vueEl = h("main.vue", { id: "vue", tabindex: "-1" });
    var voile = h("div.voile", { on: { click: fermerNav } });
    var progression = h("div.progression", { "aria-hidden": "true" });

    var theme = h("button.btn-icone", { type: "button", title: "Thème clair / sombre", "aria-label": "Changer de thème" },
      icone(document.documentElement.dataset.theme === "clair" ? "moon-stars" : "sun"));
    theme.addEventListener("click", function () {
      var t = document.documentElement.dataset.theme === "clair" ? "sombre" : "clair";
      document.documentElement.dataset.theme = t;
      theme.firstChild.className = "bi bi-" + (t === "clair" ? "moon-stars" : "sun");
      try { localStorage.setItem("codex.theme", t); } catch (e) { /* stockage bloqué */ }
    });

    var compte = h("button.compte", { type: "button", "aria-label": "Mon compte" },
      h("span.avatar", C.prenom(C.etat.email).charAt(0) || "?"),
      h("span.compte-role", C.ROLES[C.etat.role]));
    compte.addEventListener("click", function () {
      C.menu(compte, [
        { icone: "person-circle", texte: C.etat.email, desactive: true, action: function () {} },
        C.estAdmin() ? { icone: "people", texte: "Membres", action: function () { location.hash = "#/admin"; } } : null,
        { icone: "box-arrow-right", texte: "Se déconnecter", action: deconnexion }
      ]);
    });

    var burger = h("button.btn-icone.burger", { type: "button", "aria-label": "Afficher les cours", "aria-controls": "nav", "aria-expanded": "false" }, icone("list"));
    burger.addEventListener("click", function () {
      var o = !document.body.classList.contains("nav-ouverte");
      document.body.classList.toggle("nav-ouverte", o);
      burger.setAttribute("aria-expanded", String(o));
    });

    racine.appendChild(h("header.entete",
      burger,
      h("a.logo", { href: "#/", "aria-label": "Codex, accueil" }, "CODEX"),
      recherche(),
      h("div.entete-actions", theme, compte),
      progression));
    racine.appendChild(nav);
    racine.appendChild(voile);
    racine.appendChild(vueEl);
    C.nav.monter(nav);

    // Barre de progression de lecture, sous l'en-tête.
    var tic = false;
    window.addEventListener("scroll", function () {
      if (tic) return;
      tic = true;
      requestAnimationFrame(function () {
        tic = false;
        var max = document.documentElement.scrollHeight - innerHeight;
        progression.style.transform = "scaleX(" + (max > 40 && vueEl.querySelector(".lecture") ? Math.min(1, scrollY / max) : 0) + ")";
      });
    }, { passive: true });
  }

  function fermerNav() {
    document.body.classList.remove("nav-ouverte");
    var b = document.querySelector(".burger");
    if (b) b.setAttribute("aria-expanded", "false");
  }

  // ---- Recherche plein texte ----
  function recherche() {
    var champ = h("input.recherche-champ", { type: "search", placeholder: "Rechercher…", "aria-label": "Rechercher dans les cours", autocomplete: "off", role: "combobox", "aria-expanded": "false", "aria-controls": "resultats" });
    var liste = h("ul.resultats", { id: "resultats", role: "listbox", hidden: true });
    var boite = h("div.recherche", icone("search"), champ, h("kbd.raccourci", "/"), liste);
    var items = [], index = -1, derniere = "";

    function fermer() { liste.hidden = true; champ.setAttribute("aria-expanded", "false"); index = -1; }
    function surligner(texte, q) {
      var p = C.plier(texte), pq = C.plier(q), i = p.indexOf(pq);
      if (i < 0 || !pq) return [texte];
      return [texte.slice(0, i), h("mark", texte.slice(i, i + q.length)), texte.slice(i + q.length)];
    }
    function afficher(res, q) {
      C.vider(liste);
      items = res.map(function (r) {
        var chemin = C.nav.chemin(r.dossier_id).map(function (d) { return d.titre; }).join(" › ");
        var extrait = (r.extrait || "").replace(/[#*_`>$\[\]]/g, "").replace(/\s+/g, " ").trim();
        var a = h("a.resultat", { href: "#/fiche/" + r.id, role: "option" },
          h("span.resultat-titre", surligner(r.titre, q)),
          h("span.resultat-chemin", chemin),
          extrait ? h("span.resultat-extrait", surligner(extrait, q)) : null);
        a.addEventListener("click", function () { fermer(); champ.blur(); });
        liste.appendChild(h("li", a));
        return a;
      });
      if (!items.length) liste.appendChild(h("li.resultat-vide", "Aucune fiche ne contient « " + q + " »."));
      liste.hidden = false;
      champ.setAttribute("aria-expanded", "true");
      index = -1;
    }
    var lancer = C.retarder(function () {
      var q = champ.value.trim();
      if (q.length < 2) { fermer(); return; }
      derniere = q;
      C.api.rechercher(q).then(function (res) { if (q === derniere && document.activeElement === champ) afficher(res, q); })
        .catch(function (e) { C.toast(e.message, "erreur"); });
    }, 220);
    champ.addEventListener("input", lancer);
    champ.addEventListener("focus", function () { if (champ.value.trim().length >= 2) lancer(); });
    champ.addEventListener("blur", function () { setTimeout(fermer, 150); });
    champ.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { fermer(); champ.blur(); return; }
      if (!items.length || liste.hidden) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        index = (index + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items.forEach(function (a, i) { a.classList.toggle("actif", i === index); a.setAttribute("aria-selected", String(i === index)); });
        items[index].scrollIntoView({ block: "nearest" });
      } else if (e.key === "Enter") {
        e.preventDefault();
        var cible = items[Math.max(0, index)];
        fermer();
        champ.blur();
        location.hash = cible.getAttribute("href");
      }
    });
    // « / » ouvre la recherche depuis n'importe où, sauf en train d'écrire.
    document.addEventListener("keydown", function (e) {
      if (e.key !== "/" || e.ctrlKey || e.metaKey) return;
      var t = e.target.tagName;
      if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT" || e.target.isContentEditable) return;
      e.preventDefault();
      champ.focus();
    });
    return boite;
  }

  // ---- Accueil ----
  function vueAccueil(el) {
    document.title = "Codex";
    C.nav.activer(null);
    var e = C.etat;
    var recentes = e.fiches.slice().sort(function (a, b) { return b.maj_le < a.maj_le ? -1 : 1; }).slice(0, 8);
    var matieres = e.dossiers.filter(function (d) { return !d.parent_id; }).length;

    var actions = C.peutEcrire() ? h("div.accueil-actions",
      e.dossiers.length ? h("a.btn.btn-primaire", { href: "#/nouvelle/" + (C.nav.optionsDossiers()[0] || {}).id }, icone("file-earmark-plus"), "Nouvelle fiche") : null,
      h("button.btn", { type: "button", on: { click: function () { C.nav.nouveauDossier(null); } } }, icone("folder-plus"), "Nouveau dossier")) : null;

    el.appendChild(h("div.accueil",
      h("header.accueil-entete",
        h("p.accueil-bonjour", "Bonjour " + C.prenom(e.email)),
        h("h1.accueil-titre", "Les cours de la promo, résumés et rangés."),
        h("div.accueil-chiffres",
          h("div.chiffre", h("strong", String(e.fiches.length)), h("span", "fiche" + (e.fiches.length > 1 ? "s" : ""))),
          h("div.chiffre", h("strong", String(matieres)), h("span", "dossier" + (matieres > 1 ? "s" : "") + " principaux")),
          h("div.chiffre", h("strong", String(e.aretes.length)), h("span", "lien" + (e.aretes.length > 1 ? "s" : "") + " entre fiches"))),
        actions),
      e.fiches.length ? h("section.accueil-section",
        h("h2.section-titre", icone("clock-history"), "Mises à jour récentes"),
        h("ul.cartes-fiches", recentes.map(function (f) {
          var chemin = C.nav.chemin(f.dossier_id).map(function (d) { return d.titre; }).join(" › ");
          return h("li", h("a.carte-fiche", { href: "#/fiche/" + f.id },
            h("span.carte-fiche-chemin", chemin),
            h("span.carte-fiche-titre", f.titre),
            h("span.carte-fiche-meta", C.dateRelative(f.maj_le) + (f.maj_par ? " · " + C.prenom(f.maj_par) : ""))));
        }))) :
        C.etatVide("journal-bookmark", "Aucune fiche pour l'instant",
          C.peutEcrire()
            ? "Crée un dossier (un semestre ou une matière), puis une fiche : colle le résumé de ton IA, ajoute les polys et les annales à côté."
            : "Les premières fiches arrivent bientôt."),
      h("section.accueil-section",
        h("h2.section-titre", icone("keyboard"), "Raccourcis"),
        h("ul.raccourcis",
          h("li", h("kbd", "/"), " rechercher dans tous les cours"),
          C.peutEcrire() ? h("li", h("kbd", "Ctrl"), " + ", h("kbd", "S"), " enregistrer une fiche") : null,
          h("li", h("kbd", "[[Titre]]"), " dans une fiche : lien vers une autre fiche, visible dans le graphe")))));
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
          h("p.page-intro", "Chaque point est une fiche, les points gris sont les dossiers. Les traits colorés sont les liens [[Titre]] écrits dans les fiches. Glisse pour déplacer, molette pour zoomer, clic pour ouvrir.")),
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

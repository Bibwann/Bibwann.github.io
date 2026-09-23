/* ============================================================
   CODEX — outils partagés
   Construction du DOM, dialogues, menus, dates, types de ressources.

   Règle de sécurité de tout le front : le texte venu de la base passe
   par textContent (via `h`), jamais par innerHTML. Le seul HTML injecté
   est celui des fiches, et il sort de DOMPurify (rendu.js).
   ============================================================ */
window.Codex = window.Codex || {};

(function (C) {
  "use strict";

  // h("a.lien", { href: "#/", on: { click: f } }, "texte", enfant, [enfants])
  function h(balise, attrs) {
    var m = /^([a-z0-9]+)((?:\.[\w-]+)*)$/i.exec(balise);
    var el = document.createElement(m[1]);
    if (m[2]) el.className = m[2].slice(1).replace(/\./g, " ");
    var debut = 1;
    if (attrs && typeof attrs === "object" && !(attrs instanceof Node) && !Array.isArray(attrs)) {
      debut = 2;
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === "on") Object.keys(v).forEach(function (e) { el.addEventListener(e, v[e]); });
        else if (k === "class") el.className += (el.className ? " " : "") + v;
        else if (k === "text") el.textContent = v;
        else if (k === "dataset") Object.assign(el.dataset, v);
        else if (k === "value") el.value = v;
        else if (k === "checked" || k === "disabled" || k === "selected" || k === "hidden" || k === "open")
          el[k] = !!v;
        else el.setAttribute(k, v === true ? "" : v);
      });
    }
    ajouter(el, Array.prototype.slice.call(arguments, debut));
    return el;
  }

  function ajouter(el, enfants) {
    enfants.forEach(function (e) {
      if (e == null || e === false) return;
      if (Array.isArray(e)) ajouter(el, e);
      else el.appendChild(e instanceof Node ? e : document.createTextNode(String(e)));
    });
    return el;
  }

  function icone(nom) {
    return h("i", { class: "bi bi-" + nom, "aria-hidden": "true" });
  }

  // Le logo : un marque-page (une fiche qu'on garde sous la main) et le
  // nom. Construit en SVG plutôt qu'en image pour suivre la couleur
  // d'accent des deux thèmes.
  var SVG = "http://www.w3.org/2000/svg";
  function logo(lien) {
    var svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("viewBox", "0 0 17 22");
    svg.setAttribute("class", "logo-marque");
    svg.setAttribute("aria-hidden", "true");
    var ruban = document.createElementNS(SVG, "path");
    ruban.setAttribute("d", "M2 0h13a2 2 0 0 1 2 2v20l-8.5-5.2L0 22V2a2 2 0 0 1 2-2z");
    ruban.setAttribute("fill", "currentColor");
    var trait = document.createElementNS(SVG, "path");
    trait.setAttribute("d", "M5 6.5h7");
    trait.setAttribute("stroke", "var(--fond)");
    trait.setAttribute("stroke-width", "1.8");
    trait.setAttribute("stroke-linecap", "round");
    svg.appendChild(ruban);
    svg.appendChild(trait);
    return lien
      ? h("a.logo", { href: "#/", "aria-label": "Codex, accueil" }, svg, h("span", "Codex"))
      : h("div.logo", svg, h("span", "Codex"));
  }

  function vider(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
    return el;
  }

  // ---- Libellés ----

  // L'ordre de cette liste est l'ordre d'affichage dans le panneau.
  var TYPES = [
    { id: "poly",   un: "Polycopié", plusieurs: "Polycopiés",      icone: "file-earmark-text" },
    { id: "slides", un: "Slides",    plusieurs: "Slides",          icone: "easel2" },
    { id: "td",     un: "TD / TP",   plusieurs: "TD, TP & corrigés", icone: "pencil-square" },
    { id: "annale", un: "Annale",    plusieurs: "Annales",         icone: "journal-check" },
    { id: "video",  un: "Vidéo",     plusieurs: "Vidéos",          icone: "play-btn" },
    { id: "code",   un: "Code",      plusieurs: "Code",            icone: "code-slash" },
    { id: "lien",   un: "Lien",      plusieurs: "Liens",           icone: "link-45deg" }
  ];
  var TYPE = {};
  TYPES.forEach(function (t) { TYPE[t.id] = t; });

  var ROLES = { admin: "Admin", editeur: "Éditeur", lecteur: "Lecteur" };

  // Devine le type d'une ressource d'après son nom ou son URL : c'est le
  // réglage « Auto » de l'éditeur, qui évite de choisir à chaque dépôt.
  function devinerType(nom, url) {
    var s = (nom || "") + " " + (url || "");
    s = s.toLowerCase();
    if (/youtu\.?be|vimeo|dailymotion|\.mp4\b|\.webm\b|peertube/.test(s)) return "video";
    if (/github\.com|gitlab|bitbucket|codeberg|replit|colab\.research|\.ipynb\b|\.zip\b/.test(s)) return "code";
    if (/annale|examen|partiel|\bds\d*\b|\bcc\d*\b|sujet/.test(s)) return "annale";
    if (/\btd\d*\b|\btp\d*\b|corrig|exercice|feuille/.test(s)) return "td";
    if (/slide|diapo|\bcm\d*\b|\.pptx?\b|\.odp\b|keynote/.test(s)) return "slides";
    if (/\.pdf\b|\.docx?\b|\.odt\b|poly|cours/.test(s)) return "poly";
    return url ? "lien" : "poly";
  }

  // ---- Formats ----

  var rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
  var fmtJour = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  var fmtComplet = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" });

  function dateRelative(iso) {
    if (!iso) return "";
    var d = new Date(iso), s = (Date.now() - d.getTime()) / 1000;
    if (s < 45) return "à l'instant";
    if (s < 3600) return rtf.format(-Math.round(s / 60), "minute");
    if (s < 86400) return rtf.format(-Math.round(s / 3600), "hour");
    if (s < 86400 * 7) return rtf.format(-Math.round(s / 86400), "day");
    return "le " + fmtJour.format(d);
  }

  function dateComplete(iso) { return iso ? fmtComplet.format(new Date(iso)) : ""; }
  function dateCourte(iso) { return iso ? fmtJour.format(new Date(iso)) : ""; }

  function taille(o) {
    if (o == null) return "";
    if (o < 1024) return o + " o";
    if (o < 1048576) return (o / 1024).toFixed(0) + " Ko";
    return (o / 1048576).toFixed(1).replace(".", ",") + " Mo";
  }

  // « Chapitre 2 » avant « Chapitre 10 », sans tenir compte des accents.
  var collator = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });
  function trier(liste, cle) {
    return liste.slice().sort(function (a, b) { return collator.compare(a[cle], b[cle]); });
  }

  // Comparaison « humaine » de titres : sans accents, sans casse. Même
  // règle que la fonction SQL plier() — sinon un [[lien]] serait résolu
  // dans la page mais absent du graphe, ou l'inverse.
  function plier(t) {
    return String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  }

  function slug(t) {
    return String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "section";
  }

  function domaine(url) {
    try { return new URL(url).hostname.replace(/^www\./, ""); } catch (e) { return url; }
  }

  function prenom(email) {
    if (!email) return "";
    var p = email.split("@")[0].split(/[._-]/)[0];
    return p.charAt(0).toUpperCase() + p.slice(1);
  }

  function retarder(fn, ms) {
    var t;
    return function () {
      var a = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, a); }, ms);
    };
  }

  // Mot de passe aléatoire lisible (sans 0/O, 1/l/I), ~71 bits d'entropie.
  // Tirage par rejet : 256 n'est pas un multiple de 56, un simple modulo
  // favoriserait les premières lettres.
  function motDePasse() {
    var alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    var limite = 256 - (256 % alphabet.length), s = "";
    while (s.length < 12) {
      crypto.getRandomValues(new Uint8Array(16)).forEach(function (o) {
        if (o < limite && s.length < 12) s += alphabet[o % alphabet.length];
      });
    }
    return s.slice(0, 4) + "-" + s.slice(4, 8) + "-" + s.slice(8);
  }

  var mouvementReduit = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- Notifications ----

  var pile;
  function toast(message, genre) {
    if (!pile) {
      pile = h("div.toasts", { role: "status", "aria-live": "polite" });
      document.body.appendChild(pile);
    }
    var ic = { ok: "check-circle", erreur: "exclamation-octagon", info: "info-circle" }[genre || "info"];
    var t = h("div.toast.toast-" + (genre || "info"), icone(ic), h("span", message));
    pile.appendChild(t);
    setTimeout(function () {
      t.classList.add("sortie");
      setTimeout(function () { t.remove(); }, 300);
    }, genre === "erreur" ? 6000 : 3200);
  }

  // ---- Dialogues ----
  // <dialog> natif : focus piégé, Échap et arrière-plan inerte gratuits.
  // Renvoie une promesse : la valeur saisie (champ), true (confirmation),
  // ou null (annulé).
  function dialogue(o) {
    return new Promise(function (resolve) {
      var champ = null;
      if (o.champ) {
        champ = h("input.champ", {
          type: o.champ.type || "text", value: o.champ.valeur || "",
          placeholder: o.champ.indice || "", maxlength: o.champ.max || 200, required: true,
          "aria-label": o.champ.label || o.titre
        });
      }
      var valider = h("button.btn" + (o.danger ? ".btn-danger" : ".btn-primaire"), { type: "submit" }, o.confirmer || "Valider");
      var annuler = h("button.btn", { type: "button", value: "annuler" }, o.annuler || "Annuler");
      var form = h("form.dialogue-corps", { method: "dialog" },
        h("h2.dialogue-titre", o.titre),
        o.texte ? h("p.dialogue-texte", o.texte) : null,
        o.contenu || null,
        champ,
        h("div.dialogue-actions", annuler, valider)
      );
      var d = h("dialog.dialogue" + (o.large ? ".dialogue-large" : ""), form);
      var fini = false;
      function fermer(v) {
        if (fini) return;
        fini = true;
        d.close();
        d.remove();
        resolve(v);
      }
      annuler.addEventListener("click", function () { fermer(null); });
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        if (champ) {
          var v = champ.value.trim();
          if (!v) { champ.focus(); return; }
          fermer(v);
        } else fermer(true);
      });
      d.addEventListener("cancel", function (e) { e.preventDefault(); fermer(null); });
      d.addEventListener("click", function (e) { if (e.target === d) fermer(null); });
      document.body.appendChild(d);
      d.showModal();
      if (champ) { champ.focus(); champ.select(); } else valider.focus();
    });
  }

  // ---- Menu contextuel (« ⋯ ») ----
  var menuOuvert = null;
  function fermerMenu() {
    if (menuOuvert) { menuOuvert.remove(); menuOuvert = null; }
  }
  document.addEventListener("click", function (e) {
    if (menuOuvert && !menuOuvert.contains(e.target)) fermerMenu();
  }, true);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") fermerMenu(); });
  window.addEventListener("resize", fermerMenu);

  function menu(ancre, items) {
    var etaitOuvert = menuOuvert && menuOuvert._ancre === ancre;
    fermerMenu();
    if (etaitOuvert) return;
    var m = h("div.menu", { role: "menu" }, items.filter(Boolean).map(function (it) {
      return h("button.menu-item" + (it.danger ? ".danger" : ""), {
        type: "button", role: "menuitem", disabled: it.desactive,
        title: it.aide || null,
        on: { click: function () { fermerMenu(); it.action(); } }
      }, icone(it.icone), it.texte);
    }));
    m._ancre = ancre;
    document.body.appendChild(m);
    var r = ancre.getBoundingClientRect(), l = m.offsetWidth, ht = m.offsetHeight;
    var x = Math.min(r.right - l, window.innerWidth - l - 8);
    var y = r.bottom + 4 + ht > window.innerHeight ? r.top - ht - 4 : r.bottom + 4;
    m.style.left = Math.max(8, x) + "px";
    m.style.top = Math.max(8, y) + "px";
    menuOuvert = m;
    var premier = m.querySelector("button:not([disabled])");
    if (premier) premier.focus();
  }

  // ---- Petits états de page ----
  function chargement(texte) {
    return h("div.etat-page", { "aria-busy": "true" }, h("span.rouage"), h("p", texte || "Chargement…"));
  }

  function etatVide(ic, titre, texte, action) {
    return h("div.etat-vide", h("div.etat-vide-icone", icone(ic)), h("h2", titre),
      texte ? h("p", texte) : null, action || null);
  }

  Object.assign(C, {
    h: h, ajouter: ajouter, icone: icone, vider: vider, logo: logo,
    TYPES: TYPES, TYPE: TYPE, ROLES: ROLES, devinerType: devinerType,
    dateRelative: dateRelative, dateComplete: dateComplete, dateCourte: dateCourte, taille: taille,
    trier: trier, collator: collator, plier: plier, slug: slug, domaine: domaine, prenom: prenom,
    retarder: retarder, mouvementReduit: mouvementReduit, motDePasse: motDePasse,
    toast: toast, dialogue: dialogue, menu: menu, fermerMenu: fermerMenu,
    chargement: chargement, etatVide: etatVide
  });
})(window.Codex);

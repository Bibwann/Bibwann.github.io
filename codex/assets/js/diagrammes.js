/* ============================================================
   CODEX — diagrammes (blocs ```mermaid)

   Mermaid n'est chargé qu'à la première fiche qui contient un
   diagramme (≈ 1,5 Mo compressé), depuis jsdelivr, version épinglée et
   vérifiée par SRI comme les autres scripts de la page.

   Sécurité : le SVG produit n'est JAMAIS inséré dans la page. Il est
   affiché dans une <img> (adresse data:) : une image SVG ne peut ni
   exécuter de script, ni charger quoi que ce soit, ni toucher au DOM de
   Codex. Mermaid tourne en securityLevel « strict » (textes nettoyés par
   son propre DOMPurify) et sans étiquettes HTML (htmlLabels: false) :
   du SVG pur, qui s'affiche aussi bien dans une image.
   ============================================================ */
(function (C) {
  "use strict";
  var h = C.h;
  var URL_MERMAID = "https://cdn.jsdelivr.net/npm/mermaid@12.0.0/dist/mermaid.min.js";
  var SRI = "sha384-xzghz1GQ5u9HCpVskeDPqMsdogD1yvuMQbEK53+wi+G70+6J1AG0L2cfi9PHjDWI";

  var chargement = null;
  function charger() {
    if (window.mermaid) return Promise.resolve(window.mermaid);
    if (!chargement) {
      chargement = new Promise(function (ok, ko) {
        var s = document.createElement("script");
        s.src = URL_MERMAID;
        s.integrity = SRI;
        s.crossOrigin = "anonymous";
        s.async = true;
        s.onload = function () {
          if (window.mermaid) ok(window.mermaid);
          else ko(new Error("l'outil de diagrammes ne s'est pas initialisé."));
        };
        s.onerror = function () {
          chargement = null;
          s.remove();
          ko(new Error("l'outil de diagrammes n'a pas pu être chargé (réseau ?)."));
        };
        document.head.appendChild(s);
      });
    }
    return chargement;
  }

  function theme() { return document.documentElement.dataset.theme === "sombre" ? "dark" : "default"; }

  var themeInitialise = null;
  function initialiser(m) {
    var t = theme();
    if (themeInitialise === t) return;
    // Police laissée par défaut (polices système) : l'image SVG ne peut pas
    // charger les polices web, et le texte doit y avoir la même largeur
    // qu'au moment où Mermaid l'a mesuré.
    m.initialize({
      startOnLoad: false, securityLevel: "strict", theme: t,
      htmlLabels: false, flowchart: { htmlLabels: false }, maxTextSize: 20000
    });
    themeInitialise = t;
  }

  // Une image SVG a besoin d'une taille explicite (Mermaid pose
  // width="100%") : on prend celle de sa viewBox. DOMParser produit un
  // document inerte, rien n'y est exécuté.
  function versImage(svg) {
    var doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    var racine = doc.documentElement;
    if (!racine || racine.nodeName.toLowerCase() !== "svg") throw new Error("le dessin produit est illisible.");
    var vb = (racine.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
    var l = vb[2] > 0 ? vb[2] : 600, ht = vb[3] > 0 ? vb[3] : 400;
    racine.setAttribute("width", String(l));
    racine.setAttribute("height", String(ht));
    racine.removeAttribute("style");
    var texte = new XMLSerializer().serializeToString(racine);
    return { url: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(texte), largeur: l, hauteur: ht };
  }

  // Un dessin à la fois (Mermaid mesure le texte dans la page), et un
  // cache par source et par thème : l'aperçu de l'éditeur, qui redessine
  // à chaque frappe, ne relance Mermaid que si le diagramme a changé.
  var cache = {}, file = Promise.resolve(), n = 0;
  function produire(source) {
    var cle = theme() + "\n" + source;
    if (!cache[cle]) {
      var p = file.catch(function () { /* l'échec du précédent ne bloque pas celui-ci */ }).then(function () {
        return charger();
      }).then(function (m) {
        initialiser(m);
        var id = "codex-diagramme-" + (++n);
        // parse() d'abord : en cas d'erreur, render() laisserait un dessin
        // « Syntax error » orphelin au bas de la page.
        return Promise.resolve(m.parse(source)).then(function () {
          return m.render(id, source);
        }).then(function (r) {
          return versImage(r.svg);
        }).finally(function () {
          ["#" + id, "#d" + id].forEach(function (sel) {
            var reste = document.querySelector(sel);
            if (reste && !reste.closest(".diagramme")) reste.remove();
          });
        });
      });
      cache[cle] = p;
      file = p;
      p.catch(function () { delete cache[cle]; });
    }
    return cache[cle];
  }

  function premiereLigne(e) {
    var m = String((e && e.message) || e || "erreur inconnue").split("\n").filter(Boolean)[0] || "erreur inconnue";
    return m.length > 160 ? m.slice(0, 157) + "…" : m;
  }

  function afficher(fig) {
    var source = fig._source;
    fig.dataset.etat = "attente";
    fig.classList.add("en-cours");
    produire(source).then(function (img) {
      C.vider(fig);
      fig.classList.remove("en-cours");
      var legende = source.trim().split("\n")[0].slice(0, 120);
      fig.appendChild(h("img.diagramme-image", {
        src: img.url, alt: "Diagramme (" + legende + ")", decoding: "async",
        width: String(Math.round(img.largeur)), height: String(Math.round(img.hauteur))
      }));
      fig.appendChild(h("details.diagramme-code", h("summary", "Source du diagramme"), h("pre", h("code", source))));
      fig.dataset.etat = "ok";
    }, function (e) {
      C.vider(fig);
      fig.classList.remove("en-cours");
      fig.appendChild(h("p.diagramme-erreur", C.icone("exclamation-triangle"), h("span", "Diagramme non dessiné : " + premiereLigne(e))));
      fig.appendChild(h("pre.diagramme-source", h("code", source)));
      fig.dataset.etat = "erreur";
    });
  }

  // Appelé par rendu.decorer() sur chaque rendu de fiche.
  function dessiner(racine) {
    racine.querySelectorAll("figure.diagramme").forEach(function (fig) {
      if (fig.dataset.etat) return;
      var pre = fig.querySelector(".diagramme-source");
      if (!pre) return;
      fig._source = pre.textContent;
      afficher(fig);
    });
  }

  // Le thème change : les diagrammes affichés sont redessinés aux
  // nouvelles couleurs.
  document.addEventListener("codex:theme", function () {
    document.querySelectorAll("figure.diagramme[data-etat]").forEach(function (fig) {
      if (fig._source) afficher(fig);
    });
  });

  C.diagrammes = { dessiner: dessiner, charger: charger };
})(window.Codex);

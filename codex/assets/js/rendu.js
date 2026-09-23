/* ============================================================
   CODEX — rendu des fiches (Markdown → HTML sûr)

   marked + quatre extensions maison :
     $…$ et $$…$$     formules, rendues par KaTeX
     ::: genre Titre  encadrés de cours (définition, théorème, méthode…)
     [[Titre]]        lien vers une autre fiche (façon Obsidian / Quartz),
                      aussi [[Titre|texte affiché]] et [[Titre#section]]
     ```lang          code coloré par highlight.js, avec bouton Copier

   Les formules sont reconnues PENDANT l'analyse Markdown, pas avant : un
   remplacement préalable des $…$ attraperait aussi ceux des blocs de
   code, et `x_1 * y_2` perdrait ses tirets bas au profit d'italiques.

   Tout le HTML produit passe par DOMPurify avant d'entrer dans la page.
   ============================================================ */
(function (C) {
  "use strict";

  var ECHAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  function echapper(s) { return String(s).replace(/[&<>"']/g, function (c) { return ECHAP[c]; }); }

  // Notations des cours de maths français, absentes de KaTeX ou pas
  // sous cette forme.
  var MACROS = {
    "\\R": "\\mathbb{R}", "\\N": "\\mathbb{N}", "\\Z": "\\mathbb{Z}",
    "\\Q": "\\mathbb{Q}", "\\C": "\\mathbb{C}", "\\K": "\\mathbb{K}",
    "\\P": "\\mathbb{P}", "\\E": "\\mathbb{E}",
    "\\ch": "\\operatorname{ch}", "\\sh": "\\operatorname{sh}", "\\th": "\\operatorname{th}",
    "\\Ker": "\\operatorname{Ker}", "\\Im": "\\operatorname{Im}", "\\Vect": "\\operatorname{Vect}",
    "\\rg": "\\operatorname{rg}", "\\tr": "\\operatorname{tr}", "\\Card": "\\operatorname{Card}"
  };

  function formule(tex, bloc) {
    try {
      return katex.renderToString(tex, {
        displayMode: bloc, throwOnError: false, strict: "ignore",
        trust: false, macros: Object.assign({}, MACROS), output: "htmlAndMathml"
      });
    } catch (e) {
      return '<code class="formule-erreur">' + echapper(tex) + "</code>";
    }
  }

  // Encadrés : alias français et anglais → un genre, une icône, un titre
  // par défaut.
  var GENRES = {
    definition: { icone: "bookmark-star", titre: "Définition" },
    theoreme:   { icone: "award",         titre: "Théorème" },
    propriete:  { icone: "diagram-3",     titre: "Propriété" },
    methode:    { icone: "list-check",    titre: "Méthode" },
    exemple:    { icone: "lightbulb",     titre: "Exemple" },
    astuce:     { icone: "stars",         titre: "Astuce" },
    info:       { icone: "info-circle",   titre: "À savoir" },
    attention:  { icone: "exclamation-triangle", titre: "Attention" },
    danger:     { icone: "x-octagon",     titre: "Piège" },
    ressources: { icone: "box-seam",      titre: "Ressources" }
  };
  var ALIAS = {
    def: "definition", definition: "definition", "définition": "definition",
    theoreme: "theoreme", "théorème": "theoreme", theorem: "theoreme", thm: "theoreme",
    lemme: "theoreme", lemma: "theoreme", corollaire: "theoreme",
    propriete: "propriete", "propriété": "propriete", prop: "propriete", property: "propriete",
    methode: "methode", "méthode": "methode", method: "methode", recette: "methode",
    exemple: "exemple", example: "exemple", ex: "exemple",
    tip: "astuce", astuce: "astuce", conseil: "astuce",
    info: "info", note: "info", remarque: "info", rq: "info",
    warning: "attention", attention: "attention", caution: "attention",
    danger: "danger", piege: "danger", "piège": "danger", important: "danger",
    ressources: "ressources"
  };

  // Titre → fiche, fourni par l'application à partir de l'arbre. Le
  // même appariement (sans accents ni casse) que la fonction SQL
  // `graphe()`, pour que le graphe et les liens affichés concordent.
  var resoudre = function () { return null; };

  var extensions = [
    {
      name: "lienFiche", level: "inline",
      start: function (src) { var i = src.indexOf("[["); return i < 0 ? undefined : i; },
      tokenizer: function (src) {
        var m = /^\[\[([^\]|#\n]+)(?:#([^\]|\n]+))?(?:\|([^\]\n]+))?\]\]/.exec(src);
        if (m) return { type: "lienFiche", raw: m[0], titre: m[1].trim(), section: (m[2] || "").trim(), texte: (m[3] || m[1]).trim() };
      },
      renderer: function (t) {
        var f = resoudre(t.titre);
        if (!f) {
          return '<span class="lien-fiche manquant" title="Aucune fiche ne s\'appelle « ' + echapper(t.titre) + ' »">' +
            echapper(t.texte) + "</span>";
        }
        return '<a class="lien-fiche" href="#/fiche/' + encodeURIComponent(f.id) + (t.section ? "/" + C.slug(t.section) : "") +
          '" data-fiche="' + echapper(f.id) + '">' + echapper(t.texte) + "</a>";
      }
    },
    {
      name: "encadre", level: "block",
      start: function (src) { var m = /^:::/m.exec(src); return m ? m.index : undefined; },
      tokenizer: function (src) {
        var m = /^:::[ \t]*([\wÀ-ÿ]+)[ \t]*([^\n]*)\n([\s\S]*?)\n:::[ \t]*(?:\n+|$)/.exec(src);
        if (!m) return;
        var genre = ALIAS[m[1].toLowerCase()] || "info";
        var t = { type: "encadre", raw: m[0], genre: genre, titre: m[2].trim(), tokens: [] };
        this.lexer.blockTokens(m[3], t.tokens);
        return t;
      },
      renderer: function (t) {
        var g = GENRES[t.genre];
        return '<aside class="encadre encadre-' + t.genre + '"><p class="encadre-titre">' +
          '<i class="bi bi-' + g.icone + '" aria-hidden="true"></i><span>' +
          echapper(t.titre || g.titre) + "</span></p>" + this.parser.parse(t.tokens) + "</aside>";
      }
    },
    {
      name: "formuleBloc", level: "block",
      start: function (src) { var m = /^\$\$/m.exec(src); return m ? m.index : undefined; },
      tokenizer: function (src) {
        var m = /^\$\$([\s\S]+?)\$\$[ \t]*(?:\n+|$)/.exec(src);
        if (m) return { type: "formuleBloc", raw: m[0], tex: m[1].trim() };
      },
      renderer: function (t) { return '<div class="formule-bloc">' + formule(t.tex, true) + "</div>"; }
    },
    {
      name: "formule", level: "inline",
      start: function (src) { var i = src.indexOf("$"); return i < 0 ? undefined : i; },
      tokenizer: function (src) {
        var m = /^\$\$([^$]+?)\$\$/.exec(src);
        if (m) return { type: "formule", raw: m[0], tex: m[1].trim(), bloc: true };
        // $x$ mais pas « 5 $ et 10 $ » : pas d'espace juste à l'intérieur
        // des dollars, pas de chiffre juste après le dollar fermant.
        m = /^\$(?!\s)((?:\\.|[^\\$\n])+?)(?<!\s)\$(?!\d)/.exec(src);
        if (m) return { type: "formule", raw: m[0], tex: m[1], bloc: false };
      },
      renderer: function (t) { return formule(t.tex, t.bloc); }
    }
  ];

  var renderer = {
    code: function (t) {
      var langue = ((t.lang || "").match(/^\S*/) || [""])[0].toLowerCase();
      if (langue === "math" || langue === "latex" || langue === "tex") {
        return '<div class="formule-bloc">' + formule(t.text, true) + "</div>";
      }
      var corps;
      if (langue && window.hljs && hljs.getLanguage(langue)) {
        corps = hljs.highlight(t.text, { language: langue, ignoreIllegals: true }).value;
      } else {
        corps = echapper(t.text);
      }
      return '<div class="bloc-code"><div class="bloc-code-barre"><span>' + echapper(langue || "texte") +
        '</span><button type="button" class="bloc-code-copier"><i class="bi bi-clipboard" aria-hidden="true"></i>Copier</button></div>' +
        '<pre><code class="hljs">' + corps + "</code></pre></div>";
    }
  };

  var md = null;
  function moteur() {
    if (md) return md;
    md = new marked.Marked({ gfm: true, breaks: false });
    md.use({ extensions: extensions, renderer: renderer });

    // Liens vers l'extérieur : nouvel onglet, sans donner la main sur
    // l'onglet d'origine.
    DOMPurify.addHook("afterSanitizeAttributes", function (n) {
      if (n.tagName === "A" && n.getAttribute("href")) {
        var href = n.getAttribute("href");
        if (/^https?:\/\//i.test(href)) {
          n.setAttribute("target", "_blank");
          n.setAttribute("rel", "noopener noreferrer");
        }
      }
    });
    return md;
  }

  // Markdown → HTML nettoyé.
  function html(source) {
    var brut = moteur().parse(source || "");
    return DOMPurify.sanitize(brut, {
      USE_PROFILES: { html: true, svg: true, mathMl: true },
      ADD_ATTR: ["target"],
      FORBID_TAGS: ["style", "form", "iframe"]
    });
  }

  // Finitions sur le DOM rendu : ancres des titres, tableaux défilants,
  // boutons Copier, liens internes. Renvoie le plan (h2/h3) pour le
  // sommaire.
  function decorer(racine, options) {
    options = options || {};
    var plan = [], vus = {};
    racine.querySelectorAll("h1, h2, h3, h4").forEach(function (t) {
      var base = C.slug(t.textContent), s = base, i = 2;
      while (vus[s]) s = base + "-" + i++;
      vus[s] = true;
      t.id = "h-" + s;
      if (t.tagName === "H2" || t.tagName === "H3") {
        plan.push({ niveau: t.tagName === "H2" ? 2 : 3, texte: t.textContent.trim(), id: t.id, section: s });
      }
    });

    racine.querySelectorAll("table").forEach(function (tb) {
      if (tb.parentNode.classList.contains("table-defile")) return;
      var w = document.createElement("div");
      w.className = "table-defile";
      tb.parentNode.insertBefore(w, tb);
      w.appendChild(tb);
    });

    // Les liens « #section » écrits dans une fiche : le # sert déjà au
    // routage, on les transforme en défilement vers le titre visé.
    racine.querySelectorAll('a[href^="#"]').forEach(function (a) {
      var cible = a.getAttribute("href").slice(1);
      if (cible.charAt(0) === "/") return;
      a.addEventListener("click", function (e) {
        e.preventDefault();
        var el = racine.querySelector("#h-" + C.slug(cible));
        if (el) el.scrollIntoView({ behavior: C.mouvementReduit ? "auto" : "smooth" });
      });
    });

    if (!racine._copieBranchee) {
      racine._copieBranchee = true;
      racine.addEventListener("click", function (e) {
        var b = e.target.closest(".bloc-code-copier");
        if (!b) return;
        var code = b.closest(".bloc-code").querySelector("code").textContent;
        navigator.clipboard.writeText(code).then(function () {
          b.classList.add("copie");
          b.lastChild.textContent = "Copié";
          setTimeout(function () { b.classList.remove("copie"); b.lastChild.textContent = "Copier"; }, 1600);
        });
      });
    }

    // Beaucoup de résumés commencent par « # Titre du cours » : doublon
    // avec le titre de la page, on le retire à la lecture.
    if (options.titre) {
      var premier = racine.firstElementChild;
      if (premier && premier.tagName === "H1" && C.slug(premier.textContent) === C.slug(options.titre)) {
        premier.remove();
      }
    }
    return plan;
  }

  function rendre(racine, source, options) {
    racine.innerHTML = html(source);
    return decorer(racine, options);
  }

  function definirResolveur(fn) { resoudre = fn; }

  C.rendu = { html: html, decorer: decorer, rendre: rendre, echapper: echapper, definirResolveur: definirResolveur };
})(window.Codex);

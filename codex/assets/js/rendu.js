/* ============================================================
   CODEX — rendu des fiches (Markdown → HTML sûr)

   marked + extensions maison, compatibles Obsidian / Quartz :
     $…$ et $$…$$        formules, rendues par KaTeX
     > [!note] Titre     callouts Obsidian (repliables avec - ou +)
     ::: genre Titre     même chose, syntaxe « bloc » (définition, théorème…)
                         Le titre accepte du Markdown en ligne : `code`, $x$…
     [[Titre]]           lien vers une autre fiche, aussi [[Titre|texte]]
                         et [[Titre#section]]
     #tag                tag (précédé d'un blanc), cliquable
     ```lang             code coloré, lignes numérotées, bouton Copier
     ```mermaid          diagramme, dessiné par diagrammes.js (chargé à la demande)

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

  // ---- Encadrés / callouts ----
  // Les genres d'Obsidian (note, tip, warning…) et ceux d'un cours
  // (définition, théorème, méthode…). Chaque alias mène à un genre, qui
  // porte une icône, un titre par défaut et une couleur (CSS).
  var GENRES = {
    note:       { icone: "pencil",               titre: "Note" },
    definition: { icone: "bookmark",             titre: "Définition" },
    theoreme:   { icone: "award",                titre: "Théorème" },
    propriete:  { icone: "diagram-3",            titre: "Propriété" },
    resume:     { icone: "clipboard",            titre: "Résumé" },
    info:       { icone: "info-circle",          titre: "À savoir" },
    todo:       { icone: "check-circle",         titre: "À faire" },
    methode:    { icone: "list-check",           titre: "Méthode" },
    astuce:     { icone: "fire",                 titre: "Astuce" },
    succes:     { icone: "check-lg",             titre: "Réussi" },
    question:   { icone: "question-circle",      titre: "Question" },
    attention:  { icone: "exclamation-triangle", titre: "Attention" },
    echec:      { icone: "x-lg",                 titre: "Échec" },
    danger:     { icone: "lightning-charge",     titre: "Piège" },
    bug:        { icone: "bug",                  titre: "Bug" },
    exemple:    { icone: "list-ul",              titre: "Exemple" },
    citation:   { icone: "quote",                titre: "Citation" },
    ressources: { icone: "box-seam",             titre: "Ressources" },
    // Entraînement : l'énoncé, puis son corrigé (replié avec « - »). Les
    // corrigés repliables portent le suivi « fait » de lecture.js.
    exercice:   { icone: "pencil-square",        titre: "Exercice" },
    corrige:    { icone: "check2-square",        titre: "Corrigé" }
  };
  var ALIAS = {
    note: "note", remarque: "note", rq: "note",
    def: "definition", definition: "definition", "définition": "definition",
    theoreme: "theoreme", "théorème": "theoreme", theorem: "theoreme", thm: "theoreme",
    lemme: "theoreme", lemma: "theoreme", corollaire: "theoreme",
    propriete: "propriete", "propriété": "propriete", prop: "propriete", property: "propriete",
    abstract: "resume", summary: "resume", tldr: "resume", resume: "resume", "résumé": "resume",
    info: "info",
    todo: "todo", ressources: "ressources",
    methode: "methode", "méthode": "methode", method: "methode", recette: "methode",
    tip: "astuce", hint: "astuce", important: "astuce", astuce: "astuce", conseil: "astuce",
    success: "succes", check: "succes", done: "succes", succes: "succes", "succès": "succes",
    question: "question", help: "question", faq: "question",
    warning: "attention", caution: "attention", attention: "attention",
    failure: "echec", fail: "echec", missing: "echec", echec: "echec", "échec": "echec",
    danger: "danger", error: "danger", piege: "danger", "piège": "danger",
    bug: "bug",
    example: "exemple", exemple: "exemple", ex: "exemple",
    quote: "citation", cite: "citation", citation: "citation",
    exercice: "exercice", exercices: "exercice", exo: "exercice", exercise: "exercice", enonce: "exercice", "énoncé": "exercice",
    corrige: "corrige", "corrigé": "corrige", correction: "corrige", solution: "corrige", reponse: "corrige", "réponse": "corrige"
  };

  // Le titre d'un encadré est du Markdown en ligne (`code`, $x$, **gras**) :
  // ses jetons sont analysés comme le reste du texte, et le HTML produit
  // passe par DOMPurify avec tout le rendu.
  function encadre(parser, genre, titre, tokens, repli, titreTokens) {
    var g = GENRES[genre];
    var texte = titre && titreTokens ? parser.parseInline(titreTokens) : echapper(titre || g.titre);
    var tete = '<i class="bi bi-' + g.icone + '" aria-hidden="true"></i><span>' + texte + "</span>";
    var corps = '<div class="encadre-corps">' + parser.parse(tokens) + "</div>";
    if (repli) {
      return '<details class="encadre encadre-' + genre + '"' + (repli === "+" ? " open" : "") + ">" +
        '<summary class="encadre-titre">' + tete + '<i class="bi bi-chevron-down encadre-fleche" aria-hidden="true"></i></summary>' +
        corps + "</details>";
    }
    return '<aside class="encadre encadre-' + genre + '"><p class="encadre-titre">' + tete + "</p>" + corps + "</aside>";
  }

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
        // Dans un tableau, « [[Titre\|texte]] » : le « \ » d'échappement n'appartient pas au titre.
        if (m) return { type: "lienFiche", raw: m[0], titre: m[1].replace(/\\\s*$/, "").trim(), section: (m[2] || "").trim(), texte: (m[3] || m[1]).replace(/\\\s*$/, "").trim() };
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
      // #tag, précédé d'un blanc (ou en début de texte) : « C# » n'en est pas un.
      name: "etiquette", level: "inline",
      start: function (src) { var m = /(^|\s)#[\p{L}_]/u.exec(src); return m ? m.index + m[1].length : undefined; },
      tokenizer: function (src) {
        var m = /^#([\p{L}_][\p{L}\p{N}_\/-]*)/u.exec(src);
        if (m) return { type: "etiquette", raw: m[0], tag: m[1] };
      },
      renderer: function (t) {
        return '<a class="etiquette" href="#/tag/' + encodeURIComponent(t.tag.toLowerCase()) + '">#' + echapper(t.tag) + "</a>";
      }
    },
    {
      // Callout Obsidian : « > [!type]± Titre » puis des lignes « > … ».
      name: "callout", level: "block",
      start: function (src) { var m = /^ {0,3}> ?\[!/m.exec(src); return m ? m.index : undefined; },
      tokenizer: function (src) {
        var m = /^ {0,3}> ?\[!([\wÀ-ÿ-]+)\]([+-]?)[ \t]*([^\n]*)(?:\n|$)((?: {0,3}>[^\n]*(?:\n|$))*)/.exec(src);
        if (!m) return;
        var corps = m[4].replace(/^ {0,3}> ?/gm, "");
        var t = { type: "callout", raw: m[0], genre: ALIAS[m[1].toLowerCase()] || "note", repli: m[2], titre: m[3].trim(), tokens: [], titreTokens: [] };
        this.lexer.blockTokens(corps, t.tokens);
        this.lexer.inline(t.titre, t.titreTokens);
        return t;
      },
      renderer: function (t) { return encadre(this.parser, t.genre, t.titre, t.tokens, t.repli, t.titreTokens); }
    },
    {
      name: "encadre", level: "block",
      start: function (src) { var m = /^:::/m.exec(src); return m ? m.index : undefined; },
      tokenizer: function (src) {
        var m = /^:::[ \t]*([\wÀ-ÿ]+)([+-]?)[ \t]*([^\n]*)\n([\s\S]*?)\n:::[ \t]*(?:\n+|$)/.exec(src);
        if (!m) return;
        var t = { type: "encadre", raw: m[0], genre: ALIAS[m[1].toLowerCase()] || "note", repli: m[2], titre: m[3].trim(), tokens: [], titreTokens: [] };
        this.lexer.blockTokens(m[4], t.tokens);
        this.lexer.inline(t.titre, t.titreTokens);
        return t;
      },
      renderer: function (t) { return encadre(this.parser, t.genre, t.titre, t.tokens, t.repli, t.titreTokens); }
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
      // Diagramme : on ne pose ici que la source, en texte. diagrammes.js
      // le dessine ensuite (voir decorer), dans une image inerte.
      if (langue === "mermaid") {
        return '<figure class="diagramme"><pre class="diagramme-source"><code>' + echapper(t.text) + "</code></pre></figure>";
      }
      var corps;
      if (langue && window.hljs && hljs.getLanguage(langue)) {
        corps = hljs.highlight(t.text, { language: langue, ignoreIllegals: true }).value;
      } else {
        corps = echapper(t.text);
      }
      // Numéros dans une colonne à part : découper le HTML coloré ligne à
      // ligne casserait les <span> qui couvrent plusieurs lignes.
      var n = t.text.replace(/\n$/, "").split("\n").length, numeros = "";
      for (var i = 1; i <= n; i++) numeros += i + "\n";
      return '<div class="bloc-code"><button type="button" class="bloc-code-copier" title="Copier" aria-label="Copier le code">' +
        '<i class="bi bi-clipboard" aria-hidden="true"></i></button><div class="bloc-code-corps">' +
        '<pre class="bloc-code-numeros" aria-hidden="true">' + numeros + '</pre>' +
        '<pre><code class="hljs">' + corps + "</code></pre></div></div>";
    }
  };

  var md = null;
  function moteur() {
    if (md) return md;
    md = new marked.Marked({ gfm: true, breaks: false });
    md.use({ extensions: extensions, renderer: renderer });

    // Les attributs style ne sont gardés QUE sur les formules KaTeX, qui
    // en ont besoin. Ailleurs, une fiche pourrait poser un bloc en
    // position fixe par-dessus l'interface (faux écran de connexion…).
    DOMPurify.addHook("uponSanitizeAttribute", function (n, data) {
      if (data.attrName === "style" && !(n.closest && n.closest(".katex, .katex-display"))) data.keepAttr = false;
    });
    DOMPurify.addHook("afterSanitizeAttributes", function (n) {
      // Liens vers l'extérieur : nouvel onglet, sans donner la main sur
      // l'onglet d'origine, et marqués ↗ (comme Quartz).
      if (n.tagName === "A" && n.getAttribute("href")) {
        if (/^https?:\/\//i.test(n.getAttribute("href"))) {
          n.setAttribute("target", "_blank");
          n.setAttribute("rel", "noopener noreferrer");
          n.classList.add("externe");
        }
      }
      // Seules les cases à cocher des listes de tâches sont admises, inertes.
      if (n.tagName === "INPUT") {
        if (n.getAttribute("type") !== "checkbox") n.remove();
        else n.setAttribute("disabled", "");
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
      // Pas d'id ni de name venant d'une fiche : ils pourraient masquer des
      // éléments de l'application (« DOM clobbering »). Les ancres des
      // titres sont posées après, par decorer().
      FORBID_ATTR: ["id", "name"],
      FORBID_TAGS: ["style", "form", "iframe", "textarea", "select"]
    });
  }

  // Finitions sur le DOM rendu : ancres des titres, tableaux défilants,
  // boutons Copier, liens internes. Renvoie le plan (h2/h3) pour le
  // sommaire. options.titre : retire un « # Titre » en double ;
  // options.lienSection(section) : adresse d'une section, pour les ancres.
  function decorer(racine, options) {
    options = options || {};
    var plan = [], vus = {};

    // Beaucoup de résumés commencent par « # Titre du cours » : doublon
    // avec le titre de la page, on le retire à la lecture.
    if (options.titre) {
      var premier = racine.firstElementChild;
      if (premier && premier.tagName === "H1" && C.slug(premier.textContent) === C.slug(options.titre)) premier.remove();
    }

    racine.querySelectorAll("h1, h2, h3, h4").forEach(function (t) {
      var base = C.slug(t.textContent), s = base, i = 2;
      while (vus[s]) s = base + "-" + i++;
      vus[s] = true;
      t.id = "h-" + s;
      if (t.tagName === "H2" || t.tagName === "H3") {
        plan.push({ niveau: t.tagName === "H2" ? 2 : 3, texte: t.textContent.trim(), id: t.id, section: s });
        if (options.lienSection) {
          var a = document.createElement("a");
          a.className = "ancre-titre";
          a.href = options.lienSection(s);
          a.setAttribute("aria-label", "Copier le lien vers cette section");
          a.innerHTML = '<i class="bi bi-link-45deg" aria-hidden="true"></i>';
          a.addEventListener("click", function (e) {
            e.preventDefault();
            history.replaceState(null, "", a.getAttribute("href"));
            t.scrollIntoView({ behavior: C.mouvementReduit ? "auto" : "smooth" });
            if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(function () { C.toast("Lien de la section copié.", "ok"); });
          });
          t.appendChild(a);
        }
      }
    });

    racine.querySelectorAll("table").forEach(function (tb) {
      if (tb.parentNode.classList.contains("table-defile")) return;
      var w = document.createElement("div");
      w.className = "table-defile";
      tb.parentNode.insertBefore(w, tb);
      w.appendChild(tb);
    });

    if (C.diagrammes && racine.querySelector(".diagramme")) C.diagrammes.dessiner(racine);

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
          b.firstChild.className = "bi bi-check-lg";
          setTimeout(function () { b.classList.remove("copie"); b.firstChild.className = "bi bi-clipboard"; }, 1600);
        });
      });
    }
    return plan;
  }

  function rendre(racine, source, options) {
    racine.innerHTML = html(source);
    return decorer(racine, options);
  }

  function definirResolveur(fn) { resoudre = fn; }

  C.rendu = { html: html, decorer: decorer, rendre: rendre, echapper: echapper, definirResolveur: definirResolveur, GENRES: GENRES };
})(window.Codex);

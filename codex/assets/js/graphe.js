/* ============================================================
   CODEX — graphe des fiches (l'idée de Quartz, en privé)

   Deux sortes d'arêtes :
     - les liens [[Titre]] écrits dans les fiches (calculés par la
       fonction SQL `graphe()`), en couleur d'accent ;
     - la structure dossier → fiche et dossier → sous-dossier, en trait
       discret, pour que le graphe ne soit pas une poussière de points
       isolés tant que personne n'a encore écrit de [[lien]].

   Disposition par forces, maison, sur un canvas : répulsion entre tous
   les nœuds (O(n²), sans souci jusqu'à quelques centaines de fiches),
   ressorts sur les arêtes, gravité vers le centre, refroidissement
   progressif. Pas de d3 : quatre scripts de plus pour ~150 lignes.
   ============================================================ */
(function (C) {
  "use strict";

  // Construit nœuds et arêtes depuis C.etat. `centre` + `profondeur`
  // → sous-graphe local (panneau d'une fiche), sinon tout.
  function donnees(centre, profondeur) {
    var noeuds = {}, aretes = [];
    C.etat.dossiers.forEach(function (d) { noeuds["d:" + d.id] = { id: "d:" + d.id, type: "dossier", titre: d.titre, ref: d.id }; });
    C.etat.fiches.forEach(function (f) { noeuds["f:" + f.id] = { id: "f:" + f.id, type: "fiche", titre: f.titre, ref: f.id }; });
    C.etat.dossiers.forEach(function (d) {
      if (d.parent_id && noeuds["d:" + d.parent_id]) aretes.push({ a: "d:" + d.parent_id, b: "d:" + d.id, lien: false });
    });
    C.etat.fiches.forEach(function (f) { aretes.push({ a: "d:" + f.dossier_id, b: "f:" + f.id, lien: false }); });
    C.etat.aretes.forEach(function (x) {
      if (noeuds["f:" + x.source] && noeuds["f:" + x.cible]) aretes.push({ a: "f:" + x.source, b: "f:" + x.cible, lien: true });
    });

    if (centre) {
      var garder = {}, front = ["f:" + centre];
      garder[front[0]] = true;
      for (var p = 0; p < profondeur; p++) {
        var suivant = [];
        aretes.forEach(function (e) {
          front.forEach(function (n) {
            var autre = e.a === n ? e.b : e.b === n ? e.a : null;
            if (autre && !garder[autre]) { garder[autre] = true; suivant.push(autre); }
          });
        });
        front = suivant;
      }
      Object.keys(noeuds).forEach(function (k) { if (!garder[k]) delete noeuds[k]; });
      aretes = aretes.filter(function (e) { return garder[e.a] && garder[e.b]; });
    }

    var liste = Object.keys(noeuds).map(function (k) { return noeuds[k]; });
    liste.forEach(function (n) { n.degre = 0; n.voisins = {}; });
    aretes.forEach(function (e) {
      noeuds[e.a].degre++; noeuds[e.b].degre++;
      noeuds[e.a].voisins[e.b] = true; noeuds[e.b].voisins[e.a] = true;
      e.na = noeuds[e.a]; e.nb = noeuds[e.b];
    });
    return { noeuds: liste, aretes: aretes, parId: noeuds };
  }

  function couleurs() {
    var s = getComputedStyle(document.documentElement);
    var v = function (n) { return s.getPropertyValue(n).trim(); };
    return {
      fond: v("--surface-graphe"), fiche: v("--accent"), dossier: v("--texte-doux"),
      centre: v("--accent-2"), lien: v("--accent"), structure: v("--bordure-forte"),
      texte: v("--texte"), halo: v("--fond")
    };
  }

  // Monte un graphe interactif dans `conteneur`. Renvoie une fonction de
  // nettoyage (à appeler quand la vue change).
  function monter(conteneur, options) {
    options = options || {};
    var g = donnees(options.centre, options.profondeur || 2);
    var canvas = document.createElement("canvas");
    canvas.className = "graphe-canvas";
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "Graphe de " + g.noeuds.length + " éléments reliés par " + g.aretes.length + " liens. La liste des fiches est dans la barre latérale.");
    conteneur.appendChild(canvas);
    var ctx = canvas.getContext("2d");
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var L = 0, H = 0, coul = couleurs();
    var vue = { x: 0, y: 0, k: 1 };
    var survol = null, tenu = null, alpha = 1, raf = 0, fini = false;
    var compact = !!options.compact;

    // Positions de départ en spirale : pas d'aléa, même dessin à chaque
    // ouverture tant que les données ne changent pas.
    g.noeuds.forEach(function (n, i) {
      var r = 12 * Math.sqrt(i + 1), a = i * 2.39996;
      n.x = r * Math.cos(a); n.y = r * Math.sin(a); n.vx = 0; n.vy = 0;
      if (options.centre && n.id === "f:" + options.centre) { n.x = 0; n.y = 0; n.fixe = true; }
    });

    function rayon(n) {
      var base = n.type === "dossier" ? 5 : 4;
      return Math.min(14, base + Math.sqrt(n.degre) * (compact ? 1.2 : 1.6));
    }

    function pas() {
      var N = g.noeuds, i, j, a, b, dx, dy, d2, f;
      var repulsion = compact ? 900 : 1400;
      for (i = 0; i < N.length; i++) {
        a = N[i];
        for (j = i + 1; j < N.length; j++) {
          b = N[j];
          dx = b.x - a.x; dy = b.y - a.y; d2 = dx * dx + dy * dy + 0.01;
          if (d2 > 250000) continue;
          f = repulsion / d2 * alpha;
          a.vx -= dx * f; a.vy -= dy * f; b.vx += dx * f; b.vy += dy * f;
        }
      }
      g.aretes.forEach(function (e) {
        var cible = e.lien ? 70 : 45;
        dx = e.nb.x - e.na.x; dy = e.nb.y - e.na.y;
        var d = Math.sqrt(dx * dx + dy * dy) || 1;
        f = (d - cible) / d * 0.08 * alpha * (e.lien ? 1 : 0.7);
        e.na.vx += dx * f; e.na.vy += dy * f; e.nb.vx -= dx * f; e.nb.vy -= dy * f;
      });
      N.forEach(function (n) {
        n.vx -= n.x * 0.012 * alpha; n.vy -= n.y * 0.012 * alpha;
        if (n.fixe || n === tenu) { n.vx = 0; n.vy = 0; return; }
        n.vx *= 0.82; n.vy *= 0.82;
        n.x += n.vx; n.y += n.vy;
      });
      alpha *= 0.985;
    }

    function cadrer() {
      if (!g.noeuds.length) return;
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      g.noeuds.forEach(function (n) { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y); });
      var marge = compact ? 24 : 60;
      var k = Math.min((L - marge * 2) / Math.max(x1 - x0, 1), (H - marge * 2) / Math.max(y1 - y0, 1));
      vue.k = Math.max(0.3, Math.min(compact ? 1.6 : 2.2, k));
      vue.x = L / 2 - (x0 + x1) / 2 * vue.k;
      vue.y = H / 2 - (y0 + y1) / 2 * vue.k;
    }

    function dessiner() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, L, H);
      ctx.save();
      ctx.translate(vue.x, vue.y);
      ctx.scale(vue.k, vue.k);
      var focus = survol || tenu;

      g.aretes.forEach(function (e) {
        var eclaire = focus && (e.na === focus || e.nb === focus);
        ctx.globalAlpha = focus ? (eclaire ? 0.95 : 0.12) : (e.lien ? 0.7 : 0.35);
        ctx.strokeStyle = e.lien ? coul.lien : coul.structure;
        ctx.lineWidth = (e.lien ? 1.6 : 1) / Math.sqrt(vue.k);
        ctx.beginPath(); ctx.moveTo(e.na.x, e.na.y); ctx.lineTo(e.nb.x, e.nb.y); ctx.stroke();
      });

      g.noeuds.forEach(function (n) {
        var proche = !focus || n === focus || focus.voisins[n.id];
        ctx.globalAlpha = proche ? 1 : 0.18;
        var centre = options.centre && n.ref === options.centre;
        ctx.fillStyle = centre ? coul.centre : n.type === "dossier" ? coul.dossier : coul.fiche;
        ctx.beginPath(); ctx.arc(n.x, n.y, rayon(n), 0, Math.PI * 2); ctx.fill();
        if (centre || n === focus) {
          ctx.lineWidth = 2 / vue.k; ctx.strokeStyle = coul.texte; ctx.stroke();
        }
      });

      // Étiquettes : toutes quand on est assez près, sinon seulement le
      // nœud visé, ses voisins et les dossiers.
      var taille = (compact ? 11 : 12.5) / vue.k;
      ctx.font = "500 " + taille + "px Outfit, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.lineJoin = "round";
      g.noeuds.forEach(function (n) {
        // Petit graphe : toutes les étiquettes tiennent, autant les montrer.
        var montrer = (!compact && g.noeuds.length <= 40) || vue.k > 1.25 || n === focus || (focus && focus.voisins[n.id]) ||
          (!focus && (n.type === "dossier" || (options.centre && n.ref === options.centre)));
        if (!montrer || (compact && !focus && n.type === "fiche" && n.ref !== options.centre && vue.k <= 1.25)) return;
        var proche = !focus || n === focus || focus.voisins[n.id];
        ctx.globalAlpha = proche ? 1 : 0.25;
        var t = n.titre.length > 34 ? n.titre.slice(0, 32) + "…" : n.titre;
        var y = n.y + rayon(n) + 3 / vue.k;
        ctx.lineWidth = 3.5 / vue.k; ctx.strokeStyle = coul.halo; ctx.strokeText(t, n.x, y);
        ctx.fillStyle = coul.texte; ctx.fillText(t, n.x, y);
      });
      ctx.restore();
    }

    function boucle() {
      if (fini) return;
      if (alpha > 0.02) pas();
      dessiner();
      raf = alpha > 0.02 || tenu ? requestAnimationFrame(boucle) : 0;
    }
    function relancer(a) {
      alpha = Math.max(alpha, a || 0.3);
      if (!raf) raf = requestAnimationFrame(boucle);
    }

    function taillerCanvas() {
      var r = conteneur.getBoundingClientRect();
      L = Math.max(120, r.width); H = Math.max(120, r.height);
      canvas.width = Math.round(L * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.width = L + "px"; canvas.style.height = H + "px";
      cadrer();
      dessiner();
    }

    // ---- Interaction ----
    function versMonde(ev) {
      var r = canvas.getBoundingClientRect();
      return { x: (ev.clientX - r.left - vue.x) / vue.k, y: (ev.clientY - r.top - vue.y) / vue.k };
    }
    function noeudSous(p) {
      var meilleur = null, dmin = Infinity;
      g.noeuds.forEach(function (n) {
        var d = Math.hypot(n.x - p.x, n.y - p.y);
        if (d < rayon(n) + 6 / vue.k && d < dmin) { dmin = d; meilleur = n; }
      });
      return meilleur;
    }

    var glisse = null, bouge = false;
    canvas.addEventListener("pointerdown", function (ev) {
      canvas.setPointerCapture(ev.pointerId);
      var p = versMonde(ev), n = noeudSous(p);
      bouge = false;
      if (n) { tenu = n; relancer(0.3); }
      else glisse = { x: ev.clientX - vue.x, y: ev.clientY - vue.y };
    });
    canvas.addEventListener("pointermove", function (ev) {
      var p = versMonde(ev);
      if (tenu) { tenu.x = p.x; tenu.y = p.y; bouge = true; relancer(0.2); return; }
      if (glisse) { vue.x = ev.clientX - glisse.x; vue.y = ev.clientY - glisse.y; bouge = true; dessiner(); return; }
      var n = noeudSous(p);
      if (n !== survol) {
        survol = n;
        canvas.style.cursor = n ? "pointer" : "grab";
        canvas.title = n ? n.titre + (n.type === "dossier" ? " (dossier)" : "") : "";
        dessiner();
      }
    });
    function lacher(ev) {
      var clic = !bouge && tenu;
      var n = tenu;
      tenu = null; glisse = null;
      if (clic && ev.type === "pointerup") {
        if (n.type === "fiche") location.hash = "#/fiche/" + n.ref;
        else if (options.surDossier) options.surDossier(n.ref);
      }
    }
    canvas.addEventListener("pointerup", lacher);
    canvas.addEventListener("pointercancel", lacher);
    canvas.addEventListener("pointerleave", function () { if (survol) { survol = null; dessiner(); } });
    canvas.addEventListener("wheel", function (ev) {
      ev.preventDefault();
      var r = canvas.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top;
      var k = Math.max(0.2, Math.min(5, vue.k * Math.exp(-ev.deltaY * 0.0015)));
      vue.x = mx - (mx - vue.x) * k / vue.k; vue.y = my - (my - vue.y) * k / vue.k; vue.k = k;
      dessiner();
    }, { passive: false });

    var ro = new ResizeObserver(taillerCanvas);
    ro.observe(conteneur);
    var themeObs = new MutationObserver(function () { coul = couleurs(); dessiner(); });
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    // Mouvement réduit : on calcule la disposition d'un coup, sans
    // animation, et on affiche le résultat final.
    if (C.mouvementReduit) {
      while (alpha > 0.02) pas();
      taillerCanvas();
    } else {
      for (var i = 0; i < 60; i++) pas(); // dégrossit avant la première image
      taillerCanvas();
      raf = requestAnimationFrame(boucle);
      // Recadre une fois la disposition à peu près posée.
      setTimeout(function () { if (!fini && !glisse && !tenu) { cadrer(); dessiner(); } }, 900);
    }

    return {
      nb: g.noeuds.length,
      recadrer: function () { cadrer(); dessiner(); },
      zoomer: function (f) {
        var k = Math.max(0.2, Math.min(5, vue.k * f));
        vue.x = L / 2 - (L / 2 - vue.x) * k / vue.k; vue.y = H / 2 - (H / 2 - vue.y) * k / vue.k; vue.k = k;
        dessiner();
      },
      detruire: function () {
        fini = true;
        cancelAnimationFrame(raf);
        ro.disconnect();
        themeObs.disconnect();
        canvas.remove();
      }
    };
  }

  C.graphe = { monter: monter, donnees: donnees };
})(window.Codex);

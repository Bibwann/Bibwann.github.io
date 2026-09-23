/* ============================================================
   CODEX — graphe des fiches, comme celui de Quartz (d3-force)

   Deux sortes d'arêtes :
     - les liens [[Titre]] écrits dans les fiches (fonction SQL graphe()) ;
     - le rangement : dossier → fiche, dossier → sous-dossier, et la note
       d'accueil reliée aux dossiers racines (c'est le premier nœud).

   d3-force plutôt qu'un moteur maison : le moteur précédent partait en
   oscillations et laissait des nœuds hors cadre. La disposition est
   calculée d'avance (300 pas), puis cadrée : le graphe arrive posé, et
   ne bouge que quand on le touche.
   ============================================================ */
(function (C) {
  "use strict";

  // Nœuds et arêtes depuis C.etat. `centre` + `profondeur` → voisinage
  // d'une fiche (colonne de droite), sinon tout le cours.
  function donnees(centre, profondeur) {
    var noeuds = {}, aretes = [];
    var couleurs = {}, estMatiere = {};
    C.nav.matieres().forEach(function (m) { couleurs[m.dossier.id] = m.couleur; estMatiere[m.dossier.id] = true; });
    function couleurDe(dossierId) {
      var m = dossierId ? C.nav.matiere(dossierId) : null;
      return m ? couleurs[m.id] || null : null;
    }
    C.etat.dossiers.forEach(function (d) {
      noeuds["d:" + d.id] = { id: "d:" + d.id, type: "dossier", titre: d.titre, ref: d.id, couleur: couleurDe(d.id), matiere: !!estMatiere[d.id] };
    });
    C.etat.fiches.forEach(function (f) {
      noeuds["f:" + f.id] = { id: "f:" + f.id, type: "fiche", titre: f.titre, ref: f.id, accueil: !!f.accueil, couleur: couleurDe(f.dossier_id) };
    });
    C.etat.dossiers.forEach(function (d) {
      if (d.parent_id && noeuds["d:" + d.parent_id]) aretes.push({ a: "d:" + d.parent_id, b: "d:" + d.id, lien: false });
    });
    // Une fiche à la racine se raccroche à la note d'accueil, qui porte
    // aussi les dossiers racines.
    var accueil = C.etat.fiches.filter(function (f) { return f.accueil; })[0];
    C.etat.fiches.forEach(function (f) {
      if (f.dossier_id && noeuds["d:" + f.dossier_id]) aretes.push({ a: "d:" + f.dossier_id, b: "f:" + f.id, lien: false });
      else if (accueil && f !== accueil) aretes.push({ a: "f:" + accueil.id, b: "f:" + f.id, lien: false });
    });
    if (accueil) {
      C.etat.dossiers.forEach(function (d) { if (!d.parent_id) aretes.push({ a: "f:" + accueil.id, b: "d:" + d.id, lien: false }); });
    }
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
    });
    return { noeuds: liste, liens: aretes.map(function (e) { return { source: e.a, target: e.b, lien: e.lien }; }) };
  }

  function couleurs() {
    var s = getComputedStyle(document.documentElement);
    var v = function (n) { return s.getPropertyValue(n).trim(); };
    return {
      noeud: v("--texte-faible"), dossier: v("--bordure-forte"), courant: v("--accent"), voisin: v("--accent-2"),
      lien: v("--bordure-forte"), rangement: v("--bordure"), texte: v("--texte"), halo: v("--fond")
    };
  }

  // Taille d'un nœud : comme Quartz, elle grandit avec le nombre de liens.
  function rayon(n) { return n.matiere ? 8 : (n.type === "dossier" ? 3 : 3.5) + Math.sqrt(n.degre) * 1.1; }

  function monter(conteneur, options) {
    options = options || {};
    var compact = !!options.compact;
    var g = donnees(options.centre, options.profondeur || 1);
    var noeuds = g.noeuds, liens = g.liens;
    var canvas = document.createElement("canvas");
    canvas.className = "graphe-canvas";
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "Graphe de " + noeuds.length + " éléments. La liste des fiches est dans l'explorateur.");
    conteneur.appendChild(canvas);
    var ctx = canvas.getContext("2d");
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var L = 0, H = 0, coul = couleurs(), t = d3.zoomIdentity, survol = null, fini = false;
    var police = getComputedStyle(document.body).fontFamily;
    var centreId = options.centre ? "f:" + options.centre : (noeuds.filter(function (n) { return n.accueil; })[0] || {}).id;

    // ---- Forces : les réglages de Quartz, un peu resserrés pour le cadre local ----
    var sim = d3.forceSimulation(noeuds)
      .force("charge", d3.forceManyBody().strength(compact ? -70 : -120))
      .force("lien", d3.forceLink(liens).id(function (d) { return d.id; })
        .distance(function (l) { return l.lien ? (compact ? 45 : 60) : (compact ? 32 : 42); })
        .strength(function (l) { return l.lien ? 0.8 : 0.5; }))
      .force("x", d3.forceX(0).strength(0.05))
      .force("y", d3.forceY(0).strength(0.05))
      .force("collision", d3.forceCollide(function (d) { return rayon(d) + 5; }))
      .stop();
    // Pré-calcul : la disposition est stable avant la première image.
    for (var i = 0; i < 300; i++) sim.tick();

    // ---- Dessin ----
    function dessiner() {
      if (fini) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, L, H);
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.scale(t.k, t.k);
      var focus = survol;

      liens.forEach(function (l) {
        var eclaire = focus && (l.source === focus || l.target === focus);
        ctx.globalAlpha = focus ? (eclaire ? 1 : 0.25) : (l.lien ? 0.9 : 0.6);
        ctx.strokeStyle = eclaire ? coul.courant : (l.lien ? coul.lien : coul.rangement);
        ctx.lineWidth = (l.lien ? 1.2 : 1) / Math.sqrt(t.k);
        ctx.setLineDash(l.lien ? [] : [3 / t.k, 3 / t.k]);
        ctx.beginPath(); ctx.moveTo(l.source.x, l.source.y); ctx.lineTo(l.target.x, l.target.y); ctx.stroke();
      });
      ctx.setLineDash([]);

      // Couleur de la matière ; la fiche courante (ou survolée) cerclée.
      noeuds.forEach(function (n) {
        var proche = !focus || n === focus || focus.voisins[n.id];
        ctx.globalAlpha = proche ? 1 : 0.2;
        ctx.fillStyle = n.couleur || (n.type === "dossier" ? coul.dossier : coul.noeud);
        ctx.beginPath(); ctx.arc(n.x, n.y, rayon(n), 0, Math.PI * 2); ctx.fill();
        if (n.id === centreId || n === focus) {
          ctx.lineWidth = 2.5 / Math.sqrt(t.k);
          ctx.strokeStyle = coul.courant;
          ctx.beginPath(); ctx.arc(n.x, n.y, rayon(n) + 3 / t.k, 0, Math.PI * 2); ctx.stroke();
        }
      });

      // Étiquettes : trop de titres superposés ne se lisent plus. On écrit
      // toujours les matières, la fiche courante, la fiche survolée et ses
      // voisines ; les autres n'apparaissent qu'en zoomant (graphe complet)
      // ou quand le voisinage est petit.
      var fondu = compact ? (noeuds.length <= 6 ? 1 : 0) : Math.max(0, Math.min(1, (t.k - 1.4) * 2));
      if (!compact && noeuds.length <= 25) fondu = 1;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.lineJoin = "round";
      noeuds.forEach(function (n) {
        var fort = n.id === centreId || n === focus || (focus && focus.voisins[n.id]);
        var a = fort ? 1 : n.matiere && !compact ? (focus ? 0.35 : 1) : (focus ? fondu * 0.2 : fondu);
        if (a <= 0.02) return;
        ctx.globalAlpha = a;
        var taille = n.matiere && !compact ? 15 : 12.5;
        ctx.font = (n.matiere ? "700 " : "600 ") + (taille / t.k) + "px " + police;
        var texte = n.titre.length > 34 ? n.titre.slice(0, 32) + "…" : n.titre;
        var y = n.y + rayon(n) + 4 / t.k;
        ctx.lineWidth = 4 / t.k; ctx.strokeStyle = coul.halo; ctx.strokeText(texte, n.x, y);
        ctx.fillStyle = coul.texte; ctx.fillText(texte, n.x, y);
      });
      ctx.restore();
    }
    sim.on("tick", dessiner);

    // Cadre tout le graphe dans la zone.
    function cadrer() {
      if (!noeuds.length) return;
      var x0 = d3.min(noeuds, function (n) { return n.x; }), x1 = d3.max(noeuds, function (n) { return n.x; });
      var y0 = d3.min(noeuds, function (n) { return n.y; }), y1 = d3.max(noeuds, function (n) { return n.y; });
      var marge = compact ? 28 : 60;
      var k = Math.min((L - marge * 2) / Math.max(x1 - x0, 1), (H - marge * 2) / Math.max(y1 - y0, 1));
      k = Math.max(0.3, Math.min(compact ? 1.6 : 2, k));
      selection.call(zoom.transform, d3.zoomIdentity.translate(L / 2 - (x0 + x1) / 2 * k, H / 2 - (y0 + y1) / 2 * k).scale(k));
    }

    function tailler() {
      L = Math.max(120, conteneur.clientWidth); H = Math.max(120, conteneur.clientHeight);
      canvas.width = Math.round(L * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.width = L + "px"; canvas.style.height = H + "px";
    }

    // ---- Interaction : glisser un nœud (installé avant le zoom, pour être
    // prioritaire), déplacer la vue, molette pour zoomer, clic pour ouvrir. ----
    function noeudSous(evenement) {
      var p = t.invert(d3.pointer(evenement, canvas));
      return sim.find(p[0], p[1], 12 / t.k) || null;
    }
    var depart = null;
    var glisser = d3.drag().container(canvas)
      .subject(function (e) { return noeudSous(e); })
      .on("start", function (e) {
        depart = d3.pointer(e, canvas);
        if (!C.mouvementReduit) sim.alphaTarget(0.25).restart();
        e.subject.fx = e.subject.x; e.subject.fy = e.subject.y;
      })
      .on("drag", function (e) {
        var p = t.invert(d3.pointer(e, canvas));
        e.subject.fx = p[0]; e.subject.fy = p[1];
        if (C.mouvementReduit) { e.subject.x = p[0]; e.subject.y = p[1]; dessiner(); }
      })
      .on("end", function (e) {
        sim.alphaTarget(0);
        e.subject.fx = null; e.subject.fy = null;
        var fin = d3.pointer(e, canvas);
        // Un clic sans déplacement ouvre la fiche (ou la page du dossier).
        if (depart && Math.hypot(fin[0] - depart[0], fin[1] - depart[1]) < 4) {
          var n = e.subject;
          location.hash = n.type === "fiche" ? (n.accueil ? "#/" : "#/fiche/" + n.ref) : "#/dossier/" + n.ref;
        }
        depart = null;
      });
    var zoom = d3.zoom().scaleExtent([0.2, 4]).on("zoom", function (e) { t = e.transform; dessiner(); });
    var selection = d3.select(canvas).call(glisser).call(zoom).on("dblclick.zoom", null);
    canvas.addEventListener("mousemove", function (e) {
      var n = noeudSous(e);
      if (n !== survol) {
        survol = n;
        canvas.style.cursor = n ? "pointer" : "grab";
        canvas.title = n ? n.titre : "";
        dessiner();
      }
    });
    canvas.addEventListener("mouseleave", function () { if (survol) { survol = null; dessiner(); } });

    var ro = new ResizeObserver(function () { tailler(); dessiner(); });
    ro.observe(conteneur);
    var themeObs = new MutationObserver(function () { coul = couleurs(); dessiner(); });
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    tailler();
    cadrer();
    dessiner();

    return {
      nb: noeuds.length,
      recadrer: cadrer,
      zoomer: function (f) { selection.call(zoom.scaleBy, f, [L / 2, H / 2]); },
      detruire: function () {
        fini = true;
        sim.stop();
        ro.disconnect();
        themeObs.disconnect();
        selection.on(".zoom", null).on(".drag", null);
        canvas.remove();
      }
    };
  }

  C.graphe = { monter: monter, donnees: donnees };
})(window.Codex);

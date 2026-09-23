/* ============================================================
   CODEX — éditeur de fiche
   Markdown à gauche, aperçu à droite (onglets sur mobile), barre
   d'outils, autocomplétion des [[liens]], historique des versions,
   verrou optimiste contre les écrasements, et gestion des ressources
   avec compression des PDF avant envoi.
   ============================================================ */
(function (C) {
  "use strict";
  var h = C.h, icone = C.icone;

  var MODELE = [
    "## Vue d'ensemble", "", "En cinq lignes : de quoi parle ce chapitre, et pourquoi il compte.", "",
    "## Définitions et théorèmes", "",
    "::: definition Nom de la notion", "Énoncé précis.", ":::", "",
    "::: theoreme Nom du théorème", "Énoncé, avec formules : $P(X) = \\det(A - X I_n)$", ":::", "",
    "## Méthode", "",
    "::: methode Pour résoudre un exercice type", "1. …", "2. …", "3. …", ":::", "",
    "::: attention Piège classique", "…", ":::", "",
    "## Exemple corrigé", "", "…", "",
    "## Exercices", "",
    "### Exercice 1 — Titre", "",
    "Énoncé de l'exercice.", "",
    "::: corrige- Corrigé", "La solution, repliée jusqu'au clic.", ":::", "",
    "## Liens", "", "- Prérequis : [[Titre d'une autre fiche]]", ""
  ].join("\n");

  var PROMPT = [
    "Tu vas résumer un cours pour une fiche de révision. Réponds UNIQUEMENT en Markdown, en français, sans phrase d'introduction.",
    "",
    "Structure :",
    "## Vue d'ensemble (5 lignes max)",
    "## Définitions et théorèmes",
    "## Méthode (étapes numérotées pour les exercices types)",
    "## Exemple corrigé",
    "## Pièges fréquents",
    "## Exercices (3 à 5, du plus simple au plus difficile, chacun sous un titre « ### Exercice N — … »)",
    "",
    "Règles de format :",
    "- Formules en LaTeX : $…$ dans le texte, $$…$$ seules sur leur ligne. Raccourcis disponibles : \\R \\N \\Z \\Q \\C \\K \\Ker \\Im \\Vect \\rg \\tr.",
    "- Encadrés : une ligne « ::: definition Titre », le contenu, puis une ligne « ::: ».",
    "  Genres possibles : definition, theoreme, propriete, methode, exemple, astuce, attention, danger, exercice, corrige.",
    "- Chaque exercice : l'énoncé, puis son corrigé replié : « ::: corrige- Corrigé », la solution détaillée, « ::: ».",
    "- Schémas (étapes, arbres, échanges, états) : un bloc ```mermaid (flowchart, sequenceDiagram, classDiagram, stateDiagram).",
    "- Code : blocs ``` avec le langage (```python, ```c…).",
    "- Pas de titre de niveau 1 (#) : le titre de la fiche existe déjà.",
    "- Quand une notion relève d'un autre chapitre, écris [[Nom du chapitre]].",
    "",
    "Voici le cours :",
    ""
  ].join("\n");

  var ENCADRES = [
    ["definition", "bookmark-star", "Définition"], ["theoreme", "award", "Théorème"],
    ["propriete", "diagram-3", "Propriété"], ["methode", "list-check", "Méthode"],
    ["exemple", "lightbulb", "Exemple"], ["astuce", "stars", "Astuce"],
    ["attention", "exclamation-triangle", "Attention"], ["danger", "x-octagon", "Piège"],
    ["exercice", "pencil-square", "Exercice"], ["corrige-", "check2-square", "Corrigé (replié)"]
  ];

  var DIAGRAMME = [
    "flowchart TD",
    "    A[Énoncé] --> B{Condition ?}",
    "    B -- oui --> C[Cas 1]",
    "    B -- non --> D[Cas 2]"
  ].join("\n");

  function titreDeFichier(nom) {
    return nom.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim() || nom;
  }

  // Position du curseur dans un <textarea>, en pixels : un <div> miroir
  // avec la même typographie, coupé au curseur. Sert à placer la liste
  // d'autocomplétion des [[liens]] juste sous ce qu'on tape.
  var PROPS_MIROIR = ["boxSizing", "width", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
    "borderTopWidth", "borderLeftWidth", "fontFamily", "fontSize", "fontWeight", "lineHeight",
    "letterSpacing", "tabSize", "whiteSpace", "wordWrap", "wordBreak"];
  function coordCurseur(ta, pos) {
    var s = getComputedStyle(ta);
    var m = document.createElement("div");
    PROPS_MIROIR.forEach(function (p) { m.style[p] = s[p]; });
    m.style.position = "absolute"; m.style.visibility = "hidden"; m.style.whiteSpace = "pre-wrap";
    m.style.overflowWrap = "break-word"; m.style.top = "0"; m.style.left = "-9999px";
    m.textContent = ta.value.slice(0, pos);
    var marque = document.createElement("span");
    marque.textContent = "\u200b";
    m.appendChild(marque);
    document.body.appendChild(m);
    var r = { x: marque.offsetLeft, y: marque.offsetTop + parseFloat(s.lineHeight || 20) };
    m.remove();
    return { x: r.x - ta.scrollLeft, y: r.y - ta.scrollTop };
  }

  // ---- La vue ----
  function vue(el, params) {
    if (!C.peutEcrire()) { location.hash = params.id ? "#/fiche/" + params.id : "#/"; return; }
    var nettoyages = [];
    el.appendChild(C.chargement("Ouverture de l'éditeur…"));

    var charge = params.id ? C.api.fiche(params.id) : Promise.resolve(null);
    charge.then(function (fiche) {
      if (!el.isConnected) return;
      C.vider(el);
      if (params.id && !fiche) {
        el.appendChild(C.etatVide("file-earmark-x", "Fiche introuvable", null, h("a.btn", { href: "#/" }, "Retour")));
        return;
      }
      construire(el, fiche, params, nettoyages);
    }).catch(function (e) {
      C.vider(el);
      el.appendChild(C.etatVide("wifi-off", "Impossible d'ouvrir l'éditeur", e.message));
    });

    return function () {
      C.garde = null;
      nettoyages.forEach(function (f) { f(); });
    };
  }

  function construire(el, fiche, params, nettoyages) {
    var nouveau = !fiche;
    var options = C.nav.optionsDossiers();
    var etat = {
      id: fiche ? fiche.id : null,
      majLe: fiche ? fiche.maj_le : null,
      sauve: {
        titre: fiche ? fiche.titre : "",
        // "" = à la racine (aucun dossier), comme une note Quartz hors dossier.
        dossier_id: fiche ? (fiche.dossier_id || "") : (params.dossier && C.etat.dossierParId[params.dossier] ? params.dossier : ""),
        contenu: fiche ? fiche.contenu : ""
      },
      enCours: false
    };
    document.title = (nouveau ? "Nouvelle fiche" : "Modifier · " + fiche.titre) + " · Codex";

    // ---- Barre du haut ----
    var titre = h("input.editeur-titre", { type: "text", value: etat.sauve.titre, placeholder: "Titre de la fiche", maxlength: 200, "aria-label": "Titre de la fiche" });
    var dossier = h("select.champ.champ-select", { "aria-label": "Dossier" },
      h("option", { value: "", selected: !etat.sauve.dossier_id }, "Racine (aucun dossier)"),
      options.map(function (o) {
        return h("option", { value: o.id, selected: o.id === etat.sauve.dossier_id }, "\u00a0\u00a0".repeat(o.profondeur + 1) + o.libelle);
      }));
    var indicateur = h("span.etat-sauvegarde");
    var btnSauver = h("button.btn.btn-primaire", { type: "button", title: "Enregistrer (Ctrl+S)" }, icone("check2"), h("span", "Enregistrer"));
    var btnFermer = h("a.btn", { href: nouveau ? "#/" : "#/fiche/" + etat.id }, icone("x-lg"), h("span", "Fermer"));
    var btnHisto = nouveau ? null : h("button.btn", { type: "button", title: "Versions précédentes" }, icone("clock-history"), h("span", "Historique"));

    var barre = h("div.editeur-barre",
      h("div.editeur-barre-gauche", titre, dossier),
      h("div.editeur-barre-droite", indicateur, btnHisto, btnFermer, btnSauver));

    // ---- Zone d'écriture ----
    var source = h("textarea.editeur-source", {
      spellcheck: "true", "aria-label": "Contenu de la fiche en Markdown",
      placeholder: "Colle ici le résumé de ton IA, en Markdown.\n\n## Un titre de partie\n**gras**, *italique*, listes avec -\nFormules : $e^{i\\pi} + 1 = 0$ ou, seule sur sa ligne, $$\\int_0^1 f(x)\\,dx$$\nLien vers une autre fiche : [[Titre de la fiche]]\nEncadré : ::: definition Titre … :::\n\nOu clique sur « Modèle » pour partir d'une structure."
    });
    source.value = etat.sauve.contenu;
    var apercu = h("div.editeur-apercu.prose", { "aria-live": "off" });
    var liste = h("ul.autocomplete", { role: "listbox", hidden: true });
    var corps = h("div.editeur-corps", { dataset: { onglet: "ecrire" } },
      h("div.editeur-panneau-source", source, liste), apercu);

    function onglet(nom) {
      corps.dataset.onglet = nom;
      ongEcrire.setAttribute("aria-pressed", String(nom === "ecrire"));
      ongApercu.setAttribute("aria-pressed", String(nom === "apercu"));
      if (nom === "apercu") rendreApercu();
    }
    var ongEcrire = h("button.onglet", { type: "button", "aria-pressed": "true", on: { click: function () { onglet("ecrire"); } } }, "Écrire");
    var ongApercu = h("button.onglet", { type: "button", "aria-pressed": "false", on: { click: function () { onglet("apercu"); } } }, "Aperçu");

    // ---- Outils ----
    function outil(ic, aide, action) {
      return h("button.outil", { type: "button", title: aide, "aria-label": aide, on: { click: action } }, icone(ic));
    }
    function inserer(avant, apres, defaut) {
      source.focus();
      var d = source.selectionStart, f = source.selectionEnd;
      var sel = source.value.slice(d, f) || defaut || "";
      var texte = avant + sel + (apres || "");
      // execCommand garde l'annulation (Ctrl+Z) native ; setRangeText non.
      if (!document.execCommand("insertText", false, texte)) source.setRangeText(texte, d, f, "end");
      source.setSelectionRange(d + avant.length, d + avant.length + sel.length);
      auChangement();
    }
    function prefixer(prefixe) {
      source.focus();
      var d = source.selectionStart;
      var debut = source.value.lastIndexOf("\n", d - 1) + 1;
      source.setSelectionRange(debut, debut);
      if (!document.execCommand("insertText", false, prefixe)) source.setRangeText(prefixe, debut, debut, "end");
      source.setSelectionRange(d + prefixe.length, d + prefixe.length);
      auChangement();
    }
    function bloc(avant, apres, defaut) {
      var d = source.selectionStart;
      var saut = d > 0 && source.value.charAt(d - 1) !== "\n" ? "\n\n" : "";
      inserer(saut + avant, apres, defaut);
    }
    var btnEncadre = outil("bookmark-star", "Encadré (définition, théorème…)", function () {
      C.menu(btnEncadre, ENCADRES.map(function (e) {
        return { icone: e[1], texte: e[2], action: function () { bloc("::: " + e[0] + " ", "\n…\n:::\n", e[2].replace(/ \(replié\)$/, "")); } };
      }));
    });
    var outils = h("div.editeur-outils",
      h("div.outils-groupe",
        outil("type-h2", "Titre de partie", function () { prefixer("## "); }),
        outil("type-h3", "Sous-titre", function () { prefixer("### "); }),
        outil("type-bold", "Gras (Ctrl+B)", function () { inserer("**", "**", "texte"); }),
        outil("type-italic", "Italique (Ctrl+I)", function () { inserer("*", "*", "texte"); }),
        outil("list-ul", "Liste", function () { prefixer("- "); }),
        outil("list-ol", "Liste numérotée", function () { prefixer("1. "); })),
      h("div.outils-groupe",
        outil("currency-dollar", "Formule dans le texte : $…$", function () { inserer("$", "$", "x^2"); }),
        outil("calculator", "Formule centrée : $$…$$", function () { bloc("$$\n", "\n$$\n", "\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}"); }),
        btnEncadre,
        outil("code-slash", "Bloc de code", function () { bloc("```python\n", "\n```\n", "print('bonjour')"); }),
        outil("diagram-2", "Diagramme (Mermaid)", function () { bloc("```mermaid\n", "\n```\n", DIAGRAMME); }),
        outil("link", "Lien vers une fiche : [[Titre]]", function () { inserer("[[", "]]", ""); ouvrirAutocompletion(); })),
      h("div.outils-groupe.outils-texte",
        h("button.btn.btn-mini.btn-fantome", { type: "button", title: "Insérer une structure de fiche", on: { click: function () {
          if (source.value.trim()) bloc("", "", MODELE); else { source.value = MODELE; auChangement(); }
        } } }, icone("file-earmark-richtext"), "Modèle"),
        h("button.btn.btn-mini.btn-fantome", { type: "button", title: "Copier une consigne à donner à ton IA avec le cours", on: { click: function () {
          navigator.clipboard.writeText(PROMPT).then(function () {
            C.toast("Consigne copiée : colle-la dans ton IA, puis ton cours à la suite.", "ok");
          }, function () { C.toast("Copie refusée par le navigateur.", "erreur"); });
        } } }, icone("robot"), "Consigne IA")),
      h("div.onglets", { role: "group", "aria-label": "Affichage" }, ongEcrire, ongApercu));

    // ---- Aperçu en direct ----
    var rendreApercu = C.retarder(function () {
      C.rendu.rendre(apercu, source.value, {});
      if (!source.value.trim()) apercu.appendChild(h("p.prose-vide", "L'aperçu apparaîtra ici."));
    }, 180);

    // Défilement de l'aperçu calé sur celui de la source, en proportion.
    source.addEventListener("scroll", function () {
      var max = source.scrollHeight - source.clientHeight;
      if (max > 0) apercu.scrollTop = (source.scrollTop / max) * (apercu.scrollHeight - apercu.clientHeight);
    });

    // ---- État d'enregistrement ----
    function courant() {
      return { titre: titre.value.trim(), dossier_id: dossier.value, contenu: source.value };
    }
    function sale() {
      var c = courant(), s = etat.sauve;
      return c.titre !== s.titre || c.dossier_id !== s.dossier_id || c.contenu !== s.contenu;
    }
    function majIndicateur() {
      var s = sale();
      indicateur.className = "etat-sauvegarde" + (s ? " sale" : "");
      indicateur.textContent = etat.enCours ? "Enregistrement…" : s ? "Modifications non enregistrées" : nouveau ? "" : "Enregistré";
    }
    C.garde = sale;

    function auChangement() {
      // Un résumé d'IA commence souvent par « # Titre » : il devient le
      // titre de la fiche s'il n'y en a pas encore.
      if (!titre.value.trim()) {
        var m = /^\s*#\s+(.+)\s*$/m.exec(source.value.split("\n").slice(0, 3).join("\n"));
        if (m) titre.value = m[1].replace(/[*_`]/g, "").trim().slice(0, 200);
      }
      rendreApercu();
      majIndicateur();
    }
    source.addEventListener("input", function () { auChangement(); verifierAutocompletion(); });
    titre.addEventListener("input", majIndicateur);
    dossier.addEventListener("change", majIndicateur);

    // ---- Enregistrer ----
    function enregistrer(ecraser) {
      if (etat.enCours) return;
      var v = courant();
      if (!v.titre) { C.toast("Donne un titre à la fiche.", "erreur"); titre.focus(); return; }
      etat.enCours = true;
      btnSauver.disabled = true;
      majIndicateur();
      var p = nouveau
        ? C.api.creerFiche(v)
        : C.api.enregistrerFiche(etat.id, v, ecraser ? null : etat.majLe);
      function fin() {
        etat.enCours = false;
        btnSauver.disabled = false;
        majIndicateur();
      }
      p.then(function (f) {
        etat.sauve = v;
        etat.majLe = f.maj_le;
        C.toast("Fiche enregistrée.", "ok");
        fin();
        return C.recharger().then(function () {
          if (nouveau) {
            // La fiche existe : on rouvre l'éditeur dessus, ce qui fait
            // apparaître la gestion des ressources.
            C.garde = null;
            location.replace("#/editer/" + f.id);
          }
        });
      }, function (e) {
        fin();
        if (!e.conflit) { C.toast(e.message, "erreur"); return; }
        C.dialogue({
          titre: "Conflit de modification",
          texte: e.message + " « Écraser » remplace leur version par la tienne ; la leur restera récupérable dans l'Historique.",
          confirmer: "Écraser avec ma version", annuler: "Garder l'éditeur ouvert", danger: true
        }).then(function (ok) { if (ok) enregistrer(true); });
      }).catch(function (e) { C.toast(e.message, "erreur"); });
    }
    btnSauver.addEventListener("click", function () { enregistrer(false); });

    function raccourcis(e) {
      var mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); enregistrer(false); }
    }
    document.addEventListener("keydown", raccourcis);
    nettoyages.push(function () { document.removeEventListener("keydown", raccourcis); });

    source.addEventListener("keydown", function (e) {
      if (!liste.hidden && gererAutocompletion(e)) return;
      var mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "b") { e.preventDefault(); inserer("**", "**", "texte"); }
      if (mod && e.key.toLowerCase() === "i") { e.preventDefault(); inserer("*", "*", "texte"); }
    });

    // Glisser un .md sur la zone d'écriture l'importe.
    source.addEventListener("dragover", function (e) { if (e.dataTransfer.types.indexOf("Files") >= 0) e.preventDefault(); });
    source.addEventListener("drop", function (e) {
      var f = e.dataTransfer.files[0];
      if (!f) return;
      e.preventDefault();
      if (!/\.(md|markdown|txt)$/i.test(f.name)) { C.toast("Seuls les fichiers .md et .txt s'importent ici. Les PDF vont dans Ressources, plus bas.", "info"); return; }
      f.text().then(function (t) {
        if (source.value.trim()) inserer("", "", t); else { source.value = t; auChangement(); }
      });
    });

    // ---- Autocomplétion des [[liens]] ----
    var choix = [], index = 0;
    function requeteLien() {
      var avant = source.value.slice(0, source.selectionStart);
      var m = /\[\[([^\]\n|#]*)$/.exec(avant);
      return m ? m[1] : null;
    }
    function ouvrirAutocompletion() { setTimeout(verifierAutocompletion, 0); }
    function verifierAutocompletion() {
      var q = requeteLien();
      if (q === null) { liste.hidden = true; return; }
      var p = C.plier(q);
      choix = C.trier(C.etat.fiches.filter(function (f) {
        return f.id !== etat.id && C.plier(f.titre).indexOf(p) >= 0;
      }), "titre").slice(0, 8);
      if (!choix.length) { liste.hidden = true; return; }
      index = 0;
      dessinerListe();
      var c = coordCurseur(source, source.selectionStart);
      liste.style.left = Math.min(c.x, source.clientWidth - 260) + "px";
      liste.style.top = Math.min(c.y + 4, source.clientHeight - 40) + "px";
      liste.hidden = false;
    }
    function dessinerListe() {
      C.vider(liste);
      choix.forEach(function (f, i) {
        var chemin = C.nav.chemin(f.dossier_id).map(function (d) { return d.titre; }).join(" › ");
        liste.appendChild(h("li", {
          role: "option", "aria-selected": String(i === index), class: i === index ? "actif" : null,
          on: { mousedown: function (e) { e.preventDefault(); index = i; valider(); } }
        }, h("span.ac-titre", f.titre), h("span.ac-chemin", chemin)));
      });
    }
    function valider() {
      var q = requeteLien();
      if (q === null) return;
      var f = choix[index];
      var fin = source.value.slice(source.selectionStart, source.selectionStart + 2) === "]]" ? "" : "]]";
      source.setSelectionRange(source.selectionStart - q.length, source.selectionStart);
      if (!document.execCommand("insertText", false, f.titre + fin)) source.setRangeText(f.titre + fin, source.selectionStart, source.selectionEnd, "end");
      if (!fin) source.setSelectionRange(source.selectionStart + 2, source.selectionStart + 2);
      liste.hidden = true;
      auChangement();
    }
    function gererAutocompletion(e) {
      if (e.key === "ArrowDown") { index = (index + 1) % choix.length; dessinerListe(); }
      else if (e.key === "ArrowUp") { index = (index - 1 + choix.length) % choix.length; dessinerListe(); }
      else if (e.key === "Enter" || e.key === "Tab") valider();
      else if (e.key === "Escape") liste.hidden = true;
      else return false;
      e.preventDefault();
      return true;
    }
    source.addEventListener("blur", function () { setTimeout(function () { liste.hidden = true; }, 120); });
    source.addEventListener("click", verifierAutocompletion);

    // ---- Historique ----
    if (btnHisto) btnHisto.addEventListener("click", function () { ouvrirHistorique(etat, source, titre, auChangement); });

    el.appendChild(h("div.editeur", barre, outils, corps,
      nouveau ? h("p.editeur-note", icone("info-circle"), "Les ressources (polys, TD, annales…) s'ajoutent une fois la fiche enregistrée.")
        : sectionRessources(fiche, nettoyages),
      nouveau ? null : zoneDanger(fiche)));

    rendreApercu();
    majIndicateur();
    if (params.ancre === "ressources") {
      var r = el.querySelector("#ressources");
      if (r) requestAnimationFrame(function () { r.scrollIntoView(); });
    } else if (nouveau) titre.focus();
    else source.focus();
  }

  // ---- Historique des versions ----
  function ouvrirHistorique(etat, source, titre, auChangement) {
    var apercu = h("div.prose.historique-apercu", h("p.prose-vide", "Choisis une version à gauche."));
    var listeEl = h("ul.historique-liste", h("li.historique-attente", "Chargement…"));
    var choisie = null;
    var corps = h("div.historique", listeEl, apercu);
    C.api.revisions(etat.id).then(function (revs) {
      C.vider(listeEl);
      if (!revs.length) { listeEl.appendChild(h("li.historique-attente", "Aucune version précédente : la fiche n'a jamais été modifiée.")); return; }
      revs.forEach(function (r) {
        var b = h("button.historique-item", { type: "button" },
          h("span.historique-date", C.dateComplete(r.cree_le)),
          h("span.historique-auteur", r.auteur ? C.prenom(r.auteur) : "—"));
        b.addEventListener("click", function () {
          listeEl.querySelectorAll(".actif").forEach(function (x) { x.classList.remove("actif"); });
          b.classList.add("actif");
          C.vider(apercu).appendChild(C.chargement());
          C.api.revision(r.id).then(function (v) {
            choisie = v;
            C.vider(apercu);
            apercu.appendChild(h("h1", v.titre));
            var zone = h("div");
            C.rendu.rendre(zone, v.contenu, {});
            apercu.appendChild(zone);
          }).catch(function (e) { C.vider(apercu).appendChild(h("p", e.message)); });
        });
        listeEl.appendChild(h("li", b));
      });
    }).catch(function (e) { C.vider(listeEl).appendChild(h("li.historique-attente", e.message)); });

    C.dialogue({
      titre: "Historique des versions", large: true, contenu: corps,
      texte: "Les 50 dernières versions sont gardées. Charger une version la met dans l'éditeur : rien n'est écrasé tant que tu n'enregistres pas.",
      confirmer: "Charger cette version dans l'éditeur", annuler: "Fermer"
    }).then(function (ok) {
      if (!ok) return;
      if (!choisie) { C.toast("Aucune version choisie.", "info"); return; }
      source.value = choisie.contenu;
      titre.value = choisie.titre;
      auChangement();
      C.toast("Version chargée : enregistre pour la restaurer.", "info");
    });
  }

  // ---- Ressources ----
  function sectionRessources(fiche, nettoyages) {
    var ressources = fiche.ressources.slice();
    var utilise = null;
    var CLE_FORTE = "codex.compression-forte";
    var forteParDefaut = true;
    try { forteParDefaut = localStorage.getItem(CLE_FORTE) !== "non"; } catch (e) { /* stockage bloqué */ }

    var listeEl = h("ul.edition-ressources");
    var jauge = h("div.jauge", { role: "meter", "aria-label": "Stockage utilisé", "aria-valuemin": "0", "aria-valuemax": "100" },
      h("div.jauge-barre", h("div.jauge-rempli")), h("span.jauge-texte", "Stockage : calcul…"));

    function majJauge() {
      if (utilise === null) return;
      var pc = Math.min(100, utilise / C.api.QUOTA * 100);
      jauge.setAttribute("aria-valuenow", String(Math.round(pc)));
      jauge.querySelector(".jauge-rempli").style.width = pc + "%";
      jauge.classList.toggle("alerte", pc > 80);
      jauge.querySelector(".jauge-texte").textContent = "Stockage : " + C.taille(utilise) + " sur 1 Go (" + Math.round(pc) + " %)";
    }
    C.api.stockage().then(function (s) { utilise = s.octets; majJauge(); }).catch(function () {
      jauge.querySelector(".jauge-texte").textContent = "Stockage : indisponible";
    });

    function ligne(r) {
      var t = C.TYPE[r.type] || C.TYPE.lien;
      var suppr = h("button.btn.btn-mini.btn-fantome.btn-danger-texte", { type: "button", "aria-label": "Supprimer « " + r.titre + " »", title: "Supprimer" }, icone("trash3"));
      suppr.addEventListener("click", function () {
        C.dialogue({
          titre: "Supprimer « " + r.titre + " » ?",
          texte: r.fichier ? "Le fichier sera effacé du stockage." : "Seul le lien est retiré.",
          confirmer: "Supprimer", danger: true
        }).then(function (ok) {
          if (!ok) return;
          C.api.supprimerRessource(r).then(function () {
            ressources = ressources.filter(function (x) { return x.id !== r.id; });
            if (r.fichier && utilise !== null) { utilise -= r.taille || 0; majJauge(); }
            dessiner();
            C.toast("Ressource supprimée.", "ok");
          }).catch(function (e) { C.toast(e.message, "erreur"); });
        });
      });
      return h("li.edition-ressource",
        h("span.ressource-icone", icone(t.icone)),
        h("span.ressource-texte", h("span.ressource-titre", r.titre),
          h("span.ressource-meta", t.un + " · " + (r.fichier ? C.taille(r.taille) : C.domaine(r.url)))),
        suppr);
    }
    function dessiner() {
      C.vider(listeEl);
      if (!ressources.length) listeEl.appendChild(h("li.carte-vide", "Aucune ressource pour l'instant."));
      C.TYPES.forEach(function (t) {
        C.trier(ressources.filter(function (r) { return r.type === t.id; }), "titre").forEach(function (r) { listeEl.appendChild(ligne(r)); });
      });
    }
    dessiner();

    function selectType() {
      return h("select.champ.champ-select", { "aria-label": "Type de ressource" },
        h("option", { value: "auto" }, "Type : automatique"),
        C.TYPES.map(function (t) { return h("option", { value: t.id }, t.un); }));
    }

    // ---- Dépôt de fichiers ----
    var typeFichier = selectType();
    var forte = h("input", { type: "checkbox", checked: forteParDefaut });
    forte.addEventListener("change", function () {
      try { localStorage.setItem(CLE_FORTE, forte.checked ? "oui" : "non"); } catch (e) { /* stockage bloqué */ }
    });
    var entree = h("input.visuellement-cache", { type: "file", multiple: true, id: "entree-fichiers" });
    var envois = h("ul.envois");
    var depot = h("label.depot", { for: "entree-fichiers" },
      icone("cloud-arrow-up"),
      h("span.depot-titre", "Glisse tes fichiers ici, ou clique pour choisir"),
      h("span.depot-aide", "PDF compressés automatiquement · 50 Mo max par fichier après compression"));

    var file = Promise.resolve();
    function ajouterFichiers(liste) {
      Array.prototype.forEach.call(liste, function (f) {
        var etape = h("span.envoi-etape", "En attente…");
        var barre = h("div.envoi-barre", h("div.envoi-rempli"));
        var li = h("li.envoi", h("span.envoi-nom", icone("file-earmark"), f.name), etape, barre);
        envois.appendChild(li);
        // Un fichier à la fois : Ghostscript tient plusieurs copies en
        // mémoire, en parallèle le navigateur pourrait saturer.
        file = file.then(function () { return envoyer(f, li, etape, barre); });
      });
    }
    function envoyer(f, li, etape, barre) {
      var rempli = barre.firstChild;
      var type = typeFichier.value === "auto" ? C.devinerType(f.name, null) : typeFichier.value;
      return C.compression.preparer(f, { forte: forte.checked, surEtape: function (t) { etape.textContent = t; } })
        .then(function (res) {
          var avert = C.compression.verifier(res.fichier, utilise || 0);
          if (avert) C.toast(avert, "info");
          var gain = res.avant > res.apres ? " (" + C.taille(res.avant) + " → " + C.taille(res.apres) + ", −" + Math.round((1 - res.apres / res.avant) * 100) + " %)" : "";
          etape.textContent = "Envoi…" + gain;
          li.classList.add("en-cours");
          return C.api.ajouterFichier(fiche.id, { type: type, titre: titreDeFichier(f.name) }, res.fichier, function (p) {
            rempli.style.width = Math.round(p * 100) + "%";
            etape.textContent = "Envoi " + Math.round(p * 100) + " %" + gain;
          }).then(function (r) {
            ressources.push(r);
            if (utilise !== null) { utilise += r.taille || 0; majJauge(); }
            dessiner();
            li.classList.remove("en-cours");
            li.classList.add("ok");
            rempli.style.width = "100%";
            etape.textContent = "Ajouté" + gain;
            setTimeout(function () { li.remove(); }, 6000);
          });
        }).catch(function (e) {
          li.classList.remove("en-cours");
          li.classList.add("erreur");
          etape.textContent = e.message;
        });
    }
    entree.addEventListener("change", function () { ajouterFichiers(entree.files); entree.value = ""; });
    ["dragenter", "dragover"].forEach(function (t) {
      depot.addEventListener(t, function (e) { e.preventDefault(); depot.classList.add("survol"); });
    });
    ["dragleave", "drop"].forEach(function (t) {
      depot.addEventListener(t, function () { depot.classList.remove("survol"); });
    });
    depot.addEventListener("drop", function (e) { e.preventDefault(); ajouterFichiers(e.dataTransfer.files); });

    // Quitter la page pendant un envoi le couperait.
    function avantDepart(e) {
      if (envois.querySelector(".envoi:not(.ok):not(.erreur)")) { e.preventDefault(); e.returnValue = ""; }
    }
    window.addEventListener("beforeunload", avantDepart);
    nettoyages.push(function () { window.removeEventListener("beforeunload", avantDepart); });

    var panneauFichiers = h("div.ajout-panneau",
      depot, entree,
      h("div.ajout-options",
        typeFichier,
        h("label.case", forte, h("span", "Compression forte des PDF"),
          h("span.case-aide", { title: "Images ramenées à 150 dpi : parfait à l'écran et à l'impression, et souvent 3 à 4 fois plus léger." }, icone("question-circle")))),
      envois);

    // ---- Ajout d'un lien ----
    var typeLien = selectType();
    var urlLien = h("input.champ", { type: "url", placeholder: "https://…", required: true, "aria-label": "Adresse du lien" });
    var titreLien = h("input.champ", { type: "text", placeholder: "Titre (ex. Poly du prof, Corrigé TD3)", maxlength: 200, "aria-label": "Titre du lien" });
    var formLien = h("form.ajout-panneau.ajout-lien", { hidden: true },
      urlLien, titreLien, typeLien,
      h("button.btn.btn-primaire", { type: "submit" }, icone("plus-lg"), "Ajouter le lien"));
    formLien.addEventListener("submit", function (e) {
      e.preventDefault();
      var url = urlLien.value.trim();
      if (!/^https?:\/\//i.test(url)) { C.toast("L'adresse doit commencer par https://", "erreur"); urlLien.focus(); return; }
      var t = titreLien.value.trim() || C.domaine(url);
      var type = typeLien.value === "auto" ? C.devinerType(t, url) : typeLien.value;
      C.api.ajouterLien(fiche.id, { type: type, titre: t, url: url }).then(function (r) {
        ressources.push(r);
        dessiner();
        formLien.reset();
        C.toast("Lien ajouté.", "ok");
      }).catch(function (err) { C.toast(err.message, "erreur"); });
    });

    var segF = h("button.segment", { type: "button", "aria-pressed": "true" }, icone("paperclip"), "Fichiers");
    var segL = h("button.segment", { type: "button", "aria-pressed": "false" }, icone("link-45deg"), "Lien (Drive, YouTube…)");
    function mode(fichiers) {
      segF.setAttribute("aria-pressed", String(fichiers));
      segL.setAttribute("aria-pressed", String(!fichiers));
      panneauFichiers.hidden = !fichiers;
      formLien.hidden = fichiers;
      if (!fichiers) urlLien.focus();
    }
    segF.addEventListener("click", function () { mode(true); });
    segL.addEventListener("click", function () { mode(false); });

    return h("section.editeur-ressources", { id: "ressources", "aria-labelledby": "titre-edit-ressources" },
      h("div.section-entete",
        h("h2", { id: "titre-edit-ressources" }, icone("box-seam"), "Ressources"),
        h("span.section-aide", "Enregistrées dès l'ajout, sans passer par « Enregistrer ».")),
      listeEl,
      h("div.segments", { role: "group", "aria-label": "Type d'ajout" }, segF, segL),
      panneauFichiers, formLien, jauge);
  }

  function zoneDanger(fiche) {
    var b = h("button.btn.btn-danger", { type: "button" }, icone("trash3"), "Supprimer la fiche");
    b.addEventListener("click", function () {
      var n = fiche.ressources.length;
      C.dialogue({
        titre: "Supprimer « " + fiche.titre + " » ?",
        texte: "La fiche, son historique" + (n ? " et ses " + n + " ressource(s), fichiers compris," : "") + " seront supprimés définitivement.",
        confirmer: "Supprimer définitivement", danger: true
      }).then(function (ok) {
        if (!ok) return;
        C.api.fiche(fiche.id).then(function (f) { return C.api.supprimerFiche(f || fiche); }).then(function () {
          C.garde = null;
          C.toast("Fiche supprimée.", "ok");
          return C.recharger();
        }).then(function () { location.hash = "#/"; })
          .catch(function (e) { C.toast(e.message, "erreur"); });
      });
    });
    return h("section.zone-danger", h("div", h("h2", "Zone sensible"), h("p", "Supprimer la fiche efface aussi son historique et ses fichiers.")), b);
  }

  C.vues = C.vues || {};
  C.vues.editeur = vue;
})(window.Codex);

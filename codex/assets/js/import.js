/* ============================================================
   CODEX — importer (#/importer, admins et éditeurs)

   Deux outils pour remplir Codex sans passer par Supabase :

   1. Des fiches Markdown :
      - des fichiers .md : une fiche par fichier, titre tiré du « # Titre »
        ou de l'en-tête YAML (title:, tags:) des notes Obsidian / Quartz,
        sinon du nom du fichier ;
      - un dossier entier : ses sous-dossiers deviennent des dossiers ;
      - un « lot Codex » : un fichier qui commence par « @@ Dossier / Sous »
        et contient plusieurs fiches « +++ Titre », avec leurs liens
        « + type | titre | https://… » (le format des cours générés).
   2. Des fichiers en lot (PDF, TD…) : chacun est rattaché à une fiche,
      devinée d'après son nom ou donnée par un fichier de correspondance
      (CSV : fichier;fiche;type;titre), puis compressé et envoyé comme
      depuis l'éditeur.

   Rien n'est écrit avant la validation de l'aperçu. Tout passe par l'API
   habituelle, donc par la RLS : un lecteur qui forcerait l'adresse de la
   page se ferait refuser chaque écriture.
   ============================================================ */
(function (C) {
  "use strict";
  var h = C.h, icone = C.icone;

  var MAX_MD = 2 * 1024 * 1024;   // par fichier Markdown
  var MAX_FICHES = 500;           // par import
  var TYPES_OK = {};
  C.TYPES.forEach(function (t) { TYPES_OK[t.id] = true; });
  var SUFFIXE_PLAN = " : plan du cours";

  // ---------------------------------------------------------------
  // Analyse des fichiers Markdown (pur : texte en entrée, fiches en sortie)
  // ---------------------------------------------------------------

  function normaliser(texte) {
    if (texte.charCodeAt(0) === 0xFEFF) texte = texte.slice(1);
    return texte.replace(/\r\n?/g, "\n");
  }
  function sansExtension(nom) { return nom.replace(/\.[^.\/]+$/, ""); }
  function titreDeNom(nom) {
    return sansExtension(nom).replace(/_+/g, " ").replace(/\s+/g, " ").trim() || nom;
  }
  function nettoyerTitre(t) {
    return String(t).replace(/[*_`]/g, "").replace(/\s+/g, " ").trim().slice(0, 200);
  }

  // En-tête YAML simple (clé: valeur, et tags en liste) des notes Obsidian.
  function enTete(texte) {
    var m = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(texte);
    if (!m) return { meta: {}, tags: [], corps: texte };
    var meta = {}, tags = [], dansTags = false;
    m[1].split("\n").forEach(function (l) {
      var liste = /^\s*-\s+(.+)$/.exec(l);
      if (dansTags && liste) { tags.push(liste[1]); return; }
      dansTags = false;
      var k = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(l);
      if (!k) return;
      var cle = k[1].toLowerCase(), v = k[2].trim();
      if (cle === "tags" || cle === "tag") {
        if (!v) { dansTags = true; return; }
        tags = tags.concat(v.replace(/^\[|\]$/g, "").split(","));
        return;
      }
      meta[cle] = v.replace(/^["']|["']$/g, "");
    });
    tags = tags.map(function (t) { return t.trim().replace(/^["'#]+|["']+$/g, "").replace(/\s+/g, "-"); }).filter(Boolean);
    return { meta: meta, tags: tags, corps: texte.slice(m[0].length) };
  }

  function ficheSimple(texte, nom, chemin) {
    var e = enTete(texte), corps = e.corps;
    var titre = e.meta.title || e.meta.titre || "";
    var lignes = corps.split("\n"), i = 0;
    while (i < lignes.length && !lignes[i].trim()) i++;
    var h1 = i < lignes.length ? /^#\s+(.+?)\s*#*\s*$/.exec(lignes[i]) : null;
    if (h1) {
      if (!titre) titre = h1[1];
      // Le « # Titre » ferait doublon avec le titre de la page : on le retire.
      if (C.plier(nettoyerTitre(h1[1])) === C.plier(nettoyerTitre(titre))) corps = lignes.slice(i + 1).join("\n");
    }
    titre = nettoyerTitre(titre || titreDeNom(nom));
    corps = corps.trim();
    if (e.tags.length) corps += (corps ? "\n\n" : "") + e.tags.map(function (t) { return "#" + t; }).join(" ");
    return { titre: titre, chemin: chemin, contenu: corps + "\n", ressources: [], source: nom };
  }

  // Lot Codex : « @@ A / B », puis des fiches « +++ Titre ».
  function ficheLot(texte, nom, erreurs) {
    var lignes = texte.split("\n"), chemin = null, fiches = [], courante = null;
    lignes.forEach(function (l, n) {
      if (chemin === null) {
        if (!l.trim()) return;
        var m = /^@@(.*)$/.exec(l);
        chemin = m[1].split("/").map(function (s) { return s.trim(); }).filter(Boolean);
        return;
      }
      if (l.indexOf("+++ ") === 0) {
        courante = { titre: nettoyerTitre(l.slice(4)), chemin: chemin, lignes: [], ressources: [], source: nom + ":" + (n + 1) };
        fiches.push(courante);
        return;
      }
      if (!courante) {
        if (l.trim()) erreurs.push(nom + ", ligne " + (n + 1) + " : du texte avant la première fiche (« +++ Titre »).");
        return;
      }
      if (l.indexOf("+ ") === 0 && !courante.lignes.length) {
        var r = l.slice(2).split("|").map(function (s) { return s.trim(); });
        if (r.length === 3 && TYPES_OK[r[0]] && /^https?:\/\/\S+$/i.test(r[2]) && r[1]) courante.ressources.push({ type: r[0], titre: r[1].slice(0, 200), url: r[2] });
        else erreurs.push(nom + ", ligne " + (n + 1) + " : lien mal formé, ignoré (attendu « + type | titre | https://… »).");
        return;
      }
      courante.lignes.push(l);
    });
    return fiches.map(function (f) {
      f.contenu = f.lignes.join("\n").trim() + "\n";
      delete f.lignes;
      return f;
    }).filter(function (f) { return f.titre; });
  }

  // Navigation précédent / plan / suivant des lots, comme generer.py.
  function ajouterNavigation(fiches) {
    var parMatiere = {};
    fiches.forEach(function (f) { if (f.lot && f.chemin.length) (parMatiere[f.chemin[0]] = parMatiere[f.chemin[0]] || []).push(f); });
    Object.keys(parMatiere).forEach(function (k) {
      var liste = parMatiere[k];
      var plan = liste.filter(function (f) { return f.titre.slice(-SUFFIXE_PLAN.length) === SUFFIXE_PLAN; })[0];
      var suite = liste.filter(function (f) { return f !== plan; });
      suite.forEach(function (f, i) {
        var m = [];
        if (i > 0) m.push("← [[" + suite[i - 1].titre + "]]");
        if (plan) m.push("[[" + plan.titre + "|Plan du cours]]");
        if (i + 1 < suite.length) m.push("[[" + suite[i + 1].titre + "]] →");
        if (m.length) f.contenuFinal = f.contenu + "\n---\n\n" + m.join(" · ") + "\n";
      });
    });
  }

  // fichiers : [{ nom, dossiers: [..], texte }] → { fiches, erreurs }
  function analyser(fichiers) {
    var fiches = [], erreurs = [];
    fichiers.forEach(function (f) {
      var t = normaliser(f.texte);
      if (/^\s*@@/.test(t)) {
        ficheLot(t, f.nom, erreurs).forEach(function (x) { x.lot = true; fiches.push(x); });
      } else if (t.trim()) {
        fiches.push(ficheSimple(t, f.nom, f.dossiers));
      }
    });
    return { fiches: fiches, erreurs: erreurs };
  }

  function horsCode(md) {
    return md.replace(/^```[\s\S]*?^```/gm, "").replace(/`[^`\n]*`/g, "");
  }
  function liensDe(md) {
    var re = /\[\[([^\]|#\n]+)/g, m, l = [];
    var t = horsCode(md);
    while ((m = re.exec(t))) l.push(m[1].replace(/\\\s*$/, "").trim());
    return l;
  }

  // ---------------------------------------------------------------
  // Plan : ce qui sera créé, ignoré ou remplacé, d'après l'état actuel
  // ---------------------------------------------------------------

  function dossierExistant(parentId, titre) {
    var p = C.plier(titre);
    return C.etat.dossiers.filter(function (d) { return (d.parent_id || null) === (parentId || null) && C.plier(d.titre) === p; })[0] || null;
  }

  function planifier(analyse, destination, siExiste, navigation) {
    var existantes = {};
    C.etat.fiches.forEach(function (f) { if (!f.accueil) existantes[C.plier(f.titre)] = f; });
    var vus = {}, lignes = [], dossiersNeufs = {}, titresImport = {};
    analyse.fiches.forEach(function (f) { titresImport[C.plier(f.titre)] = true; });

    analyse.fiches.forEach(function (f) {
      var cle = C.plier(f.titre);
      var ligne = { fiche: f, contenu: navigation && f.contenuFinal ? f.contenuFinal : f.contenu };
      // Le chemin : dossiers existants suivis tant qu'ils existent, le reste à créer.
      var parent = destination, manque = false, libelles = [];
      f.chemin.forEach(function (part) {
        libelles.push(part);
        var d = manque ? null : dossierExistant(parent, part);
        if (d) parent = d.id;
        else { manque = true; dossiersNeufs[(destination || "") + "/" + libelles.map(C.plier).join("/")] = true; }
      });
      if (vus[cle]) { ligne.etat = "doublon"; }
      else if (existantes[cle]) { ligne.etat = siExiste === "remplacer" ? "remplacer" : "ignorer"; ligne.existante = existantes[cle]; }
      else ligne.etat = "creer";
      vus[cle] = true;
      lignes.push(ligne);
    });

    var absents = {};
    lignes.forEach(function (l) {
      if (l.etat === "doublon" || l.etat === "ignorer") return;
      liensDe(l.contenu).forEach(function (t) {
        var p = C.plier(t);
        if (!existantes[p] && !titresImport[p]) absents[t] = (absents[t] || 0) + 1;
      });
    });
    return { lignes: lignes, dossiersNeufs: Object.keys(dossiersNeufs).length, absents: absents };
  }

  // ---------------------------------------------------------------
  // Écriture
  // ---------------------------------------------------------------

  function executerFiches(plan, destination, surLigne) {
    var memo = {};
    function assurer(chemin) {
      var p = Promise.resolve(destination || null);
      chemin.forEach(function (part) {
        p = p.then(function (parent) {
          var cle = (parent || "") + "/" + C.plier(part);
          if (memo[cle]) return memo[cle];
          var d = dossierExistant(parent, part);
          memo[cle] = d ? Promise.resolve(d.id) : C.api.creerDossier(part, parent).then(function (x) { return x.id; });
          memo[cle].catch(function () { delete memo[cle]; });
          return memo[cle];
        });
      });
      return p;
    }
    var bilan = { crees: 0, remplaces: 0, erreurs: 0 };
    var suite = Promise.resolve();
    plan.lignes.forEach(function (l, i) {
      if (l.etat !== "creer" && l.etat !== "remplacer") return;
      suite = suite.then(function () {
        surLigne(i, "encours", "En cours…");
        var ecriture = l.etat === "remplacer"
          ? C.api.fiche(l.existante.id).then(function (actuelle) {
              if (!actuelle) throw new Error("La fiche existante a disparu.");
              return C.api.enregistrerFiche(actuelle.id, { titre: actuelle.titre, dossier_id: actuelle.dossier_id || "", contenu: l.contenu }, null)
                .then(function () { return { id: actuelle.id, urls: actuelle.ressources.map(function (r) { return r.url; }) }; });
            })
          : assurer(l.fiche.chemin).then(function (dossierId) {
              return C.api.creerFiche({ dossier_id: dossierId, titre: l.fiche.titre, contenu: l.contenu })
                .then(function (f) { return { id: f.id, urls: [] }; });
            });
        return ecriture.then(function (r) {
          var liens = l.fiche.ressources.filter(function (x) { return r.urls.indexOf(x.url) < 0; });
          return liens.reduce(function (p, x) {
            return p.then(function () { return C.api.ajouterLien(r.id, x); });
          }, Promise.resolve()).then(function () {
            if (l.etat === "remplacer") bilan.remplaces++; else bilan.crees++;
            surLigne(i, "ok", l.etat === "remplacer" ? "Remplacée" : "Créée" + (liens.length ? " + " + liens.length + " lien(s)" : ""));
          });
        }).catch(function (e) {
          bilan.erreurs++;
          surLigne(i, "erreur", e.message);
        });
      });
    });
    return suite.then(function () { return bilan; });
  }

  // ---------------------------------------------------------------
  // Fichiers en lot : correspondance et devinette
  // ---------------------------------------------------------------

  function base(nom) { return nom.split(/[\\\/]/).pop(); }

  // CSV « fichier;fiche;type;titre » (séparateur ; , ou tabulation, en-tête obligatoire).
  function lireCorrespondance(texte) {
    var lignes = normaliser(texte).split("\n").filter(function (l) { return l.trim(); });
    if (!lignes.length) return null;
    var sep = [";", "\t", ","].filter(function (s) { return lignes[0].indexOf(s) >= 0; })[0];
    if (!sep) return null;
    function cellules(l) { return l.split(sep).map(function (c) { return c.trim().replace(/^"|"$/g, ""); }); }
    var tete = cellules(lignes[0]).map(C.plier);
    var iF = tete.indexOf("fichier"), iC = tete.indexOf("fiche"), iT = tete.indexOf("type"), iTi = tete.indexOf("titre");
    if (iF < 0 || iC < 0) return null;
    var carte = {};
    lignes.slice(1).forEach(function (l) {
      var c = cellules(l);
      if (!c[iF]) return;
      carte[C.plier(base(c[iF]))] = { fiche: c[iC] || "", type: iT >= 0 ? c[iT] : "", titre: iTi >= 0 ? c[iTi] : "" };
    });
    return carte;
  }

  var VIDES = {};
  ("les des une pour sur avec dans par aux the and cours partie version pdf copie final finale ex exc td tp").split(" ").forEach(function (m) { VIDES[m] = true; });
  function mots(s) {
    return C.plier(s).split(/[^a-z0-9]+/).filter(function (w) { return w.length > 2 && !VIDES[w] && !/^\d+$/.test(w); });
  }
  function proches(a, b) {
    return a === b || (Math.min(a.length, b.length) >= 4 && (a.indexOf(b) === 0 || b.indexOf(a) === 0));
  }
  // La fiche dont le titre partage le plus de mots avec le nom du fichier.
  function deviner(nom, fiches) {
    var m = mots(sansExtension(base(nom)));
    if (!m.length) return null;
    var meilleure = null, score = 0;
    fiches.forEach(function (f) {
      var fm = f._mots || (f._mots = mots(f.titre));
      if (!fm.length) return;
      var communs = m.filter(function (w) { return fm.some(function (x) { return proches(w, x); }); }).length;
      var s = communs / Math.max(m.length, fm.length * 0.75);
      if (s > score || (s === score && meilleure && f.titre.length < meilleure.titre.length)) { score = s; meilleure = f; }
    });
    return score >= 0.34 ? meilleure : null;
  }

  // ---------------------------------------------------------------
  // La vue
  // ---------------------------------------------------------------

  function vue(el) {
    if (!C.peutEcrire()) { location.hash = "#/"; return; }
    document.title = "Importer · Codex";
    C.nav.activer(null);
    var nettoyages = [];

    var segF = h("button.segment", { type: "button", "aria-pressed": "true" }, icone("file-earmark-text"), "Des fiches (Markdown)");
    var segR = h("button.segment", { type: "button", "aria-pressed": "false" }, icone("files"), "Des fichiers en lot (PDF, TD…)");
    var pF = panneauFiches(nettoyages), pR = panneauFichiers(nettoyages);
    pR.hidden = true;
    function mode(fiches) {
      segF.setAttribute("aria-pressed", String(fiches));
      segR.setAttribute("aria-pressed", String(!fiches));
      pF.hidden = !fiches;
      pR.hidden = fiches;
    }
    segF.addEventListener("click", function () { mode(true); });
    segR.addEventListener("click", function () { mode(false); });

    el.appendChild(h("div.page-admin.page-import",
      h("header.page-entete",
        h("h1", "Importer"),
        h("p.page-intro", "Ajoute d'un coup des fiches écrites ailleurs (Obsidian, une IA, un dossier de notes) ou tous les fichiers d'un cours. Rien n'est enregistré avant que tu valides l'aperçu.")),
      h("div.segments", { role: "group", "aria-label": "Que veux-tu importer ?" }, segF, segR),
      pF, pR));

    // Quitter pendant un import le couperait au milieu.
    function avantDepart(e) {
      if (el.querySelector(".import-en-cours")) { e.preventDefault(); e.returnValue = ""; }
    }
    window.addEventListener("beforeunload", avantDepart);
    nettoyages.push(function () { window.removeEventListener("beforeunload", avantDepart); });
    return function () { nettoyages.forEach(function (f) { f(); }); };
  }

  // Espaces insécables : une <option> écrase les espaces ordinaires.
  var RETRAIT = String.fromCharCode(160, 160, 160);
  function selectDossiers(racineLibelle) {
    return h("select.champ.champ-select", { "aria-label": "Dossier de destination" },
      h("option", { value: "" }, racineLibelle),
      C.nav.optionsDossiers().map(function (o) {
        return h("option", { value: o.id, dataset: { chemin: o.chemin } }, RETRAIT.repeat(o.profondeur) + o.libelle);
      }));
  }

  function lireFichiers(liste) {
    var md = Array.prototype.filter.call(liste, function (f) { return /\.(md|markdown|txt)$/i.test(f.name); });
    var trop = md.filter(function (f) { return f.size > MAX_MD; });
    var bons = md.filter(function (f) { return f.size <= MAX_MD; });
    return Promise.all(bons.map(function (f) {
      var rel = (f.webkitRelativePath || "").split("/");
      return f.text().then(function (t) {
        return { nom: f.name, dossiers: rel.length > 1 ? rel.slice(0, -1) : [], texte: t };
      });
    })).then(function (lus) {
      return { lus: lus, ignores: liste.length - md.length, trop: trop.map(function (f) { return f.name; }) };
    });
  }

  // ---- Onglet 1 : fiches ----
  function panneauFiches(nettoyages) {
    var destination = selectDossiers("Racine (hors dossier)");
    var siExiste = h("select.champ.champ-select", { "aria-label": "Si une fiche du même titre existe déjà" },
      h("option", { value: "ignorer" }, "Si la fiche existe déjà : la garder telle quelle"),
      h("option", { value: "remplacer" }, "Si la fiche existe déjà : remplacer son contenu"));
    var navigation = h("input", { type: "checkbox", checked: true });
    var optNav = h("label.case", { hidden: true }, navigation, h("span", "Ajouter les liens précédent / plan / suivant (lots Codex)"));

    var entree = h("input.visuellement-cache", { type: "file", multiple: true, accept: ".md,.markdown,.txt", id: "import-md" });
    var entreeDossier = h("input.visuellement-cache", { type: "file", multiple: true, id: "import-dossier" });
    entreeDossier.setAttribute("webkitdirectory", "");
    var depot = h("label.depot", { for: "import-md" }, icone("file-earmark-arrow-up"),
      h("span.depot-titre", "Glisse des fichiers .md ici, ou clique pour les choisir"),
      h("span.depot-aide", "Une fiche par fichier, ou plusieurs par « lot Codex » · 2 Mo max par fichier"));
    var btnDossier = h("label.btn.btn-mini", { for: "import-dossier" }, icone("folder2-open"), "Choisir un dossier entier");

    var resume = h("div.import-resume", { "aria-live": "polite" });
    var table = h("div.import-table");
    var lancer = h("button.btn.btn-primaire", { type: "button", hidden: true }, icone("box-arrow-in-down"), h("span", "Importer"));
    var fin = h("div.import-fin");
    var analyse = null, plan = null, occupe = false;

    function recalculer() {
      C.vider(resume); C.vider(table); C.vider(fin);
      lancer.hidden = true;
      if (!analyse) return;
      var aLot = analyse.fiches.some(function (f) { return f.lot; });
      optNav.hidden = !aLot;
      if (aLot) ajouterNavigation(analyse.fiches);
      plan = planifier(analyse, destination.value || null, siExiste.value, aLot && navigation.checked);
      var n = { creer: 0, remplacer: 0, ignorer: 0, doublon: 0 };
      plan.lignes.forEach(function (l) { n[l.etat]++; });
      var aEcrire = n.creer + n.remplacer;

      resume.appendChild(h("p.import-chiffres",
        h("strong", plan.lignes.length + " fiche" + (plan.lignes.length > 1 ? "s" : "") + " trouvée" + (plan.lignes.length > 1 ? "s" : "")), " · ",
        n.creer + " à créer", " · ", n.remplacer + " à remplacer", " · ", n.ignorer + " déjà présente" + (n.ignorer > 1 ? "s" : "") + " (gardée" + (n.ignorer > 1 ? "s" : "") + ")",
        n.doublon ? " · " + n.doublon + " en double dans l'import (ignorée" + (n.doublon > 1 ? "s" : "") + ")" : "",
        " · ", plan.dossiersNeufs + " dossier" + (plan.dossiersNeufs > 1 ? "s" : "") + " à créer"));
      if (analyse.erreurs.length) {
        resume.appendChild(h("details.import-avert", h("summary", icone("exclamation-triangle"), " " + analyse.erreurs.length + " ligne(s) ignorée(s)"),
          h("ul", analyse.erreurs.slice(0, 50).map(function (e) { return h("li", e); }))));
      }
      var absents = Object.keys(plan.absents);
      if (absents.length) {
        resume.appendChild(h("details.import-avert", h("summary", icone("link-45deg"), " " + absents.length + " lien(s) [[…]] vers des fiches qui n'existent pas (encore)"),
          h("ul", C.collator ? absents.sort(C.collator.compare).slice(0, 80).map(function (t) { return h("li", "[[" + t + "]]"); }) : null)));
      }
      if (plan.lignes.length > MAX_FICHES) {
        resume.appendChild(h("p.admin-erreur", "Plus de " + MAX_FICHES + " fiches : découpe l'import en plusieurs fois."));
        return;
      }

      var ETATS = { creer: "À créer", remplacer: "À remplacer", ignorer: "Existe déjà : gardée", doublon: "En double : ignorée" };
      table.appendChild(h("table.table-membres.table-import",
        h("thead", h("tr", h("th", "Dossier"), h("th", "Fiche"), h("th", "État"))),
        h("tbody", plan.lignes.map(function (l, i) {
          // Une fiche existante reste où elle est : on montre son vrai emplacement.
          var chemin = l.existante
            ? ["Racine"].concat(C.nav.chemin(l.existante.dossier_id).map(function (d) { return d.titre; })).join(" › ")
            : [destination.value ? destination.options[destination.selectedIndex].dataset.chemin : "Racine"].concat(l.fiche.chemin).join(" › ");
          return h("tr", { dataset: { ligne: String(i) }, class: "import-" + l.etat },
            h("td.import-chemin", chemin),
            h("td", h("span.import-titre", l.fiche.titre),
              l.fiche.ressources.length ? h("span.admin-type", "+ " + l.fiche.ressources.length + " lien(s)") : null),
            h("td.import-etat", ETATS[l.etat]));
        }))));
      if (aEcrire) {
        lancer.lastChild.textContent = "Importer " + aEcrire + " fiche" + (aEcrire > 1 ? "s" : "");
        lancer.hidden = false;
      } else {
        resume.appendChild(h("p.carte-vide", "Rien à écrire : toutes ces fiches existent déjà."));
      }
    }

    function charger(liste) {
      if (occupe) return;
      lireFichiers(liste).then(function (r) {
        if (!r.lus.length) {
          analyse = null; recalculer();
          C.toast(r.trop.length ? "Fichiers trop lourds (2 Mo max) : " + r.trop.join(", ") : "Aucun fichier .md dans la sélection.", "erreur");
          return;
        }
        analyse = analyser(r.lus);
        if (r.trop.length) analyse.erreurs.unshift("Trop lourds (2 Mo max), ignorés : " + r.trop.join(", "));
        recalculer();
      }).catch(function (e) { C.toast(e.message, "erreur"); });
    }
    entree.addEventListener("change", function () { charger(entree.files); entree.value = ""; });
    entreeDossier.addEventListener("change", function () { charger(entreeDossier.files); entreeDossier.value = ""; });
    ["dragenter", "dragover"].forEach(function (t) { depot.addEventListener(t, function (e) { e.preventDefault(); depot.classList.add("survol"); }); });
    ["dragleave", "drop"].forEach(function (t) { depot.addEventListener(t, function () { depot.classList.remove("survol"); }); });
    depot.addEventListener("drop", function (e) { e.preventDefault(); charger(e.dataTransfer.files); });
    [destination, siExiste, navigation].forEach(function (x) { x.addEventListener("change", recalculer); });

    lancer.addEventListener("click", function () {
      if (!plan || occupe) return;
      occupe = true;
      lancer.disabled = true;
      var zone = lancer.closest(".carte");
      zone.classList.add("import-en-cours");
      [destination, siExiste, navigation, entree, entreeDossier].forEach(function (x) { x.disabled = true; });
      var dest = destination.value || null;
      executerFiches(plan, dest, function (i, etat, texte) {
        var tr = table.querySelector('tr[data-ligne="' + i + '"]');
        if (!tr) return;
        tr.className = "import-" + etat;
        tr.querySelector(".import-etat").textContent = texte;
        if (etat === "encours" && tr.scrollIntoViewIfNeeded) tr.scrollIntoViewIfNeeded(false);
      }).then(function (b) {
        return C.recharger().then(function () { return b; });
      }).then(function (b) {
        occupe = false;
        zone.classList.remove("import-en-cours");
        [destination, siExiste, navigation, entree, entreeDossier].forEach(function (x) { x.disabled = false; });
        lancer.hidden = true;
        lancer.disabled = false;
        C.vider(fin).appendChild(h("div.alerte" + (b.erreurs ? "" : ".alerte-ok"), icone(b.erreurs ? "exclamation-triangle" : "check-circle"),
          h("div", h("strong", b.crees + " fiche(s) créée(s), " + b.remplaces + " remplacée(s)" + (b.erreurs ? ", " + b.erreurs + " en erreur (voir le tableau)" : "") + "."),
            h("p", dest ? h("a", { href: "#/dossier/" + dest }, "Ouvrir le dossier de destination") : h("a", { href: "#/" }, "Retour à l'accueil")))));
        C.toast("Import terminé.", b.erreurs ? "info" : "ok");
      });
    });

    var aide = h("details.import-aide",
      h("summary", icone("question-circle"), " Formats acceptés"),
      h("div.prose",
        h("p", h("strong", "Un fichier .md = une fiche. "), "Le titre vient de la première ligne « # Titre », ou de l'en-tête « title: » des notes Obsidian (dont les « tags: » deviennent des #tags), sinon du nom du fichier."),
        h("p", h("strong", "Un dossier entier : "), "ses sous-dossiers deviennent des dossiers de Codex, sous la destination choisie."),
        h("p", h("strong", "Un lot Codex : "), "plusieurs fiches dans un seul fichier, le format des cours préparés pour Codex :"),
        h("pre", h("code", "@@ Matière / Sous-dossier\n+++ Titre de la première fiche\n+ video | Titre du lien | https://…\nContenu en Markdown…\n+++ Titre de la fiche suivante\n…")),
        h("p", "Le chemin après @@ part de la destination choisie. Les dossiers qui existent déjà sont réutilisés, les autres créés.")));

    nettoyages.push(function () { analyse = null; });
    return h("section.carte.import-panneau",
      h("div.import-options",
        h("label.champ-label", "Destination"), destination,
        siExiste, optNav),
      depot, entree, entreeDossier,
      h("div.import-boutons", btnDossier),
      aide, resume, table,
      h("div.import-actions", lancer), fin);
  }

  // ---- Onglet 2 : fichiers en lot ----
  function panneauFichiers(nettoyages) {
    var CLE_FORTE = "codex.compression-forte";
    var forteParDefaut = true;
    try { forteParDefaut = localStorage.getItem(CLE_FORTE) !== "non"; } catch (e) { /* stockage bloqué */ }
    var forte = h("input", { type: "checkbox", checked: forteParDefaut });
    forte.addEventListener("change", function () {
      try { localStorage.setItem(CLE_FORTE, forte.checked ? "oui" : "non"); } catch (e) { /* stockage bloqué */ }
    });
    var entree = h("input.visuellement-cache", { type: "file", multiple: true, id: "import-fichiers" });
    var depot = h("label.depot", { for: "import-fichiers" }, icone("cloud-arrow-up"),
      h("span.depot-titre", "Glisse tous les fichiers ici, ou clique pour les choisir"),
      h("span.depot-aide", "Ajoute un fichier de correspondance .csv pour tout ranger d'un coup · PDF compressés · 50 Mo max par fichier"));
    var resume = h("div.import-resume", { "aria-live": "polite" });
    var table = h("div.import-table");
    var lancer = h("button.btn.btn-primaire", { type: "button", hidden: true }, icone("cloud-arrow-up"), h("span", "Déposer"));
    var lignes = [], occupe = false;

    // Relu à chaque sélection : l'onglet Fiches a pu en créer entre-temps.
    function toutesLesFiches() {
      return C.trier(C.etat.fiches.filter(function (f) { return !f.accueil; }).map(function (f) {
        return { id: f.id, titre: f.titre, libelle: C.nav.chemin(f.dossier_id).map(function (d) { return d.titre; }).concat(f.titre).join(" › ") };
      }), "libelle");
    }

    function compter() {
      var n = lignes.filter(function (l) { return l.coche.checked && l.fiche.value && !l.fini; }).length;
      lancer.lastChild.textContent = "Déposer " + n + " fichier" + (n > 1 ? "s" : "");
      lancer.hidden = !n;
    }

    function charger(liste) {
      if (occupe) return;
      var tous = Array.prototype.slice.call(liste);
      var csv = tous.filter(function (f) { return /\.(csv|tsv)$/i.test(f.name); });
      Promise.all(csv.map(function (f) { return f.text().then(function (t) { return { f: f, carte: lireCorrespondance(t) }; }); })).then(function (lus) {
        var carte = {}, manifestes = [];
        lus.forEach(function (x) { if (x.carte) { Object.assign(carte, x.carte); manifestes.push(x.f); } });
        var fichiers = tous.filter(function (f) { return manifestes.indexOf(f) < 0 && f.size > 0; });
        var fiches = toutesLesFiches(), parTitre = {};
        fiches.forEach(function (f) { parTitre[C.plier(f.titre)] = f; });
        C.vider(resume); C.vider(table);
        lignes = [];
        if (!fichiers.length) { lancer.hidden = true; C.toast("Aucun fichier à déposer dans la sélection.", "erreur"); return; }

        var viaCarte = 0, devines = 0;
        var corps = h("tbody");
        fichiers.forEach(function (f) {
          var info = carte[C.plier(base(f.name))] || null;
          var cible = info && info.fiche ? parTitre[C.plier(info.fiche)] || null : null;
          if (cible) viaCarte++;
          else { cible = deviner(f.name, fiches); if (cible) devines++; }
          var type = info && TYPES_OK[info.type] ? info.type : C.devinerType(f.name, null);
          var titre = (info && info.titre) || titreDeNom(f.name).replace(/-+/g, " ").trim();

          var coche = h("input", { type: "checkbox", checked: true, "aria-label": "Déposer " + f.name });
          var selFiche = h("select.champ.champ-select.champ-compact", { "aria-label": "Fiche de " + f.name },
            h("option", { value: "" }, "— choisir une fiche —"),
            fiches.map(function (x) { return h("option", { value: x.id, selected: cible && cible.id === x.id }, x.libelle); }));
          var selType = h("select.champ.champ-select.champ-compact", { "aria-label": "Type de " + f.name },
            C.TYPES.map(function (t) { return h("option", { value: t.id, selected: t.id === type }, t.un); }));
          var champTitre = h("input.champ.champ-compact", { type: "text", value: titre, maxlength: 200, "aria-label": "Titre de " + f.name });
          var etat = h("span.import-etat", info && !cible ? "Fiche « " + info.fiche + " » introuvable" : cible ? (info ? "D'après la correspondance" : "Devinée") : "À choisir");
          var barre = h("div.envoi-barre", h("div.envoi-rempli"));
          var tr = h("tr", { class: cible ? "import-creer" : "import-ignorer" },
            h("td", coche),
            h("td", h("span.import-titre", f.name), h("span.admin-type", C.taille(f.size))),
            h("td", selFiche), h("td", selType), h("td", champTitre),
            h("td", etat, barre));
          [coche, selFiche].forEach(function (x) { x.addEventListener("change", function () { tr.className = selFiche.value ? "import-creer" : "import-ignorer"; compter(); }); });
          corps.appendChild(tr);
          lignes.push({ f: f, coche: coche, fiche: selFiche, type: selType, titre: champTitre, etat: etat, barre: barre, tr: tr });
        });
        resume.appendChild(h("p.import-chiffres",
          h("strong", fichiers.length + " fichier" + (fichiers.length > 1 ? "s" : "")), " · ",
          viaCarte + " rangé(s) par la correspondance", " · ", devines + " deviné(s) d'après le nom", " · ",
          (fichiers.length - viaCarte - devines) + " à ranger à la main",
          manifestes.length ? " · correspondance : " + manifestes.map(function (m) { return m.name; }).join(", ") : ""));
        resume.appendChild(h("p.section-aide", "Vérifie les fiches proposées avant de déposer : la devinette se fonde sur les mots communs entre le nom du fichier et le titre de la fiche."));
        table.appendChild(h("table.table-membres.table-import.table-fichiers",
          h("thead", h("tr", h("th", ""), h("th", "Fichier"), h("th", "Fiche"), h("th", "Type"), h("th", "Titre affiché"), h("th", "État"))),
          corps));
        compter();
      }).catch(function (e) { C.toast(e.message, "erreur"); });
    }

    entree.addEventListener("change", function () { charger(entree.files); entree.value = ""; });
    ["dragenter", "dragover"].forEach(function (t) { depot.addEventListener(t, function (e) { e.preventDefault(); depot.classList.add("survol"); }); });
    ["dragleave", "drop"].forEach(function (t) { depot.addEventListener(t, function () { depot.classList.remove("survol"); }); });
    depot.addEventListener("drop", function (e) { e.preventDefault(); charger(e.dataTransfer.files); });

    lancer.addEventListener("click", function () {
      if (occupe) return;
      var aFaire = lignes.filter(function (l) { return l.coche.checked && l.fiche.value && !l.fini; });
      if (!aFaire.length) return;
      occupe = true;
      lancer.disabled = true;
      var zone = lancer.closest(".carte");
      zone.classList.add("import-en-cours");
      var dejaLa = {};   // fiche → titres de ses fichiers déjà présents
      var utilise = 0;
      var suite = C.api.stockage().then(function (s) { utilise = s.octets; }).catch(function () { /* jauge indisponible */ });
      aFaire.forEach(function (l) {
        suite = suite.then(function () {
          var ficheId = l.fiche.value, titre = l.titre.value.trim() || titreDeNom(l.f.name);
          var rempli = l.barre.firstChild;
          l.tr.className = "import-encours";
          l.etat.textContent = "Vérification…";
          dejaLa[ficheId] = dejaLa[ficheId] || C.api.fiche(ficheId).then(function (f) {
            return (f ? f.ressources : []).filter(function (r) { return r.fichier; }).map(function (r) { return C.plier(r.titre); });
          });
          return dejaLa[ficheId].then(function (titres) {
            if (titres.indexOf(C.plier(titre)) >= 0) {
              l.fini = true;
              l.tr.className = "import-ignorer";
              l.etat.textContent = "Déjà présent dans la fiche : ignoré";
              return;
            }
            return C.compression.preparer(l.f, { forte: forte.checked, surEtape: function (t) { l.etat.textContent = t; } }).then(function (res) {
              var avert = C.compression.verifier(res.fichier, utilise);
              if (avert) C.toast(avert, "info");
              return C.api.ajouterFichier(ficheId, { type: l.type.value, titre: titre }, res.fichier, function (p) {
                rempli.style.width = Math.round(p * 100) + "%";
                l.etat.textContent = "Envoi " + Math.round(p * 100) + " %";
              }).then(function (r) {
                utilise += r.taille || 0;
                l.fini = true;
                titres.push(C.plier(titre));
                l.tr.className = "import-ok";
                rempli.style.width = "100%";
                l.etat.textContent = "Déposé" + (res.avant > res.apres ? " (" + C.taille(res.avant) + " → " + C.taille(res.apres) + ")" : "");
              });
            });
          }).catch(function (e) {
            l.tr.className = "import-erreur";
            l.etat.textContent = e.message;
          });
        });
      });
      suite.then(function () {
        occupe = false;
        lancer.disabled = false;
        zone.classList.remove("import-en-cours");
        compter();
        var ok = lignes.filter(function (l) { return l.tr.className === "import-ok"; }).length;
        C.toast(ok + " fichier(s) déposé(s).", "ok");
      });
    });

    var modele = "fichier;fiche;type;titre\nPoly chapitre 1.pdf;Titre exact de la fiche;poly;Polycopié du chapitre 1\nTD1.pdf;Titre exact de la fiche;td;TD 1 et corrigé";
    var aide = h("details.import-aide",
      h("summary", icone("question-circle"), " Le fichier de correspondance"),
      h("div.prose",
        h("p", "Facultatif. Un fichier .csv, choisi avec les autres, qui dit où va chaque fichier. Une ligne d'en-tête, puis une ligne par fichier ; séparateur « ; », « , » ou tabulation. Les colonnes type et titre sont facultatives."),
        h("pre", h("code", modele)),
        h("p", "Types : " + C.TYPES.map(function (t) { return t.id; }).join(", ") + ". La fiche est reconnue par son titre, sans tenir compte des accents ni des majuscules.")));

    nettoyages.push(function () { lignes = []; });
    return h("section.carte.import-panneau",
      depot, entree,
      h("div.ajout-options",
        h("label.case", forte, h("span", "Compression forte des PDF"))),
      aide, resume, table,
      h("div.import-actions", lancer));
  }

  C.vues = C.vues || {};
  C.vues.importer = vue;
  // Exposé pour les tests : l'analyse est pure (texte → fiches).
  C.importer = { analyser: analyser, lireCorrespondance: lireCorrespondance, deviner: deviner };
})(window.Codex);

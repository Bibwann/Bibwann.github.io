/* ============================================================
   CODEX — préparation des fichiers avant envoi
   Compresse les PDF dans un worker (pdf-worker.js), puis vérifie les
   deux plafonds de l'offre gratuite : 50 Mo par fichier, 1 Go en tout.
   Les autres fichiers passent tels quels.
   ============================================================ */
(function (C) {
  "use strict";

  // Au-delà, le navigateur risque de manquer de mémoire : Ghostscript
  // tient l'entrée, la sortie et ses tampons en même temps.
  var MAX_ENTREE = 250 * 1024 * 1024;
  // Le worker garde Ghostscript chargé (~15 Mo) entre deux fichiers ;
  // on le libère après une minute sans travail.
  var INACTIVITE = 60 * 1000;

  // Chemin du worker résolu depuis CE script : la page peut vivre à
  // un autre niveau (le banc d'essai est dans tools/).
  var urlWorker = new URL("pdf-worker.js?v=58cc6cf848", document.currentScript.src).href;
  var worker = null, minuterie = null, compteur = 0, attentes = {};

  function obtenirWorker() {
    clearTimeout(minuterie);
    if (worker) return worker;
    worker = new Worker(urlWorker, { type: "module" });
    worker.onmessage = function (e) {
      var m = e.data, a = attentes[m.id];
      if (!a) return;
      if (m.etape) { a.surEtape(m.etape); return; }
      delete attentes[m.id];
      a.ok(m);
      planifierArret();
    };
    worker.onerror = function (e) {
      Object.keys(attentes).forEach(function (id) {
        attentes[id].ko(new Error("Le compresseur a planté : " + (e.message || "erreur inconnue")));
        delete attentes[id];
      });
      worker.terminate();
      worker = null;
    };
    return worker;
  }

  function planifierArret() {
    clearTimeout(minuterie);
    minuterie = setTimeout(function () {
      if (worker && !Object.keys(attentes).length) { worker.terminate(); worker = null; }
    }, INACTIVITE);
  }

  function estPdf(f) {
    return f.type === "application/pdf" || /\.pdf$/i.test(f.name);
  }

  // → Promise<{ fichier, avant, apres }>
  function preparer(fichier, options) {
    options = options || {};
    var surEtape = options.surEtape || function () {};

    if (fichier.size > MAX_ENTREE) {
      return Promise.reject(new Error("« " + fichier.name + " » fait " + C.taille(fichier.size) +
        " : trop lourd pour être traité dans le navigateur. Mets-le sur un Drive et ajoute le lien."));
    }
    if (!estPdf(fichier)) {
      return Promise.resolve({ fichier: fichier, avant: fichier.size, apres: fichier.size });
    }

    return fichier.arrayBuffer().then(function (octets) {
      return new Promise(function (ok, ko) {
        var id = ++compteur;
        attentes[id] = { ok: ok, ko: ko, surEtape: surEtape };
        obtenirWorker().postMessage({ id: id, octets: octets, forte: options.forte !== false }, [octets]);
      });
    }).then(function (m) {
      var sortie = new File([m.octets], fichier.name, { type: "application/pdf", lastModified: Date.now() });
      return { fichier: sortie, avant: m.avant, apres: m.apres, journal: m.journal };
    });
  }

  // Vérifie qu'un fichier (déjà compressé) peut partir. Lève une Error
  // en français sinon ; renvoie un avertissement éventuel sinon.
  function verifier(fichier, utilise) {
    if (fichier.size > C.api.MAX_FICHIER) {
      throw new Error("« " + fichier.name + " » fait encore " + C.taille(fichier.size) +
        " après compression : la limite est de 50 Mo par fichier. Mets-le sur un Drive et ajoute le lien.");
    }
    var apres = utilise + fichier.size;
    if (apres > C.api.QUOTA) {
      throw new Error("Stockage plein : " + C.taille(utilise) + " utilisés sur 1 Go. " +
        "Supprime d'anciens fichiers ou utilise des liens Drive.");
    }
    if (apres > C.api.QUOTA * 0.8) {
      return "Attention : le stockage sera rempli à " + Math.round(apres / C.api.QUOTA * 100) + " %.";
    }
    return null;
  }

  C.compression = { preparer: preparer, verifier: verifier, estPdf: estPdf, MAX_ENTREE: MAX_ENTREE };
})(window.Codex);

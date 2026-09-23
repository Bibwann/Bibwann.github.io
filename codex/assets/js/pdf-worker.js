/* ============================================================
   CODEX — compression des PDF, dans un Web Worker (module)

   Deux étages, mesurés sur un rapport de 10 pages (611 Ko) :
     1. pdf-lib      : métadonnées effacées, objets regroupés en flux
                       compressés.            611 Ko → 609 Ko  (−0,4 %)
     2. Ghostscript  : ré-écriture complète en /ebook, images ramenées
                       à 150 dpi.             609 Ko → 156 Ko  (−75 %)
   Le vrai gain vient du second étage ; le premier sert surtout à ne
   pas publier le nom de l'auteur ou le logiciel qui a produit le fichier.

   Dans un worker parce que Ghostscript bloque son fil pendant tout le
   calcul : sur la page, l'interface gèlerait plusieurs secondes.

   Les bibliothèques sont téléchargées avec `fetch(…, { integrity })` :
   un import() de module ne peut pas porter d'empreinte SRI, alors on
   vérifie le fichier nous-mêmes avant de l'exécuter depuis un blob.
   ============================================================ */

const CDN = "https://cdn.jsdelivr.net/npm/";
const LIBS = {
  pdflib: {
    url: CDN + "pdf-lib@1.17.1/dist/pdf-lib.esm.min.js",
    integrity: "sha384-zLjz0wyamZ9fUxTFyrzCYwGprnweF4gGevYdGIw/bptum5NQvuZPNHFx/ItkRseg"
  },
  gs: {
    url: CDN + "@okathira/ghostpdl-wasm@1.1.0/dist/gs.js",
    integrity: "sha384-E+KJmmy13W59F8aes62qrMVHH3b/weTQh9ertUvUWv+1Lm3L5uZcCtopUCVnIrN7"
  },
  // ~15 Mo, mis en cache par le navigateur après le premier usage.
  wasm: {
    url: CDN + "@okathira/ghostpdl-wasm@1.1.0/dist/gs.wasm",
    integrity: "sha384-8hixs5koiMXPLy/RVeIgc3JdojHeuKk5Bj89AToreGdCzSGeblhanRGUjhbOuJ6m"
  }
};

async function telecharger(lib) {
  const r = await fetch(lib.url, { integrity: lib.integrity, mode: "cors", credentials: "omit" });
  if (!r.ok) throw new Error("Téléchargement impossible (" + r.status + ")");
  return r;
}

async function importerModule(lib) {
  // Exécuté depuis un blob, le module verrait `import.meta.url` = « blob:… »,
  // qui ne peut pas servir de base à new URL() : gs.js s'en sert pour situer
  // son .wasm et plantait (« Invalid URL »). On lui rend son adresse réelle —
  // sur un texte dont l'empreinte vient d'être vérifiée.
  const texte = (await (await telecharger(lib)).text()).split("import.meta.url").join(JSON.stringify(lib.url));
  const url = URL.createObjectURL(new Blob([texte], { type: "text/javascript" }));
  try { return await import(url); } finally { URL.revokeObjectURL(url); }
}

let pdflib = null, gsUsine = null, gsBinaire = null;

async function etagePdfLib(octets) {
  if (!pdflib) pdflib = await importerModule(LIBS.pdflib);
  const doc = await pdflib.PDFDocument.load(octets, { updateMetadata: false });
  doc.setTitle(""); doc.setAuthor(""); doc.setSubject(""); doc.setKeywords([]);
  doc.setCreator(""); doc.setProducer("");
  // Le bloc XMP double les métadonnées du dictionnaire Info.
  doc.catalog.delete(pdflib.PDFName.of("Metadata"));
  return doc.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false });
}

async function etageGhostscript(octets) {
  if (!gsUsine) gsUsine = (await importerModule(LIBS.gs)).default;
  if (!gsBinaire) gsBinaire = await (await telecharger(LIBS.wasm)).arrayBuffer();
  // Une instance neuve par fichier : le programme principal d'Emscripten
  // n'est pas prévu pour être relancé, et la mémoire est rendue d'un coup.
  const gs = await gsUsine({ wasmBinary: gsBinaire, print() {}, printErr() {} });
  gs.FS.writeFile("entree.pdf", octets);
  const code = gs.callMain([
    "-sDEVICE=pdfwrite", "-dCompatibilityLevel=1.5", "-dPDFSETTINGS=/ebook",
    "-dDetectDuplicateImages=true", "-dCompressFonts=true",
    "-dSAFER", "-dNOPAUSE", "-dQUIET", "-dBATCH",
    "-sOutputFile=sortie.pdf", "entree.pdf"
  ]);
  if (code !== 0) throw new Error("Ghostscript a échoué (code " + code + ")");
  return gs.FS.readFile("sortie.pdf");
}

// En dessous, le gain possible ne vaut pas une ré-écriture. Le seuil
// reste bas : le rapport de test (611 Ko) perdait 75 % de son poids.
const SEUIL_FORTE = 256 * 1024;
// Un gain de moins de 5 % ne vaut pas une ré-écriture complète du fichier.
const GAIN_MIN = 0.95;

self.onmessage = async (e) => {
  const { id, octets, forte } = e.data;
  const etape = (texte) => self.postMessage({ id, etape: texte });
  let meilleur = new Uint8Array(octets);
  const avant = meilleur.length;
  const journal = [];

  try {
    etape("Nettoyage du PDF…");
    const a = await etagePdfLib(meilleur);
    journal.push("pdf-lib " + a.length);
    if (a.length < meilleur.length) meilleur = a;
  } catch (err) {
    // PDF chiffré ou mal formé : on garde l'original, sans bloquer l'envoi.
    journal.push("pdf-lib ignoré : " + err.message);
  }

  if (forte && meilleur.length > SEUIL_FORTE) {
    try {
      etape(gsBinaire ? "Compression des images…" : "Chargement du compresseur (15 Mo, une seule fois)…");
      const b = await etageGhostscript(meilleur);
      journal.push("ghostscript " + b.length);
      if (b.length < meilleur.length * GAIN_MIN) meilleur = b;
    } catch (err) {
      journal.push("ghostscript ignoré : " + err.message);
    }
  }

  const sortie = meilleur.buffer.slice(meilleur.byteOffset, meilleur.byteOffset + meilleur.byteLength);
  self.postMessage({ id, fini: true, avant, apres: sortie.byteLength, journal, octets: sortie }, [sortie]);
};

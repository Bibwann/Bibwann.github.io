/* ============================================================
   Test de bout en bout de Codex, dans un vrai Chrome (headless),
   sur le banc d'essai (tools/banc.html + faux Supabase en mémoire).

     cd codex/tests && npm install && npm run e2e

   Couvre : connexion par mot de passe, note d'accueil, rendu des fiches
   (KaTeX, callouts Obsidian repliables, [[liens]], #tags, code numéroté),
   XSS, recherche en fenêtre avec aperçu, pages de dossier et de tag,
   éditeur (autocomplétion, garde, conflit, historique), compression d'un
   vrai PDF + envoi, refus au-delà de 50 Mo, graphe, création de comptes,
   mobile, rôles, mode lecture, thème.

   Chrome : chemin Windows par défaut, sinon variable CHROME.
   Captures : tests/captures/ (ignoré par git).
   Profil jetable par lancement : sans ça, le cache HTTP d'une exécution
   précédente sert d'anciens CSS/JS (piège déjà payé sur le portfolio).
   ============================================================ */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const DEPOT = path.resolve(ICI, '../..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
// PDF réel du dépôt (10 pages, 611 Ko) : sert à mesurer la compression.
const PDF_TEST = path.join(DEPOT, 'portfolio/assets/files/trieuse/Rapport_R512_Trieuse_à_boules.pdf');
const OUT = path.join(ICI, 'captures');
fs.mkdirSync(OUT, { recursive: true });
const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-e2e-'));

// Petit serveur statique sur la racine du dépôt (URL identique à la prod : /codex/…).
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.pdf': 'application/pdf' };
const serveur = http.createServer((req, res) => {
  const p = path.join(DEPOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(DEPOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${serveur.address().port}/codex/`;

const nav = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: profil, args: ['--no-sandbox'] });
let echecs = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  ÉCHEC ') + m); if (!c) echecs++; };
const erreurs = [];

async function page(url, vp = { width: 1440, height: 900 }) {
  const p = await nav.newPage();
  await p.setViewport(vp);
  await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') erreurs.push(`[${m.type()}] ${m.text()}`); });
  p.on('pageerror', e => erreurs.push('[pageerror] ' + e.message));
  await p.goto(url, { waitUntil: 'networkidle0' });
  return p;
}
const pause = ms => new Promise(r => setTimeout(r, ms));
const cap = (p, nom) => p.screenshot({ path: path.join(OUT, nom + '.png') });
const aller = (p, h) => p.evaluate(x => { location.hash = x; }, h);

try {
  // 1. Vraie page (vrai supabase-js, CSP) : écran de connexion
  let p = await page(BASE + 'index.html');
  await p.waitForSelector('.ecran-carte');
  ok(!!(await p.$('#identifiant')) && !!(await p.$('#mot-de-passe')), 'index.html réel : scripts CDN + SRI + CSP OK, connexion par identifiant et mot de passe');
  await cap(p, '00-connexion');
  await p.close();

  // 2. Accueil : la note d'accueil, façon Quartz
  p = await page(BASE + 'tools/banc.html?role=admin');
  await p.waitForSelector('.lecture.accueil #prose');
  await pause(900);
  const A = await p.evaluate(() => ({
    titre: document.querySelector('.fiche-titre')?.textContent,
    callout: !!document.querySelector('#prose .encadre-astuce'),
    replie: !!document.querySelector('#prose details.encadre:not([open])'),
    tag: !!document.querySelector('#prose a.etiquette[href="#/tag/accueil"]'),
    recents: document.querySelectorAll('.index-accueil .page-item').length,
    dossiers: document.querySelectorAll('.matiere-carte').length,
    graphe: !!document.querySelector('.panneau .graphe-local canvas'),
    explorateurSansAccueil: ![...document.querySelectorAll('.arbre-fiche')].some(a => a.textContent.includes('Bienvenue')),
  }));
  console.log('   ', JSON.stringify(A));
  ok(A.titre === 'Bienvenue sur Codex', "accueil : c'est la note d'accueil qui s'affiche");
  ok(A.callout && A.replie, 'callouts Obsidian « > [!tip] » et repliable « > [!info]- »');
  ok(A.tag, '#tag rendu en lien vers sa page');
  ok(A.recents >= 5 && A.dossiers === 3, 'index sous la note : une carte par matière et fiches récentes');
  ok(A.graphe, 'graphe dans la colonne de droite');
  ok(A.explorateurSansAccueil, "la note d'accueil n'encombre pas l'explorateur");
  await p.click('#prose details.encadre summary');
  ok(await p.$eval('#prose details.encadre', d => d.open), 'callout replié : s\'ouvre au clic');
  await cap(p, '01-accueil');

  // 3. Lecture d'une fiche
  const idRed = await p.evaluate(() => [...document.querySelectorAll('.arbre-fiche')].find(x => x.textContent.includes('Réduction')).dataset.fiche);
  await aller(p, '#/fiche/' + idRed);
  await p.waitForSelector('.lecture:not(.accueil) .prose h2');
  await pause(1200);
  const L = await p.evaluate(() => ({
    katex: document.querySelectorAll('#prose .katex').length,
    encadres: [...document.querySelectorAll('#prose .encadre')].map(e => e.className.split(' ')[1]),
    liens: document.querySelectorAll('#prose a.lien-fiche').length,
    manquants: document.querySelectorAll('#prose .lien-fiche.manquant').length,
    code: document.querySelectorAll('#prose .bloc-code .hljs-keyword').length,
    numeros: (document.querySelector('#prose .bloc-code-numeros')?.textContent || '').trim().split('\n').length,
    ancres: document.querySelectorAll('#prose .ancre-titre').length,
    dollars: document.querySelector('#prose').textContent.includes('5 $ et 10 $'),
    h1double: document.querySelectorAll('#prose h1').length,
    groupes: document.querySelectorAll('.groupe-ressources').length,
    sommaire: document.querySelectorAll('.sommaire a').length,
    dansVue: document.querySelectorAll('.sommaire a.dans-vue').length,
    fil: [...document.querySelectorAll('.fil a')].map(a => a.textContent).join(' > '),
    citePar: !!document.querySelector('#titre-cite'),
    externes: [...document.querySelectorAll('#prose a[href^="http"]')].every(a => a.target === '_blank' && a.rel.includes('noopener') && a.classList.contains('externe')),
  }));
  console.log('   ', JSON.stringify(L));
  ok(L.katex >= 10, `formules KaTeX (${L.katex})`);
  ok(['encadre-definition', 'encadre-theoreme', 'encadre-propriete', 'encadre-methode', 'encadre-attention'].every(c => L.encadres.includes(c)), 'encadrés « ::: » de cours');
  ok(L.liens === 2 && L.manquants === 1, `liens [[…]] : 2 résolus, 1 manquant (${L.liens}/${L.manquants})`);
  ok(L.code > 0 && L.numeros === 4, `code coloré, lignes numérotées (${L.numeros})`);
  ok(L.ancres >= 5, 'ancres de section sur les titres');
  ok(L.dollars && L.h1double === 0, '« 5 $ » reste du texte ; « # Titre » en double retiré');
  ok(L.groupes === 5, 'ressources rangées par type');
  ok(L.sommaire >= 5 && L.dansVue >= 1 && L.dansVue < L.sommaire, `sommaire : titres à l'écran nets, les autres estompés (${L.dansVue}/${L.sommaire})`);
  ok(L.fil === 'Accueil > Semestre 1 > Mathématiques', "fil d'Ariane cliquable (" + L.fil + ')');
  ok(L.citePar, '« Cité par »');
  await cap(p, '02-lecture');

  // Aperçu au survol
  await p.hover('#prose a.lien-fiche');
  await p.waitForSelector('.apercu', { timeout: 3000 }).catch(() => {});
  ok(!!(await p.$('.apercu')), "aperçu au survol d'un lien [[fiche]]");
  // Changer de page ferme l'aperçu, et les écouteurs de la page quittée ne
  // survivent pas : revenu sur la fiche, un survol n'ouvre qu'une bulle.
  const ficheAvecLien = await p.evaluate(() => location.hash);
  await aller(p, '#/');
  await pause(500);
  const apresNav = await p.$$eval('.apercu', b => b.length);
  await aller(p, ficheAvecLien);
  await p.waitForSelector('#prose a.lien-fiche');
  await p.mouse.move(5, 5);
  await p.hover('#prose a.lien-fiche');
  await pause(900);
  const bulles = await p.$$eval('.apercu', b => b.length);
  await aller(p, '#/documents');
  await pause(500);
  const apresNav2 = await p.$$eval('.apercu', b => b.length);
  ok(apresNav === 0 && bulles === 1 && apresNav2 === 0,
    `aperçu fermé au changement de page, sans bulle fantôme (${apresNav} / ${bulles} / ${apresNav2})`);
  await aller(p, ficheAvecLien);
  await p.waitForSelector('#prose a.lien-fiche');
  await p.mouse.move(5, 5);

  // XSS et durcissements du rendu
  const xss = await p.evaluate(() => {
    const d = document.createElement('div');
    Codex.rendu.rendre(d, [
      '<img src="data:," onerror="window.__x=1"> <script>window.__x=2</script> [a](javascript:alert(1))',
      '<iframe src="https://x"></iframe> $\\href{javascript:alert(1)}{x}$',
      '<div style="position:fixed;inset:0" id="nav" name="vue">faux écran</div> <input type="text" value="x">',
      '$x^2$'
    ].join('\n\n'));
    const attrs = [...d.querySelectorAll('*')].flatMap(e => [...e.attributes].map(a => a.name + '=' + a.value));
    return {
      x: window.__x ?? null, scripts: d.querySelectorAll('script, iframe').length,
      evenements: attrs.filter(a => /^on/i.test(a)).length, jsUrl: attrs.filter(a => /javascript:/i.test(a)).length,
      styleHorsKatex: [...d.querySelectorAll('[style]')].filter(e => !e.closest('.katex')).length,
      styleKatex: d.querySelectorAll('.katex [style]').length,
      idOuName: d.querySelectorAll('[id], [name]').length,
      champTexte: d.querySelectorAll('input').length,
    };
  });
  ok(xss.scripts === 0 && xss.evenements === 0 && xss.jsUrl === 0 && xss.x === null, 'XSS : ni script, ni on*, ni javascript:');
  ok(xss.styleHorsKatex === 0 && xss.styleKatex > 0, 'style retiré partout sauf dans les formules (pas de faux écran superposé)');
  ok(xss.idOuName === 0 && xss.champTexte === 0, 'id/name retirés (DOM clobbering), champs de saisie retirés');

  // 4. Recherche en fenêtre
  await p.click('.recherche-bouton');
  await p.waitForSelector('dialog.recherche-modale[open] .recherche-champ');
  await p.type('.recherche-modale .recherche-champ', 'diagonalis');
  await p.waitForSelector('.recherche-modale .resultat', { timeout: 3000 }).catch(() => {});
  await pause(500);
  ok((await p.$$('.recherche-modale .resultat')).length >= 1, 'recherche : résultats');
  ok(!!(await p.$('.recherche-apercu mark')), "recherche : aperçu du résultat, terme surligné");
  await cap(p, '03-recherche');
  await p.keyboard.press('Escape');
  await pause(200);
  ok(!(await p.$('dialog.recherche-modale')), 'Échap ferme la recherche');
  await p.keyboard.press('/');
  ok(!!(await p.waitForSelector('dialog.recherche-modale[open]', { timeout: 1500 }).catch(() => null)), '« / » ouvre la recherche');
  await p.keyboard.press('Escape');

  // 5. Pages de dossier et de tag
  const idMaths = await p.evaluate(() => [...document.querySelectorAll('.arbre-dossier')].find(a => a.querySelector('.arbre-titre').textContent === 'Mathématiques').dataset.dossier);
  await aller(p, '#/dossier/' + idMaths);
  await p.waitForSelector('.page-simple .fiche-titre');
  await pause(300);
  ok((await p.$eval('.fiche-titre', e => e.textContent)) === 'Mathématiques' && (await p.$$('.page-item')).length === 3, 'page de dossier : ses 3 fiches');
  await cap(p, '04-dossier');
  await aller(p, '#/tag/accueil');
  await p.waitForSelector('.page-simple .page-item', { timeout: 3000 }).catch(() => {});
  ok((await p.$$('.page-item')).length === 1, 'page de tag : la fiche qui porte #accueil');
  await aller(p, '#/tag');
  await p.waitForSelector('.nuage-tags');
  ok((await p.$$('.nuage-tags li')).length >= 1, 'page de tous les tags');

  // 5 bis. Pages transversales : Documents, Exercices ; explorateur rangé
  await aller(p, '#/');
  await p.waitForSelector('.index-accueil');
  await pause(300);
  ok(await p.evaluate(id => { const a = document.querySelector('.reprendre'); return !!a && a.getAttribute('href') === '#/fiche/' + id; }, idRed),
    'accueil : « Reprendre ma lecture » mène à la dernière fiche ouverte');
  await aller(p, '#/documents');
  await p.waitForSelector('.documents-fiche');
  await pause(300);
  const D = await p.evaluate(() => ({
    filtres: document.querySelectorAll('.filtre-type').length,
    sections: document.querySelectorAll('.page-section').length,
    ressources: document.querySelectorAll('.documents-fiche .ressource').length,
    pastille: !!document.querySelector('.page-matiere .pastille-matiere'),
  }));
  console.log('   ', JSON.stringify(D));
  ok(D.filtres >= 3 && D.ressources === 5 && D.pastille, 'Documents : les 5 supports, rangés par matière, filtres par type');
  const DL = await p.evaluate(() => [...document.querySelectorAll('.documents-fiche .ressource-dl')].map(a => ({ nom: a.getAttribute('download'), href: a.getAttribute('href') })));
  console.log('   ', JSON.stringify(DL));
  ok(DL.length === 1 && DL[0].nom === 'Polycopié du chapitre 4.pdf' && DL[0].href && DL[0].href !== '#',
    'Documents : bouton « Télécharger » sur le fichier, enregistré sous le titre du document (pas le nom de stockage)');
  await p.evaluate(() => [...document.querySelectorAll('.filtre-type')].find(b => b.dataset.type === 'video').click());
  await pause(150);
  ok(await p.evaluate(() => [...document.querySelectorAll('.documents-fiche .ressource')].filter(a => !a.hidden).length === 1
    && document.querySelector('.filtre-type[data-type="video"]').getAttribute('aria-pressed') === 'true'), 'Documents : filtre « Vidéos »');
  await p.evaluate(() => [...document.querySelectorAll('.filtre-type')].find(b => b.dataset.type === 'tous').click());
  await p.type('.champ-filtre', 'zzz-introuvable');
  await pause(150);
  ok(await p.$eval('.prose-vide', e => !e.hidden), 'Documents : filtre sans résultat annoncé');
  await cap(p, '04b-documents');

  await aller(p, '#/exercices');
  await p.waitForSelector('.liste-exercices li');
  await pause(300);
  const X = await p.evaluate(() => ({
    fiches: [...document.querySelectorAll('.liste-exercices .exercice-titre')].map(a => a.textContent),
    global: document.querySelector('.progres-global strong')?.textContent,
  }));
  console.log('   ', JSON.stringify(X));
  ok(X.fiches.includes('Structures de données') && /^0 \/ \d+ exercices faits$/.test(X.global || ''), 'Exercices : fiches à exercices et progression globale');
  await p.click('.page-entete label.case input');
  await pause(150);
  ok((await p.$$('.liste-exercices li:not([hidden])')).length === X.fiches.length, 'Exercices : « ce qu\'il me reste » garde tout quand rien n\'est fait');
  await cap(p, '04c-exercices');

  const E = await p.evaluate(() => {
    const pied = document.querySelector('.nav-pied').getBoundingClientRect();
    const arbre = document.querySelector('.nav-arbre').getBoundingClientRect();
    return {
      pastilles: document.querySelectorAll('.arbre-pastille').length,
      pied: [...document.querySelectorAll('.nav-pied .nav-lien')].map(a => a.getAttribute('href')),
      chevauche: arbre.bottom > pied.top + 1,
    };
  });
  console.log('   ', JSON.stringify(E));
  ok(E.pastilles === 3, 'explorateur : une pastille de couleur par matière');
  ok(E.pied.includes('#/documents') && E.pied.includes('#/exercices') && E.pied.includes('#/importer'), 'barre latérale : liens Documents, Exercices, Importer');
  ok(!E.chevauche, "l'explorateur ne déborde pas sur les liens du bas");

  // 6. Éditeur
  await aller(p, '#/editer/' + idRed);
  await p.waitForSelector('.editeur-source');
  await pause(500);
  ok((await p.$$('.edition-ressource')).length === 5, 'éditeur : 5 ressources listées');
  ok(await p.$eval('.editeur-barre select', s => [...s.options].some(o => o.value === '' && /Racine/.test(o.textContent))), 'éditeur : une fiche peut aller à la racine');
  await p.focus('.editeur-source');
  await p.evaluate(() => { const t = document.querySelector('.editeur-source'); t.setSelectionRange(t.value.length, t.value.length); });
  await p.keyboard.type('\n\nVoir [[pol');
  await pause(300);
  ok(!(await p.$eval('.autocomplete', e => e.hidden)), 'autocomplétion [[ ouverte');
  await p.keyboard.press('Enter');
  ok(await p.$eval('.editeur-source', t => t.value.endsWith('[[Polynômes annulateurs]]')), 'autocomplétion : titre complété et crochets fermés');
  await pause(400);
  ok((await p.$eval('.etat-sauvegarde', e => e.textContent)).includes('non enregistrées'), 'indicateur « non enregistrées »');
  await cap(p, '05-editeur');

  await aller(p, '#/');
  await p.waitForSelector('dialog.dialogue[open]');
  ok((await p.$eval('dialog .dialogue-titre', e => e.textContent)).includes('Quitter sans enregistrer'), 'garde : quitter sans enregistrer demande confirmation');
  await p.click('dialog .dialogue-actions .btn:not(.btn-danger)');
  await pause(200);
  ok((await p.evaluate(() => location.hash)).startsWith('#/editer/'), "garde : « Rester » garde l'éditeur");

  await p.evaluate(id => { const f = CODEX_BANC.db.fiches.find(x => x.id === id); f.maj_le = new Date(Date.now() + 5000).toISOString(); }, idRed);
  await p.keyboard.down('Control'); await p.keyboard.press('s'); await p.keyboard.up('Control');
  await p.waitForSelector('dialog.dialogue[open]', { timeout: 3000 });
  ok((await p.$eval('dialog .dialogue-titre', e => e.textContent)).includes('Conflit'), 'conflit détecté (verrou optimiste)');
  await p.click('dialog .btn-danger');
  await pause(900);
  ok(await p.evaluate(id => CODEX_BANC.db.fiches.find(x => x.id === id).contenu.endsWith('[[Polynômes annulateurs]]'), idRed), "écraser : la version de l'éditeur est enregistrée");

  await p.click('.editeur-barre-droite .btn[title="Versions précédentes"]');
  await p.waitForSelector('.historique-item');
  ok((await p.$$('.historique-item')).length >= 2, 'historique : versions listées');
  await p.keyboard.press('Escape');
  await pause(200);

  const [entree] = await p.$$('#entree-fichiers');
  await entree.uploadFile(PDF_TEST);
  await p.waitForSelector('.envoi.ok, .envoi.erreur', { timeout: 120000 });
  const envoi = await p.$eval('.envoi', e => ({ classe: e.className, texte: e.querySelector('.envoi-etape').textContent }));
  console.log('    envoi :', envoi.texte);
  ok(envoi.classe.includes('ok') && /→/.test(envoi.texte), 'PDF compressé puis envoyé, gain affiché');
  const stocke = await p.evaluate(() => { const k = Object.keys(CODEX_BANC.fichiers).find(k => k.includes('Rapport')); return k ? CODEX_BANC.fichiers[k].size : 0; });
  ok(stocke > 0 && stocke < 611722 * 0.5, `fichier stocké compressé (${stocke} o au lieu de 611722)`);
  const gros = path.join(os.tmpdir(), 'codex-e2e-gros.bin');
  if (!fs.existsSync(gros)) fs.writeFileSync(gros, Buffer.alloc(51 * 1024 * 1024));
  await entree.uploadFile(gros);
  await p.waitForFunction(() => document.querySelectorAll('.envoi.erreur').length > 0, { timeout: 20000 }).catch(() => {});
  ok(/50 Mo/.test(await p.$eval('.envoi.erreur .envoi-etape', e => e.textContent).catch(() => '')), 'fichier de 51 Mo refusé avant envoi');

  // 7. Graphe complet
  await aller(p, '#/graphe');
  await p.waitForSelector('.graphe-plein canvas');
  await pause(1200);
  ok((await p.$$('.legende .puce')).length === 3, 'graphe complet : légende, une couleur par matière');
  await cap(p, '06-graphe');

  // 7 bis. Révision, diagrammes, titres d'encadrés en Markdown
  const idSd = await p.evaluate(() => [...document.querySelectorAll('.arbre-fiche')].find(x => x.textContent.includes('Structures')).dataset.fiche);
  await aller(p, '#/fiche/' + idSd);
  await p.waitForSelector('.lecture .prose h2');
  await p.waitForSelector('#prose figure.diagramme[data-etat="ok"] img', { timeout: 60000 }).catch(() => {});
  const R = await p.evaluate(() => ({
    diagramme: !!document.querySelector('#prose figure.diagramme img.diagramme-image[src^="data:image/svg+xml"]'),
    svgInsere: document.querySelectorAll('#prose figure svg').length + document.querySelectorAll('body > [id^="dcodex-diagramme"], body > [id^="codex-diagramme"]').length,
    titreCode: !!document.querySelector('#prose .encadre-astuce .encadre-titre code') && !!document.querySelector('#prose .encadre-astuce .encadre-titre .katex'),
    exercice: !!document.querySelector('#prose .encadre-exercice'),
    boutons: document.querySelectorAll('#prose .exo-fait').length,
    carte: document.querySelector('.carte-revision .revision-texte')?.textContent,
  }));
  console.log('   ', JSON.stringify(R));
  ok(R.diagramme && R.svgInsere === 0, 'diagramme Mermaid dessiné, affiché en image inerte (aucun SVG inséré dans la page)');
  ok(R.titreCode, "titre d'encadré en Markdown : `code` et $formule$ rendus");
  ok(R.exercice && R.boutons === 2, 'encadrés Exercice / Corrigé, un bouton « fait » sous chaque corrigé');
  ok(R.carte === '0 / 2 exercices faits', 'carte Révision : compteur (' + R.carte + ')');
  await p.click('#prose .exo-fait');
  await pause(500);
  ok(await p.evaluate(() => CODEX_BANC.db.progression.length === 1 && document.querySelector('.carte-revision .revision-texte').textContent.startsWith('1 / 2')), 'exercice marqué fait : enregistré, compteur à jour');
  await p.click('.carte-revision .btn');
  ok(await p.evaluate(() => [...document.querySelectorAll('#prose details.encadre-corrige')].every(d => d.open)), '« Afficher les corrigés » les ouvre tous');
  await cap(p, '06b-revision');
  await aller(p, '#/graphe');
  await pause(300);
  await aller(p, '#/fiche/' + idSd);
  await p.waitForSelector('#prose .exo-fait:not([disabled])', { timeout: 3000 }).catch(() => {});
  ok((await p.$$('#prose .exo-fait[aria-pressed="true"]')).length === 1, 'le suivi est retrouvé en rouvrant la fiche');
  await p.waitForSelector('#prose figure.diagramme[data-etat="ok"] img', { timeout: 20000 }).catch(() => {});
  const srcAvant = await p.$eval('#prose .diagramme-image', i => i.src).catch(() => '');
  await p.click('.btn-theme');
  await p.waitForFunction(s => { const i = document.querySelector('#prose .diagramme-image'); return i && i.src !== s; }, { timeout: 20000 }, srcAvant).catch(() => {});
  ok(srcAvant && (await p.$eval('#prose .diagramme-image', i => i.src).catch(() => srcAvant)) !== srcAvant, 'changer de thème redessine le diagramme');
  await p.click('.btn-theme');
  const erreurMermaid = await p.evaluate(async () => {
    const d = document.createElement('div');
    document.body.appendChild(d);
    Codex.rendu.rendre(d, '```mermaid\nflowchart TD\n  A -->\n```');
    await new Promise(r => setTimeout(r, 3000));
    const txt = d.querySelector('.diagramme-erreur')?.textContent || '';
    const orphelins = document.querySelectorAll('body > [id^="dcodex-diagramme"]').length;
    d.remove();
    return { txt, orphelins };
  });
  ok(/non dessiné/.test(erreurMermaid.txt) && erreurMermaid.orphelins === 0, 'diagramme faux : message clair, source affichée, rien d\'orphelin dans la page');

  // Analyse d'import (pure)
  const A2 = await p.evaluate(() => {
    const r = Codex.importer.analyser([
      { nom: 'note.md', dossiers: ['Vault', 'Algo'], texte: '---\ntitle: Tri rapide\ntags:\n  - algo\n  - tri\n---\n# Tri rapide\n\nPivot.' },
      { nom: 'lot.md', dossiers: [], texte: '@@ A / B\nparasite\n+++ Un\n+ video | V | https://y.fr/v\n+ inconnu | X | https://y.fr\nCorps' }
    ]);
    const carte = Codex.importer.lireCorrespondance('fichier;fiche;type\nTD 1.pdf;Structures de données;td');
    return { n: r.fiches.length, tri: r.fiches[0], un: r.fiches[1], erreurs: r.erreurs.length, carte };
  });
  ok(A2.n === 2 && A2.tri.titre === 'Tri rapide' && A2.tri.chemin.join('/') === 'Vault/Algo' && A2.tri.contenu.trim() === 'Pivot.\n\n#algo #tri',
    'import : note Obsidian (en-tête YAML, tags en liste, « # Titre » retiré, dossiers conservés)');
  ok(A2.un.titre === 'Un' && A2.un.chemin.join('/') === 'A/B' && A2.un.ressources.length === 1 && A2.erreurs === 2, 'import : lot Codex (@@, +++, liens valides seulement, lignes fautives signalées)');
  ok(A2.carte && A2.carte['td 1.pdf'] && A2.carte['td 1.pdf'].fiche === 'Structures de données', 'import : fichier de correspondance CSV lu');

  // 7 ter. Importer des fiches depuis l'interface
  await aller(p, '#/importer');
  await p.waitForSelector('#import-md');
  const lot = path.join(os.tmpdir(), 'codex-e2e-lot.md');
  fs.writeFileSync(lot, '@@ Import test / Partie 1\n\n+++ Lot : première fiche\n+ video | Une vidéo | https://www.youtube.com/watch?v=abc\nVoir [[Lot : seconde fiche]] et [[Fiche absente]].\n\n+++ Lot : seconde fiche\nSecond contenu.\n\n+++ Structures de données\nNe doit pas écraser la vraie.\n');
  const note = path.join(os.tmpdir(), 'codex-e2e-note.md');
  fs.writeFileSync(note, '---\ntitle: Note Obsidian\ntags: [algo, tri]\n---\n# Note Obsidian\n\nCorps de la note.\n');
  const [entreeMd] = await p.$$('#import-md');
  await entreeMd.uploadFile(lot, note);
  await p.waitForSelector('.table-import tbody tr', { timeout: 5000 }).catch(() => {});
  const I = await p.evaluate(() => ({
    lignes: [...document.querySelectorAll('.table-import tbody tr')].map(tr => tr.querySelector('.import-etat').textContent),
    absents: document.querySelector('.import-avert')?.textContent || '',
    bouton: document.querySelector('.import-actions .btn-primaire:not([hidden])')?.textContent || '',
  }));
  console.log('   ', JSON.stringify(I));
  ok(I.lignes.length === 4 && I.lignes.filter(e => e === 'À créer').length === 3 && I.lignes.includes('Existe déjà : gardée'), 'import : aperçu avant écriture (3 à créer, 1 existante gardée)');
  ok(/1 lien/.test(I.absents) && /Importer 3 fiches/.test(I.bouton), 'import : lien vers une fiche absente signalé, bouton « Importer 3 fiches »');
  ok(await p.evaluate(() => !CODEX_BANC.db.fiches.some(f => f.titre === 'Note Obsidian')), "import : rien n'est écrit avant validation");
  await p.click('.import-actions .btn-primaire');
  await p.waitForSelector('.import-fin .alerte', { timeout: 15000 }).catch(() => {});
  const J = await p.evaluate(() => {
    const db = CODEX_BANC.db;
    const f1 = db.fiches.find(f => f.titre === 'Lot : première fiche');
    const d1 = f1 && db.dossiers.find(d => d.id === f1.dossier_id);
    const d0 = d1 && db.dossiers.find(d => d.id === d1.parent_id);
    const nObs = db.fiches.find(f => f.titre === 'Note Obsidian');
    return {
      chemin: d0 && d1 ? d0.titre + '/' + d1.titre + '/' + (d0.parent_id === null) : null,
      liens: f1 ? db.ressources.filter(r => r.fiche_id === f1.id && r.url).length : -1,
      nav: f1 ? f1.contenu.includes('[[Lot : seconde fiche]] →') : false,
      obs: nObs ? nObs.contenu : null,
      intacte: db.fiches.find(f => f.titre === 'Structures de données').contenu.includes('Piles et files'),
      arbre: [...document.querySelectorAll('.arbre-dossier')].some(a => a.querySelector('.arbre-titre').textContent === 'Import test'),
    };
  });
  console.log('   ', JSON.stringify(J));
  ok(J.chemin === 'Import test/Partie 1/true' && J.liens === 1 && J.nav, 'import : dossiers créés, liens ajoutés, navigation précédent / suivant du lot');
  ok(J.obs && J.obs.startsWith('Corps de la note.') && J.obs.includes('#algo #tri'), 'import : note Obsidian avec ses tags');
  ok(J.intacte && J.arbre, 'import : fiche existante intacte, explorateur rechargé');
  await cap(p, '06c-import');

  // 7 quater. Déposer des fichiers en lot, rangés par un fichier de correspondance
  await p.click('.page-import .segments .segment:nth-child(2)');
  const csv = path.join(os.tmpdir(), 'codex-e2e-correspondance.csv');
  fs.writeFileSync(csv, 'fichier;fiche;type;titre\n' + path.basename(PDF_TEST) + ';Réduction des endomorphismes;annale;Rapport importé\n');
  const [entreeLot] = await p.$$('#import-fichiers');
  await entreeLot.uploadFile(PDF_TEST, csv);
  await p.waitForSelector('.table-fichiers tbody tr', { timeout: 5000 }).catch(() => {});
  const K = await p.evaluate(id => {
    const tr = document.querySelectorAll('.table-fichiers tbody tr');
    const s = tr[0]?.querySelectorAll('select');
    return { n: tr.length, fiche: s && s[0].value === id, type: s && s[1].value, titre: tr[0]?.querySelector('input[type=text]').value };
  }, idRed);
  ok(K.n === 1 && K.fiche && K.type === 'annale' && K.titre === 'Rapport importé', 'dépôt en lot : la correspondance range le fichier (fiche, type, titre), le CSV n\'est pas déposé');
  await p.click('.page-import .import-panneau:not([hidden]) .import-actions .btn-primaire');
  await p.waitForSelector('.table-fichiers tr.import-ok, .table-fichiers tr.import-erreur', { timeout: 120000 }).catch(() => {});
  ok(await p.evaluate(id => CODEX_BANC.db.ressources.some(r => r.fiche_id === id && r.titre === 'Rapport importé' && r.type === 'annale' && r.fichier), idRed), 'dépôt en lot : fichier compressé et rattaché à sa fiche');
  const devine = await p.evaluate(() => {
    const f = [{ id: '1', titre: 'Structures de données' }, { id: '2', titre: 'Mécanique du point' }];
    return [Codex.importer.deviner('TD structures de donnees.pdf', f)?.id, Codex.importer.deviner('scan_0042.pdf', f)];
  });
  ok(devine[0] === '1' && devine[1] === null, 'dépôt en lot : fiche devinée d\'après le nom, rien de proposé sans ressemblance');
  await cap(p, '06d-depot-lot');

  // 8. Comptes (admin)
  await aller(p, '#/admin');
  await p.waitForSelector('.table-membres tbody tr');
  const avantComptes = (await p.$$('.table-membres tbody tr')).length;
  await p.type('#admin-ids', 'Nouveau.Compte\nlea.martin@banc.example');
  await p.click('.admin-ajout .btn-primaire');
  await p.waitForSelector('.admin-bilan', { timeout: 5000 });
  const bilan = await p.evaluate(() => ({ mdp: document.querySelectorAll('.admin-bilan code').length, err: document.querySelectorAll('.admin-bilan .admin-erreur').length }));
  ok(bilan.mdp === 1 && bilan.err === 1, 'création de comptes : mot de passe généré affiché, doublon signalé');
  await p.click('.nav .compte');
  await p.waitForSelector('.menu');
  ok(!(await p.$eval('.menu', m => m.textContent)).includes('mot de passe'), 'admin : pas de « Changer mon mot de passe » non plus');
  await p.keyboard.press('Escape');
  await pause(400);
  ok((await p.$$('.table-membres tbody tr')).length === avantComptes + 1, 'le nouveau compte apparaît dans la liste');
  ok(await p.evaluate(() => [...document.querySelectorAll('.admin-email')].some(td => td.textContent.startsWith('nouveau.compte'))), 'identifiant affiché sans le domaine technique');
  const presence = await p.evaluate(() => {
    const ligne = debut => [...document.querySelectorAll('.table-membres tbody tr')].find(tr => tr.querySelector('.admin-email').textContent.startsWith(debut));
    const etat = debut => { const tr = ligne(debut); return { point: tr.querySelector('.presence').classList.contains('presence-en-ligne'), vu: tr.querySelector('.admin-vu').textContent }; };
    return { admin: etat('bastien.nieto'), editeur: etat('lea.martin'), lecteur: etat('hugo.petit'), nouveau: etat('nouveau.compte'),
      compteur: document.querySelector('.admin-compteurs').textContent,
      signale: !!CODEX_BANC.db.membres.find(m => m.role === 'admin').vu_le };
  });
  ok(presence.admin.point && presence.editeur.point && presence.editeur.vu === 'en ligne', 'présence : pastille verte pour soi et pour un membre vu il y a 1 min');
  ok(!presence.lecteur.point && /hier|jour/.test(presence.lecteur.vu) && !presence.nouveau.point && presence.nouveau.vu === 'jamais', 'présence : hors ligne, avec la dernière connexion (« hier ») ou « jamais »');
  ok(/· 2 en ligne$/.test(presence.compteur) && presence.signale, 'présence : compteur « 2 en ligne », et le site a signalé la présence de l\'admin');
  await cap(p, '07-comptes');
  const nouveauMdp = await p.evaluate(() => [...document.querySelectorAll('.admin-bilan tr')].find(tr => tr.textContent.startsWith('nouveau.compte')).querySelector('code').textContent);
  await p.close();

  // 9. Le compte créé se connecte avec son identifiant (sans e-mail)
  p = await page(BASE + 'tools/banc.html?role=deconnecte');
  await p.waitForSelector('#identifiant');
  await p.type('#identifiant', 'personne');
  await p.type('#mot-de-passe', 'faux-mot-de-passe');
  await p.click('.ecran-form .btn-primaire');
  await p.waitForSelector('.alerte-texte', { timeout: 3000 }).catch(() => {});
  ok(/incorrect/i.test(await p.$eval('.alerte-texte', e => e.textContent).catch(() => '')), 'mauvais mot de passe : message clair');
  await p.evaluate(() => { document.querySelector('#identifiant').value = ''; document.querySelector('#mot-de-passe').value = ''; });
  await p.type('#identifiant', 'hugo.petit@banc.example');
  await p.type('#mot-de-passe', 'motdepasse-banc');
  await p.click('.ecran-form .btn-primaire');
  ok(!!(await p.waitForSelector('.nav .explorateur-titre', { timeout: 5000 }).catch(() => null)), 'connexion identifiant + mot de passe : Codex s\'ouvre');
  ok(nouveauMdp.length >= 10, 'le mot de passe généré fait au moins 10 caractères');
  await p.close();

  // 10. Mobile
  p = await page(BASE + 'tools/banc.html?role=admin#/fiche/' + idRed, { width: 390, height: 844, isMobile: true, hasTouch: true });
  await p.waitForSelector('.lecture .prose h2');
  await pause(600);
  ok((await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0, 'mobile : pas de défilement horizontal');
  const M = await p.evaluate(() => {
    const docs = document.querySelector('.docs-rapides'), prose = document.querySelector('#prose'), panneau = document.querySelector('.panneau');
    return {
      docs: !!docs && getComputedStyle(docs).display !== 'none',
      dl: docs ? docs.querySelectorAll('.ressource-dl').length : 0,
      avantCours: !!docs && docs.getBoundingClientRect().top < prose.getBoundingClientRect().top,
      panneauApres: panneau.getBoundingClientRect().top > prose.getBoundingClientRect().top,
      ressourcesMasquees: getComputedStyle(document.querySelector('.panneau .carte-ressources')).display === 'none',
    };
  });
  console.log('   ', JSON.stringify(M));
  ok(M.docs && M.dl === 1 && M.avantCours, 'mobile : les documents du cours, à télécharger, juste sous le titre');
  ok(M.panneauApres && M.ressourcesMasquees, 'mobile : le cours d\'abord, le panneau ensuite (sans doublon des ressources)');
  await cap(p, '08-mobile-lecture');
  await p.click('.burger');
  await pause(400);
  await cap(p, '09-mobile-nav');
  await aller(p, '#/importer');
  await p.waitForSelector('#import-md');
  await pause(300);
  ok((await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0, 'mobile : page Importer sans défilement horizontal');
  await cap(p, '09b-mobile-import');
  await p.close();

  // 11. Rôles
  p = await page(BASE + 'tools/banc.html?role=lecteur#/fiche/' + idRed);
  await p.waitForSelector('.lecture .prose h2');
  ok(!(await p.$('.fiche-titre-ligne .btn')), 'lecteur : pas de bouton Modifier');
  ok(!(await p.$('.arbre-plus')), "lecteur : pas d'actions sur les dossiers");
  await aller(p, '#/editer/' + idRed);
  await pause(400);
  ok(!(await p.evaluate(() => location.hash)).startsWith('#/editer'), 'lecteur : /editer redirige vers la lecture');
  await aller(p, '#/admin');
  await pause(300);
  ok(!(await p.$('.table-membres')), 'lecteur : pas de page Membres');
  await p.click('.nav .compte');
  await p.waitForSelector('.menu');
  const menuCompte = await p.$eval('.menu', m => m.textContent);
  ok(!menuCompte.includes('mot de passe') && menuCompte.includes('Se déconnecter'), 'lecteur : pas de « Changer mon mot de passe » dans le menu du compte');
  const mdpRefuse = await p.evaluate(() => window.supabase.createClient().auth.updateUser({ password: 'mon-vrai-mdp-perso' }).then(r => !!r.error));
  ok(mdpRefuse, 'lecteur : un appel direct pour changer son mot de passe est refusé');
  await p.keyboard.press('Escape');
  ok(!(await p.$('a.nav-lien[href="#/importer"]')), 'lecteur : pas de lien Importer');
  await aller(p, '#/importer');
  await pause(300);
  ok(!(await p.$('#import-md')), 'lecteur : /importer redirige');
  await aller(p, '#/fiche/' + idSd);
  await p.waitForSelector('#prose .exo-fait:not([disabled])', { timeout: 3000 }).catch(() => {});
  await p.click('#prose .exo-fait');
  await pause(400);
  ok(await p.evaluate(() => document.querySelector('.carte-revision .revision-texte').textContent.startsWith('1 / 2')), 'lecteur : peut suivre ses propres exercices');
  await p.close();

  p = await page(BASE + 'tools/banc.html?role=intrus');
  await p.waitForSelector('.ecran-carte');
  ok((await p.$eval('.ecran-titre', e => e.textContent)).includes('pas encore autorisé'), "compte non membre : écran d'attente");
  await p.close();

  // 12. Mode lecture et thème
  p = await page(BASE + 'tools/banc.html?role=admin#/fiche/' + idRed);
  await p.waitForSelector('.lecture .prose h2');
  await p.click('.btn-lecture');
  await pause(300);
  ok(await p.evaluate(() => getComputedStyle(document.querySelector('.nav')).display === 'none' && !!document.querySelector('.sortie-lecture')), 'mode lecture : les colonnes disparaissent');
  await cap(p, '10-mode-lecture');
  await p.keyboard.press('Escape');
  await pause(200);
  ok(await p.evaluate(() => getComputedStyle(document.querySelector('.nav')).display !== 'none'), 'Échap quitte le mode lecture');
  const themeAvant = await p.evaluate(() => document.documentElement.dataset.theme);
  await p.click('.btn-theme');
  await pause(800);
  await cap(p, '11-autre-theme');
  const themeApres = await p.evaluate(() => document.documentElement.dataset.theme);
  ok(themeAvant !== themeApres, `bascule de thème (${themeAvant} → ${themeApres})`);
  await p.close();
} catch (e) {
  echecs++;
  console.log('  EXCEPTION', e.message);
} finally {
  await nav.close();
  serveur.close();
  fs.rmSync(profil, { recursive: true, force: true });
}

const utiles = erreurs.filter(e => !/favicon|DevTools/.test(e));
console.log(utiles.length ? '\nConsole :\n  ' + utiles.join('\n  ') : '\nConsole propre.');
console.log(echecs ? `\n${echecs} ÉCHEC(S)` : '\nTout passe.');
process.exit(echecs ? 1 : 0);

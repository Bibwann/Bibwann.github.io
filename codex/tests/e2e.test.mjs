/* ============================================================
   Test de bout en bout de Codex, dans un vrai Chrome (headless),
   sur le banc d'essai (tools/banc.html + faux Supabase en mémoire).

     cd codex/tests && npm install && npm run e2e

   Couvre : rendu des fiches (KaTeX, encadrés, [[liens]], code), XSS,
   recherche, éditeur (autocomplétion, garde, conflit, historique),
   compression d'un vrai PDF + envoi avec progression, refus au-delà de
   50 Mo, graphe, admin, mobile, rôles, connexion, thème clair.

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
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') erreurs.push(`[${m.type()}] ${m.text()}`); });
  p.on('pageerror', e => erreurs.push('[pageerror] ' + e.message));
  await p.goto(url, { waitUntil: 'networkidle0' });
  return p;
}
const pause = ms => new Promise(r => setTimeout(r, ms));
const cap = (p, nom) => p.screenshot({ path: path.join(OUT, nom + '.png') });

try {
  // 1. Vraie page, sans configuration : écran « pas branché », CSP respectée
  let p = await page(BASE + 'index.html');
  await p.waitForSelector('.ecran-carte');
  ok((await p.$eval('.ecran-titre', e => e.textContent)).includes('pas encore branché'), 'index.html sans config : écran de configuration (scripts CDN + SRI + CSP OK)');
  await p.close();

  // 2. Accueil admin
  p = await page(BASE + 'tools/banc.html?role=admin');
  await p.waitForSelector('.accueil');
  ok((await p.$$('.carte-fiche')).length === 5, 'accueil : 5 fiches récentes');
  ok((await p.$$('.arbre-fiche')).length === 5, 'arbre : 5 fiches');
  await cap(p, '01-accueil');

  // 3. Lecture
  const idRed = await p.$eval('.arbre-fiche', () => {
    const a = [...document.querySelectorAll('.arbre-fiche')].find(x => x.textContent.includes('Réduction'));
    return a.dataset.fiche;
  });
  await p.evaluate(id => { location.hash = '#/fiche/' + id; }, idRed);
  await p.waitForSelector('.lecture .prose h2');
  await pause(1200);
  const L = await p.evaluate(() => ({
    katex: document.querySelectorAll('#prose .katex').length,
    blocs: document.querySelectorAll('#prose .formule-bloc').length,
    encadres: [...document.querySelectorAll('#prose .encadre')].map(e => e.className.split(' ')[1]),
    liens: document.querySelectorAll('#prose a.lien-fiche').length,
    manquants: document.querySelectorAll('#prose .lien-fiche.manquant').length,
    code: document.querySelectorAll('#prose .bloc-code .hljs-keyword').length,
    dollars: document.querySelector('#prose').textContent.includes('5 $ et 10 $'),
    h1double: [...document.querySelectorAll('#prose h1')].length,
    groupes: document.querySelectorAll('.groupe-ressources').length,
    ressources: document.querySelectorAll('.ressource').length,
    sommaire: document.querySelectorAll('.sommaire a').length,
    canvas: !!document.querySelector('.graphe-local canvas'),
    citePar: document.querySelectorAll('#titre-cite').length,
    table: !!document.querySelector('#prose .table-defile table'),
    taches: document.querySelectorAll('#prose input[type=checkbox]').length,
    lienFichier: document.querySelector('.ressource[href^="blob:"]') !== null,
    externes: [...document.querySelectorAll('#prose a[href^="http"], .ressource[href^="http"]')].every(a => a.target === '_blank' && a.rel.includes('noopener')),
    titre: document.title
  }));
  console.log('   ', JSON.stringify(L));
  ok(L.katex >= 10, `formules KaTeX rendues (${L.katex})`);
  ok(L.blocs >= 1, 'formule centrée $$…$$ dans un encadré');
  ok(['encadre-definition', 'encadre-theoreme', 'encadre-propriete', 'encadre-methode', 'encadre-attention'].every(c => L.encadres.includes(c)), 'encadrés définition/théorème/propriété/méthode/attention');
  ok(L.liens === 2 && L.manquants === 1, `liens [[…]] : 2 résolus (alias compris), 1 manquant en rouge (${L.liens}/${L.manquants})`);
  ok(L.code > 0, 'code Python coloré');
  ok(L.dollars, '« 5 $ et 10 $ » reste du texte, pas une formule');
  ok(L.h1double === 0, 'le « # Titre » en double avec le titre de la fiche est retiré');
  ok(L.groupes === 5 && L.ressources === 5, 'ressources rangées par type (5 groupes)');
  ok(L.sommaire >= 5, `sommaire (${L.sommaire} entrées)`);
  ok(L.canvas, 'graphe local dessiné');
  ok(L.citePar === 1, '« Cité par » présent (Espaces vectoriels cite cette fiche)');
  ok(L.table && L.taches === 2, 'tableau et cases à cocher GFM');
  ok(L.lienFichier, 'fichier du bucket : lien signé pré-calculé');
  ok(L.externes, 'liens externes en nouvel onglet avec noopener');
  await cap(p, '02-lecture');

  // Aperçu au survol
  await p.hover('#prose a.lien-fiche');
  await p.waitForSelector('.apercu', { timeout: 3000 }).catch(() => {});
  ok(!!(await p.$('.apercu')), 'aperçu au survol d\'un lien [[fiche]]');
  await cap(p, '03-apercu');
  await p.mouse.move(5, 5);

  // XSS : contenu malveillant nettoyé
  const xss = await p.evaluate(() => {
    const d = document.createElement('div');
    Codex.rendu.rendre(d, '<img src="data:," onerror="window.__x=1"> <script>window.__x=2</script> [a](javascript:alert(1)) <iframe src="https://x"></iframe> $\\href{javascript:alert(1)}{x}$');
    const attrs = [...d.querySelectorAll('*')].flatMap(e => [...e.attributes].map(a => a.name + '=' + a.value));
    return { x: window.__x ?? null, scripts: d.querySelectorAll('script, iframe').length,
      evenements: attrs.filter(a => /^on/i.test(a)).length, jsUrl: attrs.filter(a => /javascript:/i.test(a)).length };
  });
  ok(xss.scripts === 0 && xss.evenements === 0 && xss.jsUrl === 0 && xss.x === null, 'XSS : aucun script, gestionnaire on*, ni URL javascript: dans le DOM ' + JSON.stringify(xss));

  // 4. Recherche
  await p.click('.recherche-champ');
  await p.type('.recherche-champ', 'equation');
  await pause(600);
  await p.evaluate(() => { document.querySelector('.recherche-champ').value = ''; });
  await p.type('.recherche-champ', 'diagonalis');
  await p.waitForSelector('.resultat', { timeout: 3000 }).catch(() => {});
  ok((await p.$$('.resultat')).length >= 1, 'recherche plein texte : résultats');
  ok(!!(await p.$('.resultat mark')), 'terme surligné dans les résultats');
  await cap(p, '04-recherche');
  await p.keyboard.press('Escape');

  // 5. Éditeur
  await p.evaluate(id => { location.hash = '#/editer/' + id; }, idRed);
  await p.waitForSelector('.editeur-source');
  await pause(500);
  ok((await p.$$('.edition-ressource')).length === 5, 'éditeur : 5 ressources listées');
  await p.focus('.editeur-source');
  await p.evaluate(() => { const t = document.querySelector('.editeur-source'); t.setSelectionRange(t.value.length, t.value.length); });
  await p.keyboard.type('\n\nVoir [[pol');
  await pause(300);
  ok(!(await p.$eval('.autocomplete', e => e.hidden)), 'autocomplétion [[ ouverte');
  await p.keyboard.press('Enter');
  const insere = await p.$eval('.editeur-source', t => t.value.endsWith('[[Polynômes annulateurs]]'));
  ok(insere, 'autocomplétion : titre complété et crochets fermés');
  await pause(400);
  ok((await p.$eval('.etat-sauvegarde', e => e.textContent)).includes('non enregistrées'), 'indicateur « non enregistrées »');
  ok((await p.$$eval('.editeur-apercu a.lien-fiche', a => a.length)) >= 3, 'aperçu en direct mis à jour');
  await cap(p, '05-editeur');

  // Garde : quitter sans enregistrer
  await p.evaluate(() => { location.hash = '#/'; });
  await p.waitForSelector('dialog.dialogue[open]');
  ok((await p.$eval('dialog .dialogue-titre', e => e.textContent)).includes('Quitter sans enregistrer'), 'garde : quitter sans enregistrer demande confirmation');
  await p.click('dialog .dialogue-actions .btn:not(.btn-danger)'); // Rester
  await pause(200);
  ok((await p.evaluate(() => location.hash)).startsWith('#/editer/'), 'garde : « Rester » garde l\'éditeur');

  // Conflit : quelqu'un d'autre enregistre entre-temps
  await p.evaluate(id => { const f = CODEX_BANC.db.fiches.find(x => x.id === id); f.maj_le = new Date(Date.now() + 5000).toISOString(); }, idRed);
  await p.keyboard.down('Control'); await p.keyboard.press('s'); await p.keyboard.up('Control');
  await p.waitForSelector('dialog.dialogue[open]', { timeout: 3000 });
  ok((await p.$eval('dialog .dialogue-titre', e => e.textContent)).includes('Conflit'), 'conflit détecté (verrou optimiste)');
  await p.click('dialog .btn-danger'); // Écraser
  await pause(900);
  const apres = await p.evaluate(id => CODEX_BANC.db.fiches.find(x => x.id === id).contenu.endsWith('[[Polynômes annulateurs]]'), idRed);
  ok(apres, 'écraser : la version de l\'éditeur est enregistrée');
  ok((await p.$eval('.etat-sauvegarde', e => e.textContent)) === 'Enregistré', 'indicateur « Enregistré »');

  // Historique
  await p.click('.editeur-barre-droite .btn[title="Versions précédentes"]');
  await p.waitForSelector('.historique-item');
  ok((await p.$$('.historique-item')).length >= 2, 'historique : versions listées');
  await p.click('.historique-item');
  await pause(400);
  await cap(p, '06-historique');
  await p.keyboard.press('Escape');
  await pause(200);

  // 6. Envoi d'un PDF réel : compression + progression
  const pdf = PDF_TEST;
  const [entree] = await p.$$('#entree-fichiers');
  await entree.uploadFile(pdf);
  await p.waitForSelector('.envoi.ok, .envoi.erreur', { timeout: 120000 });
  const envoi = await p.$eval('.envoi', e => ({ classe: e.className, texte: e.querySelector('.envoi-etape').textContent }));
  console.log('    envoi :', envoi.texte);
  ok(envoi.classe.includes('ok'), 'PDF compressé puis envoyé');
  ok(/→/.test(envoi.texte), 'gain de compression affiché');
  const stocke = await p.evaluate(() => { const k = Object.keys(CODEX_BANC.fichiers).find(k => k.includes('Rapport')); return k ? CODEX_BANC.fichiers[k].size : 0; });
  ok(stocke > 0 && stocke < 611722 * 0.5, `fichier stocké compressé (${stocke} o au lieu de 611722)`);
  ok((await p.$$('.edition-ressource')).length === 6, 'la nouvelle ressource apparaît');
  await cap(p, '07-envoi');

  // Fichier trop lourd après compression (non-PDF de 51 Mo)
  const gros = path.join(os.tmpdir(), 'codex-e2e-gros.bin');
  if (!fs.existsSync(gros)) fs.writeFileSync(gros, Buffer.alloc(51 * 1024 * 1024));
  await entree.uploadFile(gros);
  await p.waitForFunction(() => document.querySelectorAll('.envoi.erreur').length > 0, { timeout: 20000 }).catch(() => {});
  const err = await p.$eval('.envoi.erreur .envoi-etape', e => e.textContent).catch(() => '');
  ok(/50 Mo/.test(err), 'fichier de 51 Mo refusé avant envoi : ' + err.slice(0, 60));

  // 7. Graphe complet
  await p.evaluate(() => { location.hash = '#/graphe'; });
  await p.waitForSelector('.graphe-plein canvas');
  await pause(1500);
  ok(true, 'graphe complet affiché');
  await cap(p, '08-graphe');

  // 8. Admin : ajout en masse
  await p.evaluate(() => { location.hash = '#/admin'; });
  await p.waitForSelector('.table-membres tbody tr');
  await p.type('#admin-emails', 'Alice.Durand@etu.example, bob@etu.example\nbob@etu.example lea.martin@banc.example');
  await p.click('.admin-ajout .btn-primaire');
  await pause(800);
  ok((await p.$$('.table-membres tbody tr')).length === 5, 'admin : 2 ajoutés, doublons ignorés (5 membres)');
  ok(await p.evaluate(() => CODEX_BANC.db.membres.some(m => m.email === 'alice.durand@etu.example')), 'e-mails normalisés en minuscules');
  ok(await p.$eval('.table-membres select[disabled]', e => !!e), 'admin : son propre rôle non modifiable');
  await cap(p, '09-admin');

  // 9. Mobile
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await p.evaluate(id => { location.hash = '#/fiche/' + id; }, idRed);
  await p.waitForSelector('.lecture .prose h2');
  await pause(600);
  const debord = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(debord <= 0, `mobile : pas de défilement horizontal (${debord}px)`);
  await cap(p, '10-mobile-lecture');
  await p.click('.burger');
  await pause(400);
  await cap(p, '11-mobile-nav');
  await p.close();

  // 10. Rôles
  p = await page(BASE + 'tools/banc.html?role=lecteur#/fiche/' + idRed);
  await p.waitForSelector('.lecture .prose h2');
  ok(!(await p.$('.fiche-titre-ligne .btn')), 'lecteur : pas de bouton Modifier');
  ok(!(await p.$('.arbre-plus')), 'lecteur : pas d\'actions sur les dossiers');
  await p.evaluate(id => { location.hash = '#/editer/' + id; }, idRed);
  await pause(400);
  ok(!(await p.evaluate(() => location.hash)).startsWith('#/editer'), 'lecteur : /editer redirige vers la lecture');
  await p.close();

  p = await page(BASE + 'tools/banc.html?role=intrus');
  await p.waitForSelector('.ecran-carte');
  ok((await p.$eval('.ecran-titre', e => e.textContent)).includes('pas encore autorisé'), 'compte non membre : écran d\'attente');
  await p.close();

  p = await page(BASE + 'tools/banc.html?role=deconnecte');
  await p.waitForSelector('#email-connexion');
  await p.type('#email-connexion', 'moi@etu.example');
  await p.click('.ecran-form .btn-primaire');
  await p.waitForSelector('.alerte-ok');
  ok(true, 'déconnecté : formulaire de lien magique → confirmation');
  await cap(p, '12-connexion');
  await p.close();

  // 11. Thème clair
  p = await page(BASE + 'tools/banc.html?role=admin#/fiche/' + idRed);
  await p.waitForSelector('.lecture .prose h2');
  await p.click('.entete-actions .btn-icone');
  await pause(1000);
  await cap(p, '13-clair');
  ok((await p.evaluate(() => document.documentElement.dataset.theme)) === 'clair', 'bascule vers le thème clair');
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

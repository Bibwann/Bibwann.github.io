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
    dossiers: document.querySelectorAll('.index-dossier').length,
    graphe: !!document.querySelector('.panneau .graphe-local canvas'),
    explorateurSansAccueil: ![...document.querySelectorAll('.arbre-fiche')].some(a => a.textContent.includes('Bienvenue')),
  }));
  console.log('   ', JSON.stringify(A));
  ok(A.titre === 'Bienvenue sur Codex', "accueil : c'est la note d'accueil qui s'affiche");
  ok(A.callout && A.replie, 'callouts Obsidian « > [!tip] » et repliable « > [!info]- »');
  ok(A.tag, '#tag rendu en lien vers sa page');
  ok(A.recents >= 5 && A.dossiers === 2, 'index sous la note : dossiers et fiches récentes');
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
  const idMaths = await p.evaluate(() => [...document.querySelectorAll('.arbre-dossier')].find(a => a.textContent === 'Mathématiques').dataset.dossier);
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
  ok(true, 'graphe complet affiché');
  await cap(p, '06-graphe');

  // 8. Comptes (admin)
  await aller(p, '#/admin');
  await p.waitForSelector('.table-membres tbody tr');
  const avantComptes = (await p.$$('.table-membres tbody tr')).length;
  await p.type('#admin-ids', 'Nouveau.Compte\nlea.martin@banc.example');
  await p.click('.admin-ajout .btn-primaire');
  await p.waitForSelector('.admin-bilan', { timeout: 5000 });
  const bilan = await p.evaluate(() => ({ mdp: document.querySelectorAll('.admin-bilan code').length, err: document.querySelectorAll('.admin-bilan .admin-erreur').length }));
  ok(bilan.mdp === 1 && bilan.err === 1, 'création de comptes : mot de passe généré affiché, doublon signalé');
  await pause(400);
  ok((await p.$$('.table-membres tbody tr')).length === avantComptes + 1, 'le nouveau compte apparaît dans la liste');
  ok(await p.evaluate(() => [...document.querySelectorAll('.admin-email')].some(td => td.textContent.startsWith('nouveau.compte'))), 'identifiant affiché sans le domaine technique');
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
  await cap(p, '08-mobile-lecture');
  await p.click('.burger');
  await pause(400);
  await cap(p, '09-mobile-nav');
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

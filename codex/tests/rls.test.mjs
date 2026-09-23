/* ============================================================
   Tests de la Row Level Security de Codex, sur un vrai Postgres
   (PGlite : Postgres compilé en WebAssembly, sans Docker ni serveur).

     cd codex/tests && npm install && npm test

   Supabase n'est pas là : ses rôles (anon, authenticated), auth.users,
   auth.uid() et storage.objects sont simulés ci-dessous au plus près.
   À lancer après CHAQUE modification de supabase/schema.sql. Une règle
   d'accès non testée est une règle qu'on croit avoir.
   ============================================================ */
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';

const db = new PGlite();
const schema = fs.readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');

// --- Environnement Supabase simulé ---
await db.exec(`
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
grant usage on schema public, storage, auth to anon, authenticated;
grant all on all tables in schema storage to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
`);
await db.exec(schema);
await db.exec(schema); // rejouable ?

const U = {
  admin:  ['00000000-0000-0000-0000-00000000000a', 'boss@univ.fr', true],
  edit:   ['00000000-0000-0000-0000-00000000000e', 'edit@univ.fr', true],
  lect:   ['00000000-0000-0000-0000-00000000000l'.replace('l','1'), 'lect@univ.fr', true],
  intrus: ['00000000-0000-0000-0000-000000000099', 'intrus@exemple.example', true],
  nonconf:['00000000-0000-0000-0000-000000000088', 'Lect2@Univ.fr', false],
};
for (const [id, email, ok] of Object.values(U))
  await db.query('insert into auth.users values ($1,$2,$3)', [id, email, ok ? new Date() : null]);
await db.exec(`insert into public.membres (email, role) values
  ('boss@univ.fr','admin'),('edit@univ.fr','editeur'),('lect@univ.fr','lecteur'),('lect2@univ.fr','lecteur')`);

let echecs = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  ÉCHEC ') + msg); if (!cond) echecs++; };

async function comme(qui, fn) {
  await db.exec('reset role');
  if (qui === 'anon') { await db.exec(`select set_config('request.jwt.claim.sub','',false); set role anon`); }
  else { await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [U[qui][0]]); await db.exec('set role authenticated'); }
  try { return await fn(); } finally { await db.exec('reset role'); }
}
const essaie = async (sql, p) => { try { return { r: await db.query(sql, p) }; } catch (e) { return { e: e.message }; } };
const n = async (sql, p) => (await db.query(sql, p)).rows.length;

// Contenu de départ, écrit par l'éditeur
let dossier, fiche;
await comme('edit', async () => {
  dossier = (await db.query(`insert into dossiers (titre) values ('Maths') returning id`)).rows[0].id;
  const r = await db.query(`insert into fiches (dossier_id, titre, contenu, maj_par) values ($1,'Diagonalisation','Les valeurs propres d''une matrice', 'faux@x.fr') returning id, maj_par`, [dossier]);
  fiche = r.rows[0].id;
  ok(r.rows[0].maj_par === 'edit@univ.fr', 'maj_par posé par le serveur, pas par le client');
  await db.query(`insert into ressources (fiche_id, type, titre, url) values ($1,'poly','Poly','https://x.fr/p.pdf')`, [fiche]);
  ok(!!(await essaie(`insert into ressources (fiche_id, type, titre, url, fichier) values ($1,'poly','X','https://x','a/b')`, [fiche])).e, 'ressource lien ET fichier refusée');
  ok(!!(await essaie(`insert into ressources (fiche_id, type, titre, url) values ($1,'poly','X','javascript:alert(1)')`, [fiche])).e, 'URL javascript: refusée');
  const avant = (await db.query('select maj_le from fiches where id=$1', [fiche])).rows[0].maj_le;
  await db.query(`update fiches set contenu='v2' where id=$1`, [fiche]);
  ok(await n('select 1 from revisions where fiche_id=$1', [fiche]) === 1, 'une révision créée à la modification du contenu');
  await db.query(`update fiches set dossier_id=dossier_id where id=$1`, [fiche]);
  ok(await n('select 1 from revisions where fiche_id=$1', [fiche]) === 1, 'pas de révision pour un simple déplacement');
  ok(!!(await essaie(`insert into revisions (fiche_id, titre, contenu, cree_le) values ($1,'x','x',now())`, [fiche])).e, 'éditeur ne peut pas forger une révision');
  ok(await n('select 1 from storage.objects') === 0 && !(await essaie(`insert into storage.objects (bucket_id, name) values ('ressources','f/a.pdf')`)).e, 'éditeur dépose un fichier');
  ok(!!(await essaie(`insert into membres values ('pote@x.fr','admin')`)).e, 'éditeur ne peut pas ajouter de membre');
  ok(await n('select * from membres') === 1, 'éditeur ne voit que sa ligne de membres');
});

// Concurrence optimiste : l'appli met à jour « where maj_le = <ce que j'ai lu> »
await comme('edit', async () => {
  const perime = '2000-01-01T00:00:00Z';
  const r = await db.query(`update fiches set contenu='v3' where id=$1 and maj_le=$2 returning id`, [fiche, perime]);
  ok(r.rows.length === 0, 'mise à jour sur une version périmée : 0 ligne (conflit détecté)');
});

await comme('lect', async () => {
  ok(await n('select * from fiches') === 1, 'lecteur lit les fiches');
  ok(await n('select * from ressources') === 1, 'lecteur lit les ressources');
  ok(await n('select * from storage.objects') === 1, 'lecteur lit les fichiers du bucket');
  ok(await n('select * from revisions') === 0, "lecteur ne voit pas l'historique");
  ok((await db.query(`update fiches set contenu='pirate' returning id`)).rows.length === 0, 'lecteur ne modifie rien (0 ligne)');
  ok(!!(await essaie(`insert into dossiers (titre) values ('x')`)).e, 'lecteur ne crée pas de dossier');
  ok(!!(await essaie(`insert into storage.objects (bucket_id, name) values ('ressources','z')`)).e, 'lecteur ne dépose pas de fichier');
  ok((await db.query(`delete from fiches returning id`)).rows.length === 0, 'lecteur ne supprime rien');
  ok((await db.query('select public.role_courant() r')).rows[0].r === 'lecteur', 'role_courant() = lecteur');
  ok((await db.query(`select * from rechercher('VALEURS')`)).rows.length === 0, 'recherche sur contenu remplacé (v2) : plus de « valeurs »');
  ok((await db.query(`select * from rechercher('diagonalisation')`)).rows.length === 1, 'recherche par titre');
  ok((await db.query(`select * from rechercher('%%')`)).rows.length === 0, '« %% » est échappé, pas un joker');
});

await comme('intrus', async () => {
  ok(await n('select * from fiches') === 0, 'compte non membre : ne voit aucune fiche');
  ok(await n('select * from membres') === 0, 'compte non membre : ne voit pas les membres');
  ok(await n('select * from storage.objects') === 0, 'compte non membre : ne voit aucun fichier');
  ok((await db.query(`select * from rechercher('diag')`)).rows.length === 0, 'compte non membre : recherche vide');
  ok(!!(await essaie(`insert into membres values ('intrus@exemple.example','admin')`)).e, "compte non membre ne peut pas s'ajouter");
});

await comme('nonconf', async () => {
  ok(await n('select * from fiches') === 0, 'e-mail listé mais NON confirmé : aucun accès');
});

await comme('anon', async () => {
  ok(!!(await essaie('select * from fiches')).e, 'anonyme : accès refusé aux tables');
  ok((await db.query('select public.ping() p')).rows[0].p === 'ok', 'anonyme : ping() répond (keep-alive)');
  ok(!!(await essaie('select * from public.graphe()')).e, 'anonyme : graphe() refusé');
  ok(!!(await essaie('select * from public.stockage()')).e, 'anonyme : stockage() refusé');
  ok(!!(await essaie("select * from public.rechercher('diag')")).e, 'anonyme : rechercher() refusé');
});

await comme('admin', async () => {
  ok(await n('select * from membres') === 4, "admin voit tous les membres");
  ok(!(await essaie(`insert into membres values ('nouveau@univ.fr','lecteur')`)).e, 'admin ajoute un membre');
  ok((await db.query(`update membres set role='editeur' where email='lect@univ.fr' returning email`)).rows.length === 1, 'admin change un rôle');
  ok((await db.query(`update membres set role='lecteur' where email='boss@univ.fr' returning email`)).rows.length === 0, 'admin ne peut pas se rétrograder');
  ok((await db.query(`delete from membres where email='boss@univ.fr' returning email`)).rows.length === 0, 'admin ne peut pas se retirer');
  ok(!!(await essaie(`insert into membres values ('MAJ@univ.fr','lecteur')`)).e, 'e-mail en majuscules refusé (le client normalise)');
  ok(!!(await essaie(`delete from dossiers where id=$1`, [dossier])).e, 'dossier non vide : suppression refusée');
});

// Plafond de 50 révisions
await comme('edit', async () => {
  for (let i = 0; i < 60; i++) await db.query(`update fiches set contenu=$2 where id=$1`, [fiche, 'v' + i]);
  ok(await n('select 1 from revisions where fiche_id=$1', [fiche]) === 50, 'historique plafonné à 50 versions');
  await db.query(`update fiches set contenu='Équation différentielle' where id=$1`, [fiche]);
  ok((await db.query(`select extrait from rechercher('equation')`)).rows.length === 1, 'recherche insensible aux accents');
});

// Graphe : liens [[Titre]], [[titre|alias]], [[Titre#section]], sans accents ni casse
await comme('edit', async () => {
  const cible = (await db.query(`insert into fiches (dossier_id, titre, contenu) values ($1, 'Espaces vectoriels', 'base') returning id`, [dossier])).rows[0].id;
  const autre = (await db.query(`insert into fiches (dossier_id, titre, contenu) values ($1, 'Réduction', $2) returning id`,
    [dossier, 'Voir [[espaces VECTORIELS|les ev]], [[Espaces vectoriels#base]] et [[Fiche inexistante]]. `code [[x]]`'])).rows[0].id;
  await db.query(`update fiches set contenu = 'Rappel : [[reduction]]' where id = $1`, [cible]);
  const aretes = (await db.query('select * from public.graphe()')).rows;
  ok(aretes.length === 2, `graphe : 2 arêtes attendues, ${aretes.length} obtenues`);
  ok(aretes.some(a => a.source === autre && a.cible === cible), 'graphe : alias et #section résolus vers la même fiche (dédoublonnés)');
  ok(aretes.some(a => a.source === cible && a.cible === autre), 'graphe : [[reduction]] trouve « Réduction » (accents, casse)');
  await db.query(`insert into ressources (fiche_id, type, titre, fichier, taille) values ($1, 'poly', 'P', 'x/p.pdf', 1000), ($1, 'td', 'T', 'x/t.pdf', 500)`, [cible]);
  const st = (await db.query('select * from public.stockage()')).rows[0];
  ok(Number(st.octets) === 1500 && Number(st.fichiers) === 2, 'stockage() : somme des fichiers (les liens ne comptent pas)');
});
await comme('intrus', async () => {
  ok((await db.query('select * from public.graphe()')).rows.length === 0, 'compte non membre : graphe vide');
});

console.log(echecs ? `\n${echecs} ÉCHEC(S)` : '\nTout passe.');
process.exit(echecs ? 1 : 0);

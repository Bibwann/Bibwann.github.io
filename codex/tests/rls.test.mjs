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
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'node:fs';

const db = new PGlite({ extensions: { pgcrypto } });
const schema = fs.readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');

// --- Environnement Supabase simulé ---
await db.exec(`
create role anon nologin; create role authenticated nologin;
create schema auth;
create schema extensions;
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz,
  instance_id uuid, aud text, role text, encrypted_password text, raw_app_meta_data jsonb, raw_user_meta_data jsonb,
  created_at timestamptz, updated_at timestamptz, confirmation_token text, recovery_token text,
  email_change_token_new text, email_change text, email_change_token_current text, reauthentication_token text,
  phone_change text, phone_change_token text);
create table auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users (id) on delete cascade,
  provider_id text not null, provider text not null, identity_data jsonb not null,
  last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz, unique (provider_id, provider));
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
grant usage on schema public, storage, auth to anon, authenticated;
grant all on all tables in schema storage to anon, authenticated;
-- « Automatically expose new tables » désactivé : aucun droit de table par défaut,
-- schema.sql doit tout accorder lui-même.
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

// Comptes créés depuis le site : fonctions admin_* (auth.users + auth.identities)
let idLea;
await comme('admin', async () => {
  const r = await db.query(`select public.admin_creer_compte('Lea.Martin', 'un-mot-de-passe-10', 'editeur') e`);
  ok(r.rows[0].e === 'lea.martin@codex.invalid', 'admin_creer_compte : identifiant → adresse technique .invalid');
  ok(!!(await essaie(`select public.admin_creer_compte('lea.martin', 'autre-mot-de-passe', 'lecteur')`)).e, 'doublon refusé');
  ok(!!(await essaie(`select public.admin_creer_compte('a', 'un-mot-de-passe-10', 'lecteur')`)).e, 'identifiant trop court refusé');
  ok(!!(await essaie(`select public.admin_creer_compte('x@codex.invalid', 'un-mot-de-passe-10', 'lecteur')`)).e, 'domaine technique forgé refusé');
  ok(!!(await essaie(`select public.admin_creer_compte('bob', 'court', 'lecteur')`)).e, 'mot de passe < 10 refusé');
  ok(!!(await essaie(`select public.admin_creer_compte('bob', 'un-mot-de-passe-10', 'dieu')`)).e, 'rôle inventé refusé');
  ok((await db.query(`select public.admin_creer_compte('vrai.mail@etu.univ.fr', 'un-mot-de-passe-10', 'lecteur') e`)).rows[0].e === 'vrai.mail@etu.univ.fr', 'un vrai e-mail peut servir d\'identifiant');
  ok(!!(await essaie(`select public.admin_mot_de_passe('boss@univ.fr', 'nouveau-mot-de-passe')`)).e, "l'admin ne change pas son mot de passe par ici");
  ok(!!(await essaie(`select public.admin_supprimer_compte('boss@univ.fr')`)).e, "l'admin ne peut pas supprimer son propre compte");
  ok(!!(await essaie(`select public.admin_mot_de_passe('personne@codex.invalid', 'nouveau-mot-de-passe')`)).e, 'compte inexistant : erreur');
});
{
  const u = (await db.query(`select * from auth.users where email = 'lea.martin@codex.invalid'`)).rows[0];
  idLea = u.id;
  const bon = (await db.query(`select encrypted_password = extensions.crypt('un-mot-de-passe-10', encrypted_password) ok from auth.users where id = $1`, [u.id])).rows[0].ok;
  ok(bon && u.encrypted_password.startsWith('$2a$10$'), 'mot de passe haché en bcrypt coût 10 (comme Supabase Auth), jamais en clair');
  ok(!!u.email_confirmed_at && u.aud === 'authenticated' && u.role === 'authenticated', 'compte confirmé d\'office, audience et rôle Supabase corrects');
  ok(['confirmation_token', 'recovery_token', 'email_change_token_new', 'email_change'].every(c => u[c] === ''), 'jetons à « » et non NULL (sinon Supabase Auth refuse la connexion)');
  const idt = (await db.query(`select * from auth.identities where user_id = $1`, [u.id])).rows[0];
  ok(idt && idt.provider === 'email' && idt.provider_id === u.id && idt.identity_data.email === 'lea.martin@codex.invalid', 'identité « email » créée (connexion par mot de passe)');
  ok((await db.query(`select role from membres where email = 'lea.martin@codex.invalid'`)).rows[0].role === 'editeur', 'rôle enregistré dans membres');
}
U.lea = [idLea, 'lea.martin@codex.invalid', true];
await comme('lea', async () => {
  ok((await db.query('select public.role_courant() r')).rows[0].r === 'editeur', 'le compte créé est reconnu avec son rôle');
  ok(!!(await essaie(`select public.admin_creer_compte('pirate', 'un-mot-de-passe-10', 'admin')`)).e, 'un éditeur ne crée pas de compte');
});
await comme('lect', async () => {
  ok(!!(await essaie(`select public.admin_supprimer_compte('lea.martin@codex.invalid')`)).e, 'un lecteur ne supprime pas de compte');
  ok(!!(await essaie(`select public.admin_mot_de_passe('lea.martin@codex.invalid', 'je-prends-ton-compte')`)).e, 'un lecteur ne change pas le mot de passe d\'un autre');
});
await comme('anon', async () => {
  ok(!!(await essaie(`select public.admin_creer_compte('anonyme', 'un-mot-de-passe-10', 'admin')`)).e, 'anonyme : fonctions de comptes refusées');
});
await comme('lect', async () => {
  ok(!!(await essaie(`select email, encrypted_password from auth.users`)).e, 'auth.users illisible depuis une session (hachés compris)');
});
{
  const avant = (await db.query(`select encrypted_password from auth.users where id = $1`, [idLea])).rows[0].encrypted_password;
  await comme('admin', async () => { await db.query(`select public.admin_mot_de_passe('lea.martin@codex.invalid', 'mot-de-passe-neuf-2')`); });
  const apres = (await db.query(`select encrypted_password = extensions.crypt('mot-de-passe-neuf-2', encrypted_password) ok, encrypted_password h from auth.users where id = $1`, [idLea])).rows[0];
  ok(apres.ok && apres.h !== avant, 'admin_mot_de_passe : nouveau mot de passe appliqué');
  await comme('admin', async () => { await db.query(`select public.admin_supprimer_compte('lea.martin@codex.invalid')`); });
  ok(await n(`select 1 from auth.users where id = $1`, [idLea]) === 0 && await n(`select 1 from auth.identities where user_id = $1`, [idLea]) === 0
    && await n(`select 1 from membres where email = 'lea.martin@codex.invalid'`) === 0, 'admin_supprimer_compte : compte, identité et accès retirés');
}

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

// Fiches à la racine, note d'accueil unique, tags
await comme('edit', async () => {
  const racine = (await db.query(`insert into fiches (titre, contenu, accueil) values ('Bienvenue', 'Intro #Méthodo et #maths/algebre, pas#ici', true) returning id`)).rows[0].id;
  ok(!!racine, 'fiche à la racine (sans dossier) acceptée, marquée accueil');
  ok(!!(await essaie(`insert into fiches (titre, accueil) values ('Deuxième accueil', true)`)).e, "une seule note d'accueil possible");
  const tags = (await db.query('select tag from public.etiquettes() where fiche_id = $1 order by tag', [racine])).rows.map(r => r.tag);
  ok(JSON.stringify(tags) === JSON.stringify(['maths/algebre', 'méthodo']), 'etiquettes() : #tags (accents, sous-tags), pas les # collés à un mot (' + tags.join(', ') + ')');
});
await comme('anon', async () => {
  ok(!!(await essaie('select * from public.etiquettes()')).e, 'anonyme : etiquettes() refusé');
});
{
  const b = (await db.query(`select allowed_mime_types from storage.buckets where id = 'ressources'`)).rows[0].allowed_mime_types;
  ok(b.includes('application/pdf') && !b.includes('text/html') && !b.some(t => t.includes('svg')), 'bucket : PDF autorisé, ni HTML ni SVG');
}

// Contenu d'exemple : exemple.sql puis exemple-retirer.sql (exécutés comme
// dans le SQL Editor, donc sans RLS), sans toucher au reste.
{
  const lire = (f) => fs.readFileSync(new URL('../supabase/' + f, import.meta.url), 'utf8');
  const avant = (await db.query('select count(*)::int n from fiches')).rows[0].n;
  await db.exec(lire('exemple.sql'));
  await db.exec(lire('exemple.sql')); // rejouable : ne duplique rien
  // La note d'accueil existe déjà (posée plus haut) : accueil.sql ne doit rien faire.
  const nAccueil = (await db.query('select count(*)::int n from fiches where accueil')).rows[0].n;
  await db.exec(fs.readFileSync(new URL('../supabase/accueil.sql', import.meta.url), 'utf8'));
  ok((await db.query('select count(*)::int n from fiches where accueil')).rows[0].n === nAccueil, "accueil.sql : ne crée pas de seconde note d'accueil");
  // Avec l'exemple chargé : la note d'accueil posée par accueil.sql doit être reliée à son cours.
  await db.exec(`update fiches set accueil = false where accueil`);
  await db.exec(lire('accueil.sql'));
  const acc = (await db.query(`select titre, dossier_id, contenu from fiches where accueil`)).rows[0];
  ok(acc && acc.titre === 'Bienvenue sur Codex' && acc.dossier_id === null && acc.contenu.includes('$e^{i\\pi} + 1 = 0$'), "accueil.sql : note d'accueil à la racine, formules intactes");
  const liensAccueil = await db.query(`select c.titre from public.graphe() g join fiches f on f.id = g.source join fiches c on c.id = g.cible where f.accueil`);
  ok(liensAccueil.rows.some(r => r.titre === 'Transformée de Laplace'), "accueil : relié au cours d'exemple dans le graphe");
  // On remet les choses comme avant : l'ancienne note redevient l'accueil.
  await db.exec(`delete from fiches where accueil`);
  await db.exec(`update fiches set accueil = true where titre = 'Bienvenue'`);
  ok((await db.query('select count(*)::int n from fiches')).rows[0].n === avant + 4, 'exemple.sql : 4 fiches, pas de doublon au 2e passage');
  const titres = await db.query(`select f.titre, c.titre as cible from public.graphe() g
    join fiches f on f.id = g.source join fiches c on c.id = g.cible`);
  const a = (s, c) => titres.rows.some(r => r.titre === s && r.cible === c);
  ok(a('Complexité des algorithmes', 'Algorithmes de tri'), 'graphe : [[Titre\\|alias]] dans un tableau Markdown est résolu');
  ok(a('Transformée de Laplace', 'Équations différentielles') && a('Algorithmes de tri', 'Complexité des algorithmes'), 'graphe : liens de l\'exemple présents');
  await db.exec(lire('exemple-retirer.sql'));
  ok((await db.query('select count(*)::int n from fiches')).rows[0].n === avant, 'exemple-retirer.sql : fiches d\'exemple supprimées, les autres intactes');
  ok((await db.query(`select count(*)::int n from dossiers where titre in ('Exemple')`)).rows[0].n === 0 &&
     (await db.query(`select count(*)::int n from dossiers where titre = 'Maths'`)).rows[0].n === 1, 'exemple-retirer.sql : dossiers d\'exemple supprimés, « Maths » intact');
}

// Ordre de lecture et comptage des exercices.
{
  const id = (await db.query(`insert into fiches (dossier_id, titre, ordre, contenu) values ($1, 'Exos', 3, $2) returning id`, [dossier,
    '## Ex 1\n::: corrige- Corrigé\nA\n:::\n\n::: succes- Réponse\nB\n:::\n\n::: succes Pas un exercice\nC\n:::\n\n> [!solution]- S\n> D\n\n```\n::: corrige- dans du code, compté quand même\n```\n'])).rows[0].id;
  await comme('lect', async () => {
    const r = (await db.query('select nombre from public.exercices() where fiche_id = $1', [id])).rows[0];
    ok(r && r.nombre === 4, 'exercices() : corrigés repliés comptés, succès non replié ignoré (' + (r && r.nombre) + ')');
    ok((await db.query('select ordre from fiches where id = $1', [id])).rows[0].ordre === 3, 'ordre : lu par les membres');
  });
  await comme('anon', async () => { ok(!!(await essaie('select * from public.exercices()')).e, 'anonyme : exercices() refusé'); });
  await db.query('delete from fiches where id = $1', [id]);
}

// Progression (exercices faits) : un carnet personnel, lecteurs compris.
await comme('lect', async () => {
  ok(!(await essaie(`insert into progression (fiche_id, cle) values ($1, 'exercice-1#1')`, [fiche])).e, 'progression : un membre marque un exercice fait');
  ok((await db.query('select email from progression')).rows[0]?.email === 'lect@univ.fr', 'progression : ligne au nom du membre connecté (posé par la base)');
  ok(!!(await essaie(`insert into progression (email, fiche_id, cle) values ('edit@univ.fr', $1, 'x')`, [fiche])).e, "progression : impossible d'écrire au nom d'un autre");
  ok(!!(await essaie(`insert into progression (fiche_id, cle) values ($1, 'exercice-1#1')`, [fiche])).e, 'progression : doublon refusé');
  ok(!!(await essaie(`update progression set cle = 'y'`)).e, 'progression : ni modification (seulement ajouter ou retirer)');
});
await comme('edit', async () => {
  await db.query(`insert into progression (fiche_id, cle) values ($1, 'autre#1')`, [fiche]);
  ok(await n('select * from progression') === 1, 'progression : chacun ne voit que ses propres lignes');
  ok((await db.query(`delete from progression where email = 'lect@univ.fr' returning cle`)).rows.length === 0, "progression : impossible de retirer celles d'un autre");
});
await comme('admin', async () => {
  ok(await n('select * from progression') === 0, "progression : l'admin ne voit pas celle des autres");
});
await comme('intrus', async () => {
  ok(!!(await essaie(`insert into progression (fiche_id, cle) values ($1, 'x')`, [fiche])).e, 'progression : compte non membre refusé');
});
await comme('nonconf', async () => {
  ok(!!(await essaie(`insert into progression (fiche_id, cle) values ($1, 'x')`, [fiche])).e, 'progression : e-mail non confirmé refusé');
});
await comme('anon', async () => {
  ok(!!(await essaie('select * from progression')).e, 'progression : anonyme refusé');
});
await comme('lect', async () => {
  ok((await db.query(`delete from progression where cle = 'exercice-1#1' returning cle`)).rows.length === 1, 'progression : un membre retire sa propre ligne');
});
{
  const f2 = (await db.query(`insert into fiches (dossier_id, titre) values ($1, 'Fiche éphémère') returning id`, [dossier])).rows[0].id;
  await comme('edit', async () => { await db.query(`insert into progression (fiche_id, cle) values ($1, 'x#1')`, [f2]); });
  await db.query('delete from fiches where id = $1', [f2]);
  ok(await n('select 1 from progression where fiche_id = $1', [f2]) === 0, 'progression : effacée avec la fiche');
  await db.query(`delete from membres where email = 'edit@univ.fr'`);
  ok(await n(`select 1 from progression where email = 'edit@univ.fr'`) === 0, 'progression : effacée avec le membre');
}

console.log(echecs ? `\n${echecs} ÉCHEC(S)` : '\nTout passe.');
process.exit(echecs ? 1 : 0);

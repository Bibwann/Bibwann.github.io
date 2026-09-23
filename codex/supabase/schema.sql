-- ============================================================
-- CODEX — schéma Supabase
--
-- À coller tel quel dans Supabase > SQL Editor > New query, puis Run.
-- Le script est rejouable : le relancer après une modification met à
-- jour les fonctions et les règles sans toucher aux données.
--
-- Tout le contrôle d'accès est ici, pas dans le JS. La clé « anon » du
-- site est publique par construction (elle est dans le dépôt) : c'est
-- la Row Level Security qui décide, ligne par ligne, qui lit et qui
-- écrit. Une règle oubliée ici est une porte ouverte, quel que soit ce
-- que l'interface affiche.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Tables
-- ------------------------------------------------------------

-- La liste blanche. Un compte Supabase sans ligne ici ne voit RIEN :
-- n'importe qui peut recevoir un lien magique, seuls les e-mails
-- listés ouvrent le contenu.
create table if not exists public.membres (
  email     text primary key check (email = lower(email) and email like '%_@_%'),
  role      text not null default 'lecteur' check (role in ('admin', 'editeur', 'lecteur')),
  ajoute_le timestamptz not null default now()
);

-- Arborescence libre : Semestre > Matière > …, sur autant de niveaux
-- que voulu. `restrict` : on ne supprime pas un dossier qui contient
-- encore quelque chose, l'interface le dit au lieu de tout emporter.
create table if not exists public.dossiers (
  id        uuid primary key default gen_random_uuid(),
  parent_id uuid references public.dossiers (id) on delete restrict,
  titre     text not null check (length(btrim(titre)) between 1 and 120),
  cree_le   timestamptz not null default now()
);

create table if not exists public.fiches (
  id         uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references public.dossiers (id) on delete restrict,
  titre      text not null check (length(btrim(titre)) between 1 and 200),
  contenu    text not null default '',
  cree_le    timestamptz not null default now(),
  -- Posés par le déclencheur, jamais par le client : impossible de
  -- signer une modification au nom de quelqu'un d'autre.
  maj_le     timestamptz not null default now(),
  maj_par    text
);

-- Une ressource est SOIT un lien externe, SOIT un fichier du bucket.
create table if not exists public.ressources (
  id       uuid primary key default gen_random_uuid(),
  fiche_id uuid not null references public.fiches (id) on delete cascade,
  type     text not null check (type in ('poly', 'td', 'annale', 'slides', 'video', 'code', 'lien')),
  titre    text not null check (length(btrim(titre)) between 1 and 200),
  url      text check (url ~* '^https?://'),
  fichier  text,
  taille   bigint,
  cree_le  timestamptz not null default now(),
  constraint ressources_lien_ou_fichier check ((url is null) <> (fichier is null))
);

-- Les versions précédentes de chaque fiche, écrites par le
-- déclencheur. Personne n'y écrit directement.
create table if not exists public.revisions (
  id       bigint generated always as identity primary key,
  fiche_id uuid not null references public.fiches (id) on delete cascade,
  titre    text not null,
  contenu  text not null,
  auteur   text,
  cree_le  timestamptz not null
);

create index if not exists dossiers_parent_idx   on public.dossiers (parent_id);
create index if not exists fiches_dossier_idx    on public.fiches (dossier_id);
create index if not exists ressources_fiche_idx  on public.ressources (fiche_id);
create index if not exists revisions_fiche_idx   on public.revisions (fiche_id, cree_le desc);

-- Évolutions, rejouables sur une base déjà créée :
-- une fiche peut vivre à la racine (hors dossier), comme une note Quartz ;
alter table public.fiches alter column dossier_id drop not null;
-- et UNE fiche peut être la note d'accueil (la page d'arrivée du site).
alter table public.fiches add column if not exists accueil boolean not null default false;
create unique index if not exists fiches_une_seule_accueil on public.fiches ((true)) where accueil;
-- L'ordre de lecture (1, 2, 3…) dans un dossier : sans lui, l'explorateur
-- trie par titre et « Chaînage » passe avant « Classes ». NULL = après les
-- éléments numérotés, par titre.
alter table public.dossiers add column if not exists ordre integer;
alter table public.fiches   add column if not exists ordre integer;


-- ------------------------------------------------------------
-- 2. Qui est connecté, et avec quel rôle
-- ------------------------------------------------------------

-- L'e-mail vient de auth.users, pas du jeton : c'est la vérité de la
-- base, et un e-mail non confirmé ne compte pas (un compte créé avec
-- l'adresse de quelqu'un d'autre n'hérite donc pas de ses droits).
create or replace function public.email_courant()
returns text
language sql stable security definer set search_path = ''
as $$
  select lower(u.email)
  from auth.users u
  where u.id = auth.uid() and u.email_confirmed_at is not null
$$;

-- `security definer` : lit `membres` en contournant sa propre RLS,
-- sinon la règle de `membres` qui appelle cette fonction bouclerait
-- sur elle-même.
create or replace function public.role_courant()
returns text
language sql stable security definer set search_path = ''
as $$
  select m.role from public.membres m where m.email = public.email_courant()
$$;

revoke all on function public.email_courant() from public, anon;
revoke all on function public.role_courant()  from public, anon;
grant execute on function public.email_courant() to authenticated;
grant execute on function public.role_courant()  to authenticated;


-- ------------------------------------------------------------
-- 3. Horodatage, signature et historique des fiches
-- ------------------------------------------------------------

create or replace function public.fiches_avant_ecriture()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.maj_le  := now();
  new.maj_par := public.email_courant();

  if tg_op = 'INSERT' then
    new.cree_le := now();
    return new;
  end if;

  new.cree_le := old.cree_le;

  -- Un simple déplacement de dossier ne crée pas de version.
  if new.contenu is distinct from old.contenu or new.titre is distinct from old.titre then
    insert into public.revisions (fiche_id, titre, contenu, auteur, cree_le)
    values (old.id, old.titre, old.contenu, old.maj_par, old.maj_le);

    -- 50 versions par fiche suffisent à rattraper une erreur sans
    -- laisser la table grossir indéfiniment.
    delete from public.revisions r
    where r.fiche_id = old.id
      and r.id not in (
        select k.id from public.revisions k
        where k.fiche_id = old.id
        order by k.cree_le desc, k.id desc
        limit 50
      );
  end if;

  return new;
end
$$;

drop trigger if exists fiches_avant_ecriture on public.fiches;
create trigger fiches_avant_ecriture
  before insert or update on public.fiches
  for each row execute function public.fiches_avant_ecriture();


-- ------------------------------------------------------------
-- 4. Recherche plein texte, insensible aux accents et à la casse
-- ------------------------------------------------------------

-- `translate` plutôt que l'extension unaccent : aucune dépendance, et
-- ça couvre tout ce qu'on tape en français.
create or replace function public.plier(t text)
returns text
language sql immutable parallel safe set search_path = ''
as $$
  select translate(lower(t),
    'àâäáãåçéèêëíìîïñóòôöõúùûüýÿ',
    'aaaaaaceeeeiiiinooooouuuuyy')
$$;

-- `security invoker` : la RLS des fiches s'applique, un non-membre ne
-- trouve rien.
create or replace function public.rechercher(q text)
returns table (id uuid, titre text, dossier_id uuid, extrait text)
language sql stable security invoker set search_path = ''
as $$
  with p as (
    select public.plier(btrim(q)) as brut,
           '%' || replace(replace(replace(public.plier(btrim(q)), '\', '\\'), '%', '\%'), '_', '\_') || '%' as motif
  )
  select f.id, f.titre, f.dossier_id,
         case
           when strpos(public.plier(f.contenu), p.brut) > 0
             then substr(f.contenu, greatest(1, strpos(public.plier(f.contenu), p.brut) - 70), 190)
           else left(f.contenu, 190)
         end
  from public.fiches f, p
  where length(p.brut) >= 2
    and (public.plier(f.titre) like p.motif or public.plier(f.contenu) like p.motif)
  order by (public.plier(f.titre) like p.motif) desc, f.maj_le desc
  limit 20
$$;

revoke all on function public.rechercher(text) from public, anon;
grant execute on function public.rechercher(text) to authenticated;


-- ------------------------------------------------------------
-- 4 bis. Graphe des fiches (liens [[Titre]], façon Quartz)
-- ------------------------------------------------------------
-- Les liens sont extraits ici plutôt que dans le navigateur : le graphe
-- et les rétroliens (« cité par ») n'ont ainsi jamais besoin de
-- télécharger le contenu de toutes les fiches. Un lien vise un TITRE,
-- comparé sans accents ni casse ; `[[Titre|texte]]` et `[[Titre#section]]`
-- visent la même fiche.
create or replace function public.graphe()
returns table (source uuid, cible uuid)
language sql stable security invoker set search_path = ''
as $$
  select distinct f.id, c.id
  from public.fiches f
  cross join lateral regexp_matches(f.contenu, '\[\[([^]|#[:cntrl:]]+)', 'g') as m (t)
  -- rtrim du « \ » : dans un tableau Markdown on écrit [[Titre\|texte]].
  join public.fiches c on public.plier(btrim(c.titre)) = public.plier(btrim(rtrim(m.t[1], '\')))
  where c.id <> f.id
$$;

revoke all on function public.graphe() from public, anon;
grant execute on function public.graphe() to authenticated;

-- Nombre d'exercices corrigés par fiche, pour la page Exercices : on
-- compte les encadrés « corrigé » (::: corrige…, ou succès replié), comme
-- lecture.js qui pose un bouton « fait » sous chacun.
create or replace function public.exercices()
returns table (fiche_id uuid, nombre integer)
language sql stable security invoker set search_path = ''
as $$
  select f.id, count(*)::integer
  from public.fiches f
  cross join lateral regexp_matches(f.contenu,
    '^(:::[ \t]*(corrige|corrigé|correction|solution|reponse|réponse)[+-]?([ \t]|$)|:::[ \t]*succes-|>[ \t]?\[!(corrige|corrigé|correction|solution|reponse|réponse)\]|>[ \t]?\[!(succes|success|check|done)\]-)',
    'gin') as m
  group by f.id
$$;

revoke all on function public.exercices() from public, anon;
grant execute on function public.exercices() to authenticated;

-- Jauge de l'espace de stockage (1 Go sur l'offre gratuite).
create or replace function public.stockage()
returns table (octets bigint, fichiers bigint)
language sql stable security invoker set search_path = ''
as $$
  select coalesce(sum(r.taille), 0)::bigint, count(*)::bigint
  from public.ressources r
  where r.fichier is not null
$$;

revoke all on function public.stockage() from public, anon;
grant execute on function public.stockage() to authenticated;

-- Tags : « #mot » dans le texte d'une fiche (précédé d'un blanc ou en
-- début de ligne, comme dans Obsidian/Quartz). Extraits ici pour que les
-- pages de tag n'aient pas à télécharger toutes les fiches.
create or replace function public.etiquettes()
returns table (fiche_id uuid, tag text)
language sql stable security invoker set search_path = ''
as $$
  select distinct f.id, lower(m.t[1])
  from public.fiches f
  cross join lateral regexp_matches(f.contenu, '(?:^|\s)#([[:alpha:]_][[:alnum:]_/-]*)', 'g') as m (t)
$$;

revoke all on function public.etiquettes() from public, anon;
grant execute on function public.etiquettes() to authenticated;

-- Battement de cœur pour .github/workflows/keep-alive.yml : Supabase met
-- en pause un projet gratuit resté 7 jours sans activité. La fonction ne
-- lit aucune table, elle est donc la seule chose ouverte aux anonymes.
create or replace function public.ping()
returns text
language sql stable set search_path = ''
as $$ select 'ok'::text $$;

revoke all on function public.ping() from public;
grant execute on function public.ping() to anon, authenticated;


-- ------------------------------------------------------------
-- 4 ter. Comptes gérés depuis le site (admin seulement)
-- ------------------------------------------------------------
-- Créer un compte « identifiant + mot de passe » sans e-mail de
-- confirmation, changer un mot de passe, supprimer un compte : trois
-- fonctions appelées depuis la page Membres, sans rien déployer d'autre
-- et sans jamais exposer de clé secrète au navigateur.
--
-- Elles écrivent dans auth.users / auth.identities, les tables internes
-- de Supabase Auth, avec les droits du propriétaire (security definer).
-- C'est la méthode des scripts de « seed » de Supabase ; si une future
-- version d'Auth change ces tables, c'est ici qu'il faudra adapter.
--
-- Garde-fous : appelant admin vérifié à chaque appel, mot de passe haché
-- en bcrypt (coût 10, comme Supabase Auth), pas d'action sur son propre
-- compte, identifiants validés, aucun mot de passe stocké en clair ni
-- renvoyé (il est généré dans le navigateur de l'admin).
--
-- Un identifiant « lea.martin » devient l'adresse technique
-- « lea.martin@codex.invalid » : domaine réservé, aucun e-mail n'y part.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.admin_verifier()
returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if public.role_courant() is distinct from 'admin' then
    raise exception 'Réservé aux admins.' using errcode = '42501';
  end if;
end
$$;

-- « lea.martin » → « lea.martin@codex.invalid » ; un vrai e-mail reste tel quel.
create or replace function public.email_de_compte(p_identifiant text)
returns text
language plpgsql immutable set search_path = ''
as $$
declare v text := lower(btrim(coalesce(p_identifiant, '')));
begin
  if position('@' in v) > 0 then
    if v !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or v like '%@codex.invalid' then
      raise exception 'Adresse e-mail invalide : %', v using errcode = '22023';
    end if;
    return v;
  end if;
  if v !~ '^[a-z0-9][a-z0-9._-]{1,39}$' then
    raise exception 'Identifiant invalide : % (lettres, chiffres, point, tiret, 2 à 40 caractères)', v using errcode = '22023';
  end if;
  return v || '@codex.invalid';
end
$$;

create or replace function public.admin_creer_compte(p_identifiant text, p_mot_de_passe text, p_role text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text;
  v_id uuid := gen_random_uuid();
begin
  perform public.admin_verifier();
  if p_role not in ('admin', 'editeur', 'lecteur') then
    raise exception 'Rôle invalide.' using errcode = '22023';
  end if;
  if length(coalesce(p_mot_de_passe, '')) < 10 then
    raise exception 'Mot de passe trop court (10 caractères minimum).' using errcode = '22023';
  end if;
  v_email := public.email_de_compte(p_identifiant);
  if exists (select 1 from auth.users u where lower(u.email) = v_email) then
    raise exception 'Ce compte existe déjà : %', v_email using errcode = '23505';
  end if;

  -- Les colonnes *_token et email_change doivent valoir '' et non NULL :
  -- Supabase Auth refuse sinon de lire le compte à la connexion.
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, reauthentication_token, phone_change, phone_change_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    extensions.crypt(p_mot_de_passe, extensions.gen_salt('bf', 10)), now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb, '{}'::jsonb, now(), now(),
    '', '', '', '', '', '', '', ''
  );
  insert into auth.identities (user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  values (v_id, v_id::text, 'email',
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
    now(), now(), now());

  insert into public.membres (email, role) values (v_email, p_role)
  on conflict (email) do update set role = excluded.role;
  return v_email;
end
$$;

create or replace function public.admin_mot_de_passe(p_email text, p_mot_de_passe text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.admin_verifier();
  if lower(p_email) = public.email_courant() then
    raise exception 'Pas sur ton propre compte : change ton mot de passe depuis le menu du compte.' using errcode = '22023';
  end if;
  if length(coalesce(p_mot_de_passe, '')) < 10 then
    raise exception 'Mot de passe trop court (10 caractères minimum).' using errcode = '22023';
  end if;
  update auth.users
  set encrypted_password = extensions.crypt(p_mot_de_passe, extensions.gen_salt('bf', 10)), updated_at = now()
  where lower(email) = lower(p_email);
  if not found then
    raise exception 'Aucun compte pour %', p_email using errcode = 'P0002';
  end if;
end
$$;

create or replace function public.admin_supprimer_compte(p_email text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.admin_verifier();
  if lower(p_email) = public.email_courant() then
    raise exception 'Tu ne peux pas supprimer ton propre compte.' using errcode = '22023';
  end if;
  -- D'abord l'accès (effet immédiat grâce à la RLS), ensuite le compte ;
  -- ses sessions et identités partent avec lui (clés étrangères d'Auth).
  delete from public.membres where email = lower(p_email);
  delete from auth.users where lower(email) = lower(p_email);
end
$$;

revoke all on function public.admin_verifier() from public, anon;
revoke all on function public.admin_creer_compte(text, text, text) from public, anon;
revoke all on function public.admin_mot_de_passe(text, text) from public, anon;
revoke all on function public.admin_supprimer_compte(text) from public, anon;
grant execute on function public.admin_creer_compte(text, text, text) to authenticated;
grant execute on function public.admin_mot_de_passe(text, text) to authenticated;
grant execute on function public.admin_supprimer_compte(text) to authenticated;


-- ------------------------------------------------------------
-- 4 quater. Progression : les exercices que chacun a faits
-- ------------------------------------------------------------
-- Une ligne = « ce membre a fait cet exercice de cette fiche ». `cle`
-- repère l'exercice dans la fiche (le titre de sa section + un numéro,
-- calculé par lecture.js). Chacun ne voit, n'ajoute et ne retire QUE ses
-- propres lignes, lecteurs compris : ce n'est pas du contenu, c'est un
-- carnet personnel. Personne d'autre, admin compris, n'y a accès.
-- L'e-mail est posé par défaut par la base (email_courant), et la règle
-- d'ajout refuse toute autre valeur : impossible d'écrire pour autrui.
create table if not exists public.progression (
  email    text not null default public.email_courant()
           references public.membres (email) on delete cascade,
  fiche_id uuid not null references public.fiches (id) on delete cascade,
  cle      text not null check (length(cle) between 1 and 200),
  fait_le  timestamptz not null default now(),
  primary key (email, fiche_id, cle)
);
create index if not exists progression_fiche_idx on public.progression (fiche_id);

alter table public.progression enable row level security;
revoke all on public.progression from anon;
revoke update on public.progression from authenticated;
grant select, insert, delete on public.progression to authenticated;

drop policy if exists "progression_lecture" on public.progression;
create policy "progression_lecture" on public.progression for select to authenticated
  using (email = (select public.email_courant()));

drop policy if exists "progression_ajout" on public.progression;
create policy "progression_ajout" on public.progression for insert to authenticated
  with check (email = (select public.email_courant()) and (select public.role_courant()) is not null);

drop policy if exists "progression_retrait" on public.progression;
create policy "progression_retrait" on public.progression for delete to authenticated
  using (email = (select public.email_courant()));


-- ------------------------------------------------------------
-- 5. Row Level Security
-- ------------------------------------------------------------
-- `(select public.role_courant())` et non `public.role_courant()` : la
-- forme entre parenthèses est évaluée une fois par requête au lieu
-- d'une fois par ligne.

alter table public.membres    enable row level security;
alter table public.dossiers   enable row level security;
alter table public.fiches     enable row level security;
alter table public.ressources enable row level security;
alter table public.revisions  enable row level security;

-- Les visiteurs non connectés n'ont rien à faire ici, même en lecture.
revoke all on public.membres, public.dossiers, public.fiches, public.ressources, public.revisions from anon;

-- Droits de table explicites pour les comptes connectés. Ne pas compter
-- sur ceux que Supabase donne par défaut : l'option « Automatically
-- expose new tables » peut être désactivée (c'est la recommandation), et
-- tout répondrait alors « permission denied ». Ces droits ouvrent la
-- porte ; ce sont les règles RLS ci-dessous qui décident ligne par ligne.
grant select, insert, update, delete on public.membres, public.dossiers, public.fiches, public.ressources to authenticated;
-- L'historique n'est écrit que par le déclencheur (security definer).
revoke insert, update, delete on public.revisions from authenticated;
grant select on public.revisions to authenticated;

-- membres : chacun voit sa propre ligne (pour connaître son rôle),
-- l'admin voit et gère tout — sauf sa propre ligne, pour ne jamais
-- pouvoir s'enfermer dehors ou retirer le dernier admin par mégarde.
drop policy if exists "membres_lecture" on public.membres;
create policy "membres_lecture" on public.membres for select to authenticated
  using (email = (select public.email_courant()) or (select public.role_courant()) = 'admin');

drop policy if exists "membres_ajout" on public.membres;
create policy "membres_ajout" on public.membres for insert to authenticated
  with check ((select public.role_courant()) = 'admin');

drop policy if exists "membres_modif" on public.membres;
create policy "membres_modif" on public.membres for update to authenticated
  using      ((select public.role_courant()) = 'admin' and email <> (select public.email_courant()))
  with check ((select public.role_courant()) = 'admin' and email <> (select public.email_courant()));

drop policy if exists "membres_retrait" on public.membres;
create policy "membres_retrait" on public.membres for delete to authenticated
  using ((select public.role_courant()) = 'admin' and email <> (select public.email_courant()));

-- Contenu : tout membre lit, admin et éditeurs écrivent.
do $$
declare t text;
begin
  foreach t in array array['dossiers', 'fiches', 'ressources'] loop
    execute format('drop policy if exists "%1$s_lecture" on public.%1$I', t);
    execute format($p$create policy "%1$s_lecture" on public.%1$I for select to authenticated
      using ((select public.role_courant()) is not null)$p$, t);

    execute format('drop policy if exists "%1$s_ajout" on public.%1$I', t);
    execute format($p$create policy "%1$s_ajout" on public.%1$I for insert to authenticated
      with check ((select public.role_courant()) in ('admin', 'editeur'))$p$, t);

    execute format('drop policy if exists "%1$s_modif" on public.%1$I', t);
    execute format($p$create policy "%1$s_modif" on public.%1$I for update to authenticated
      using ((select public.role_courant()) in ('admin', 'editeur'))
      with check ((select public.role_courant()) in ('admin', 'editeur'))$p$, t);

    execute format('drop policy if exists "%1$s_retrait" on public.%1$I', t);
    execute format($p$create policy "%1$s_retrait" on public.%1$I for delete to authenticated
      using ((select public.role_courant()) in ('admin', 'editeur'))$p$, t);
  end loop;
end
$$;

-- L'historique ne sert qu'à ceux qui éditent. Aucune règle d'écriture :
-- seul le déclencheur (security definer) y insère.
drop policy if exists "revisions_lecture" on public.revisions;
create policy "revisions_lecture" on public.revisions for select to authenticated
  using ((select public.role_courant()) in ('admin', 'editeur'));


-- ------------------------------------------------------------
-- 6. Stockage des fichiers (polys, annales, slides…)
-- ------------------------------------------------------------
-- Bucket PRIVÉ : les fichiers ne s'ouvrent que par des liens signés,
-- valables une heure, que seul un membre peut obtenir. 50 Mo par
-- fichier, le plafond de l'offre gratuite.

-- Types autorisés : documents, images, archives, texte. Pas de HTML ni de
-- SVG : servis depuis le domaine Supabase, ils pourraient exécuter du
-- script dans le navigateur de qui ouvre le lien.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ressources', 'ressources', false, 52428800, array[
  'application/pdf',
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  'application/zip', 'application/x-zip-compressed',
  'text/plain', 'text/markdown', 'text/csv',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.presentation',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/x-ipynb+json', 'application/json', 'application/octet-stream'
])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "codex_fichiers_lecture" on storage.objects;
create policy "codex_fichiers_lecture" on storage.objects for select to authenticated
  using (bucket_id = 'ressources' and (select public.role_courant()) is not null);

drop policy if exists "codex_fichiers_depot" on storage.objects;
create policy "codex_fichiers_depot" on storage.objects for insert to authenticated
  with check (bucket_id = 'ressources' and (select public.role_courant()) in ('admin', 'editeur'));

drop policy if exists "codex_fichiers_retrait" on storage.objects;
create policy "codex_fichiers_retrait" on storage.objects for delete to authenticated
  using (bucket_id = 'ressources' and (select public.role_courant()) in ('admin', 'editeur'));


-- ------------------------------------------------------------
-- 7. Premier admin
-- ------------------------------------------------------------
-- À exécuter UNE fois, à part, avec ta vraie adresse (celle avec
-- laquelle tu te connecteras) :
--
--   insert into public.membres (email, role) values ('ton.adresse@exemple.fr', 'admin');
--
-- Ensuite, tout le reste (ajouter la promo, nommer des éditeurs) se
-- fait depuis la page Admin du site.

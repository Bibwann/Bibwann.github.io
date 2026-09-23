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
  join public.fiches c on public.plier(btrim(c.titre)) = public.plier(btrim(m.t[1]))
  where c.id <> f.id
$$;

revoke all on function public.graphe() from public, anon;
grant execute on function public.graphe() to authenticated;

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

insert into storage.buckets (id, name, public, file_size_limit)
values ('ressources', 'ressources', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

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

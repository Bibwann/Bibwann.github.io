-- ============================================================
-- CODEX — retirer le contenu d'exemple
--
-- Supprime le dossier racine « Exemple » et TOUT ce qu'il contient
-- (sous-dossiers, fiches, historique, ressources). Rien d'autre.
--
-- Si des fichiers ont été déposés dans ces fiches depuis l'éditeur,
-- supprime-les d'abord depuis l'éditeur (ou Storage > ressources) :
-- effacer une ligne ne supprime pas le fichier stocké.
-- ============================================================

with recursive arbre as (
  select id from public.dossiers where titre = 'Exemple' and parent_id is null
  union all
  select d.id from public.dossiers d join arbre a on d.parent_id = a.id
)
delete from public.fiches where dossier_id in (select id from arbre);

-- Les dossiers, des plus profonds aux plus hauts (la clé étrangère
-- interdit de supprimer un parent avant ses enfants).
do $$
begin
  loop
    delete from public.dossiers d
    where d.id in (
      with recursive arbre as (
        select id from public.dossiers where titre = 'Exemple' and parent_id is null
        union all
        select c.id from public.dossiers c join arbre a on c.parent_id = a.id
      )
      select id from arbre
    )
    and not exists (select 1 from public.dossiers e where e.parent_id = d.id);
    exit when not found;
  end loop;
end
$$;

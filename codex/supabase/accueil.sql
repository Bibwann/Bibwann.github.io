-- ============================================================
-- CODEX — note d'accueil
--
-- Crée la page d'arrivée du site : l'introduction de tous les cours, et
-- le premier nœud du graphe. Elle se modifie ensuite comme n'importe
-- quelle fiche (bouton « Modifier » sur la page d'accueil).
--
-- À coller dans Supabase > SQL Editor > Run, APRÈS schema.sql.
-- Rejouable : s'il existe déjà une note d'accueil, il ne fait rien.
-- Délimiteur $accueil$ : le texte contient des $ (formules LaTeX).
-- ============================================================

do $accueil$
begin
  if exists (select 1 from public.fiches where accueil) then
    raise notice 'Une note d''accueil existe déjà : rien à faire.';
    return;
  end if;

  insert into public.fiches (dossier_id, titre, accueil, contenu) values (null, 'Bienvenue sur Codex', true, $md$
Codex rassemble les cours de la promo au même endroit : **une fiche par chapitre**, un résumé clair au centre, et à côté toutes ses ressources — polys, TD et corrigés, annales, slides, vidéos, code. Les fiches se citent entre elles et forment un réseau : le graphe, à droite, en donne la carte. #accueil

> [!tip] Par où commencer
> Ouvre un dossier dans l'**explorateur** à gauche, ou cherche directement une notion avec la touche `/`. Pour voir à quoi ressemble une fiche complète : [[Transformée de Laplace]] (dans le dossier Exemple).

## Lire une fiche

Chaque fiche suit la même forme : une vue d'ensemble, les définitions et théorèmes, la méthode pour les exercices, un exemple corrigé, les pièges.

- **À droite**, les *ressources* de la fiche, rangées par type, puis le *graphe* des fiches voisines, le *sommaire* (les titres à l'écran restent nets, les autres s'estompent) et *Cité par* : les fiches qui renvoient vers celle-ci.
- **Survoler** un lien vers une autre fiche en montre un aperçu, sans quitter la page.
- Le bouton **livre** à côté de la recherche passe en *mode lecture* : il ne reste que le texte. Échap pour revenir.
- Le **soleil / la lune** change de thème.

> [!info]- Les raccourcis (cliquer pour déplier)
> - `/` ou `Ctrl` `K` : rechercher dans tous les cours, avec l'aperçu du résultat.
> - `Ctrl` `S` : enregistrer une fiche dans l'éditeur.
> - Échap : fermer la recherche, quitter le mode lecture.

## Écrire une fiche

Les fiches s'écrivent en **Markdown** — c'est ce que produisent les IA. Le bouton *Consigne IA* de l'éditeur copie une consigne toute prête : colle-la dans ton IA avec le cours, puis colle la réponse dans l'éditeur.

| Écrire | Pour obtenir |
|---|---|
| `## Titre` | une partie (elle apparaît dans le sommaire) |
| `$e^{i\pi} + 1 = 0$` | une formule dans le texte : $e^{i\pi} + 1 = 0$ |
| `$$\int_0^1 f$$` seule sur sa ligne | une formule centrée |
| `[[Titre d'une fiche]]` | un lien vers une autre fiche (il nourrit le graphe) |
| `#maths` | un tag, cliquable, qui regroupe les fiches |
| `> [!definition] Titre` | un encadré (voir ci-dessous) |

Les encadrés reprennent la syntaxe d'Obsidian. Un `-` après le type les replie :

> [!definition] Définition
> Pour poser une notion. Aussi : `theoreme`, `propriete`, `methode`, `exemple`.

> [!attention] Attention
> Pour les pièges d'examen. Aussi : `astuce`, `question`, `danger`, `citation`.

> [!exemple]- Un exemple replié
> $$\sum_{k=1}^{n} k = \frac{n(n+1)}{2}$$

## Qui fait quoi

- Les **lecteurs** lisent tout.
- Les **éditeurs** écrivent les fiches et déposent les fichiers ; les PDF sont compressés avant l'envoi.
- Les **admins** créent les comptes depuis la page *Membres*.

Chaque modification garde la version précédente : rien ne se perd, l'historique de chaque fiche est dans l'éditeur.
$md$);

  raise notice 'Note d''accueil créée.';
end
$accueil$;

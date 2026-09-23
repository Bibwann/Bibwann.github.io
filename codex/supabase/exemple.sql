-- ============================================================
-- CODEX — contenu d'exemple
--
-- Un petit cours fictif pour voir l'arborescence, les liens [[…]], le
-- graphe, les encadrés et les ressources avant d'avoir les vrais cours.
-- Tout est rangé dans un dossier racine « Exemple » : le script
-- exemple-retirer.sql l'efface d'un coup, sans toucher au reste.
--
-- À coller dans Supabase > SQL Editor > Run, APRÈS schema.sql.
-- Rejouable : s'il existe déjà un dossier « Exemple », il ne fait rien.
-- Délimiteur $exemple$ et non $$ : les formules LaTeX des fiches contiennent
-- des $$, qui fermeraient le bloc en plein milieu.
-- ============================================================

do $exemple$
declare
  racine uuid; maths uuid; info uuid;
  laplace uuid; equadiff uuid; complexite uuid; tri uuid;
begin
  if exists (select 1 from public.dossiers where titre = 'Exemple' and parent_id is null) then
    raise notice 'Le dossier « Exemple » existe déjà : rien à faire.';
    return;
  end if;

  insert into public.dossiers (titre) values ('Exemple') returning id into racine;
  insert into public.dossiers (titre, parent_id) values ('Mathématiques', racine) returning id into maths;
  insert into public.dossiers (titre, parent_id) values ('Informatique', racine) returning id into info;

  -- ---------- Mathématiques ----------
  insert into public.fiches (dossier_id, titre, contenu) values (maths, 'Équations différentielles', $md$
## Vue d'ensemble

Une équation différentielle linéaire du premier ordre à coefficients constants s'écrit $y' + a\,y = f(t)$. On la résout en deux temps : la solution de l'équation homogène, puis une solution particulière. Pour les ordres supérieurs, la [[Transformée de Laplace]] transforme le problème en calcul algébrique.

## Définitions et théorèmes

::: definition Équation homogène associée
L'équation $y' + a\,y = 0$, dont les solutions sont $y_h(t) = C\,e^{-a t}$, $C \in \R$.
:::

::: theoreme Structure des solutions
Toute solution s'écrit $y = y_h + y_p$, où $y_p$ est **une** solution particulière.
:::

## Méthode

::: methode Résoudre $y' + a\,y = f(t)$
1. Écrire $y_h(t) = C e^{-at}$.
2. Chercher $y_p$ de la même forme que $f$ (constante, polynôme, exponentielle).
3. Utiliser la condition initiale $y(0)$ pour trouver $C$.
:::

::: attention Piège classique
La constante $C$ se détermine **à la fin**, sur $y_h + y_p$, pas sur $y_h$ seule.
:::
$md$) returning id into equadiff;

  insert into public.fiches (dossier_id, titre, contenu) values (maths, 'Transformée de Laplace', $md$
## Vue d'ensemble

La transformée de Laplace associe à une fonction causale $f(t)$ la fonction

$$F(p) = \int_0^{+\infty} f(t)\,e^{-pt}\,dt$$

Son intérêt : une dérivée devient une multiplication par $p$. Une [[Équations différentielles|équation différentielle]] devient une équation algébrique, qu'on résout puis qu'on « retransforme ».

## Propriétés essentielles

::: propriete Linéarité et dérivation
$\mathcal{L}[a f + b g] = a F + b G$ et $\mathcal{L}[f'] = p\,F(p) - f(0^+)$
:::

| $f(t)$ | $F(p)$ |
|---|---|
| $1$ (échelon) | $\dfrac{1}{p}$ |
| $e^{-at}$ | $\dfrac{1}{p+a}$ |
| $t$ | $\dfrac{1}{p^2}$ |
| $\sin(\omega t)$ | $\dfrac{\omega}{p^2+\omega^2}$ |

::: theoreme Valeur finale
Si la limite existe : $\displaystyle \lim_{t \to +\infty} f(t) = \lim_{p \to 0} p\,F(p)$
:::

## Exemple corrigé

::: exemple $y' + 2y = 1$, $y(0) = 0$
On transforme : $pY + 2Y = \dfrac{1}{p}$, donc $Y(p) = \dfrac{1}{p(p+2)} = \dfrac{1}{2}\left(\dfrac{1}{p} - \dfrac{1}{p+2}\right)$.

D'où $y(t) = \dfrac{1}{2}\left(1 - e^{-2t}\right)$. Valeur finale : $\tfrac12$, cohérent avec le théorème.
:::
$md$) returning id into laplace;

  -- ---------- Informatique ----------
  insert into public.fiches (dossier_id, titre, contenu) values (info, 'Complexité des algorithmes', $md$
## Vue d'ensemble

La complexité mesure comment le coût d'un algorithme (nombre d'opérations, mémoire) grandit avec la taille $n$ de l'entrée. On la note avec $O(\cdot)$ et on s'intéresse d'abord au **pire cas**.

::: definition Notation $O$
$f(n) = O(g(n))$ s'il existe $c > 0$ et $n_0$ tels que $f(n) \le c\,g(n)$ pour tout $n \ge n_0$.
:::

| Classe | Exemple | $n = 10^6$ |
|---|---|---|
| $O(1)$ | accès à un tableau | instantané |
| $O(\log n)$ | recherche dichotomique | ~20 étapes |
| $O(n \log n)$ | [[Algorithmes de tri\|tri fusion]] | ~$2 \cdot 10^7$ |
| $O(n^2)$ | tri par insertion | ~$10^{12}$ : trop lent |

::: astuce Réflexe
Deux boucles imbriquées sur $n$ : pensez $O(n^2)$. Une boucle qui divise $n$ par deux : $O(\log n)$.
:::
$md$) returning id into complexite;

  insert into public.fiches (dossier_id, titre, contenu) values (info, 'Algorithmes de tri', $md$
## Vue d'ensemble

Trier, c'est ranger $n$ éléments. Aucun tri par comparaisons ne fait mieux que $O(n \log n)$ dans le pire cas : voir [[Complexité des algorithmes]].

## Tri fusion

::: methode Diviser pour régner
1. Couper le tableau en deux moitiés.
2. Trier chaque moitié (récursivement).
3. Fusionner les deux moitiés triées en un parcours.
:::

```python
def tri_fusion(t):
    if len(t) <= 1:
        return t
    m = len(t) // 2
    g, d = tri_fusion(t[:m]), tri_fusion(t[m:])
    res = []
    while g and d:
        res.append(g.pop(0) if g[0] <= d[0] else d.pop(0))
    return res + g + d
```

::: danger Piège
`pop(0)` coûte $O(n)$ en Python : pour rester en $O(n \log n)$, avancer avec deux indices plutôt que vider les listes.
:::
$md$) returning id into tri;

  -- ---------- Ressources (liens publics ; les fichiers se déposent depuis l'éditeur) ----------
  insert into public.ressources (fiche_id, type, titre, url) values
    (laplace,    'poly',  'Transformation de Laplace (Wikipédia)', 'https://fr.wikipedia.org/wiki/Transformation_de_Laplace'),
    (laplace,    'lien',  'Table des transformées usuelles',       'https://fr.wikipedia.org/wiki/Transformation_de_Laplace#Table_des_transform%C3%A9es_de_Laplace_usuelles'),
    (equadiff,   'poly',  'Équation différentielle linéaire (Wikipédia)', 'https://fr.wikipedia.org/wiki/%C3%89quation_diff%C3%A9rentielle_lin%C3%A9aire'),
    (complexite, 'poly',  'Analyse de la complexité (Wikipédia)',  'https://fr.wikipedia.org/wiki/Analyse_de_la_complexit%C3%A9_des_algorithmes'),
    (tri,        'lien',  'Tri fusion (Wikipédia)',                'https://fr.wikipedia.org/wiki/Tri_fusion'),
    (tri,        'code',  'Visualisation des tris (VisuAlgo)',     'https://visualgo.net/fr/sorting');

  raise notice 'Exemple créé : 3 dossiers, 4 fiches, 6 ressources.';
end
$exemple$;

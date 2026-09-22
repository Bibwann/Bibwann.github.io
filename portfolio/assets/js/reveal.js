/* ============================================================
   reveal.js — les entrées de contenu.

   Remplace AOS, qui faisait un « fade-up » identique sur les 26
   blocs de la page : tout arrivait du même côté, au même rythme,
   et ça finissait par sentir la transition PowerPoint.

   Ici chaque bloc déclare d'où il vient :

     data-reveal="left | right | up | scale | mask"
     data-reveal-delay="120"        (ms, optionnel)

   Un seul IntersectionObserver, une seule transition composée
   (translate + opacity, jamais de `top`/`margin` qui repeignent),
   et la classe est posée une fois pour toutes : un bloc déjà vu
   ne rejoue pas son entrée quand on remonte. C'est ce qui fait la
   différence entre « animé » et « agité ».
   ============================================================ */
(function () {
   "use strict";

   const blocs = Array.prototype.slice.call(document.querySelectorAll("[data-reveal]"));
   if (!blocs.length) return;

   const sansMouvement = window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

   // Mouvement réduit demandé : on affiche tout, sans jamais animer.
   if (sansMouvement || !("IntersectionObserver" in window)) {
      blocs.forEach(el => el.classList.add("revele"));
      return;
   }

   blocs.forEach(el => el.classList.add("a-reveler"));

   // Décalage : celui écrit sur l'élément, sinon un petit échelonnement
   // entre voisins immédiats pour que les grilles se remplissent en cascade
   // au lieu d'apparaître d'un bloc.
   function delai(el, rang) {
      const dec = parseInt(el.getAttribute("data-reveal-delay"), 10);
      if (!isNaN(dec)) return dec;
      return Math.min(rang, 4) * 70;
   }

   const obs = new IntersectionObserver(function (entrees) {
      // Les éléments qui entrent ensemble sont ordonnés de haut en bas
      // pour que la cascade suive la lecture, pas l'ordre du DOM.
      const visibles = entrees
         .filter(e => e.isIntersecting)
         .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

      visibles.forEach(function (e, i) {
         const el = e.target;
         const d = delai(el, i);
         if (d > 0) el.style.transitionDelay = d + "ms";
         el.classList.add("revele");
         el.classList.remove("a-reveler");
         obs.unobserve(el);
         // Le délai a servi une fois ; on le retire pour que les
         // transitions de survol de l'élément ne soient pas retardées.
         window.setTimeout(function () { el.style.transitionDelay = ""; }, d + 900);
      });
   }, {
      // Se déclenche quand le bloc a franchi le bas de l'écran d'environ 12 %,
      // donc pendant que le regard y arrive — pas une fois qu'il est passé.
      rootMargin: "0px 0px -12% 0px",
      threshold: 0.08
   });

   blocs.forEach(el => obs.observe(el));
})();

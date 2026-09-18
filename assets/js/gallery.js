/* ============================================================
   gallery.js — tout ce qui s'ouvre et se filtre
   • Filtres de la grille de projets (vanilla, sans Isotope)
   • Dépliage de l'archive
   • Fiche projet en fenêtre modale (avec la VRAIE capture)
   • Vitrines : aperçus iframe mis à l'échelle + ouverture plein écran
   ============================================================ */
(function () {
   "use strict";

   const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
   const $ = (sel, racine) => (racine || document).querySelector(sel);
   const $$ = (sel, racine) => Array.from((racine || document).querySelectorAll(sel));

   /* ---------------------------------------------------------
      1. Filtres de la grille de projets
      --------------------------------------------------------- */
   const filtres = $$(".filtres li");
   const cartes = $$(".carte-projet");

   filtres.forEach(function (bouton) {
      bouton.addEventListener("click", function () {
         filtres.forEach(f => f.classList.remove("actif"));
         bouton.classList.add("actif");
         const cible = bouton.getAttribute("data-filtre");

         cartes.forEach(function (carte, i) {
            const cats = (carte.getAttribute("data-cat") || "").split(/\s+/);
            const garde = cible === "*" || cats.indexOf(cible) !== -1;
            carte.classList.toggle("masquee", !garde);
            // Re-jouer l'entrée en cascade : sans ça le filtrage donne un
            // remplissage instantané qui fait sauter la grille d'un bloc.
            if (garde && !reduit) {
               carte.style.animation = "none";
               // Forcer un reflow pour que l'animation reparte vraiment.
               void carte.offsetWidth;
               carte.style.animation = "carte-entre .45s cubic-bezier(.22,1,.36,1) " + (i % 8) * 45 + "ms both";
            }
         });
      });
   });

   /* ---------------------------------------------------------
      2. Archive dépliable
      --------------------------------------------------------- */
   const bascule = $("#archive-bascule");
   const liste = $("#archive-liste");

   if (bascule && liste) {
      bascule.addEventListener("click", function () {
         const ouvert = bascule.getAttribute("aria-expanded") === "true";
         bascule.setAttribute("aria-expanded", String(!ouvert));
         liste.hidden = ouvert;
         bascule.classList.toggle("ouvert", !ouvert);
         const libelle = $("span", bascule);
         if (libelle) {
            const cle = ouvert ? "archive_open" : "archive_close";
            libelle.setAttribute("data-i18n", cle);
            if (window.traduire) libelle.innerHTML = window.traduire(cle, libelle.innerHTML);
         }
      });
   }

   /* ---------------------------------------------------------
      3. Fenêtres modales — ouverture, fermeture, focus
      --------------------------------------------------------- */
   let dernierFocus = null;

   function ouvrir(modale) {
      dernierFocus = document.activeElement;
      modale.hidden = false;
      document.body.classList.add("modale-ouverte");
      // Laisser le navigateur peindre l'état initial avant d'animer.
      requestAnimationFrame(() => modale.classList.add("visible"));
      const premier = modale.querySelector("button, a, iframe");
      if (premier) premier.focus({ preventScroll: true });
   }

   function fermer(modale) {
      modale.classList.remove("visible");
      const fin = function () {
         modale.hidden = true;
         if (modale.id === "modale-site") {
            // Couper le site : sinon il continue de tourner derrière.
            const cadre = $("#site-iframe");
            if (cadre) cadre.src = "";
         }
      };
      if (reduit) fin();
      else setTimeout(fin, 240);
      document.body.classList.remove("modale-ouverte");
      if (dernierFocus) dernierFocus.focus({ preventScroll: true });
   }

   $$(".modale").forEach(function (modale) {
      $$("[data-fermer]", modale).forEach(function (el) {
         el.addEventListener("click", () => fermer(modale));
      });
   });

   document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      const ouverte = $$(".modale").find(m => !m.hidden);
      if (ouverte) fermer(ouverte);
   });

   /* ---------------------------------------------------------
      4. Fiche projet
      La fiche est construite À PARTIR de la carte : titre, texte et
      liens sont déjà traduits dans le DOM, donc rien n'est à dupliquer
      dans les fichiers de langue.
      --------------------------------------------------------- */
   const modaleProjet = $("#modale-projet");

   function ouvrirProjet(carte) {
      if (!modaleProjet) return;

      const shot = carte.getAttribute("data-shot");
      const vignette = $(".carte-vignette img", carte);
      const img = $("#modale-projet-img");
      img.src = shot || (vignette ? vignette.src : "");
      img.alt = $("h4", carte) ? $("h4", carte).textContent : "";
      img.classList.toggle("est-motif", !shot);

      $("#modale-projet-titre").textContent = $("h4", carte).textContent;
      $("#modale-projet-desc").textContent = $(".carte-corps p", carte).textContent;

      const stack = $("#modale-projet-stack");
      stack.innerHTML = "";
      const etiquette = $(".carte-etiquette", carte);
      if (etiquette) {
         const e = document.createElement("span");
         e.className = "principale";
         e.textContent = etiquette.textContent;
         stack.appendChild(e);
      }
      $$(".carte-stack span", carte).forEach(function (s) {
         stack.appendChild(s.cloneNode(true));
      });

      const actions = $("#modale-projet-actions");
      actions.innerHTML = "";
      $$(".carte-actions > *", carte).forEach(function (a) {
         actions.appendChild(a.cloneNode(true));
      });

      ouvrir(modaleProjet);
   }

   cartes.forEach(function (carte) {
      carte.addEventListener("click", function (e) {
         // Un clic sur « Jouer » ou « Github » doit suivre le lien, pas ouvrir la fiche.
         if (e.target.closest("a, button")) return;
         ouvrirProjet(carte);
      });
      carte.addEventListener("keydown", function (e) {
         if (e.key === "Enter" || e.key === " ") {
            if (e.target.closest("a, button")) return;
            e.preventDefault();
            ouvrirProjet(carte);
         }
      });
   });

   /* ---------------------------------------------------------
      5. Vitrines
      --------------------------------------------------------- */
   const LARGEUR_RENDU = 1280;   // largeur à laquelle l'aperçu est rendu
   const HAUTEUR_RENDU = 860;

   const vitrines = $$(".vitrine");

   // Mettre l'aperçu à l'échelle : l'iframe est rendue en 1280 de large puis
   // réduite, pour que la miniature soit le vrai site et non une capture.
   function mettreALEchelle(vitrine) {
      const cadre = $(".vitrine-cadre", vitrine);
      const cadreIframe = $("iframe", vitrine);
      if (!cadre || !cadreIframe) return;
      const k = cadre.clientWidth / LARGEUR_RENDU;
      cadreIframe.style.width = LARGEUR_RENDU + "px";
      cadreIframe.style.height = HAUTEUR_RENDU + "px";
      cadreIframe.style.transform = "scale(" + k + ")";
      cadre.style.height = Math.round(HAUTEUR_RENDU * k) + "px";
   }

   // Ne charger les cinq sites que lorsqu'on approche de la section : cinq
   // iframes au chargement de la page, ce serait cinq sites de plus à payer
   // avant même que le visiteur ait scrollé.
   // Huit demos, huit documents complets, chacun avec ses propres polices
   // distantes et son propre JS — le tout par-dessus une scene WebGL qui
   // tourne deja a 60 images par seconde. Les garder toutes allumees en
   // meme temps faisait ramer la page entiere.
   //
   // On les recycle donc : au plus PLAFOND apercus vivants a la fois, les
   // plus proches du centre de l'ecran. Ceux qui s'eloignent sont eteints
   // (src vide = document detruit, JS arrete, polices liberees) et se
   // rallument tout seuls si on revient dessus. Le visiteur n'en voit que
   // deux ou trois a la fois de toute facon.
   const PLAFOND = 3;

   function allumer(vitrine) {
      const cadreIframe = $("iframe", vitrine);
      if (!cadreIframe || cadreIframe.getAttribute("src")) return;
      // L'echelle ne depend que de la largeur de la carte, pas du contenu :
      // on la pose AVANT le chargement.
      mettreALEchelle(vitrine);
      cadreIframe.setAttribute("src", cadreIframe.getAttribute("data-src"));
      cadreIframe.addEventListener("load", () => mettreALEchelle(vitrine), { once: true });
      vitrine.classList.remove("en-veille");
   }

   function eteindre(vitrine) {
      const cadreIframe = $("iframe", vitrine);
      if (!cadreIframe || !cadreIframe.getAttribute("src")) return;
      cadreIframe.removeAttribute("src");
      vitrine.classList.add("en-veille");
   }

   function arbitrer() {
      const milieu = window.innerHeight / 2;
      // Distance au centre de l'ecran : c'est ce que le visiteur regarde.
      const classees = vitrines.map(function (v) {
         const r = v.getBoundingClientRect();
         return { v: v, d: Math.abs((r.top + r.bottom) / 2 - milieu), visible: r.bottom > -400 && r.top < window.innerHeight + 700 };
      }).sort(function (a, b) { return a.d - b.d; });

      let allumees = 0;
      classees.forEach(function (o) {
         if (o.visible && allumees < PLAFOND) { allumer(o.v); allumees++; }
         else eteindre(o.v);
      });
   }

   window.addEventListener("scroll", arbitrer, { passive: true });
   window.addEventListener("resize", arbitrer);
   window.addEventListener("load", arbitrer);
   arbitrer();

   // Filet de securite. S'appuyer sur « scroll » + « load » ne suffit pas :
   // la position des vitrines bouge encore apres l'execution du script
   // (polices distantes, vignettes, mise en page du voyage 3D), et si
   // « load » tarde — une ressource CDN lente, par exemple — aucun apercu ne
   // se charge et les cadres restent vides. On re-teste donc la position a
   // chaque frame pendant quelques secondes, puis on arrete.
   const finFilet = Date.now() + 8000;
   (function filet() {
      if (Date.now() > finFilet) return;
      arbitrer();
      requestAnimationFrame(filet);
   })();

   let minuteurTaille;
   window.addEventListener("resize", function () {
      clearTimeout(minuteurTaille);
      minuteurTaille = setTimeout(function () {
         verifierApproche();
         vitrines.forEach(mettreALEchelle);
      }, 150);
   });

   const modaleSite = $("#modale-site");

   function ouvrirSite(vitrine) {
      if (!modaleSite) return;
      const url = vitrine.getAttribute("data-site");
      const titre = $(".vitrine-pied h4", vitrine);
      $("#site-nom").textContent = titre ? titre.textContent : "";
      $("#site-onglet").href = url;
      const scene = $(".site-scene");
      scene.style.setProperty("--largeur-site", "100%");
      $$(".site-tailles button").forEach(b => b.classList.toggle("actif", b.getAttribute("data-largeur") === "100%"));
      $("#site-iframe").src = url;
      ouvrir(modaleSite);
   }

   vitrines.forEach(function (vitrine) {
      vitrine.addEventListener("click", function (e) {
         if (e.target.closest("a")) return;
         ouvrirSite(vitrine);
      });
      vitrine.addEventListener("keydown", function (e) {
         if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ouvrirSite(vitrine); }
      });
   });

   $$(".site-tailles button").forEach(function (bouton) {
      bouton.addEventListener("click", function () {
         $$(".site-tailles button").forEach(b => b.classList.remove("actif"));
         bouton.classList.add("actif");
         const scene = $(".site-scene");
         if (scene) scene.style.setProperty("--largeur-site", bouton.getAttribute("data-largeur"));
      });
   });
})();

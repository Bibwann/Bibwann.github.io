/* Thème posé avant le premier rendu (script synchrone dans le <head>) :
   chargé avec le reste, la page s'afficherait une fraction de seconde
   dans le mauvais thème. Préférence enregistrée > réglage du système. */
(function () {
  // Anti-clickjacking : GitHub Pages ne permet pas d'envoyer l'en-tête
  // frame-ancestors / X-Frame-Options. Si la page est chargée dans un
  // cadre (site tiers qui ferait cliquer à l'aveugle), on la masque et
  // on tente d'en sortir.
  if (window.top !== window.self) {
    document.documentElement.style.display = "none";
    try { window.top.location = window.self.location.href; } catch (e) { /* cadre d'une autre origine */ }
    return;
  }
  var t = null;
  try { t = localStorage.getItem("codex.theme"); } catch (e) { /* stockage bloqué */ }
  if (t !== "clair" && t !== "sombre") {
    t = window.matchMedia && matchMedia("(prefers-color-scheme: light)").matches ? "clair" : "sombre";
  }
  document.documentElement.setAttribute("data-theme", t);
})();

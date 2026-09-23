/* Thème posé avant le premier rendu (script synchrone dans le <head>) :
   chargé avec le reste, la page s'afficherait une fraction de seconde
   dans le mauvais thème. Préférence enregistrée > réglage du système. */
(function () {
  var t = null;
  try { t = localStorage.getItem("codex.theme"); } catch (e) { /* stockage bloqué */ }
  if (t !== "clair" && t !== "sombre") {
    t = window.matchMedia && matchMedia("(prefers-color-scheme: light)").matches ? "clair" : "sombre";
  }
  document.documentElement.setAttribute("data-theme", t);
})();

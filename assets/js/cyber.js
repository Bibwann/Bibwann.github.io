/* ============================================================
   cyber.js — UI interactions for the Deep Cyber theme
   • Sliding nav indicator (follows the active dock link)
   • 3D tilt + glare on .tilt-card
   • Top scroll-progress bar
   ============================================================ */
(function () {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Scroll progress bar ---------- */
  const bar = document.getElementById("scroll-progress");
  let progressTicking = false;

  function updateProgress() {
    progressTicking = false;
    if (!bar) return;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const p = max > 0 ? (window.scrollY / max) * 100 : 0;
    bar.style.width = p + "%";
  }

  /* ---------- Sliding nav indicator ---------- */
  const navUl = document.querySelector("#navmenu > ul");
  const indicator = navUl ? navUl.querySelector(".nav-indicator") : null;

  function updateIndicator() {
    if (!navUl || !indicator) return;
    // The dock collapses into a full-screen menu under 1200px — hide the pill there.
    if (window.innerWidth < 1200) {
      indicator.classList.remove("visible");
      return;
    }
    const active = navUl.querySelector("a.active");
    if (!active) {
      indicator.classList.remove("visible");
      return;
    }
    const ulRect = navUl.getBoundingClientRect();
    const aRect = active.getBoundingClientRect();
    indicator.style.width = aRect.width + "px";
    indicator.style.transform = "translateX(" + (aRect.left - ulRect.left) + "px)";
    indicator.classList.add("visible");
  }

  let navTicking = false;
  function onScroll() {
    if (!progressTicking) {
      progressTicking = true;
      requestAnimationFrame(updateProgress);
    }
    if (!navTicking) {
      navTicking = true;
      requestAnimationFrame(function () {
        navTicking = false;
        updateIndicator();
      });
    }
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", function () { updateProgress(); updateIndicator(); });
  window.addEventListener("load", function () {
    updateProgress();
    updateIndicator();
    // Recompute once fonts have settled (their width shifts the links).
    setTimeout(updateIndicator, 400);
  });

  // Update the pill right after clicking a dock link.
  document.querySelectorAll("#navmenu a").forEach(function (a) {
    a.addEventListener("click", function () { setTimeout(updateIndicator, 60); });
  });

  // Reposition after a language switch (link labels change width).
  document.querySelectorAll(".lang-item").forEach(function (item) {
    item.addEventListener("click", function () { setTimeout(updateIndicator, 250); });
  });

  // First paint
  updateProgress();
  updateIndicator();

  /* ---------- 3D tilt + glare ---------- */
  const canTilt = window.matchMedia("(hover: hover) and (pointer: fine)").matches && !reduceMotion;

  if (canTilt) {
    const MAX = 7; // degrees
    document.querySelectorAll(".tilt-card").forEach(function (card) {
      card.addEventListener("pointerenter", function () {
        card.style.transition = "transform 0.08s ease-out";
      });

      card.addEventListener("pointermove", function (e) {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;   // 0..1
        const py = (e.clientY - r.top) / r.height;   // 0..1
        const rx = (0.5 - py) * MAX * 2;
        const ry = (px - 0.5) * MAX * 2;
        card.style.transform =
          "perspective(900px) rotateX(" + rx.toFixed(2) + "deg) rotateY(" + ry.toFixed(2) + "deg) scale(1.02)";
        card.style.setProperty("--mx", (px * 100).toFixed(1) + "%");
        card.style.setProperty("--my", (py * 100).toFixed(1) + "%");
      });

      card.addEventListener("pointerleave", function () {
        card.style.transition = "transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)";
        card.style.transform = "";
      });
    });
  }
})();

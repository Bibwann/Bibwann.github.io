/* ============================================================
   CODEX — membres (admin)
   La liste blanche d'e-mails et leurs rôles. Ajouter quelqu'un ne lui
   envoie rien : il se connecte lui-même sur Codex avec cette adresse,
   et son compte ouvre alors le contenu.
   ============================================================ */
(function (C) {
  "use strict";
  var h = C.h, icone = C.icone;

  var RE_EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

  function vue(el) {
    if (!C.estAdmin()) { location.hash = "#/"; return; }
    document.title = "Membres · Codex";
    el.appendChild(C.chargement("Chargement des membres…"));
    Promise.all([C.api.membres(), C.api.stockage().catch(function () { return null; })]).then(function (r) {
      if (!el.isConnected) return;
      C.vider(el);
      construire(el, r[0], r[1]);
    }).catch(function (e) {
      C.vider(el);
      el.appendChild(C.etatVide("exclamation-octagon", "Impossible de charger les membres", e.message));
    });
  }

  function construire(el, membres, stockage) {
    var moi = C.etat.email;
    var corpsTable = h("tbody");
    var compteurs = h("p.admin-compteurs");

    function majCompteurs() {
      var n = { admin: 0, editeur: 0, lecteur: 0 };
      membres.forEach(function (m) { n[m.role]++; });
      C.vider(compteurs).appendChild(document.createTextNode(
        membres.length + " membre(s) : " + n.admin + " admin, " + n.editeur + " éditeur(s), " + n.lecteur + " lecteur(s)"));
    }

    function ligne(m) {
      var soi = m.email === moi;
      var role = h("select.champ.champ-select.champ-compact", { "aria-label": "Rôle de " + m.email, disabled: soi },
        Object.keys(C.ROLES).map(function (r) { return h("option", { value: r, selected: r === m.role }, C.ROLES[r]); }));
      role.addEventListener("change", function () {
        var ancien = m.role;
        C.api.changerRole(m.email, role.value).then(function () {
          m.role = role.value;
          majCompteurs();
          C.toast(m.email + " est maintenant " + C.ROLES[m.role].toLowerCase() + ".", "ok");
        }).catch(function (e) { role.value = ancien; C.toast(e.message, "erreur"); });
      });
      var retirer = h("button.btn.btn-mini.btn-fantome.btn-danger-texte", {
        type: "button", disabled: soi, title: soi ? "Tu ne peux pas te retirer toi-même" : "Retirer l'accès",
        "aria-label": "Retirer " + m.email
      }, icone("person-dash"));
      retirer.addEventListener("click", function () {
        C.dialogue({
          titre: "Retirer l'accès de " + m.email + " ?",
          texte: "Son compte existera toujours, mais n'ouvrira plus rien sur Codex.",
          confirmer: "Retirer", danger: true
        }).then(function (ok) {
          if (!ok) return;
          C.api.retirerMembre(m.email).then(function () {
            membres = membres.filter(function (x) { return x.email !== m.email; });
            dessiner();
            C.toast("Accès retiré.", "ok");
          }).catch(function (e) { C.toast(e.message, "erreur"); });
        });
      });
      return h("tr",
        h("td.admin-email", m.email, soi ? h("span.pastille.pastille-accent", "toi") : null),
        h("td", role),
        h("td.admin-date", C.dateRelative(m.ajoute_le)),
        h("td.admin-actions", retirer));
    }

    function dessiner() {
      C.vider(corpsTable);
      C.trier(membres, "email").forEach(function (m) { corpsTable.appendChild(ligne(m)); });
      majCompteurs();
    }

    // ---- Ajout en masse : une adresse par ligne, ou séparées par des
    // virgules — la liste de la promo se colle telle quelle. ----
    var zone = h("textarea.champ", { rows: 4, placeholder: "prenom.nom@etu.univ.fr\nautre.personne@etu.univ.fr\n…", "aria-label": "Adresses e-mail à ajouter" });
    var roleAjout = h("select.champ.champ-select", { "aria-label": "Rôle des nouveaux membres" },
      h("option", { value: "lecteur" }, "Lecteur : lit tout"),
      h("option", { value: "editeur" }, "Éditeur : écrit et dépose des fichiers"),
      h("option", { value: "admin" }, "Admin : gère aussi les membres"));
    var form = h("form.admin-ajout",
      h("label.champ-label", { for: "admin-emails" }, "Ajouter des membres"),
      zone, h("div.admin-ajout-bas", roleAjout, h("button.btn.btn-primaire", { type: "submit" }, icone("person-plus"), "Ajouter")));
    zone.id = "admin-emails";
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var brut = zone.value.split(/[\s,;]+/).map(function (x) { return x.trim().toLowerCase(); }).filter(Boolean);
      var invalides = brut.filter(function (x) { return !RE_EMAIL.test(x); });
      var emails = brut.filter(function (x, i) { return RE_EMAIL.test(x) && brut.indexOf(x) === i; });
      if (invalides.length) { C.toast("Adresse(s) invalide(s) : " + invalides.slice(0, 3).join(", "), "erreur"); return; }
      if (!emails.length) { zone.focus(); return; }
      var dejaLa = emails.filter(function (x) { return membres.some(function (m) { return m.email === x; }); });
      C.api.ajouterMembres(emails, roleAjout.value).then(function () { return C.api.membres(); }).then(function (liste) {
        membres = liste;
        dessiner();
        zone.value = "";
        var ajoutes = emails.length - dejaLa.length;
        C.toast(ajoutes + " membre(s) ajouté(s)" + (dejaLa.length ? ", " + dejaLa.length + " déjà inscrit(s) (rôle inchangé)" : "") + ".", "ok");
      }).catch(function (err) { C.toast(err.message, "erreur"); });
    });

    var jauge = null;
    if (stockage) {
      var pc = Math.min(100, stockage.octets / C.api.QUOTA * 100);
      jauge = h("section.carte", h("h2.carte-titre", icone("hdd"), "Stockage des fichiers"),
        h("div.jauge" + (pc > 80 ? ".alerte" : ""), { role: "meter", "aria-valuenow": String(Math.round(pc)), "aria-valuemin": "0", "aria-valuemax": "100", "aria-label": "Stockage utilisé" },
          h("div.jauge-barre", h("div.jauge-rempli", { style: "width:" + pc + "%" })),
          h("span.jauge-texte", C.taille(stockage.octets) + " sur 1 Go · " + stockage.fichiers + " fichier(s)")),
        h("p.carte-aide", "Offre gratuite de Supabase : 1 Go de fichiers, 50 Mo par fichier. Les PDF sont compressés avant l'envoi ; pour les gros documents, préfère un lien Drive."));
    }

    el.appendChild(h("div.page-admin",
      h("header.page-entete", h("h1", "Membres"),
        h("p.page-intro", "Seules les adresses listées ici ouvrent Codex. Ajouter quelqu'un ne lui envoie aucun e-mail : " +
          "donne-lui le lien du site, il s'y connecte avec cette adresse."),
        h("p.page-intro", h("code.lien-site", C.api.urlRetour()))),
      h("div.admin-grille",
        h("section.carte", form),
        jauge),
      h("section.carte",
        compteurs,
        h("div.table-defile", h("table.table-membres",
          h("thead", h("tr", h("th", "E-mail"), h("th", "Rôle"), h("th", "Ajouté"), h("th", h("span.visuellement-cache", "Actions")))),
          corpsTable)))));
    dessiner();
  }

  C.vues = C.vues || {};
  C.vues.admin = vue;
})(window.Codex);

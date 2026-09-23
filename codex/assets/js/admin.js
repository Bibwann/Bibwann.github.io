/* ============================================================
   CODEX — membres et comptes (admin)

   Les comptes se créent ici : un identifiant (ou un e-mail) et un mot de
   passe, sans aucun e-mail envoyé. La création passe par les fonctions
   SQL admin_* (schema.sql), qui vérifient que l'appelant est admin. Le mot
   de passe est tiré dans ce navigateur, montré une seule fois, et la base
   n'en garde que le haché.
   ============================================================ */
(function (C) {
  "use strict";
  var h = C.h, icone = C.icone;

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

  function copier(texte, message) {
    navigator.clipboard.writeText(texte).then(function () { C.toast(message || "Copié.", "ok"); },
      function () { C.toast("Copie refusée par le navigateur.", "erreur"); });
  }

  // Affiche un mot de passe une seule fois, avec un bouton pour le copier.
  function montrerMotDePasse(identifiant, mdp) {
    var ligne = identifiant + " : " + mdp;
    C.dialogue({
      titre: "Nouveau mot de passe",
      texte: "Transmets-le à la personne. Il ne sera plus affiché ensuite ; elle pourra le changer depuis le menu de son compte.",
      contenu: h("p.mdp-affiche", h("code", ligne)),
      confirmer: "Copier et fermer", annuler: "Fermer"
    }).then(function (ok) { if (ok) copier(ligne, "Identifiant et mot de passe copiés."); });
  }

  function construire(el, membres, stockage) {
    var moi = C.etat.email;
    var corpsTable = h("tbody");
    var compteurs = h("p.admin-compteurs");

    function majCompteurs() {
      var n = { admin: 0, editeur: 0, lecteur: 0 };
      membres.forEach(function (m) { n[m.role]++; });
      C.vider(compteurs).appendChild(document.createTextNode(
        membres.length + " compte(s) : " + n.admin + " admin, " + n.editeur + " éditeur(s), " + n.lecteur + " lecteur(s)"));
    }

    function ligne(m) {
      var soi = m.email === moi;
      var id = C.api.identifiantDe(m.email);
      var role = h("select.champ.champ-select.champ-compact", { "aria-label": "Rôle de " + id, disabled: soi },
        Object.keys(C.ROLES).map(function (r) { return h("option", { value: r, selected: r === m.role }, C.ROLES[r]); }));
      role.addEventListener("change", function () {
        var ancien = m.role;
        C.api.changerRole(m.email, role.value).then(function () {
          m.role = role.value;
          majCompteurs();
          C.toast(id + " est maintenant " + C.ROLES[m.role].toLowerCase() + ".", "ok");
        }).catch(function (e) { role.value = ancien; C.toast(e.message, "erreur"); });
      });
      var actions = h("button.btn-icone", { type: "button", disabled: soi, title: soi ? "C'est ton compte" : "Actions", "aria-label": "Actions sur " + id }, icone("three-dots"));
      actions.addEventListener("click", function () {
        C.menu(actions, [
          { icone: "key", texte: "Nouveau mot de passe", action: function () {
            var mdp = C.motDePasse();
            C.api.reinitialiserMotDePasse(m.email, mdp)
              .then(function () { montrerMotDePasse(id, mdp); })
              .catch(function (e) { C.toast(e.message, "erreur"); });
          } },
          { icone: "person-x", texte: "Supprimer le compte", danger: true, action: function () {
            C.dialogue({
              titre: "Supprimer le compte « " + id + " » ?",
              texte: "La personne ne pourra plus se connecter. Les fiches qu'elle a écrites restent.",
              confirmer: "Supprimer", danger: true
            }).then(function (ok) {
              if (!ok) return;
              C.api.supprimerCompte(m.email).then(function () {
                membres = membres.filter(function (x) { return x.email !== m.email; });
                dessiner();
                C.toast("Compte supprimé.", "ok");
              }).catch(function (e) { C.toast(e.message, "erreur"); });
            });
          } }
        ]);
      });
      return h("tr",
        h("td.admin-email", id, soi ? h("span.pastille.pastille-accent", "toi") : null,
          m.email.indexOf("@codex.invalid") < 0 ? h("span.admin-type", { title: "Compte avec e-mail : peut aussi se connecter par lien" }, icone("envelope")) : null),
        h("td", role),
        h("td.admin-date", C.dateRelative(m.ajoute_le)),
        h("td.admin-actions", actions));
    }

    function dessiner() {
      C.vider(corpsTable);
      C.trier(membres.map(function (m) { return Object.assign({ tri: C.api.identifiantDe(m.email) }, m); }), "tri")
        .forEach(function (m) { corpsTable.appendChild(ligne(m)); });
      majCompteurs();
    }

    // ---- Création de comptes : un identifiant par ligne ----
    var zone = h("textarea.champ", { rows: 5, id: "admin-ids", spellcheck: "false", placeholder: "lea.martin\nhugo.petit\nprenom.nom@etu.univ.fr", "aria-label": "Identifiants à créer" });
    var roleAjout = h("select.champ.champ-select", { "aria-label": "Rôle des nouveaux comptes" },
      h("option", { value: "lecteur" }, "Lecteur : lit tout"),
      h("option", { value: "editeur" }, "Éditeur : écrit et dépose des fichiers"),
      h("option", { value: "admin" }, "Admin : gère aussi les comptes"));
    var bouton = h("button.btn.btn-primaire", { type: "submit" }, icone("person-plus"), "Créer les comptes");
    var resultats = h("div.admin-resultats");
    var form = h("form.admin-ajout",
      h("label.champ-label", { for: "admin-ids" }, "Créer des comptes"),
      h("p.carte-aide", "Un identifiant par ligne (lettres, chiffres, point, tiret), ou une adresse e-mail. Un mot de passe est généré pour chacun."),
      zone, h("div.admin-ajout-bas", roleAjout, bouton), resultats);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var ids = zone.value.split(/[\s,;]+/).map(function (x) { return x.trim().toLowerCase(); }).filter(Boolean)
        .filter(function (x, i, t) { return t.indexOf(x) === i; });
      if (!ids.length) { zone.focus(); return; }
      bouton.disabled = true;
      // Un compte après l'autre : un identifiant refusé n'empêche pas les suivants.
      var resultatsListe = [];
      ids.reduce(function (p, i) {
        return p.then(function () {
          var mdp = C.motDePasse();
          return C.api.creerCompte(i, mdp, roleAjout.value)
            .then(function () { resultatsListe.push({ identifiant: i, motDePasse: mdp }); },
              function (e) { resultatsListe.push({ identifiant: i, erreur: e.message }); });
        });
      }, Promise.resolve())
        .then(function () {
          var r = { resultats: resultatsListe };
          var crees = r.resultats.filter(function (x) { return x.motDePasse; });
          var texte = crees.map(function (x) { return x.identifiant + " : " + x.motDePasse; }).join("\n");
          C.vider(resultats).appendChild(h("div.admin-bilan",
            h("p", h("strong", crees.length + " compte(s) créé(s). "), "Les mots de passe ne seront plus affichés : copie-les maintenant."),
            h("table.table-bilan", h("tbody", r.resultats.map(function (x) {
              return h("tr", h("td", x.identifiant),
                x.motDePasse ? h("td", h("code", x.motDePasse)) : h("td.admin-erreur", x.erreur));
            }))),
            crees.length ? h("div.admin-ajout-bas",
              h("button.btn", { type: "button", on: { click: function () { copier(texte, "Identifiants et mots de passe copiés."); } } }, icone("clipboard"), "Tout copier"),
              h("button.btn", { type: "button", on: { click: function () {
                var a = h("a", { href: URL.createObjectURL(new Blob([texte + "\n"], { type: "text/plain" })), download: "comptes-codex.txt" });
                document.body.appendChild(a); a.click(); a.remove();
                setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
              } } }, icone("download"), "Télécharger (.txt)")) : null));
          zone.value = "";
          return C.api.membres().then(function (liste) { membres = liste; dessiner(); });
        })
        .catch(function (err) { C.toast(err.message, "erreur"); })
        .then(function () { bouton.disabled = false; });
    });

    var jauge = null;
    if (stockage) {
      var pc = Math.min(100, stockage.octets / C.api.QUOTA * 100);
      jauge = h("section.carte", h("h2.carte-titre", "Stockage des fichiers"),
        h("div.jauge" + (pc > 80 ? ".alerte" : ""), { role: "meter", "aria-valuenow": String(Math.round(pc)), "aria-valuemin": "0", "aria-valuemax": "100", "aria-label": "Stockage utilisé" },
          h("div.jauge-barre", h("div.jauge-rempli", { style: "width:" + pc + "%" })),
          h("span.jauge-texte", C.taille(stockage.octets) + " sur 1 Go · " + stockage.fichiers + " fichier(s)")),
        h("p.carte-aide", "Offre gratuite de Supabase : 1 Go de fichiers, 50 Mo par fichier. Les PDF sont compressés avant l'envoi ; pour les gros documents, préfère un lien Drive."));
    }

    el.appendChild(h("div.page-admin",
      h("header.fiche-entete", h("h1.fiche-titre", "Membres"),
        h("p.page-intro", "Seuls les comptes listés ici ouvrent Codex. Crée un compte, puis transmets à la personne son identifiant, son mot de passe et l'adresse du site :"),
        h("p.page-intro", h("code.lien-site", C.api.urlRetour()))),
      h("div.admin-grille", h("section.carte", form), jauge),
      h("section.carte",
        compteurs,
        h("div.table-defile", h("table.table-membres",
          h("thead", h("tr", h("th", "Identifiant"), h("th", "Rôle"), h("th", "Ajouté"), h("th", h("span.visuellement-cache", "Actions")))),
          corpsTable)))));
    dessiner();
  }

  C.vues = C.vues || {};
  C.vues.admin = vue;
})(window.Codex);

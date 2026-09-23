/* ============================================================
   CODEX — accès aux données
   Le seul fichier qui parle à Supabase. Les vues ne voient que des
   fonctions qui renvoient des données ou lèvent une Error en français.

   Rappel : rien ici n'est une protection. Un lecteur qui appellerait
   `enregistrerFiche` à la main se ferait refuser par la RLS
   (supabase/schema.sql), c'est tout l'intérêt.
   ============================================================ */
(function (C) {
  "use strict";

  var cfg = window.CODEX_CONFIG || {};
  var pret = !!(cfg.supabaseUrl && cfg.supabaseCle && window.supabase);
  var sb = pret ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseCle, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  }) : null;

  var BUCKET = "ressources";
  var DUREE_LIEN = 3600; // secondes de validité d'un lien de fichier signé

  // ---- Erreurs lisibles ----

  function erreur(e) {
    var code = e && e.code, msg = (e && e.message) || String(e);
    var texte;
    // Messages déjà rédigés en français par les fonctions SQL : on les garde tels quels.
    if (/^(Ce compte|Identifiant invalide|Adresse e-mail invalide|Mot de passe trop court|Rôle invalide|Aucun compte|Pas sur ton|Tu ne peux pas|Réservé aux admins)/.test(msg)) texte = msg;
    else if (code === "42501" || /row-level security|permission denied/i.test(msg)) texte = "Tu n'as pas les droits pour faire ça.";
    else if (code === "23503") texte = "Impossible : cet élément contient encore des fiches ou des sous-dossiers.";
    else if (code === "23505" || /duplicate|already exists/i.test(msg)) texte = "Cet élément existe déjà.";
    else if (code === "23514") texte = "Valeur refusée : vérifie ce que tu as saisi.";
    // Site plus récent que la base : colonne ou fonction ajoutée par une
    // nouvelle version de schema.sql, pas encore exécutée dans Supabase.
    else if (code === "42703" || code === "42P01" || code === "PGRST202" || code === "PGRST205" ||
      /column .* does not exist|could not find the (function|table)|relation .* does not exist/i.test(msg)) {
      texte = "La base n'est pas à jour : relance supabase/schema.sql dans Supabase (SQL Editor), puis recharge la page.";
    }
    else if (/failed to fetch|networkerror|load failed/i.test(msg)) texte = "Connexion impossible. Vérifie ton réseau puis réessaie.";
    else if (/payload too large|exceeded the maximum|too large/i.test(msg)) texte = "Fichier trop lourd : 50 Mo maximum. Mets-le sur un Drive et ajoute le lien à la place.";
    else if (/rate limit|too many/i.test(msg)) texte = "Trop de demandes d'affilée. Attends quelques minutes puis réessaie.";
    else if (/jwt|session|not authenticated/i.test(msg)) texte = "Ta session a expiré. Recharge la page pour te reconnecter.";
    else texte = msg;
    var err = new Error(texte);
    err.cause = e;
    return err;
  }

  function q(promesse) {
    return promesse.then(function (r) {
      if (r.error) throw erreur(r.error);
      return r.data;
    }, function (e) { throw erreur(e); });
  }

  // Adresse de retour du lien magique : la page elle-même, sans le
  // #/route (que Supabase remplacerait de toute façon par ses jetons).
  function urlRetour() { return location.origin + location.pathname; }

  // ---- Session ----

  function session() {
    return sb.auth.getSession().then(function (r) { return r.data.session; });
  }

  function surChangement(fn) {
    sb.auth.onAuthStateChange(function (evenement, s) { fn(evenement, s); });
  }

  // Les comptes sans e-mail ont une adresse technique « identifiant@codex.invalid »
  // (voir admin_creer_compte dans schema.sql). On tape l'identifiant, on se connecte
  // avec l'adresse.
  var DOMAINE = "codex.invalid";
  function versEmail(identifiant) {
    var v = String(identifiant || "").trim().toLowerCase();
    return v.indexOf("@") >= 0 ? v : v + "@" + DOMAINE;
  }
  function identifiantDe(email) {
    return String(email || "").replace("@" + DOMAINE, "");
  }

  function connexion(identifiant, motDePasse) {
    return q(sb.auth.signInWithPassword({ email: versEmail(identifiant), password: motDePasse }))
      .catch(function (e) {
        if (/invalid login|invalid credentials/i.test((e.cause && e.cause.message) || e.message)) {
          throw new Error("Identifiant ou mot de passe incorrect.");
        }
        throw e;
      });
  }

  // shouldCreateUser: false : le lien n'ouvre QUE des comptes existants.
  // Les comptes se créent depuis la page Membres, pas en tapant une adresse.
  function envoyerLien(email) {
    return q(sb.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: urlRetour(), shouldCreateUser: false }
    }));
  }

  function changerMotDePasse(mdp) {
    return q(sb.auth.updateUser({ password: mdp }));
  }

  // Comptes gérés par un admin : fonctions SQL admin_* de schema.sql (elles
  // vérifient elles-mêmes que l'appelant est admin). Le mot de passe est
  // tiré dans le navigateur de l'admin ; la base n'en garde que le haché.
  function creerCompte(identifiant, motDePasse, role) {
    return q(sb.rpc("admin_creer_compte", { p_identifiant: identifiant, p_mot_de_passe: motDePasse, p_role: role }));
  }
  function reinitialiserMotDePasse(email, motDePasse) {
    return q(sb.rpc("admin_mot_de_passe", { p_email: email, p_mot_de_passe: motDePasse }));
  }
  function supprimerCompte(email) {
    return q(sb.rpc("admin_supprimer_compte", { p_email: email }));
  }

  function connexionGoogle() {
    return q(sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: urlRetour() } }));
  }

  function deconnexion() { return q(sb.auth.signOut()); }

  function monRole() { return q(sb.rpc("role_courant")); }

  // ---- Arborescence ----
  // Une seule lecture pour tout l'arbre, sans le contenu des fiches :
  // c'est ce qui rend la navigation instantanée ensuite.

  // `ordre` (ordre de lecture) vient d'une version récente de schema.sql :
  // si la base ne l'a pas encore, on relit sans, et tout reste utilisable.
  var sansOrdre = false;
  function arbre() {
    function lire(avecOrdre) {
      var o = avecOrdre ? ", ordre" : "";
      return Promise.all([
        q(sb.from("dossiers").select("id, parent_id, titre" + o)),
        q(sb.from("fiches").select("id, dossier_id, titre, maj_le, maj_par, accueil" + o))
      ]).then(function (r) { return { dossiers: r[0], fiches: r[1] }; });
    }
    if (sansOrdre) return lire(false);
    return lire(true).catch(function (e) {
      if (!/base n'est pas à jour/.test(e.message)) throw e;
      sansOrdre = true;
      return lire(false);
    });
  }

  function creerDossier(titre, parentId) {
    return q(sb.from("dossiers").insert({ titre: titre, parent_id: parentId || null }).select().single());
  }

  function renommerDossier(id, titre) {
    return q(sb.from("dossiers").update({ titre: titre }).eq("id", id));
  }

  function supprimerDossier(id) {
    return q(sb.from("dossiers").delete().eq("id", id));
  }

  // ---- Fiches ----

  function fiche(id) {
    return Promise.all([
      q(sb.from("fiches").select("*").eq("id", id).maybeSingle()),
      q(sb.from("ressources").select("*").eq("fiche_id", id))
    ]).then(function (r) {
      if (!r[0]) return null;
      r[0].ressources = r[1];
      return r[0];
    });
  }

  function creerFiche(v) {
    return q(sb.from("fiches").insert({ dossier_id: v.dossier_id || null, titre: v.titre, contenu: v.contenu, accueil: !!v.accueil }).select().single());
  }

  // Verrou optimiste : l'écriture ne passe que si la fiche n'a pas bougé
  // depuis qu'on l'a ouverte (même `maj_le`). Sinon, 0 ligne touchée →
  // conflit, et c'est à l'utilisateur de trancher plutôt qu'à la
  // dernière sauvegarde d'écraser la précédente en silence.
  function enregistrerFiche(id, v, majLeLu) {
    var req = sb.from("fiches").update({ dossier_id: v.dossier_id || null, titre: v.titre, contenu: v.contenu }).eq("id", id);
    if (majLeLu) req = req.eq("maj_le", majLeLu);
    return q(req.select()).then(function (lignes) {
      if (!lignes || !lignes.length) {
        var e = new Error("Cette fiche a été modifiée par quelqu'un d'autre depuis que tu l'as ouverte.");
        e.conflit = true;
        throw e;
      }
      return lignes[0];
    });
  }

  // Les fichiers d'abord : la suppression de la fiche emporte les lignes
  // `ressources` en cascade, mais pas les fichiers du bucket.
  function supprimerFiche(f) {
    var chemins = (f.ressources || []).filter(function (r) { return r.fichier; }).map(function (r) { return r.fichier; });
    var avant = chemins.length ? q(sb.storage.from(BUCKET).remove(chemins)) : Promise.resolve();
    return avant.then(function () { return q(sb.from("fiches").delete().eq("id", f.id)); });
  }

  function revisions(ficheId) {
    return q(sb.from("revisions").select("id, titre, auteur, cree_le").eq("fiche_id", ficheId).order("cree_le", { ascending: false }));
  }

  function revision(id) {
    return q(sb.from("revisions").select("id, titre, contenu, auteur, cree_le").eq("id", id).single());
  }

  function rechercher(texte) { return q(sb.rpc("rechercher", { q: texte })); }

  // Arêtes [[liens]] entre fiches, calculées par la base.
  function graphe() { return q(sb.rpc("graphe")); }

  // Couples (fiche, #tag) de toutes les fiches.
  function etiquettes() { return q(sb.rpc("etiquettes")); }

  function stockage() {
    return q(sb.rpc("stockage")).then(function (r) {
      var l = (r && r[0]) || { octets: 0, fichiers: 0 };
      return { octets: Number(l.octets), fichiers: Number(l.fichiers) };
    });
  }

  // ---- Ressources ----

  function ajouterLien(ficheId, r) {
    return q(sb.from("ressources").insert({ fiche_id: ficheId, type: r.type, titre: r.titre, url: r.url }).select().single());
  }

  function nomDeFichier(nom) {
    var base = nom.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-");
    return base.slice(-80) || "fichier";
  }

  // supabase-js envoie par fetch, qui ne donne aucune progression. On
  // parle donc directement à l'API Storage en XHR, avec la session de
  // l'utilisateur : ce sont les mêmes règles RLS qui s'appliquent.
  function envoyer(chemin, fichier, surProgression) {
    return session().then(function (s) {
      if (!s) throw erreur(new Error("not authenticated"));
      return new Promise(function (ok, ko) {
        var x = new XMLHttpRequest();
        var cible = cfg.supabaseUrl.replace(/\/$/, "") + "/storage/v1/object/" + BUCKET + "/" +
          chemin.split("/").map(encodeURIComponent).join("/");
        x.open("POST", cible);
        x.setRequestHeader("Authorization", "Bearer " + s.access_token);
        x.setRequestHeader("apikey", cfg.supabaseCle);
        x.setRequestHeader("x-upsert", "false");
        x.setRequestHeader("Content-Type", fichier.type || "application/octet-stream");
        if (surProgression) {
          x.upload.onprogress = function (e) { if (e.lengthComputable) surProgression(e.loaded / e.total); };
        }
        x.onload = function () {
          if (x.status >= 200 && x.status < 300) return ok();
          var corps = {};
          try { corps = JSON.parse(x.responseText); } catch (e) { /* réponse non JSON */ }
          ko(erreur({ code: String(corps.statusCode || x.status), message: corps.message || corps.error || ("HTTP " + x.status) }));
        };
        x.onerror = function () { ko(erreur(new Error("Failed to fetch"))); };
        x.send(fichier);
      });
    });
  }

  // Préfixe aléatoire : deux « TD1.pdf » dans la même fiche ne
  // s'écrasent pas, et le chemin n'est pas devinable.
  function ajouterFichier(ficheId, r, fichier, surProgression) {
    var alea = Math.random().toString(36).slice(2, 10);
    var chemin = ficheId + "/" + alea + "-" + nomDeFichier(fichier.name);
    return envoyer(chemin, fichier, surProgression).then(function () {
      return q(sb.from("ressources").insert({
        fiche_id: ficheId, type: r.type, titre: r.titre, fichier: chemin, taille: fichier.size
      }).select().single()).catch(function (e) {
        // Ligne refusée : on ne laisse pas un fichier orphelin dans le bucket.
        sb.storage.from(BUCKET).remove([chemin]);
        throw e;
      });
    });
  }

  function supprimerRessource(r) {
    return q(sb.from("ressources").delete().eq("id", r.id)).then(function () {
      if (r.fichier) return sb.storage.from(BUCKET).remove([r.fichier]);
    });
  }

  // Liens signés en un seul appel pour toute la fiche.
  function liensSignes(chemins) {
    if (!chemins.length) return Promise.resolve({});
    return q(sb.storage.from(BUCKET).createSignedUrls(chemins, DUREE_LIEN)).then(function (liste) {
      var m = {};
      liste.forEach(function (x) { if (x.signedUrl) m[x.path] = x.signedUrl; });
      return m;
    });
  }

  // ---- Progression : les exercices que J'AI faits ----
  // La RLS ne renvoie que les lignes du membre connecté, et la base pose
  // elle-même son e-mail : on ne l'envoie jamais.

  function progression(ficheId) {
    return q(sb.from("progression").select("cle").eq("fiche_id", ficheId)).then(function (l) {
      return l.map(function (x) { return x.cle; });
    });
  }

  function marquerFait(ficheId, cle, fait) {
    if (fait) {
      return q(sb.from("progression").insert({ fiche_id: ficheId, cle: cle })).catch(function (e) {
        // Déjà marqué (autre onglet, double clic) : c'est le résultat voulu.
        if (e.cause && e.cause.code === "23505") return null;
        throw e;
      });
    }
    return q(sb.from("progression").delete().eq("fiche_id", ficheId).eq("cle", cle));
  }

  // Toute ma progression (page Exercices) : { fiche_id: nombre fait }.
  function maProgression() {
    return q(sb.from("progression").select("fiche_id")).then(function (l) {
      var n = {};
      l.forEach(function (x) { n[x.fiche_id] = (n[x.fiche_id] || 0) + 1; });
      return n;
    });
  }

  // Nombre d'exercices corrigés par fiche : { fiche_id: nombre }.
  function exercices() {
    return q(sb.rpc("exercices")).then(function (l) {
      var n = {};
      (l || []).forEach(function (x) { n[x.fiche_id] = x.nombre; });
      return n;
    });
  }

  // Tous les documents et liens de toutes les fiches (page Documents).
  function toutesRessources() {
    return q(sb.from("ressources").select("id, fiche_id, type, titre, url, fichier, taille"));
  }

  // ---- Membres (admin) ----

  function membres() { return q(sb.from("membres").select("*").order("email")); }

  function changerRole(email, role) {
    return q(sb.from("membres").update({ role: role }).eq("email", email).select()).then(function (l) {
      if (!l || !l.length) throw new Error("Rôle inchangé : tu n'as pas les droits sur ce compte.");
    });
  }

  C.api = {
    pret: pret, urlRetour: urlRetour, DUREE_LIEN: DUREE_LIEN,
    graphe: graphe, stockage: stockage, etiquettes: etiquettes,
    connexion: connexion, changerMotDePasse: changerMotDePasse,
    creerCompte: creerCompte, reinitialiserMotDePasse: reinitialiserMotDePasse, supprimerCompte: supprimerCompte,
    versEmail: versEmail, identifiantDe: identifiantDe,
    // Offre gratuite Supabase. Les deux plafonds sont aussi imposés côté
    // serveur (bucket à 50 Mo) : ici, on prévient avant d'essayer.
    MAX_FICHIER: 50 * 1024 * 1024, QUOTA: 1024 * 1024 * 1024,
    session: session, surChangement: surChangement, envoyerLien: envoyerLien,
    connexionGoogle: connexionGoogle, deconnexion: deconnexion, monRole: monRole,
    arbre: arbre, creerDossier: creerDossier, renommerDossier: renommerDossier, supprimerDossier: supprimerDossier,
    fiche: fiche, creerFiche: creerFiche, enregistrerFiche: enregistrerFiche, supprimerFiche: supprimerFiche,
    revisions: revisions, revision: revision, rechercher: rechercher,
    ajouterLien: ajouterLien, ajouterFichier: ajouterFichier, supprimerRessource: supprimerRessource,
    liensSignes: liensSignes,
    progression: progression, marquerFait: marquerFait, maProgression: maProgression,
    exercices: exercices, toutesRessources: toutesRessources,
    membres: membres, changerRole: changerRole
  };
})(window.Codex);

/* ============================================================
   CODEX — faux Supabase pour le banc d'essai (tools/banc.html)

   Imite, en mémoire, le sous-ensemble de supabase-js qu'utilise
   assets/js/api.js, plus l'API Storage appelée en XHR pour l'envoi
   avec progression. Sert à essayer toute l'interface SANS projet
   Supabase. Jamais chargé par index.html.

   Ce banc ne teste PAS la sécurité : les droits sont simulés côté
   client. La vraie RLS se teste avec tests/rls.test.mjs.

   Paramètres d'URL : ?role=admin|editeur|lecteur|intrus|deconnecte
                      &vide  (démarre sans aucun contenu)
   ============================================================ */
(function () {
  "use strict";
  var URL_BANC = "https://banc.supabase.co";
  window.CODEX_CONFIG = { supabaseUrl: URL_BANC, supabaseCle: "cle-du-banc", connexionGoogle: true, responsable: "Bastien" };

  var params = new URLSearchParams(location.search);
  var role = params.get("role") || "admin";
  var EMAILS = { admin: "bastien.nieto@banc.example", editeur: "lea.martin@banc.example", lecteur: "hugo.petit@banc.example", intrus: "inconnu@exemple.example" };
  var email = EMAILS[role] || EMAILS.admin;
  var LATENCE = 120;

  var n = 0;
  function uuid() { n++; return "00000000-0000-4000-8000-" + String(n).padStart(12, "0"); }
  function maintenant(decalageMin) { return new Date(Date.now() - (decalageMin || 0) * 60000).toISOString(); }
  function plier(t) { return String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(); }

  // ---- Données de départ ----
  var db = { membres: [], dossiers: [], fiches: [], ressources: [], revisions: [], progression: [] };
  var fichiers = {}; // chemin → Blob

  db.membres.push({ email: EMAILS.admin, role: "admin", ajoute_le: maintenant(60 * 24 * 30) });
  db.membres.push({ email: EMAILS.editeur, role: "editeur", ajoute_le: maintenant(60 * 24 * 12), vu_le: maintenant(1) });
  db.membres.push({ email: EMAILS.lecteur, role: "lecteur", ajoute_le: maintenant(60 * 24 * 3), vu_le: maintenant(60 * 26) });

  if (!params.has("vide")) {
    var s1 = uuid(), s2 = uuid(), maths = uuid(), info = uuid(), phys = uuid();
    db.dossiers.push({ id: s1, parent_id: null, titre: "Semestre 1" }, { id: s2, parent_id: null, titre: "Semestre 2" },
      { id: maths, parent_id: s1, titre: "Mathématiques" }, { id: info, parent_id: s1, titre: "Informatique" },
      { id: phys, parent_id: s2, titre: "Physique" });

    var reduction = uuid(), ev = uuid(), poly = uuid(), sd = uuid(), meca = uuid();
    var CONTENU = [
      "# Réduction des endomorphismes", "",
      "## Vue d'ensemble", "",
      "Réduire un endomorphisme $u$ d'un espace de dimension finie $E$, c'est trouver une base où sa matrice est la plus simple possible : diagonale si on peut, triangulaire sinon. Tout repose sur les **valeurs propres** et les [[Espaces vectoriels|sous-espaces]] qui leur sont associés.", "",
      "## Définitions et théorèmes", "",
      "::: definition Valeur propre, vecteur propre", "$\\lambda \\in \\K$ est **valeur propre** de $u$ s'il existe $x \\neq 0$ tel que $u(x) = \\lambda x$. Le sous-espace propre associé est $E_\\lambda = \\Ker(u - \\lambda\\,\\mathrm{id})$.", ":::", "",
      "::: theoreme Polynôme caractéristique", "Les valeurs propres de $A \\in \\mathcal{M}_n(\\K)$ sont exactement les racines de", "$$\\chi_A(X) = \\det(X I_n - A)$$", ":::", "",
      "::: propriete Critère de diagonalisabilité", "$u$ est diagonalisable si et seulement si $\\chi_u$ est scindé et, pour toute valeur propre $\\lambda$, $\\dim E_\\lambda = m(\\lambda)$ (multiplicité). Voir aussi [[Polynômes annulateurs]].", ":::", "",
      "## Méthode", "",
      "::: methode Diagonaliser une matrice 3×3", "1. Calculer $\\chi_A(X)$ et le factoriser.", "2. Pour chaque racine $\\lambda$, résoudre $(A - \\lambda I_3)X = 0$.", "3. Si les dimensions collent, $P$ = vecteurs propres en colonnes et $A = PDP^{-1}$.", ":::", "",
      "::: attention Piège classique", "Une matrice réelle peut être diagonalisable sur $\\C$ sans l'être sur $\\R$ : toujours préciser le corps.", ":::", "",
      "### Exemple corrigé", "",
      "Pour $A = \\begin{pmatrix} 2 & 1 \\\\ 1 & 2 \\end{pmatrix}$, on trouve $\\chi_A = (X-1)(X-3)$.", "",
      "| Valeur propre | Vecteur propre | Dimension |", "|---|---|---|", "| 1 | $(1, -1)$ | 1 |", "| 3 | $(1, 1)$ | 1 |", "",
      "### Vérification numérique", "",
      "```python", "import numpy as np", "A = np.array([[2, 1], [1, 2]])", "valeurs, P = np.linalg.eig(A)  # [3., 1.]", "print(valeurs)", "```", "",
      "Coût d'un café : 5 $ et 10 $ ne sont pas des formules. Un lien vers une fiche absente : [[Fiche qui n'existe pas]].", "",
      "- [x] Revoir les déterminants", "- [ ] Faire les annales 2024"
    ].join("\n");
    db.fiches.push(
      { id: reduction, dossier_id: maths, titre: "Réduction des endomorphismes", contenu: CONTENU, cree_le: maintenant(9000), maj_le: maintenant(95), maj_par: EMAILS.editeur },
      { id: ev, dossier_id: maths, titre: "Espaces vectoriels", contenu: "## Vue d'ensemble\n\nUn espace vectoriel sur $\\K$…\n\n::: definition Famille libre\n$\\sum \\lambda_i x_i = 0 \\Rightarrow \\forall i,\\ \\lambda_i = 0$\n:::\n\nSuite logique : [[Réduction des endomorphismes]].", cree_le: maintenant(12000), maj_le: maintenant(60 * 30), maj_par: EMAILS.admin },
      { id: poly, dossier_id: maths, titre: "Polynômes annulateurs", contenu: "## Vue d'ensemble\n\nSi $P(u) = 0$ avec $P$ scindé à racines simples, alors $u$ est diagonalisable. Prérequis : [[Espaces vectoriels]].", cree_le: maintenant(8000), maj_le: maintenant(60 * 50), maj_par: EMAILS.admin },
      { id: sd, dossier_id: info, titre: "Structures de données", contenu: [
        "## Piles et files", "",
        "```c", "typedef struct { int t[100]; int sommet; } Pile;", "```", "",
        "::: astuce Retenir : `push` et `pop` en $O(1)$", "Pile = LIFO, file = FIFO.", ":::", "",
        "```mermaid", "flowchart LR", "    E[Entrée] --> P((Pile))", "    P -- pop --> S[Sortie]", "```", "",
        "## Exercices", "",
        "### Exercice 1 — Empiler", "",
        "::: exercice Énoncé", "Empile 1, 2, 3 puis dépile une fois. Que reste-t-il ?", ":::", "",
        "::: corrige- Corrigé", "1 et 2 : le 3, entré en dernier, sort en premier.", ":::", "",
        "### Exercice 2 — File", "",
        "Enfile 1, 2, 3 puis défile une fois.", "",
        "::: corrige- Corrigé", "2 et 3 : le premier entré sort en premier.", ":::"
      ].join("\n"), cree_le: maintenant(7000), maj_le: maintenant(60 * 70), maj_par: EMAILS.editeur },
      { id: meca, dossier_id: phys, titre: "Mécanique du point", contenu: "## Principe fondamental\n\n$$\\sum \\vec F = m \\vec a$$", cree_le: maintenant(3000), maj_le: maintenant(60 * 24 * 9), maj_par: EMAILS.admin });

    var pdf = new Blob(["%PDF-1.4\n% faux PDF du banc d'essai\n"], { type: "application/pdf" });
    fichiers[reduction + "/a1b2c3-poly-reduction.pdf"] = pdf;
    db.ressources.push(
      { id: uuid(), fiche_id: reduction, type: "poly", titre: "Polycopié du chapitre 4", url: null, fichier: reduction + "/a1b2c3-poly-reduction.pdf", taille: 2480000, cree_le: maintenant(900) },
      { id: uuid(), fiche_id: reduction, type: "td", titre: "TD 4 et corrigé", url: "https://drive.google.com/file/d/exemple", fichier: null, taille: null, cree_le: maintenant(800) },
      { id: uuid(), fiche_id: reduction, type: "annale", titre: "Partiel 2025", url: "https://drive.google.com/file/d/exemple2", fichier: null, taille: null, cree_le: maintenant(700) },
      { id: uuid(), fiche_id: reduction, type: "video", titre: "Diagonalisation en 15 minutes", url: "https://www.youtube.com/watch?v=exemple", fichier: null, taille: null, cree_le: maintenant(600) },
      { id: uuid(), fiche_id: reduction, type: "code", titre: "Notebook de vérification", url: "https://github.com/exemple/algebre", fichier: null, taille: null, cree_le: maintenant(500) });
    db.revisions.push({ id: 1, fiche_id: reduction, titre: "Réduction des endomorphismes", contenu: "## Première version\n\nBrouillon.", auteur: EMAILS.admin, cree_le: maintenant(60 * 24 * 2) });

    // La note d'accueil, à la racine : la page d'arrivée du site.
    db.fiches.push({ id: uuid(), dossier_id: null, accueil: true, titre: "Bienvenue sur Codex", cree_le: maintenant(20000), maj_le: maintenant(300), maj_par: EMAILS.admin, contenu: [
      "Codex rassemble les cours de la promo : **une fiche par chapitre**, et à côté de chaque fiche toutes ses ressources. #accueil", "",
      "> [!tip] Par où commencer",
      "> Ouvre [[Réduction des endomorphismes]] pour voir une fiche complète, ou parcours l'explorateur à gauche.", "",
      "## Se repérer", "",
      "- La **recherche** (touche `/`) fouille le texte de toutes les fiches.",
      "- Le **graphe** montre comment les chapitres se citent entre eux.", "",
      "> [!info]- Écrire une fiche (cliquer pour déplier)",
      "> Les formules s'écrivent en LaTeX : $e^{i\\pi} + 1 = 0$."
    ].join("\n") });
  }

  // ---- Droits simulés (reflet de la RLS, pour que l'interface réagisse pareil) ----
  function monRole() {
    var m = db.membres.filter(function (x) { return x.email === email; })[0];
    return m ? m.role : null;
  }
  function refus() { return { data: null, error: { code: "42501", message: "new row violates row-level security policy" } }; }

  function erreurRpc(code, message) { return { code: code, message: message }; }
  function repondre(v) { return new Promise(function (ok) { setTimeout(function () { ok(v); }, LATENCE); }); }
  function copie(x) { return JSON.parse(JSON.stringify(x)); }

  // ---- Constructeur de requêtes ----
  function Requete(table) {
    this.table = table; this.op = "select"; this.filtres = []; this.tri = null; this.unique = null;
    this.valeurs = null; this.retour = false; this.options = {};
  }
  Requete.prototype.select = function () { if (this.op !== "select") this.retour = true; return this; };
  Requete.prototype.insert = function (v) { this.op = "insert"; this.valeurs = v; return this; };
  Requete.prototype.upsert = function (v, o) { this.op = "upsert"; this.valeurs = v; this.options = o || {}; return this; };
  Requete.prototype.update = function (v) { this.op = "update"; this.valeurs = v; return this; };
  Requete.prototype.delete = function () { this.op = "delete"; return this; };
  Requete.prototype.eq = function (c, v) { this.filtres.push([c, v]); return this; };
  Requete.prototype.order = function (c, o) { this.tri = [c, !o || o.ascending !== false]; return this; };
  Requete.prototype.limit = function () { return this; };
  Requete.prototype.single = function () { this.unique = "single"; return this; };
  Requete.prototype.maybeSingle = function () { this.unique = "maybe"; return this; };
  Requete.prototype.then = function (ok, ko) { return repondre(this.executer()).then(ok, ko); };

  Requete.prototype.executer = function () {
    var t = this.table, r = monRole(), lignes = db[t], self = this;
    var ecrit = r === "admin" || r === "editeur";
    function correspond(l) { return self.filtres.every(function (f) { return String(l[f[0]]) === String(f[1]); }); }
    function lisible(l) {
      if (!r) return false;
      if (t === "membres") return r === "admin" || l.email === email;
      if (t === "revisions") return ecrit;
      if (t === "progression") return l.email === email;   // chacun son carnet, admin compris
      return true;
    }
    function fin(data) {
      if (self.unique) {
        if (!data.length && self.unique === "single") return { data: null, error: { code: "PGRST116", message: "no rows" } };
        return { data: data[0] ? copie(data[0]) : null, error: null };
      }
      return { data: copie(data), error: null };
    }

    if (this.op === "select") {
      var res = lignes.filter(lisible).filter(correspond);
      if (this.tri) {
        var c = this.tri[0], asc = this.tri[1];
        res = res.slice().sort(function (a, b) { return (a[c] < b[c] ? -1 : a[c] > b[c] ? 1 : 0) * (asc ? 1 : -1); });
      }
      return fin(res);
    }

    var peut = t === "membres" ? r === "admin" : t === "progression" ? !!r : ecrit;
    if (!peut || t === "revisions") return refus();
    if (t === "progression" && this.op === "update") return refus();

    if (this.op === "insert" || this.op === "upsert") {
      var liste = Array.isArray(this.valeurs) ? this.valeurs : [this.valeurs];
      var ajoutees = [];
      for (var i = 0; i < liste.length; i++) {
        var v = Object.assign({}, liste[i]);
        if (t === "membres") {
          if (db.membres.some(function (m) { return m.email === v.email; })) {
            if (this.op === "upsert" && this.options.ignoreDuplicates) continue;
            return { data: null, error: { code: "23505", message: "duplicate key value" } };
          }
          v.ajoute_le = maintenant();
        } else if (t === "progression") {
          v.email = email;   // posé par la base, comme default email_courant()
          if (db.progression.some(function (p) { return p.email === v.email && p.fiche_id === v.fiche_id && p.cle === v.cle; })) {
            return { data: null, error: { code: "23505", message: "duplicate key value" } };
          }
          v.fait_le = maintenant();
        } else {
          v.id = uuid();
          v.cree_le = maintenant();
          if (t === "fiches") {
            v.maj_le = maintenant(); v.maj_par = email; v.contenu = v.contenu || "";
            v.dossier_id = v.dossier_id || null; v.accueil = !!v.accueil;
            if (v.accueil && db.fiches.some(function (f) { return f.accueil; })) {
              return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
            }
          }
        }
        lignes.push(v);
        ajoutees.push(v);
      }
      return fin(ajoutees);
    }

    var cibles = lignes.filter(correspond);
    if (t === "membres") cibles = cibles.filter(function (m) { return m.email !== email; });
    if (t === "progression") cibles = cibles.filter(function (p) { return p.email === email; });

    if (this.op === "update") {
      // Comme `grant update (role)` : dans membres, seul le rôle se modifie.
      if (t === "membres" && Object.keys(this.valeurs).some(function (k) { return k !== "role"; })) {
        return { data: null, error: { code: "42501", message: "permission denied for table membres" } };
      }
      cibles.forEach(function (l) {
        if (t === "fiches" && (self.valeurs.contenu !== l.contenu || self.valeurs.titre !== l.titre)) {
          db.revisions.push({ id: db.revisions.length + 100, fiche_id: l.id, titre: l.titre, contenu: l.contenu, auteur: l.maj_par, cree_le: l.maj_le });
        }
        Object.assign(l, self.valeurs);
        if (t === "fiches") {
          // Horodatage strictement croissant, comme now() d'une transaction à l'autre.
          l.maj_le = new Date(Math.max(Date.now(), new Date(l.maj_le).getTime() + 1)).toISOString();
          l.maj_par = email;
        }
      });
      return fin(this.retour ? cibles : []);
    }

    if (this.op === "delete") {
      if (t === "dossiers") {
        var occupe = cibles.some(function (d) {
          return db.dossiers.some(function (x) { return x.parent_id === d.id; }) || db.fiches.some(function (f) { return f.dossier_id === d.id; });
        });
        if (occupe) return { data: null, error: { code: "23503", message: "violates foreign key constraint" } };
      }
      db[t] = lignes.filter(function (l) { return cibles.indexOf(l) < 0; });
      if (t === "fiches") {
        var ids = cibles.map(function (f) { return f.id; });
        db.ressources = db.ressources.filter(function (x) { return ids.indexOf(x.fiche_id) < 0; });
        db.revisions = db.revisions.filter(function (x) { return ids.indexOf(x.fiche_id) < 0; });
        db.progression = db.progression.filter(function (x) { return ids.indexOf(x.fiche_id) < 0; });
      }
      return fin([]);
    }
  };

  // ---- Fonctions SQL ----
  var RPC = {
    role_courant: function () { return monRole(); },
    signaler_presence: function () {
      db.membres.forEach(function (m) { if (m.email === email) m.vu_le = maintenant(); });
      return null;
    },
    rechercher: function (a) {
      if (!monRole()) return [];
      var q = plier(a.q);
      if (q.length < 2) return [];
      return db.fiches.filter(function (f) { return plier(f.titre).indexOf(q) >= 0 || plier(f.contenu).indexOf(q) >= 0; })
        .map(function (f) {
          var i = plier(f.contenu).indexOf(q);
          return { id: f.id, titre: f.titre, dossier_id: f.dossier_id, extrait: i >= 0 ? f.contenu.substr(Math.max(0, i - 70), 190) : f.contenu.slice(0, 190) };
        });
    },
    graphe: function () {
      if (!monRole()) return [];
      var parTitre = {};
      db.fiches.forEach(function (f) { parTitre[plier(f.titre)] = f.id; });
      var vus = {}, aretes = [];
      db.fiches.forEach(function (f) {
        var re = /\[\[([^\]|#\n]+)/g, m;
        while ((m = re.exec(f.contenu))) {
          var c = parTitre[plier(m[1])];
          if (c && c !== f.id && !vus[f.id + c]) { vus[f.id + c] = 1; aretes.push({ source: f.id, cible: c }); }
        }
      });
      return aretes;
    },
    // Comptes (fonctions admin_* de schema.sql), simulées.
    admin_creer_compte: function (a) {
      if (monRole() !== "admin") throw erreurRpc("42501", "Réservé aux admins.");
      var v = String(a.p_identifiant || "").trim().toLowerCase();
      var e = v.indexOf("@") >= 0 ? v : v + "@codex.invalid";
      if (v.indexOf("@") < 0 && !/^[a-z0-9][a-z0-9._-]{1,39}$/.test(v)) throw erreurRpc("22023", "Identifiant invalide : " + v);
      if ((a.p_mot_de_passe || "").length < 10) throw erreurRpc("22023", "Mot de passe trop court (10 caractères minimum).");
      if (db.membres.some(function (m) { return m.email === e; })) throw erreurRpc("23505", "Ce compte existe déjà : " + e);
      motsDePasse[e] = a.p_mot_de_passe;
      db.membres.push({ email: e, role: a.p_role, ajoute_le: maintenant() });
      return e;
    },
    admin_mot_de_passe: function (a) {
      if (monRole() !== "admin") throw erreurRpc("42501", "Réservé aux admins.");
      if (a.p_email === email) throw erreurRpc("22023", "Pas sur ton propre compte.");
      motsDePasse[a.p_email] = a.p_mot_de_passe;
    },
    admin_supprimer_compte: function (a) {
      if (monRole() !== "admin") throw erreurRpc("42501", "Réservé aux admins.");
      if (a.p_email === email) throw erreurRpc("22023", "Tu ne peux pas supprimer ton propre compte.");
      db.membres = db.membres.filter(function (m) { return m.email !== a.p_email; });
      db.progression = db.progression.filter(function (p) { return p.email !== a.p_email; });
    },
    // Même règle que public.exercices() : les encadrés « corrigé » repliés.
    exercices: function () {
      if (!monRole()) return [];
      var re = /^(:::[ \t]*(corrige|corrigé|correction|solution|reponse|réponse)[+-]?([ \t]|$)|:::[ \t]*succes-|>[ \t]?\[!(corrige|corrigé|correction|solution|reponse|réponse)\]|>[ \t]?\[!(succes|success|check|done)\]-)/gim;
      return db.fiches.map(function (f) {
        var n = (f.contenu.match(re) || []).length;
        return n ? { fiche_id: f.id, nombre: n } : null;
      }).filter(Boolean);
    },
    etiquettes: function () {
      if (!monRole()) return [];
      var sortie = [];
      db.fiches.forEach(function (f) {
        var vus = {}, re = /(?:^|\s)#([\p{L}_][\p{L}\p{N}_\/-]*)/gu, m;
        while ((m = re.exec(f.contenu))) {
          var t = m[1].toLowerCase();
          if (!vus[t]) { vus[t] = 1; sortie.push({ fiche_id: f.id, tag: t }); }
        }
      });
      return sortie;
    },
    stockage: function () {
      var f = db.ressources.filter(function (r) { return r.fichier; });
      return [{ octets: f.reduce(function (s, r) { return s + (r.taille || 0); }, 0), fichiers: f.length }];
    }
  };

  // ---- Session ----
  var motsDePasse = {};
  var session = role === "deconnecte" ? null : { access_token: "jeton-du-banc", user: { email: email } };
  var abonnes = [];
  var auth = {
    getSession: function () { return repondre({ data: { session: session }, error: null }); },
    onAuthStateChange: function (fn) { abonnes.push(fn); return { data: { subscription: { unsubscribe: function () {} } } }; },
    signInWithOtp: function (o) { console.info("[banc] lien magique pour", o.email); return repondre({ data: {}, error: null }); },
    signInWithOAuth: function () { return repondre({ data: {}, error: { message: "Google n'est pas disponible dans le banc d'essai." } }); },
    signOut: function () { session = null; abonnes.forEach(function (f) { f("SIGNED_OUT", null); }); return repondre({ error: null }); },
    // Mot de passe du banc : « motdepasse-banc » pour tous les comptes connus.
    signInWithPassword: function (o) {
      var connu = db.membres.some(function (m) { return m.email === o.email; }) || motsDePasse[o.email];
      var bon = o.password === (motsDePasse[o.email] || "motdepasse-banc");
      if (!connu || !bon) return repondre({ data: null, error: { message: "Invalid login credentials" } });
      email = o.email;
      session = { access_token: "jeton-du-banc", user: { email: email } };
      setTimeout(function () { abonnes.forEach(function (f) { f("SIGNED_IN", session); }); }, 0);
      return repondre({ data: { session: session }, error: null });
    },
    // Comme le déclencheur mdp_verrouille : personne ne change son mot de passe.
    updateUser: function () { return repondre({ data: null, error: { status: 500, message: "Database error updating user" } }); }
  };

  var storage = {
    from: function () {
      return {
        remove: function (chemins) { chemins.forEach(function (c) { delete fichiers[c]; }); return repondre({ data: [], error: null }); },
        createSignedUrls: function (chemins) {
          return repondre({ data: chemins.map(function (c) { return { path: c, signedUrl: fichiers[c] ? URL.createObjectURL(fichiers[c]) : null }; }), error: null });
        }
      };
    }
  };

  window.supabase = {
    createClient: function () {
      return {
        auth: auth, storage: storage,
        from: function (t) { return new Requete(t); },
        rpc: function (nom, args) {
          var r;
          try { r = RPC[nom](args || {}); } catch (e) { return repondre({ data: null, error: e }); }
          return repondre({ data: r === undefined || r === null ? null : copie(r), error: null });
        }
      };
    }
  };

  // ---- API Storage en XHR (envoi avec progression) ----
  var XHRNatif = window.XMLHttpRequest;
  window.XMLHttpRequest = function () {
    var x = new XHRNatif(), faux = false, url = "", self = this;
    this.upload = { onprogress: null };
    this.open = function (m, u) { url = u; faux = u.indexOf(URL_BANC) === 0; if (!faux) x.open.apply(x, arguments); };
    this.setRequestHeader = function () { if (!faux) x.setRequestHeader.apply(x, arguments); };
    this.send = function (corps) {
      if (!faux) {
        x.upload.onprogress = self.upload.onprogress;
        x.onload = function () { self.status = x.status; self.responseText = x.responseText; if (self.onload) self.onload(); };
        x.onerror = self.onerror;
        return x.send(corps);
      }
      var chemin = decodeURIComponent(url.split("/storage/v1/object/ressources/")[1]);
      if (monRole() !== "admin" && monRole() !== "editeur") {
        self.status = 403; self.responseText = JSON.stringify({ statusCode: "403", message: "new row violates row-level security policy" });
        return setTimeout(function () { self.onload(); }, LATENCE);
      }
      if (corps.size > 50 * 1024 * 1024) {
        self.status = 413; self.responseText = JSON.stringify({ statusCode: "413", message: "The object exceeded the maximum allowed size" });
        return setTimeout(function () { self.onload(); }, LATENCE);
      }
      // Débit simulé : ~4 Mo/s, pour voir la barre avancer.
      var total = corps.size || 1, envoye = 0, tranche = Math.max(65536, total / 20);
      (function suite() {
        envoye = Math.min(total, envoye + tranche);
        if (self.upload.onprogress) self.upload.onprogress({ lengthComputable: true, loaded: envoye, total: total });
        if (envoye < total) return setTimeout(suite, Math.max(30, tranche / 4194304 * 1000));
        fichiers[chemin] = corps;
        self.status = 200; self.responseText = JSON.stringify({ Key: "ressources/" + chemin });
        self.onload();
      })();
    };
  };

  window.CODEX_BANC = { db: db, fichiers: fichiers };
})();

/* ============================================================
   ai-console.js — Nano, le micro-chat du drone.

   Un VRAI petit LLM dans le navigateur : Qwen2.5-0.5B-Instruct
   via WebLLM (WebGPU), téléchargé à la première question et mis
   en cache ensuite. Amorcé par une fiche de faits sur Bastien.
   Bascule sur un assistant scripté si WebGPU manque.
   100 % côté client — rien n'est envoyé à un serveur.
   ============================================================ */
(function () {
   "use strict";

   const drone = document.getElementById("nano-chibi");
   const boite = document.getElementById("nano-chat");
   const journal = document.getElementById("nano-journal");
   const champ = document.getElementById("nano-input");
   const formulaire = document.getElementById("nano-form");
   const puces = document.getElementById("nano-puces");
   const etat = document.getElementById("nano-etat");
   const fermerBtn = document.getElementById("nano-fermer");
   if (!drone || !boite || !journal || !champ) return;

   const MODELE = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";
   const WEBLLM_CDN = "https://esm.run/@mlc-ai/web-llm";

   function langue() { return (localStorage.getItem("lang") || "fr").startsWith("en") ? "en" : "fr"; }

   /* ---------- Libellés ---------- */
   const T = {
      fr: {
         accueil: "Salut ! Je suis <b>Nano</b>, un petit modèle d'IA qui tourne dans <i>ton</i> navigateur — rien n'est envoyé à un serveur. Pose-moi une question sur Bastien.",
         amorce: "À ta première question, je télécharge mon modèle (~300 Mo, une seule fois, mis en cache).",
         veille: "en veille",
         chargement: "chargement…",
         enligne: "en ligne",
         local: "mode local",
         reflexion: "je réfléchis…",
         telecharge: "Téléchargement du modèle",
         sansGpu: "WebGPU n'est pas dispo sur ce navigateur — je passe en mode local (réponses préprogrammées). Pour la vraie IA, essaie Chrome ou Edge récent.",
         echec: "Le modèle n'a pas pu se charger — je passe en mode local.",
         pret: "Modèle prêt. Vas-y, je t'écoute."
      },
      en: {
         accueil: "Hi! I'm <b>Nano</b>, a small AI model running inside <i>your</i> browser — nothing is sent to a server. Ask me anything about Bastien.",
         amorce: "On your first question I'll download my model (~300 MB, once, then cached).",
         veille: "idle",
         chargement: "loading…",
         enligne: "online",
         local: "local mode",
         reflexion: "thinking…",
         telecharge: "Downloading the model",
         sansGpu: "WebGPU isn't available in this browser — switching to local mode (scripted answers). For the real AI, try a recent Chrome or Edge.",
         echec: "The model failed to load — switching to local mode.",
         pret: "Model ready. Go ahead, I'm listening."
      }
   };
   function S() { return T[langue()]; }

   /* ---------- Consigne courte (pour les questions hors fiches) ----------
      La grande fiche de faits sert à amorcer le modèle au chargement ;
      pour répondre, on lui donne une consigne de quelques lignes. Un
      0.5B ne tient pas trente lignes de contexte : il en pioche des
      morceaux au hasard et les recolle.
      --------------------------------------------------------------- */
   function consigne() {
      if (langue() === "en") {
         return "You are Nano, the assistant of Bastien Nieto's portfolio. You are NOT Bastien. Always speak about him in the third person ('Bastien', 'he'). Never say 'I am Bastien'. The visitor is a recruiter or a client, never Bastien. You only know this portfolio: if the question is not about Bastien, his projects, his stack, his background, his ambition or how to contact him, say so in one sentence and suggest what to ask instead. Never invent a fact. Answer in English, in one or two sentences.";
      }
      return "Tu es Nano, l'assistant du portfolio de Bastien Nieto. Tu n'es PAS Bastien. Parle toujours de lui à la troisième personne (« Bastien », « il »). Ne dis jamais « je suis Bastien ». La personne qui te parle est un recruteur ou un client, jamais Bastien. Tu ne connais que ce portfolio : si la question ne porte pas sur Bastien, ses projets, sa stack, son parcours, son ambition ou comment le contacter, dis-le en une phrase et propose ce qu'on peut te demander. N'invente jamais un fait. Réponds en français, en une ou deux phrases.";
   }

   /* Deux échanges d'exemple valent mieux qu'un paragraphe de consignes :
      c'est ce qui tient le modèle à la troisième personne, et ce qui lui
      apprend à refuser une question hors sujet au lieu de broder. */
   function exemples() {
      if (langue() === "en") {
         return [
            { role: "user", content: "who are you?" },
            { role: "assistant", content: "I'm Nano, a small AI running in your browser. I'm here to talk about Bastien Nieto — not to speak as him." },
            { role: "user", content: "where are we?" },
            { role: "assistant", content: "That's outside what I know — I only cover Bastien's portfolio. Ask me about his projects, his stack or his ambition instead." }
         ];
      }
      return [
         { role: "user", content: "tu es qui ?" },
         { role: "assistant", content: "Je suis Nano, un petit modèle qui tourne dans ton navigateur. Je suis là pour parler de Bastien Nieto — pas pour parler à sa place." },
         { role: "user", content: "on est où ?" },
         { role: "assistant", content: "Ça sort de ce que je connais — je ne couvre que le portfolio de Bastien. Demande-moi plutôt ses projets, sa stack ou son ambition." }
      ];
   }

   /* ---------- Base de faits ----------
      Qwen2.5-0.5B est un très petit modèle : livré à lui-même sur une
      question factuelle, il invente (« Aegis aide les entreprises à
      intégrer de l'IA ») et il oublie la consigne de troisième personne
      (« Je suis Bastien Nieto »). Constaté en conditions réelles.

      Donc on inverse la priorité : les faits d'abord, le modèle ensuite.
      Toute question qui touche un sujet connu reçoit une réponse écrite
      ici, mot pour mot. Le modèle ne sert que pour le reste, avec les
      seuls faits utiles en contexte et un filtre de sortie.
      --------------------------------------------------------------- */
   const FAITS = [
      {
         id: "aegis",
         mots: ["aegis", "luminai", "pokemon", "pokémon", "twitch", "lora", "fine-tun", "finetun"],
         fr: "Aegis (nom de code Luminai) est le projet le plus important de Bastien : une IA locale et souveraine, 100 % hors ligne et sans aucune API. Son « Mind » est un Qwen2.5 qu'il a fine-tuné lui-même en LoRA, orchestré par une architecture multi-agents — chat, pensée, monologue intérieur, mémoire hiérarchique, émotions, vision et jeu. Elle joue à Pokémon en autonomie totale et discute en direct sur Twitch.",
         en: "Aegis (codename Luminai) is Bastien's most important project: a local, sovereign AI running 100% offline with no API at all. Its 'Mind' is a Qwen2.5 he fine-tuned himself with LoRA, orchestrated by a multi-agent architecture — chat, thought, inner monologue, hierarchical memory, emotions, vision and game. It plays Pokémon fully autonomously and talks live on Twitch."
      },
      {
         id: "undergears",
         mots: ["undergear", "rouage", "godot", "fps", "jeu de tir"],
         fr: "UnderGears (Sous les Rouages) est un FPS de mouvement sous Godot 4 dont Bastien n'a pas écrit une seule ligne à la main : tout le code, les shaders et les outils sont produits par des agents IA qu'il pilote. Ce qui est à lui : l'architecture, l'univers, le game design et l'arbitrage permanent. Un Prologue de 4 salles est jouable, 73 salles sont cartographiées.",
         en: "UnderGears is a movement FPS built in Godot 4 in which Bastien has not written a single line by hand: all the code, shaders and tooling are produced by AI agents he directs. What is his: the architecture, the world, the game design and the constant arbitration. A 4-room prologue is playable and 73 rooms are mapped."
      },
      {
         id: "cerber",
         mots: ["cerber", "cerbere", "cerbère", "vie privée", "privacy", "dlp", "vpn", "rgpd perso"],
         fr: "Cerber est son bouclier de vie privée — et il faut être clair : ce n'est pas encore du code. C'est une architecture complète, six modules spécifiés sur le papier. Au programme : un moteur DLP local qui coupe tout flux sortant contenant son identité réelle, un kill switch au niveau du noyau (nftables / WFP), un camouflage d'empreinte matérielle, la purge EXIF automatique et des alias e-mail jetables. Bastien publie le cahier des charges avant la première ligne.",
         en: "Cerber is his privacy shield — and to be clear: it is not code yet. It is a complete architecture, six modules specified on paper. The scope: a local DLP engine that kills any outgoing stream carrying his real identity, a kernel-level kill switch (nftables / WFP), hardware-fingerprint camouflage, automatic EXIF purging and throwaway email aliases. Bastien publishes the spec before the first line."
      },
      {
         id: "entreprise",
         mots: ["entreprise", "boite", "boîte", "ambition", "auto-entrepreneur", "freelance", "conseil", "consult", "company", "business", "souverain"],
         fr: "Son ambition, c'est de monter sa propre entreprise, à son nom, pour vendre aux entreprises de l'intégration d'IA locale et souveraine. D'abord le conseil : auditer leurs processus et dire honnêtement ce que l'IA peut faire chez elles. Ensuite la construction : fine-tuner les modèles sur leurs données, les déployer sur leurs machines, et repartir en laissant leurs équipes autonomes. Le RGPD comme contrainte d'architecture de départ. C'est en préparation, pas encore immatriculé — la section Ambition, sur Mars.",
         en: "His ambition is to start his own company, under his own name, selling local and sovereign AI integration to businesses. Advice first: audit their processes and say honestly what AI can do for them. Then building: fine-tune models on their data, deploy on their machines, and leave their teams autonomous. GDPR as the starting architecture constraint. It is in preparation, not registered yet — that is the Ambition section, on Mars."
      },
      {
         id: "creations",
         mots: ["vitrine", "création", "creation", "site", "design", "maquette", "showcase", "website", "boutique", "dashboard", "tableau de bord"],
         fr: "Dans la section « Créations », Bastien a conçu cinq démos complètes — et surtout cinq formats différents, pas cinq couleurs : une boutique avec panier et tunnel de commande, l'intérieur d'un tableau de bord B2B, un moteur de réservation de restaurant, le planning d'une salle de sport, et un parcours de qualification pour un cabinet d'avocats. Tout est codé à la main, sans aucune librairie, et chacune s'ouvre et s'utilise pour de vrai.",
         en: "In the 'Creations' section, Bastien built five complete demos — and above all five different formats, not five colour schemes: a shop with a working cart and checkout, the inside of a B2B dashboard, a restaurant booking engine, a gym class schedule, and a qualification flow for a law firm. All hand-coded with no library, and each one opens and actually works."
      },
      {
         id: "stack",
         mots: ["stack", "techno", "technolog", "compétence", "competence", "langage", "skill", "outil", "symfony", "docker", "python"],
         fr: "Sa stack : PHP/Symfony, Node.js, JavaScript, Java, Kotlin, Swift, Python, Docker, MongoDB/MySQL et Three.js. Côté IA : orchestration multi-agents, fine-tuning et LoRA, prompt engineering, RAG, LLM locaux via Ollama et Qwen, et modèles dans le navigateur via WebLLM — comme moi.",
         en: "His stack: PHP/Symfony, Node.js, JavaScript, Java, Kotlin, Swift, Python, Docker, MongoDB/MySQL and Three.js. On the AI side: multi-agent orchestration, fine-tuning and LoRA, prompt engineering, RAG, local LLMs through Ollama and Qwen, and in-browser models through WebLLM — like me."
      },
      {
         id: "parcours",
         mots: ["étude", "etude", "école", "ecole", "formation", "parcours", "valiance", "polytech", "iut", "diplome", "diplôme", "alternance", "study", "school", "education", "resume", "experience", "expérience"],
         fr: "Bastien est élève ingénieur à Polytech. Avant ça : trois ans de BUT Informatique en alternance à l'IUT de Sophia Antipolis (2023-2026), une année de cycle préparatoire à Polytech Annecy, et un bac Maths/NSI mention Bien. Son alternance chez Valiance : migration de leur ERP legacy de Symfony 1.4 à 7, dev web et mobile, administration système, et intégration d'IA pour le service client.",
         en: "Bastien is an engineering student at Polytech. Before that: a three-year work-study BUT in Computer Science at IUT Sophia Antipolis (2023-2026), a preparatory year at Polytech Annecy, and a Maths/CS high-school diploma with honours. His apprenticeship at Valiance: migrating their legacy ERP from Symfony 1.4 to 7, web and mobile development, sysadmin, and AI integration for customer service."
      },
      {
         id: "projets",
         mots: ["projet", "portfolio", "réalisation", "realisation", "project", "work", "github"],
         fr: "Trois projets phares — Aegis, UnderGears et Cerber —, dix projets aboutis (BeatForge, Whiskers Rebellion II, TinyML, un système solaire piloté à la main, la migration ERP Valiance, Valorant Tactical Protocol, Potify, une stack MongoDB Docker, Player vs Zombie et une base Steam sous Docker), et une archive de travaux d'école dont le premier date de 2018. Tout est dans la section Projets, sur Jupiter.",
         en: "Three flagship projects — Aegis, UnderGears and Cerber —, ten finished ones (BeatForge, Whiskers Rebellion II, TinyML, a hand-tracked solar system, the Valiance ERP migration, Valorant Tactical Protocol, Potify, a MongoDB Docker stack, Player vs Zombie and a Steam database on Docker), and an archive of school work going back to 2018. It is all in the Projects section, on Jupiter."
      },
      {
         id: "passions",
         mots: ["passion", "hobby", "loisir", "musique", "music", "sport", "salle", "muscu", "escalade", "workout", "handstand", "muscle-up", "montre", "horloger", "watch", "seiko", "jeu vidéo", "jeux", "game", "f1", "formule", "voiture", "café", "cafe"],
         fr: "Hors du code : le street workout, l'escalade et la salle — cinq séances par semaine depuis un an, et en ce moment il travaille le muscle-up et l'handstand. Les montres et l'horlogerie aussi : la mécanique, la précision, le tic-tac ; il porte une Pierre Lannier squelette et vise une Seiko. Et puis la musique, les jeux vidéo (Pokémon, Valorant), les voitures et la Formule 1. Plus beaucoup trop de café.",
         en: "Outside the code: street workout, climbing and the gym — five sessions a week for the past year, and right now he is working on the muscle-up and the handstand. Watches and horology too: the mechanics, the precision, the ticking; he wears a skeleton Pierre Lannier and is after a Seiko. Then music, video games (Pokémon, Valorant), cars and Formula 1. Plus far too much coffee."
      },
      {
         id: "contact",
         mots: ["contact", "écrire", "ecrire", "mail", "email", "recrut", "embauch", "joindre", "hire", "reach", "linkedin"],
         fr: "Écris-lui à bastien.nieto.pro@gmail.com. Sinon : GitHub (Bibwann), GitLab (iut-git.unice.fr/nb312097) et LinkedIn (bastien-nieto). Il est basé aux Adrets-de-l'Estérel, dans le Var. C'est la section Contact, sur Neptune.",
         en: "Write to him at bastien.nieto.pro@gmail.com. Otherwise: GitHub (Bibwann), GitLab (iut-git.unice.fr/nb312097) and LinkedIn (bastien-nieto). He is based in Les Adrets-de-l'Estérel, in the Var. That is the Contact section, on Neptune."
      },
      {
         id: "qui",
         mots: ["presente toi", "presentation", "bastien", "nieto", "about him", "tell me about"],
         fr: "Bastien Nieto est développeur fullstack et spécialiste de l'intégration d'IA, basé sur la Côte d'Azur. Il est élève ingénieur à Polytech après trois ans d'alternance en entreprise. Sa marque de fabrique : faire tourner l'IA en local, sans rien envoyer à un serveur — c'est le fil qui relie Aegis, Cerber et le projet d'entreprise qu'il prépare.",
         en: "Bastien Nieto is a fullstack developer and AI integration specialist based on the French Riviera. He is an engineering student at Polytech after three years of work-study in a company. His signature: running AI locally, with nothing sent to a server — that is the thread linking Aegis, Cerber and the company he is preparing."
      },
      {
         id: "nano",
         mots: ["nano", "webllm", "qwen", "modele", "yourself"],
         fr: "Moi, je suis Nano : un vrai petit modèle Qwen2.5-0.5B qui tourne dans TON navigateur via WebGPU. Rien de ce que tu écris ne part sur un serveur. C'est aussi une démonstration en soi — c'est exactement le genre d'IA locale que Bastien veut installer chez ses futurs clients.",
         en: "Me, I'm Nano: a real little Qwen2.5-0.5B model running inside YOUR browser through WebGPU. Nothing you type leaves for a server. It is also a demo in itself — this is exactly the kind of local AI Bastien wants to set up for his future clients."
      },
      {
         id: "site",
         mots: ["naviguer", "navigat", "planète", "planete", "solaire", "solar", "section", "3d", "three.js", "hud", "radar"],
         fr: "Ce portfolio est un système solaire en 3D que l'on traverse en scrollant : chaque section est une planète. Soleil = l'accueil, Mercure = à propos, Vénus = le parcours, la Terre = les chiffres, Mars = l'ambition, Jupiter = les projets, Saturne = les créations, Uranus = les passions, Neptune = le contact. Le petit bouton radar en bas à gauche ouvre le HUD pour voler librement.",
         en: "This portfolio is a 3D solar system you travel through by scrolling: each section is a planet. Sun = home, Mercury = about, Venus = resume, Earth = the numbers, Mars = the ambition, Jupiter = the projects, Saturn = the creations, Uranus = the passions, Neptune = contact. The little radar button at the bottom left opens the HUD to fly around freely."
      }
   ];

   const SALUT = /\b(bonjour|salut|hey|coucou|yo|hello|hi|good morning)\b/i;

   function estSalutation(q) { return SALUT.test(q) && q.length < 24; }

   /* Les gens tapent vite et mal : « tu est qui », « c koi », « qui est
      tu ». On aplatit donc accents, apostrophes et ponctuation avant de
      chercher quoi que ce soit. Sans ça, « tu est qui » ne ressemblait à
      rien de connu et partait au modèle, qui inventait. */
   function aplatir(t) {
      return " " + String(t || "")
         .toLowerCase()
         .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
         .replace(/['\u2019`]/g, " ")
         .replace(/[^a-z0-9]+/g, " ")
         .trim() + " ";
   }

   /* Motifs prioritaires, testés dans l'ordre. Ils tranchent les cas où
      deux fiches se valent au score : « et toi qui est tu ? » contient à
      la fois « qui est » (fiche Bastien) et une adresse directe à Nano.
      Le mot-clé le plus court gagnait, donc Nano répondait avec la
      biographie de Bastien. */
   const PRIORITES = [
      { id: "nano", re: /\b(tu|t) (es|est|e) qui\b|\bqui (es|est) (tu|toi)\b|\bc est qui toi\b|\bqui tu es\b|\bton (modele|nom)\b|\bwho are you\b/ },
      { id: "qui", re: /\bqui (est|etait) bastien\b|\bc est qui bastien\b|\bparle moi de bastien\b|\bwho is bastien\b/ },
      { id: "contact", re: /\b(comment|ou) (le |te |vous )?(contacter|joindre|ecrire)\b/ },
      { id: "entreprise", re: /\b(son|sa|ton|ta) (entreprise|boite|projet d entreprise)\b/ }
   ];

   /* À défaut de motif prioritaire : score pondéré par la longueur du
      mot-clé trouvé. Un mot-clé long est forcément plus spécifique qu'un
      mot court, donc il doit peser plus lourd — c'est ce qui manquait. */
   function chercherFait(texte) {
      const q = aplatir(texte);

      for (let i = 0; i < PRIORITES.length; i++) {
         if (PRIORITES[i].re.test(q)) {
            const f = FAITS.find(function (x) { return x.id === PRIORITES[i].id; });
            if (f) return f;
         }
      }

      let meilleur = null, score = 0;
      FAITS.forEach(function (f) {
         let n = 0;
         f.mots.forEach(function (m) {
            const mm = aplatir(m).trim();
            if (mm && q.indexOf(" " + mm) >= 0) n += mm.length;
         });
         if (n > score) { score = n; meilleur = f; }
      });
      // Un seul mot de trois lettres ne suffit pas à engager une fiche.
      return score >= 4 ? meilleur : null;
   }

   function texteFait(f) { return langue() === "en" ? f.en : f.fr; }

   function accueilDefaut() {
      return langue() === "en"
         ? "I only know Bastien — his projects, his stack, his background, his ambition and how to reach him. Ask me about Aegis, UnderGears, Cerber, his creations or his passions."
         : "Je ne connais que Bastien — ses projets, sa stack, son parcours, son ambition et comment le joindre. Demande-moi Aegis, UnderGears, Cerber, ses créations ou ses passions.";
   }

   function scripte(texte) {
      if (estSalutation(texte)) {
         return langue() === "en"
            ? "Hi! I'm Nano, Bastien's assistant. Ask me about his projects, his stack or his ambition."
            : "Salut ! Je suis Nano, l'assistant de Bastien. Demande-moi ses projets, sa stack ou son ambition.";
      }
      const f = chercherFait(texte);
      return f ? texteFait(f) : accueilDefaut();
   }

   /* Garde-fou de sortie. Un 0.5B glisse régulièrement à la première
      personne (« Je suis Bastien Nieto ») ou rend une bouillie trop
      courte. Dans ces cas-là on jette la génération et on sert le fait. */
   function sortieSuspecte(t) {
      if (!t) return true;
      const x = t.trim();
      if (x.length < 25) return true;
      if (/\b(je suis|i am|i'm)\s+bastien\b/i.test(x)) return true;
      if (/\ben tant que (développeur|developpeur|developer)\b/i.test(x)) return true;
      // Le modèle se met parfois à répondre en anglais en mode français.
      if (langue() === "fr" && /\b(the|and|with|his|which)\b/i.test(x) && !/[àéèêçù]/i.test(x)) return true;
      return false;
   }

   /* ---------- Rendu du journal ---------- */
   function bas() { journal.scrollTop = journal.scrollHeight; }

   function bulle(role, html) {
      const d = document.createElement("div");
      d.className = "nano-bulle " + role;
      d.innerHTML = html;
      journal.appendChild(d);
      bas();
      return d;
   }

   function echappe(s) {
      return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
   }

   function poserEtat(txt, genre) {
      if (!etat) return;
      etat.textContent = txt;
      etat.dataset.genre = genre || "";
   }

   /* ---------- État ---------- */
   let moteur = null;      // moteur WebLLM, ou null
   let mode = null;        // 'llm' | 'scripte'
   let chargement = false;
   let amorce = false;
   const historique = [];

   function amorcer() {
      if (amorce) return;
      amorce = true;
      bulle("nano", S().accueil);
      bulle("note", S().amorce);
      poserEtat(S().veille, "veille");
   }

   /* ---------- Activation du modèle ---------- */
   async function activer(question) {
      if (mode || chargement) { if (question) demander(question); return; }

      if (!("gpu" in navigator)) {
         mode = "scripte";
         poserEtat(S().local, "local");
         bulle("note", S().sansGpu);
         if (question) demander(question);
         return;
      }

      chargement = true;
      poserEtat(S().chargement, "chargement");
      const ligne = bulle("note",
         S().telecharge + ' <span class="nano-pct">0 %</span><span class="nano-jauge"><i></i></span>');
      const jauge = ligne.querySelector(".nano-jauge > i");
      const pct = ligne.querySelector(".nano-pct");

      try {
         const webllm = await import(WEBLLM_CDN);
         moteur = await webllm.CreateMLCEngine(MODELE, {
            initProgressCallback: (r) => {
               const p = Math.round((r.progress || 0) * 100);
               if (jauge) jauge.style.width = p + "%";
               if (pct) pct.textContent = p + " %";
               bas();
            }
         });
         mode = "llm";
         chargement = false;
         poserEtat(S().enligne, "enligne");
         ligne.remove();
         bulle("note", "✓ " + S().pret);
         if (question) demander(question);
      } catch (e) {
         console.warn("[nano] chargement du modèle impossible :", e);
         chargement = false;
         mode = "scripte";
         poserEtat(S().local, "local");
         ligne.remove();
         bulle("note", S().echec);
         if (question) demander(question);
      }
   }

   /* ---------- Poser une question ---------- */
   async function demander(texte) {
      texte = (texte || "").trim();
      if (!texte) return;
      champ.value = "";

      if (!mode && !chargement) { bulle("moi", echappe(texte)); activer(texte); return; }
      if (chargement) return;   // le modèle descend encore : on n'empile pas

      bulle("moi", echappe(texte));

      if (mode === "scripte") {
         bulle("nano", echappe(scripte(texte)));
         return;
      }

      // Les faits passent AVANT le modèle. Sur une question qui touche un
      // sujet connu, une fiche écrite est toujours meilleure qu'une
      // génération de 0.5B : elle est juste, elle est à jour, et elle ne
      // part pas à la première personne. Le modèle garde ce qu'il sait
      // faire — reformuler et répondre à l'imprévu.
      // Une salutation n'a rien à faire dans le modèle : il répondait
      // « Bonjour ! Comment puis-je vous aider ? », ce que dirait
      // n'importe quel assistant générique. Nano se présente.
      if (estSalutation(texte)) {
         bulle("nano", echappe(scripte(texte)));
         return;
      }

      const fait = chercherFait(texte);
      if (fait) {
         bulle("nano", echappe(texteFait(fait)));
         historique.push({ role: "user", content: texte });
         historique.push({ role: "assistant", content: texteFait(fait) });
         return;
      }

      const sortie = bulle("nano", '<span class="nano-points"><i></i><i></i><i></i></span>');
      try {
         historique.push({ role: "user", content: texte });
         // Contexte court et ciblé : la fiche complète noyait un modèle de
         // cette taille, qui en ressortait des bouts recollés au hasard.
         const messages = [{ role: "system", content: consigne() }]
            .concat(exemples())
            .concat(historique.slice(-4));
         const flux = await moteur.chat.completions.create({
            messages: messages, stream: true, temperature: 0.2, top_p: 0.85, max_tokens: 180
         });
         sortie.textContent = "";
         let tout = "";
         for await (const morceau of flux) {
            const d = morceau.choices && morceau.choices[0] && morceau.choices[0].delta && morceau.choices[0].delta.content;
            if (d) { tout += d; sortie.textContent = tout; bas(); }
         }
         if (sortieSuspecte(tout)) {
            // Génération jetée : première personne, charabia ou trop courte.
            console.warn("[nano] generation rejetee :", tout);
            tout = accueilDefaut();
            sortie.textContent = tout;
         }
         historique.push({ role: "assistant", content: tout });
      } catch (e) {
         console.warn("[nano] erreur de génération :", e);
         sortie.textContent = scripte(texte);
      }
   }

   /* ---------- Ouverture / fermeture ---------- */
   function ouvert() { return !boite.hidden; }

   function ouvrir() {
      boite.hidden = false;
      requestAnimationFrame(() => boite.classList.add("visible"));
      drone.classList.add("actif");
      drone.setAttribute("aria-expanded", "true");
      amorcer();
      setTimeout(() => champ.focus({ preventScroll: true }), 220);
   }

   function fermer() {
      boite.classList.remove("visible");
      drone.classList.remove("actif");
      drone.setAttribute("aria-expanded", "false");
      setTimeout(() => { boite.hidden = true; }, 240);
   }

   drone.addEventListener("click", function () { ouvert() ? fermer() : ouvrir(); });
   if (fermerBtn) fermerBtn.addEventListener("click", fermer);

   document.addEventListener("keydown", function (e) {
      // Échap ferme le chat — sauf si une fenêtre modale est ouverte, elle est prioritaire.
      if (e.key !== "Escape" || !ouvert()) return;
      if (document.querySelector(".modale:not([hidden])")) return;
      fermer();
   });

   // Les boutons « Parler à mon IA » de la page ouvrent le même chat.
   document.querySelectorAll("[data-nano-open]").forEach(function (b) {
      b.addEventListener("click", function () { if (!ouvert()) ouvrir(); });
   });

   /* ---------- Saisie ---------- */
   if (formulaire) {
      formulaire.addEventListener("submit", function (e) {
         e.preventDefault();
         demander(champ.value);
      });
   }
   if (puces) {
      puces.querySelectorAll("button").forEach(function (p) {
         p.addEventListener("click", function () { demander(p.textContent.trim()); });
      });
   }
})();

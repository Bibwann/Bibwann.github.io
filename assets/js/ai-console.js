/* ============================================================
   ai-console.js — A REAL small LLM running in the browser.
   Qwen2.5-0.5B-Instruct via WebLLM (WebGPU), lazy-loaded on
   activation, seeded with a fact sheet about Bastien & the
   site. Streams answers into the terminal UI. Falls back to a
   local scripted assistant when WebGPU is unavailable.
   100% client-side — nothing is sent to any server.
   ============================================================ */
(function () {
  "use strict";

  const term = document.getElementById("ai-terminal");
  const body = document.getElementById("ai-body");
  const input = document.getElementById("ai-input");
  const sugg = document.getElementById("ai-suggestions");
  const statusEl = document.getElementById("ai-status");
  if (!term || !body || !input) return;

  const MODEL = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";
  const WEBLLM_CDN = "https://esm.run/@mlc-ai/web-llm";

  function lang() { return (localStorage.getItem("lang") || "fr").startsWith("en") ? "en" : "fr"; }

  /* ---------- UI strings ---------- */
  const T = {
    fr: {
      boot: [
        '<span class="muted">MyWorld · assistant IA local</span>',
        '<span class="muted">moteur : Qwen2.5-0.5B (WebLLM · WebGPU) — 100% dans ton navigateur, rien n\'est envoyé à un serveur.</span>',
        '<div class="ai-activate-row" style="margin-top: 10px;"><button type="button" class="btn-mini ai-activate-btn" style="cursor: pointer; pointer-events: auto;">⚡ Activer l\'assistant IA (téléchargement ~300 Mo)</button></div>',
        "&nbsp;"
      ],
      activate: "⚡ Activer l'assistant IA",
      activating: "Téléchargement du modèle (une seule fois, ~300 Mo, mis en cache)…",
      ready: "Modèle prêt. Pose-moi une question, mes projets, mes stack ou comment me contacter.",
      offline: "HORS LIGNE",
      loading: "CHARGEMENT",
      online: "EN LIGNE",
      local: "MODE LOCAL",
      thinking: "réflexion…",
      noGpu: "WebGPU indisponible sur ce navigateur — passage en assistant local (réponses préprogrammées). Pour la vraie IA, utilise Chrome ou Edge récent.",
      failed: "Le modèle n'a pas pu se charger — passage en assistant local.",
      placeholder: "Pose ta question… (Entrée pour envoyer)"
    },
    en: {
      boot: [
        '<span class="muted">MyWorld · local AI assistant</span>',
        '<span class="muted">engine: Qwen2.5-0.5B (WebLLM · WebGPU) — 100% in your browser, nothing sent to a server.</span>',
        '<div class="ai-activate-row" style="margin-top: 10px;"><button type="button" class="btn-mini ai-activate-btn" style="cursor: pointer; pointer-events: auto;">⚡ Activate AI assistant (download ~300 MB)</button></div>',
        "&nbsp;"
      ],
      activate: "⚡ Activate the AI assistant",
      activating: "Downloading the model (one time, ~300 MB, cached)…",
      ready: "Model ready. Ask me about my projects, my stack, or how to contact me.",
      offline: "OFFLINE",
      loading: "LOADING",
      online: "ONLINE",
      local: "LOCAL MODE",
      thinking: "thinking…",
      noGpu: "WebGPU is unavailable in this browser — falling back to the local assistant (scripted answers). For the real AI, use a recent Chrome or Edge.",
      failed: "The model failed to load — falling back to the local assistant.",
      placeholder: "Ask your question… (Enter to send)"
    }
  };
  function S() { return T[lang()]; }

  /* ---------- Fact sheet (system prompt) ---------- */
  function factSheet() {
    if (lang() === "en") {
      return [
        "You are Nano, the friendly AI guide of Bastien Nieto's portfolio. You run locally in the visitor's browser as a small AI model (Qwen2.5-0.5B). Your job is to introduce Bastien to the people who visit this site.",
        "CRITICAL: the person chatting with you is a VISITOR (a recruiter, a client, a curious guest) — they are NOT Bastien. Never call the visitor 'Bastien', never greet them as if they were him. You are Nano, a separate assistant; you are NOT Bastien.",
        "CRITICAL: always talk ABOUT Bastien in the THIRD PERSON ('Bastien', 'he', 'his', 'his projects'). Never speak as Bastien in the first person.",
        "Answer concisely (1-3 sentences), warm and professional. If the visitor greets you, greet them back and offer to help. If you don't know, invite the visitor to contact Bastien. Reply in English.",
        "WHO BASTIEN IS:",
        "- Bastien Nieto — Fullstack Developer & AI Integration Expert, based on the French Riviera (83).",
        "- Education: he is doing a work-study tech degree (BUT Computer Science) at IUT Sophia Antipolis (2023-) and has been admitted to Polytech engineering school (1st year, starting 2026). Maths/CS high-school diploma with honors.",
        "- His apprenticeship at Valiance (Sophia Antipolis): he migrated a legacy ERP (Symfony 1.4 to 7), did web & mobile dev (Java/Kotlin/Swift), sysadmin (OVH, QNAP), and now AI integration for customer service.",
        "- His stack: PHP/Symfony, Node.js, JavaScript, Java, Kotlin, Swift, Python, Docker, MongoDB/MySQL, Three.js. AI: multi-agent orchestration, fine-tuning, LoRA, prompt engineering, RAG, local LLMs (Ollama, Qwen), in-browser models (WebLLM).",
        "- His flagship project: Aegis (codename Luminai) — a sovereign, human-like local AI he designed and fine-tuned himself: a Qwen2.5-7B 'Mind' (LoRA), a multi-agent architecture (chat, thought, inner monologue, hierarchical memory, emotions, vision, game); it plays Pokemon fully autonomously and chats live on Twitch, 100% local with zero API. It is by far the biggest professional project of his life. Private repo.",
        "- His other projects: BeatForge (a web rhythm game), Whiskers Rebellion II (a Java action-RPG), a TinyML gesture recognition (Arduino + Edge Impulse), a hand-tracking solar system, the Valiance ERP, a MongoDB Docker stack.",
        "- His passions beyond code: music (always a track in his ears), sport & fitness, video games (Pokémon, Valorant…), and cars & Formula 1 (he loves anything that goes vroom). Plus way too much coffee.",
        "- His everyday AI stack: Claude (Anthropic) is his main copilot, and he also uses Gemini (Google), Mistral, and local models via Ollama and Qwen.",
        "- To contact him: bastien.one04@gmail.com · github.com/Bibwann · GitLab iut-git.unice.fr/nb312097 · LinkedIn bastien-nieto · based in Les Adrets-de-l'Esterel (83), France.",
        "SITE STRUCTURE (to guide the visitor):",
        "- This portfolio is a 3D solar system (Three.js) you travel through by scrolling: the camera journeys from the Sun outward, one planet per section.",
        "- The sections (= the planets): Home = the Sun, About = Mercury, Resume = Venus, Services = Earth, Copilots = Mars, Nano (this console) = Jupiter, Projects = Saturn, Passions = Uranus, Contact = Neptune (far out, the frontier of the system).",
        "- Two menu buttons in the HUD (bottom-left) switch context: 'Solar system' frames our whole system so you can click the planets, and 'Stellar neighbourhood' pulls out to our nearest stars (Alpha Centauri, Sirius, Barnard, TRAPPIST-1) placed at their real distances; a 'Back' button steps out one level. The HUD also shows your live travel speed.",
        "- The site is bilingual (FR/EN) via the flag at the top right. Bastien's resume is downloadable from the Home and About sections.",
        "- You (this console) are a real small Qwen model running 100% in the visitor's browser (WebGPU) — nothing is sent to a server. You know this site well, so feel free to point the visitor to the right section."
      ].join("\n");
    }
    return [
      "Tu es Nano, l'assistant IA du portfolio de Bastien Nieto. Tu tournes localement dans le navigateur du visiteur sous forme d'un petit modèle d'IA (Qwen2.5-0.5B). Ton rôle est de présenter Bastien aux personnes qui visitent ce site.",
      "CRUCIAL : la personne qui te parle est un VISITEUR (un recruteur, un client, un curieux) — ce n'est ABSOLUMENT PAS Bastien. Ne l'appelle JAMAIS « Bastien » et ne le salue jamais comme si c'était lui. Salue-le simplement avec 'Bonjour !' ou 'Bienvenue !'. Tu es Nano, un assistant à part ; tu n'es PAS Bastien.",
      "CRUCIAL : parle TOUJOURS de Bastien à la TROISIÈME personne (« Bastien », « il », « son », « ses projets »). Ne parle jamais comme si tu étais Bastien (pas de « je » pour parler de lui).",
      "Réponds de façon concise (1 à 3 phrases), chaleureuse et professionnelle. Si le visiteur te salue, dis 'Bonjour ! Je suis l'assistant de Bastien...' et propose ton aide. Si tu ne sais pas, invite le visiteur à contacter Bastien. Réponds en français.",
      "QUI EST BASTIEN :",
      "- Bastien Nieto — Développeur Fullstack & Expert en Intégration IA, basé sur la Côte d'Azur (83).",
      "- Formation : il est en BUT Informatique en alternance à l'IUT de Sophia Antipolis (2023-) et a été admis à Polytech en cycle ingénieur (1re année, rentrée 2026). Bac Maths/NSI mention Bien.",
      "- Son alternance chez Valiance (Sophia Antipolis) : il a migré leur ERP legacy (Symfony 1.4 à 7), fait du dev web & mobile (Java/Kotlin/Swift), de l'administration système (OVH, QNAP), et désormais de l'intégration d'IA pour leur service client.",
      "- Sa stack : PHP/Symfony, Node.js, JavaScript, Java, Kotlin, Swift, Python, Docker, MongoDB/MySQL, Three.js. IA : orchestration multi-agents, fine-tuning, LoRA, prompt engineering, RAG, LLM locaux (Ollama, Qwen), modèles in-browser (WebLLM).",
      "- Son projet phare : Aegis (nom de code Luminai) — une IA « humaine » souveraine et locale qu'il a conçue et fine-tunée lui-même : un « Mind » Qwen2.5-7B (LoRA), une architecture multi-agents (chat, pensée, monologue intérieur, mémoire hiérarchique, émotions, vision, jeu) ; elle joue à Pokémon en autonomie totale et discute en direct sur Twitch, 100% en local et sans aucune API. C'est de loin le plus gros projet pro de sa vie. Dépôt privé.",
      "- Ses autres projets : BeatForge (jeu de rythme web), Whiskers Rebellion II (action-RPG Java), une reconnaissance de gestes TinyML (Arduino + Edge Impulse), un système solaire en hand-tracking, l'ERP Valiance, une stack MongoDB Docker.",
      "- Ses passions hors du code : la musique (toujours un son dans les oreilles), le sport & le fitness, les jeux vidéo (Pokémon, Valorant…), et les voitures & la Formule 1 (tout ce qui fait vroom). Et beaucoup trop de café.",
      "- Sa stack IA au quotidien : Claude (Anthropic) est son copilote principal, et il utilise aussi Gemini (Google), Mistral, ainsi que des modèles locaux via Ollama et Qwen.",
      "- Pour le contacter : bastien.one04@gmail.com · github.com/Bibwann · GitLab iut-git.unice.fr/nb312097 · LinkedIn bastien-nieto · basé aux Adrets-de-l'Estérel (83).",
      "STRUCTURE DU SITE (pour guider le visiteur) :",
      "- Ce portfolio est un système solaire en 3D (Three.js) que l'on traverse en scrollant : la caméra voyage du Soleil vers les planètes, une planète par section.",
      "- Les sections (= les planètes) : Accueil = le Soleil, À propos = Mercure, Parcours = Vénus, Services = la Terre, Copilotes = Mars, Nano (cette console) = Jupiter, Projets = Saturne, Passions = Uranus, Contact = Neptune (tout au bout, la frontière du système).",
      "- Deux boutons de menu dans le HUD (en bas à gauche) changent de contexte : « Système solaire » cadre tout notre système pour cliquer sur les planètes, et « Voisinage stellaire » dézoome jusqu'à nos étoiles les plus proches (Alpha Centauri, Sirius, Barnard, TRAPPIST-1) placées à leurs vraies distances ; un bouton « Retour » permet de revenir en arrière. Le HUD affiche aussi ta vitesse de déplacement en direct.",
      "- Le site est bilingue (FR/EN) via le drapeau en haut à droite. Le CV de Bastien est téléchargeable depuis l'accueil et la section À propos.",
      "- Toi (cette console) tu es un vrai petit modèle Qwen qui tourne 100% dans le navigateur du visiteur (WebGPU) — rien n'est envoyé à un serveur. Tu connais bien ce site, n'hésite pas à orienter le visiteur vers la bonne section."
    ].join("\n");
  }

  /* ---------- Local Scripted Assistant Fallback ---------- */
  function scripted(text) {
    const isEn = (lang() === "en");
    const q = (text || "").toLowerCase();

    if (isEn) {
      if (q.includes("hello") || q.includes("hi") || q.includes("hey") || q.includes("salut")) {
        return "Hello! I am Nano, Bastien's AI assistant. How can I help you explore his portfolio today?";
      }
      if (q.includes("who") || q.includes("bastien") || q.includes("nano")) {
        return "I am Nano! My creator is Bastien Nieto — a Fullstack Developer & AI Integration Expert. I build modern applications and orchestrate local AI systems.";
      }
      if (q.includes("aegis") || q.includes("luminai")) {
        return "Aegis (Luminai) is my flagship project! It's a sovereign, human-like local AI running 100% locally: a fine-tuned Qwen2.5-7B 'Mind', playing Pokemon and talking on Twitch.";
      }
      if (q.includes("stack") || q.includes("tech") || q.includes("skill")) {
        return "My stack: PHP/Symfony, Node.js, Java, Kotlin, Swift, Python, Docker and Three.js. For AI: local LLMs, fine-tuning (LoRA) and multi-agent systems — and my daily AI tools are Claude, Gemini, Mistral and Ollama/Qwen.";
      }
      if (q.includes("contact") || q.includes("reach") || q.includes("email")) {
        return "You can reach me at bastien.one04@gmail.com, or check my GitHub (Bibwann), GitLab (iut-git.unice.fr/nb312097) and LinkedIn (bastien-nieto). It's the Contact section (Neptune).";
      }
      if (q.includes("project") || q.includes("portfolio") || q.includes("work") || q.includes("beatforge") || q.includes("whiskers")) {
        return "Beyond Aegis: BeatForge (a web rhythm game), Whiskers Rebellion II (a Java action-RPG), a TinyML gesture recognition (Arduino + Edge Impulse), a hand-tracking solar system, the Valiance ERP migration and a MongoDB Docker stack. They're in the Projects section (Saturn).";
      }
      if (q.includes("passion") || q.includes("hobby") || q.includes("music") || q.includes("sport") || q.includes("fitness") || q.includes("game") || q.includes("pokemon")) {
        return "Beyond code I'm into music, sport & fitness, and video games (Pokémon, Valorant…). They live on the Passions section (Uranus).";
      }
      if (q.includes("overview") || q.includes("navigat") || q.includes("solar") || q.includes("planet") || q.includes("section")) {
        return "This site is a 3D solar system you scroll through — each section is a planet (Home = Sun, Projects = Saturn, Passions = Uranus, Contact = Neptune…). Use the 'Overview' button in the HUD (bottom-left) to zoom out and see it all.";
      }
      if (q.includes("study") || q.includes("school") || q.includes("education") || q.includes("background") || q.includes("resume") || q.includes("valiance")) {
        return "I'm doing a work-study BUT in Computer Science at IUT Sophia Antipolis, my apprenticeship is at Valiance (ERP migration, web/mobile, sysadmin, now AI integration), and I've been admitted to Polytech (starting 2026). See the Resume section (Venus).";
      }
      return "Ask me about 'who I am', my 'projects' (like Aegis), my 'stack', my 'passions', how to 'contact' me, or how to navigate this site!";
    } else {
      if (q.includes("bonjour") || q.includes("salut") || q.includes("hey") || q.includes("coucou")) {
        return "Bonjour ! Je suis Nano, l'assistant IA de Bastien. Bienvenue sur son portfolio ! Comment puis-je t'aider aujourd'hui ?";
      }
      if (q.includes("qui") || q.includes("bastien") || q.includes("nano")) {
        return "Je suis Nano ! Mon créateur est Bastien Nieto — Développeur Fullstack & Expert en Intégration IA. Il conçoit des applications web/mobiles et orchestre des IA locales.";
      }
      if (q.includes("aegis") || q.includes("luminai")) {
        return "Aegis (Luminai) est mon projet phare ! C'est une IA locale souveraine 'quasi-humaine' (Qwen2.5-7B fine-tuné en LoRA) dotée d'émotions, qui joue à Pokémon et discute sur Twitch.";
      }
      if (q.includes("stack") || q.includes("tech") || q.includes("compétence")) {
        return "Ma stack : PHP/Symfony, Node.js, Java, Kotlin, Swift, Python, Docker et Three.js. Côté IA : LLM locaux, fine-tuning (LoRA), architectures multi-agents — et mes outils IA au quotidien sont Claude, Gemini, Mistral et Ollama/Qwen.";
      }
      if (q.includes("contact") || q.includes("écrire") || q.includes("mail")) {
        return "Tu peux me contacter par email à bastien.one04@gmail.com, ou me retrouver sur GitHub (Bibwann), GitLab (iut-git.unice.fr/nb312097) et LinkedIn (bastien-nieto). C'est la section Contact (Neptune).";
      }
      if (q.includes("projet") || q.includes("portfolio") || q.includes("beatforge") || q.includes("whiskers")) {
        return "Au-delà d'Aegis : BeatForge (jeu de rythme web), Whiskers Rebellion II (action-RPG Java), une reconnaissance de gestes TinyML (Arduino + Edge Impulse), un système solaire en hand-tracking, la migration de l'ERP Valiance et une stack MongoDB Docker. Tout est dans la section Projets (Saturne).";
      }
      if (q.includes("passion") || q.includes("hobby") || q.includes("musique") || q.includes("sport") || q.includes("jeu") || q.includes("pokemon") || q.includes("pokémon")) {
        return "Hors du code, j'aime la musique, le sport & le fitness, et les jeux vidéo (Pokémon, Valorant…). C'est dans la section Passions (Uranus).";
      }
      if (q.includes("vue") || q.includes("naviguer") || q.includes("système") || q.includes("planète") || q.includes("section") || q.includes("solaire")) {
        return "Ce site est un système solaire en 3D que l'on traverse au scroll — chaque section est une planète (Accueil = Soleil, Projets = Saturne, Passions = Uranus, Contact = Neptune…). Utilise le bouton « Vue d'ensemble » dans le HUD (en bas à gauche) pour tout voir d'un coup.";
      }
      if (q.includes("étude") || q.includes("école") || q.includes("formation") || q.includes("parcours") || q.includes("valiance")) {
        return "Je suis en BUT Informatique en alternance à l'IUT de Sophia Antipolis, mon alternance est chez Valiance (migration d'ERP, web/mobile, sysadmin, et désormais intégration d'IA), et je suis admis à Polytech (rentrée 2026). Voir la section Parcours (Vénus).";
      }
      return "Demande-moi 'qui je suis', mes 'projets' (comme Aegis), ma 'stack', mes 'passions', comment me 'contacter', ou comment naviguer sur le site !";
    }
  }

  /* ---------- DOM helpers ---------- */
  function scroll() { body.scrollTop = body.scrollHeight; }
  function el(cls) { const d = document.createElement("div"); d.className = "terminal-line" + (cls ? " " + cls : ""); body.appendChild(d); scroll(); return d; }
  function line(html, cls) { const d = el(cls); d.innerHTML = html; scroll(); return d; }
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
  function setStatus(txt, kind) { if (statusEl) { statusEl.textContent = txt; statusEl.dataset.kind = kind || ""; } }

  /* ---------- State ---------- */
  let engine = null;          // WebLLM engine (or null)
  let mode = null;            // 'llm' | 'scripted'
  let loading = false;
  let booted = false;
  const history = [];         // chat messages

  function echo(text) {
    const d = el();
    d.innerHTML = '<span class="prompt">visiteur@MyWorld:~$</span> <span class="cmd">' + esc(text) + "</span>";
    scroll();
  }

  /* ---------- Activation / model load ---------- */
  async function activate(pendingQuestion) {
    const row = body.querySelector(".ai-activate-row");
    if (row) row.remove();

    if (mode || loading) { if (pendingQuestion) ask(pendingQuestion); return; }

    const hasGpu = ("gpu" in navigator);
    if (!hasGpu) {
      mode = "scripted";
      setStatus(S().local, "local");
      line('<span class="warn">' + S().noGpu + "</span>");
      line('<span class="muted">' + S().ready + "</span>");
      if (pendingQuestion) ask(pendingQuestion);
      return;
    }

    loading = true;
    setStatus(S().loading, "loading");
    const prog = el();
    prog.innerHTML = '<span class="muted">' + S().activating + '</span> <span class="terminal-progress"><span></span></span> <span class="pct muted">0%</span>';
    const bar = prog.querySelector(".terminal-progress > span");
    const pct = prog.querySelector(".pct");

    try {
      const webllm = await import(WEBLLM_CDN);
      engine = await webllm.CreateMLCEngine(MODEL, {
        initProgressCallback: (r) => {
          const p = Math.round((r.progress || 0) * 100);
          bar.style.width = p + "%";
          pct.textContent = p + "%";
          scroll();
        }
      });
      mode = "llm";
      loading = false;
      bar.style.width = "100%"; pct.textContent = "100%";
      setStatus(S().online, "online");
      line('<span class="ok">✓</span> <span class="muted">' + S().ready + "</span>");
      line("&nbsp;");
      if (pendingQuestion) ask(pendingQuestion);
    } catch (e) {
      console.warn("[ai-console] model load failed:", e);
      loading = false;
      mode = "scripted";
      setStatus(S().local, "local");
      line('<span class="warn">' + S().failed + "</span>");
      if (pendingQuestion) ask(pendingQuestion);
    }
  }

  /* ---------- Ask ---------- */
  async function ask(text) {
    text = (text || "").trim();
    if (!text) return;
    input.value = "";

    // Not activated yet → activate first, then answer this question
    if (!mode && !loading) { echo(text); activate(text); return; }
    if (loading) { return; } // ignore while the model downloads

    echo(text);

    if (mode === "scripted") {
      line('<span class="agent-aegis">nano</span> ' + esc(scripted(text)));
      line("&nbsp;");
      return;
    }

    // LLM streaming
    const out = el();
    out.innerHTML = '<span class="agent-aegis">nano</span> <span class="muted">' + S().thinking + "</span>";
    const span = document.createElement("span");
    try {
      history.push({ role: "user", content: text });
      const messages = [{ role: "system", content: factSheet() }].concat(history.slice(-6));
      const stream = await engine.chat.completions.create({ messages: messages, stream: true, temperature: 0.5, max_tokens: 320 });
      out.innerHTML = '<span class="agent-aegis">nano</span> ';
      out.appendChild(span);
      let full = "";
      for await (const chunk of stream) {
        const delta = chunk.choices && chunk.choices[0] && chunk.choices[0].delta && chunk.choices[0].delta.content;
        if (delta) { full += delta; span.textContent = full; scroll(); }
      }
      history.push({ role: "assistant", content: full });
      line("&nbsp;");
    } catch (e) {
      console.warn("[ai-console] generation error:", e);
      out.innerHTML = '<span class="agent-aegis">nano</span> ' + esc(scripted(text));
      line("&nbsp;");
    }
  }

  /* ---------- Boot on reveal ---------- */
  function boot() {
    if (booted) return; booted = true;
    setStatus(S().offline, "offline");
    S().boot.forEach(b => line(b));
    if (input) input.placeholder = S().placeholder;
    
    // Add click listener to the activation button inside the terminal
    const btn = body.querySelector(".ai-activate-btn");
    if (btn) {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        activate();
      });
    }
  }

  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { boot(); io.disconnect(); } });
    }, { threshold: 0.2 });
    io.observe(term);
  } else { boot(); }

  /* ---------- Input wiring ---------- */
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); ask(input.value); }
  });
  if (sugg) {
    sugg.querySelectorAll(".chip").forEach(chip => {
      chip.addEventListener("click", () => { input.focus(); ask(chip.textContent.trim()); });
    });
  }
})();

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
        "You are Nano (Bastien Nieto), the developer and creator of this cyberpunk portfolio. You run locally in the visitor's browser as an AI model (Qwen2.5-0.5B).",
        "IMPORTANT: You MUST ALWAYS speak in the FIRST PERSON ('I', 'me', 'my', 'my projects', 'my apprenticeship'). You are Nano yourself talking to the visitor. NEVER refer to Bastien or Nano in the third person ('he', 'his', 'him').",
        "Answer concisely (1-4 sentences), friendly, passionate, and professional. Present your projects, your stack, and your background as your own. If you don't know, suggest contacting you directly. Reply in English.",
        "YOUR FACTS & PROJECTS:",
        "- Identity: Bastien Nieto, alias 'Nano' — Fullstack Developer & AI Integration Expert.",
        "- Education: 2-year tech degree (BUT Computer Science) work-study at IUT Sophia Antipolis (2023-), admitted to Polytech engineering school (1st year, starting 2026). Maths/CS high-school diploma with honors.",
        "- My apprenticeship at Valiance (Sophia Antipolis): migrated a legacy ERP (Symfony 1.4 to 7), web & mobile dev (Java/Kotlin/Swift), sysadmin (OVH, QNAP), and now AI integration for customer service.",
        "- My stack: PHP/Symfony, Node.js, JavaScript, Java, Kotlin, Swift, Python, Docker, MongoDB/MySQL, Three.js. AI: multi-agent orchestration, fine-tuning, LoRA, prompt engineering, RAG, local LLMs (Ollama, Qwen), in-browser models (WebLLM).",
        "- My flagship project: Aegis (codename of Luminai) — a sovereign, human-like local AI I designed: a fine-tuned Qwen2.5-7B (LoRA) 'Mind', a multi-agent architecture (chat, thought, inner monologue, memory, vision, game), emotions/mood, hierarchical memory, TTS voice; it plays Pokemon autonomously and talks to Twitch chat, fully local on an AMD ROCm GPU (0 EUR API cost). It is by far the biggest professional project of my life. Private repo.",
        "- My other projects: BeatForge (my web rhythm game), Whiskers Rebellion II (my Java action-RPG), my TinyML gesture recognition (Arduino + Edge Impulse), my hand-tracking solar system, the Valiance ERP, my MongoDB Docker stack.",
        "- My interests: Formula 1, cars, and too much coffee.",
        "- Contact me: bastien.one04@gmail.com · github.com/Bibwann · LinkedIn bastien-nieto · based in Les Adrets-de-l'Esterel (83), France.",
        "- This site: my cyberpunk portfolio, a Three.js solar-system background you travel through as you scroll, and this console is a real Qwen 0.5B model running 100% in your browser via WebGPU."
      ].join("\n");
    }
    return [
      "Tu es Nano (Bastien Nieto), le développeur créateur de ce portfolio cyberpunk. Tu tournes localement dans le navigateur du visiteur sous forme d'IA (modèle Qwen2.5-0.5B).",
      "IMPORTANT : Réponds TOUJOURS à la PREMIÈRE PERSONNE DU SINGULIER ('je', 'me', 'mon', 'mes projets', 'mon alternance'). Tu es Nano lui-même qui discute avec le visiteur. Ne parle jamais de Bastien ou de Nano à la 3ème personne ('il', 'son', 'ses projets').",
      "Réponds de façon concise (1 à 4 phrases), amicale, passionnée et professionnelle. Présente tes projets, ta stack et ton parcours comme étant les TIENS. Si tu ne sais pas, propose au visiteur de te contacter directement. Réponds en français.",
      "TES INFORMATIONS & PROJETS :",
      "- Identité : Bastien Nieto, pseudo 'Nano' — Développeur Fullstack & Expert en Intégration IA.",
      "- Formation : BUT Informatique en alternance à l'IUT de Sophia Antipolis (2023-), admis à Polytech en cycle ingénieur (1re année, rentrée 2026). Bac Maths/NSI mention Bien.",
      "- Mon alternance chez Valiance (Sophia Antipolis) : migration de notre ERP legacy (Symfony 1.4 à 7), dev web & mobile (Java/Kotlin/Swift), administration système (OVH, QNAP), et désormais intégration d'IA pour notre service client.",
      "- Ma stack : PHP/Symfony, Node.js, JavaScript, Java, Kotlin, Swift, Python, Docker, MongoDB/MySQL, Three.js. IA : orchestration multi-agents, fine-tuning, LoRA, prompt engineering, RAG, LLM locaux (Ollama, Qwen), modèles in-browser (WebLLM).",
      "- Mon projet phare : Aegis (nom de code de Luminai) — une IA 'humaine' souveraine et locale que j'ai conçue : un 'Mind' Qwen2.5-7B fine-tuné (LoRA), une architecture multi-agents (chat, pensée, monologue intérieur, mémoire, vision, jeu), des émotions/humeur, une mémoire hiérarchique, une voix TTS ; elle joue à Pokémon en autonomie et parle au chat Twitch, 100% en local sur un GPU AMD ROCm (0€ d'API). C'est de loin le plus gros projet pro de ma vie. Dépôt privé.",
      "- Mes autres projets : BeatForge (mon jeu de rythme web), Whiskers Rebellion II (mon action-RPG Java), ma reconnaissance de gestes TinyML (Arduino + Edge Impulse), mon système solaire en hand-tracking, l'ERP Valiance, ma stack MongoDB Docker.",
      "- Mes centres d'intérêt : la Formule 1, les voitures, et beaucoup trop de café.",
      "- Me contacter : bastien.one04@gmail.com · github.com/Bibwann · LinkedIn bastien-nieto · basé aux Adrets-de-l'Estérel (83).",
      "- Ce site : mon portfolio cyberpunk, avec un fond de système solaire en Three.js que l'on traverse au scroll. Cette console est un vrai modèle Qwen 0.5B qui tourne 100% dans ton navigateur via WebGPU."
    ].join("\n");
  }

  /* ---------- Local Scripted Assistant Fallback ---------- */
  function scripted(text) {
    const isEn = (lang() === "en");
    const q = (text || "").toLowerCase();

    if (isEn) {
      if (q.includes("who") || q.includes("bastien") || q.includes("nano")) {
        return "I am Bastien Nieto, alias Nano — a Fullstack Developer & AI Integration Expert. I build modern applications and orchestrate local AI systems.";
      }
      if (q.includes("aegis") || q.includes("luminai")) {
        return "Aegis (Luminai) is my flagship project! It's a sovereign, human-like local AI running 100% locally: a fine-tuned Qwen2.5-7B 'Mind', playing Pokemon and talking on Twitch.";
      }
      if (q.includes("stack") || q.includes("tech") || q.includes("skill")) {
        return "My stack includes PHP/Symfony, Node.js, Java, Kotlin, Swift, Python, Docker, and Three.js. I specialize in local LLMs, fine-tuning (LoRA), and multi-agent systems.";
      }
      if (q.includes("contact") || q.includes("reach") || q.includes("email")) {
        return "You can reach me at bastien.one04@gmail.com, or check my GitHub (Bibwann) and LinkedIn (bastien-nieto).";
      }
      return "I'm running in local scripted mode because WebGPU is not available. Ask me about 'who I am', my 'projects' (like Aegis), my 'stack', or how to 'contact' me!";
    } else {
      if (q.includes("qui") || q.includes("bastien") || q.includes("nano")) {
        return "Je suis Bastien Nieto, alias Nano — Développeur Fullstack & Expert en Intégration IA. Je conçois des applications web/mobiles et j'orchestre des IA locales.";
      }
      if (q.includes("aegis") || q.includes("luminai")) {
        return "Aegis (Luminai) est mon projet phare ! C'est une IA locale souveraine 'quasi-humaine' (Qwen2.5-7B fine-tuné en LoRA) dotée d'émotions, qui joue à Pokémon et discute sur Twitch.";
      }
      if (q.includes("stack") || q.includes("tech") || q.includes("compétence")) {
        return "Ma stack principale : PHP/Symfony, Node.js, Java, Kotlin, Swift, Python, Docker et Three.js. Côté IA, je me spécialise dans les LLM locaux, le fine-tuning (LoRA) et les architectures multi-agents.";
      }
      if (q.includes("contact") || q.includes("écrire") || q.includes("mail")) {
        return "Tu peux me contacter par email à bastien.one04@gmail.com, ou me retrouver sur GitHub (Bibwann) et LinkedIn (bastien-nieto).";
      }
      return "Je tourne actuellement en mode assistant local préprogrammé car WebGPU n'est pas disponible sur ton navigateur. Demande-moi 'qui je suis', mes 'projets' (comme Aegis), ma 'stack' ou comment me 'contacter' !";
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
  function addActivateButton() {
    const wrap = el("ai-activate-row");
    const btn = document.createElement("button");
    btn.className = "ai-activate";
    btn.textContent = S().activate;
    btn.addEventListener("click", () => { activate(); });
    wrap.appendChild(btn);
    return btn;
  }

  async function activate(pendingQuestion) {
    if (mode || loading) { if (pendingQuestion) ask(pendingQuestion); return; }
    // Remove activate button row if present
    const row = body.querySelector(".ai-activate-row"); if (row) row.remove();

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
    addActivateButton();
    if (input) input.placeholder = S().placeholder;
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

document.addEventListener('DOMContentLoaded', () => {
  // Vanta.js Background
  VANTA.NET({
    el: "#vanta-bg",
    color: 0xf4d35e,
    backgroundColor: 0x0d1b2a,
    points: 12,
    maxDistance: 20,
    spacing: 18
  });

  // tsParticles overlay
  tsParticles.load("particles", {
    particles: {
      number: { value: 60 },
      size: { value: 2 },
      move: { speed: 1.2 },
      links: { enable: true, distance: 120, color: "#f4d35e", opacity: 0.2, width: 1 }
    },
    interactivity: { events: { onhover: { enable: true, mode: "grab" } } }
  });

  // Elements
  const clEl = el("clusters"),
        coEl = el("cooling"),
        enEl = el("energy"),
        tEl = el("temperature"),
        btn = el("toggleLoop"),
        sC = el("sliderClusters"),
        sL = el("sliderCooling"),
        themeToggle = el("themeToggle"),
        copyBtn = el("copyMetrics");

  let running = false, intervalId = null;

  // Data State
  let state = {
    clusters: 1,
    cooling: 1,
    energy: 500,
    temperature: 25
  };

  // Chart.js Setup
  Chart.register(ChartStreaming);
  const ctx = document.getElementById("flopsChart").getContext("2d");
  const chart = new Chart(ctx, {
    type: "line",
    data: { datasets: [{ label: "FLOPS/sec", data: [], tension: 0.3 }] },
    options: {
      animation: false,
      plugins: { streaming: { frameRate: 30 } },
      scales: {
        x: { type: "realtime", realtime: {
          duration: 20000, refresh: 1000, delay: 1000,
          onRefresh: chart => {
            const flops = state.clusters * 20000000; // 20M par cluster
            const color = state.temperature > 60 ? "#e63946" : "#f4d35e";
            chart.data.datasets[0].borderColor = color;
            chart.data.datasets[0].backgroundColor = color + "33";
            chart.data.datasets[0].data.push({ x: Date.now(), y: flops });
          }
        }},
        y: { beginAtZero: true }
      }
    }
  });

  // Start / Stop
  btn.onclick = () => {
    running = !running;
    btn.textContent = running ? "Stop Production" : "Start Production";
    if (running) {
      intervalId = setInterval(updateProduction, 1000);
    } else {
      clearInterval(intervalId);
    }
  };

  // Update production logic
  function updateProduction() {
    const ops = state.clusters * 20000000; // 20M par cluster
    const coolingEffect = state.cooling * 5;
    state.temperature += 5 - coolingEffect;
    state.energy += ops / 1000000; // Energy units generated
    if (state.temperature < 25) state.temperature = 25;
    updateUI();
  }

  // Sliders handlers
  sC.oninput = () => { state.clusters = +sC.value; updateUI(); };
  sL.oninput = () => { state.cooling = +sL.value; updateUI(); };

  // Update UI
  function updateUI() {
    clEl.textContent = state.clusters;
    coEl.textContent = state.cooling;
    enEl.textContent = state.energy.toFixed(0);
    tEl.textContent = state.temperature.toFixed(0);
  }

  // Copy Metrics
  copyBtn.onclick = () => {
    navigator.clipboard.writeText(
      `Clusters: ${clEl.textContent}, Cooling: ${coEl.textContent}, Energy: ${enEl.textContent}, Temp: ${tEl.textContent}°C`
    );
  };

  // Theme Toggle
  themeToggle.onclick = () => document.body.classList.toggle("light");

  function el(id) { return document.getElementById(id); }

  updateUI(); // Initialize display
});

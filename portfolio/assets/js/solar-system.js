/* ============================================================
   solar-system.js — Interactive solar-system background.
   A textured Sun + planets (Bastien's own textures), orbit
   rings, asteroid belt and starfield. As you scroll, the
   camera takes a "voyage" from the Sun outward, gliding from
   planet to planet — one planet framed per section. No mouse
   motion; matte-black space void with static stars.
   ============================================================ */
(function () {
  "use strict";

  const canvas = document.getElementById("webgl-bg");
  if (!canvas) return;
  if (typeof THREE === "undefined") {
    console.warn("[solar] THREE unavailable — keeping CSS background.");
    return;
  }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isMobile = window.matchMedia("(max-width: 768px)").matches;
  const TEX = "assets/img/space/";

  let renderer, scene, camera, asteroidBelt = null;
  let width = window.innerWidth, height = window.innerHeight;
  let running = true, frameId = null, inspectTarget = null, controls = null, overviewTransition = false, ignoreScroll = false, isDragging = false, startX = 0, startY = 0;

  try {
    // Pas de MSAA sur mobile ni sur les écrans denses : à partir de 1.5x de
    // densité, l'anticrénelage coûte cher pour un gain invisible.
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile && (window.devicePixelRatio || 1) < 1.5, alpha: true, powerPreference: "high-performance" });
  } catch (e) {
    console.warn("[solar] WebGL unavailable — keeping CSS background.");
    return;
  }
  // Densité de rendu plafonnée : en 2x, un écran 1440p fait calculer quatre
  // fois plus de pixels à chaque image pour un fond qui reste flou et sombre.
  // `qualite` est ensuite ajustée à la volée (voir ajusterQualite dans la boucle).
  const DPR_MAX = Math.min(window.devicePixelRatio || 1, isMobile ? 1 : 1.5);
  const DPR_MIN = 0.75;
  let qualite = DPR_MAX;
  renderer.setPixelRatio(qualite);
  renderer.setSize(width, height, false);
  renderer.setClearColor(0x000000, 1); // opaque matte-black void
  if ("outputEncoding" in renderer) renderer.outputEncoding = THREE.sRGBEncoding;

  scene = new THREE.Scene();
  // Very light fog — just enough to give the outer system some depth.
  scene.fog = new THREE.FogExp2(0x000000, 0.000004);
  // The scene now ends at the Kuiper belt (~5300 u) and the overview camera sits
  // ~9600 u out, so ~24k covers everything. Keeping the far plane tight (instead
  // of the old 130k needed by the interstellar neighbours) buys back a lot of
  // depth-buffer precision — the starfield and the orbit rings stop fighting.
  camera = new THREE.PerspectiveCamera(55, width / height, 0.5, 24000);
  camera.position.set(0, 15, 130);

  // Track camera speed for HUD display
  let lastCamPos = new THREE.Vector3(0, 15, 130);
  let displaySpeed = 0;

  // When inspecting a body we freeze all orbital motion so the target is still
  // and the camera can truly settle on it (a major cause of the motion sickness).
  let orbitsRunning = true;

  // History of inspect targets so the "back" button can step out one level at a
  // time (sub-body -> system -> overview -> voyage).
  let inspectStack = [];

  // Framerate-independent camera smoothing. ONE rate drives position, look and
  // FOV together so the view eases in without the old "swim" that caused nausea.
  let lastFrameTime = (typeof performance !== "undefined") ? performance.now() : Date.now();
  const CAM_LAMBDA = 2.6; // higher = snappier approach, lower = floatier

  if (typeof THREE.OrbitControls !== "undefined") {
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enabled = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 45;     // Don't get too close to Sun
    controls.maxDistance = 16000;  // Far enough to hold the whole system in frame
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,      // Left click drag to pan
      MIDDLE: THREE.MOUSE.DOLLY,  // Middle/wheel zoom
      RIGHT: THREE.MOUSE.ROTATE   // Right click drag to rotate
    };
  }

  const loader = new THREE.TextureLoader();
  function tex(file) {
    const t = loader.load(TEX + file);
    if ("encoding" in t) t.encoding = THREE.sRGBEncoding;
    return t;
  }

  /* ---------- Zoom Interactions & Helpers ---------- */
  function scrollPageToSection(selector) {
    setOverview(false);
    if (inspectTarget) {
      inspectTarget = null;
      document.body.classList.remove("inspect-active");
    }
    const target = document.querySelector(selector);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth' });
    }
  }

  function zoomToInspect(obj3d, radius, name, type, distAU, velKMS, isBack) {
    // Remember where we came from so "back" can step out one level at a time.
    if (!isBack && inspectTarget) {
      inspectStack.push({
        obj3d: inspectTarget.obj3d, radius: inspectTarget.radius, name: inspectTarget.name,
        type: inspectTarget.type, distAU: inspectTarget.distAU, velKMS: inspectTarget.velKMS
      });
    }
    document.body.classList.add("inspect-active");
    const isSunSystem = (obj3d === sun && name === "SYSTEME SOLAIRE");
    inspectTarget = {
      obj3d: obj3d,
      radius: radius,
      name: name,
      type: type,
      distAU: distAU,
      velKMS: velKMS,
      update: function () {
        const pp = new THREE.Vector3();
        this.obj3d.getWorldPosition(pp);
        const radial = pp.clone().normalize();
        if (radial.length() < 0.001) radial.set(0, 0, 1); // fallback for origin objects
        const tangent = new THREE.Vector3().crossVectors(UP, radial).normalize();
        if (tangent.length() < 0.001) tangent.set(1, 0, 0);

        let dist;
        if (isSunSystem) {
          dist = 1200;
        } else {
          dist = this.radius * 2.4 + 16;
        }

        // Side-on perspective for individual bodies.
        this.camPos = pp.clone()
          .addScaledVector(tangent, dist * 0.40)
          .addScaledVector(radial, dist * 0.92)
          .addScaledVector(UP, dist * 0.30 + this.radius * 0.25);
        this.lookPos = pp.clone().addScaledVector(tangent, this.radius * 0.9 * -1);
      }
    };
    inspectTarget.update();
    desiredCam.copy(inspectTarget.camPos);
    desiredLook.copy(inspectTarget.lookPos);
    setOverview(false);
  }

  function inspectPlanetWithSection(i) {
    const def = planetDefs[i];
    const sect = sectionSelectors[i];
    
    ignoreScroll = true;
    setOverview(false); // Exit overview mode
    
    // Scroll to target instantly
    const target = document.querySelector(sect);
    if (target) {
      target.scrollIntoView({ behavior: 'auto' });
    }
    
    // Update scroll segment manually
    scrollSegment = i + 1; // index 0 is Hero
    
    // Call zoomToInspect
    zoomToInspect(
      planets[i].mesh, 
      def.r, 
      planetFrenchNames[i], 
      planetTypes[i], 
      (def.d / 270).toFixed(2) + " AU", 
      (29.78 / Math.sqrt(def.d / 270)).toFixed(2) + " KM/S"
    );
    
    // Reset ignoreScroll after a short delay
    setTimeout(() => {
      ignoreScroll = false;
    }, 50);
  }

  /* ---------- Procedural Textures & Models ---------- */
  function createMoonTexture() {
    const size = 512, cv = document.createElement("canvas");
    cv.width = cv.height = size;
    const ctx = cv.getContext("2d");

    // Base lunar grey
    ctx.fillStyle = "#b5b5b5";
    ctx.fillRect(0, 0, size, size);

    // Draw Maria (dark volcanic plains)
    const maria = [
      { x: 180, y: 150, rx: 70, ry: 50 },
      { x: 260, y: 180, rx: 80, ry: 60 },
      { x: 340, y: 220, rx: 60, ry: 40 },
      { x: 140, y: 240, rx: 50, ry: 40 },
      { x: 220, y: 320, rx: 90, ry: 50 }
    ];
    maria.forEach(m => {
      const grad = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, Math.max(m.rx, m.ry));
      grad.addColorStop(0, "rgba(75, 75, 75, 0.75)");
      grad.addColorStop(0.6, "rgba(90, 90, 90, 0.4)");
      grad.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(m.x, m.y, m.rx, m.ry, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw bright highlands/crater ejecta ray systems (e.g. Tycho, Copernicus)
    const craters = [
      { x: 220, y: 380, r: 8, rays: 12, length: 120 },
      { x: 160, y: 200, r: 6, rays: 8, length: 60 },
      { x: 300, y: 160, r: 5, rays: 6, length: 45 }
    ];
    craters.forEach(c => {
      ctx.strokeStyle = "rgba(245, 245, 245, 0.25)";
      ctx.lineWidth = 1;
      for (let j = 0; j < c.rays; j++) {
        const angle = (j / c.rays) * Math.PI * 2 + Math.random() * 0.2;
        const len = c.length * (0.6 + Math.random() * 0.5);
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(c.x + Math.cos(angle) * len, c.y + Math.sin(angle) * len);
        ctx.stroke();
      }

      const grad = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.r * 2);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.3, "#e5e5e5");
      grad.addColorStop(1, "rgba(180, 180, 180, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r * 2, 0, Math.PI * 2);
      ctx.fill();
    });

    // Add thousands of small craters for high-frequency detail
    for (let i = 0; i < 400; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = 1 + Math.random() * 5;

      ctx.strokeStyle = "rgba(0, 0, 0, 0.2)";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
      ctx.beginPath();
      ctx.arc(x + 0.5, y + 0.5, r - 0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    const t = new THREE.CanvasTexture(cv);
    if ("encoding" in t) t.encoding = THREE.sRGBEncoding;
    return t;
  }

  function createPlutoTexture() {
    const size = 512, cv = document.createElement("canvas");
    cv.width = cv.height = size;
    const ctx = cv.getContext("2d");

    // Base background (Pluto's rusty brownish-red color)
    ctx.fillStyle = "#8d644d";
    ctx.fillRect(0, 0, size, size);

    // Add some dark reddish-brown patches (like Cthulhu Macula)
    for (let i = 0; i < 15; i++) {
      const x = Math.random() * size;
      const y = size * 0.5 + (Math.random() - 0.5) * size * 0.4;
      const r = 40 + Math.random() * 80;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, "rgba(58, 28, 16, 0.7)");
      grad.addColorStop(0.5, "rgba(79, 44, 27, 0.4)");
      grad.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw the famous heart-shaped region (Tombaugh Regio)
    const hx = 256;
    const hy = 320;

    // Left lobe of the heart
    ctx.beginPath();
    const leftGrad = ctx.createRadialGradient(hx - 30, hy + 10, 0, hx - 30, hy + 10, 70);
    leftGrad.addColorStop(0, "#f9f2e7"); // Light cream/white
    leftGrad.addColorStop(0.6, "#e8dcd0");
    leftGrad.addColorStop(1, "rgba(141, 100, 77, 0)");
    ctx.fillStyle = leftGrad;
    ctx.arc(hx - 30, hy + 10, 70, 0, Math.PI * 2);
    ctx.fill();

    // Right lobe of the heart
    ctx.beginPath();
    const rightGrad = ctx.createRadialGradient(hx + 30, hy + 10, 0, hx + 30, hy + 10, 60);
    rightGrad.addColorStop(0, "#f5ebd6"); // Slightly darker cream
    rightGrad.addColorStop(0.6, "#dfd1c1");
    rightGrad.addColorStop(1, "rgba(141, 100, 77, 0)");
    ctx.fillStyle = rightGrad;
    ctx.arc(hx + 30, hy + 10, 60, 0, Math.PI * 2);
    ctx.fill();

    // Add some crater noise and rocky texture
    for (let i = 0; i < 200; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = 2 + Math.random() * 6;

      ctx.strokeStyle = "rgba(0, 0, 0, 0.15)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
      ctx.beginPath();
      ctx.arc(x + 1, y + 1, r - 1, 0, Math.PI * 2);
      ctx.fill();
    }

    const t = new THREE.CanvasTexture(cv);
    if ("encoding" in t) t.encoding = THREE.sRGBEncoding;
    return t;
  }

  /* ---------- Inclined orbital position ---------- */
  // Returns the 3D position of a body on a circular orbit of radius def.d,
  // tilted by def.inc (inclination) about a line of nodes at longitude def.node.
  // This is what gives the system real relief (no longer all on the y=0 plane).
  function planetPosition(def, angle) {
    const d = def.d;
    const inc = def.inc || 0;
    const node = def.node || 0;
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    const cosN = Math.cos(node), sinN = Math.sin(node);
    const cosI = Math.cos(inc), sinI = Math.sin(inc);
    return new THREE.Vector3(
      d * (cosN * cosA - sinN * sinA * cosI),
      d * (sinA * sinI),
      d * (sinN * cosA + cosN * sinA * cosI)
    );
  }

  function createFoilTexture() {
    const size = 128, cv = document.createElement("canvas");
    cv.width = cv.height = size;
    const ctx = cv.getContext("2d");

    ctx.fillStyle = "#d4af37"; // Gold base
    ctx.fillRect(0, 0, size, size);

    for (let i = 0; i < 40; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const w = 15 + Math.random() * 30;
      const h = 15 + Math.random() * 30;
      const grad = ctx.createLinearGradient(x, y, x + w, y + h);
      grad.addColorStop(0, "rgba(255, 255, 255, 0.25)");
      grad.addColorStop(0.5, "rgba(0, 0, 0, 0.2)");
      grad.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y + Math.random() * 10);
      ctx.lineTo(x + w * 0.8, y + h);
      ctx.closePath();
      ctx.fill();
    }
    const t = new THREE.CanvasTexture(cv);
    if ("encoding" in t) t.encoding = THREE.sRGBEncoding;
    return t;
  }

  function createVoyager1Mesh() {
    const voyager = new THREE.Group();

    // 1. Golden Bus (central cylinder aligned along Z-axis)
    const busGeo = new THREE.CylinderGeometry(0.8, 0.8, 1.0, 10);
    const foilTex = createFoilTexture();
    const busMat = new THREE.MeshStandardMaterial({
      map: foilTex,
      roughness: 0.2,
      metalness: 0.9,
      color: 0xffd700
    });
    const bus = new THREE.Mesh(busGeo, busMat);
    bus.rotation.x = Math.PI / 2; // Rotate so Cylinder Y aligns with Z
    voyager.add(bus);

    // 2. High-Gain Antenna (dish sitting on +Z end of bus, pointing towards +Z)
    const dishGeo = new THREE.CylinderGeometry(0.1, 2.0, 0.6, 32, 1, true);
    const dishMat = new THREE.MeshStandardMaterial({
      color: 0xeaeaea,
      roughness: 0.4,
      metalness: 0.2,
      side: THREE.DoubleSide
    });
    const dish = new THREE.Mesh(dishGeo, dishMat);
    dish.position.z = 0.5; // Offset along Z
    dish.rotation.x = Math.PI / 2; // Rotate so Cylinder Y aligns with Z (facing +Z)
    voyager.add(dish);

    // Sub-dish receiver feed (extending further along +Z)
    const feedGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.8, 8);
    const feedMat = new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.8 });
    const feed = new THREE.Mesh(feedGeo, feedMat);
    feed.position.set(0, 0, 1.0); // Sitting in front of the dish
    feed.rotation.x = Math.PI / 2;
    voyager.add(feed);

    // 3. Magnetometer Boom (long thin boom extending sideways along X-axis)
    const magBoomGeo = new THREE.CylinderGeometry(0.03, 0.03, 6, 8);
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8, roughness: 0.2 });
    const magBoom = new THREE.Mesh(magBoomGeo, metalMat);
    magBoom.position.set(-2.8, 0, 0);
    magBoom.rotation.z = Math.PI / 2; // Extend along X
    voyager.add(magBoom);

    // 4. RTG Boom (power source extending backwards and to the right)
    const rtgBoomGeo = new THREE.CylinderGeometry(0.04, 0.04, 2.5, 8);
    const rtgBoom = new THREE.Mesh(rtgBoomGeo, metalMat);
    rtgBoom.position.set(1.1, 0, -0.6);
    rtgBoom.rotation.x = Math.PI / 2;
    rtgBoom.rotation.z = -Math.PI / 4;
    voyager.add(rtgBoom);

    // Cylindrical RTG canisters
    const rtgGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.9, 8);
    const rtgMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, metalness: 0.8, roughness: 0.5 });
    const rtg = new THREE.Mesh(rtgGeo, rtgMat);
    rtg.position.set(1.8, 0, -1.3);
    rtg.rotation.x = Math.PI / 2;
    rtg.rotation.z = -Math.PI / 4;
    voyager.add(rtg);

    return voyager;
  }

  /* ---------- Lights ---------- */
  // Ambient cosmic deep blue shadow light
  scene.add(new THREE.AmbientLight(0x252a44, 0.3));
  // Main solar light
  const sunLight = new THREE.PointLight(0xfff1d0, 3.0, 6000, 0.8);
  scene.add(sunLight);
  // Soft camera-following fill light to highlight planet details
  const camLight = new THREE.DirectionalLight(0x9bb7f0, 0.65);
  scene.add(camLight);
  scene.add(camLight.target);

  /* ---------- Background: matte-black space void (the opaque clear colour above) ---------- */

  /* ---------- Starfield: crisp procedural points with soft round sprites ---------- */
  function starSprite() {
    const s = 64, cv = document.createElement("canvas");
    cv.width = cv.height = s;
    const ctx = cv.getContext("2d");
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.25, "rgba(255,255,255,0.85)");
    g.addColorStop(0.5, "rgba(255,255,255,0.25)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    return new THREE.CanvasTexture(cv);
  }
  const starTex = starSprite();
  function starColor() {
    const r = Math.random();
    if (r < 0.14) return [0.74, 0.82, 1.0];   // cool blue
    if (r > 0.90) return [1.0, 0.9, 0.78];     // warm
    const w = 0.85 + Math.random() * 0.15;
    return [w, w, w];
  }
  function makeStars(count, size, opacity, radius) {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const u = Math.random(), v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      const rr = radius * (0.92 + Math.random() * 0.16);
      pos[i * 3] = rr * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = rr * Math.cos(phi);
      pos[i * 3 + 2] = rr * Math.sin(phi) * Math.sin(theta);
      const c = starColor();
      col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const m = new THREE.PointsMaterial({
      size: size, map: starTex, vertexColors: true, transparent: true,
      opacity: opacity, depthWrite: false, blending: THREE.AdditiveBlending,
      sizeAttenuation: false, fog: false
    });
    return new THREE.Points(g, m);
  }
  const starField = new THREE.Group();
  starField.add(makeStars(isMobile ? 1500 : 3500, 2.0, 0.85, 2400));
  starField.add(makeStars(isMobile ? 500 : 1000, 3.0, 0.95, 2200));
  if (!isMobile) starField.add(makeStars(120, 4.5, 1.0, 2050));
  scene.add(starField);

  /* ---------- Galaxy: subtle Milky Way band + glowing core + faint nebulae ----------
     A flattened band of faint stars across the sky, a soft warm galactic centre and
     a couple of very low-opacity nebulae. Kept deliberately subtle ("épuré") so it
     never competes with the planets in the foreground. */
  const galaxy = new THREE.Group();
  galaxy.rotation.set(0.38, 0.6, 0.22); // tilt the band so it crosses the sky diagonally
  const CORE_ANGLE = 1.1;               // azimuth of the bright galactic centre

  function makeGalaxyBand(count, size, opacity, radius, bandWidth, coreBias) {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Bias a fraction of stars toward the galactic-centre direction (denser core)
      const theta = (Math.random() < coreBias)
        ? CORE_ANGLE + (Math.random() - 0.5) * 1.4
        : Math.random() * Math.PI * 2;
      // Concentrate latitude near the galactic plane — sum of 3 randoms ≈ gaussian → thin band
      const lat = (Math.random() + Math.random() + Math.random() - 1.5) * bandWidth;
      const rr = radius * (0.95 + Math.random() * 0.1);
      const cl = Math.cos(lat);
      pos[i * 3] = rr * cl * Math.cos(theta);
      pos[i * 3 + 1] = rr * Math.sin(lat);
      pos[i * 3 + 2] = rr * cl * Math.sin(theta);
      const c = starColor();
      col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const m = new THREE.PointsMaterial({
      size: size, map: starTex, vertexColors: true, transparent: true,
      opacity: opacity, depthWrite: false, blending: THREE.AdditiveBlending,
      sizeAttenuation: false, fog: false
    });
    return new THREE.Points(g, m);
  }

  function makeGalacticBulgeStars(count, size, opacity, radius) {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = CORE_ANGLE + (Math.random() - 0.5) * 1.0;
      const lat = (Math.random() - 0.5) * 0.4;
      const distFactor = Math.pow(Math.random(), 1.5);
      const rr = radius * (0.85 + distFactor * 0.3);
      const cl = Math.cos(lat);
      pos[i * 3] = rr * cl * Math.cos(theta);
      pos[i * 3 + 1] = rr * Math.sin(lat);
      pos[i * 3 + 2] = rr * cl * Math.sin(theta);

      const r = Math.random();
      if (r < 0.35) {
        col[i * 3] = 1.0; col[i * 3 + 1] = 0.85; col[i * 3 + 2] = 0.7; // Warm orange-yellow
      } else if (r < 0.70) {
        col[i * 3] = 1.0; col[i * 3 + 1] = 0.95; col[i * 3 + 2] = 0.85; // Warm white
      } else {
        col[i * 3] = 0.9; col[i * 3 + 1] = 0.9; col[i * 3 + 2] = 0.9;   // White
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const m = new THREE.PointsMaterial({
      size: size, map: starTex, vertexColors: true, transparent: true,
      opacity: opacity, depthWrite: false, blending: THREE.AdditiveBlending,
      sizeAttenuation: false, fog: false
    });
    return new THREE.Points(g, m);
  }

  // Layer 1: Dense, fine background star cloud
  // Couche 0 : la brume. Beaucoup d'etoiles minuscules et tres etalees en
  // latitude — c'est elle qui donne l'epaisseur. Sans cette couche, les
  // trois couches suivantes se lisaient comme une rayure horizontale nette.
  galaxy.add(makeGalaxyBand(isMobile ? 6000 : 16000, 1.0, 0.22, 2320, 0.52, 0.30));
  galaxy.add(makeGalaxyBand(isMobile ? 5000 : 15000, 1.2, 0.45, 2300, 0.34, 0.4));
  // Layer 2: Medium dust band
  galaxy.add(makeGalaxyBand(isMobile ? 3500 : 8500, 1.8, 0.55, 2290, 0.24, 0.45));
  // Layer 3: Brighter sprinkles
  galaxy.add(makeGalaxyBand(isMobile ? 800 : 1500, 2.6, 0.75, 2280, 0.16, 0.5));
  // Layer 4: Bulge stars (warm core concentration)
  galaxy.add(makeGalacticBulgeStars(isMobile ? 1000 : 3000, 2.0, 0.8, 2250));

  scene.add(galaxy);



  // Soft luminous galactic core glow, placed along the band
  const coreLocalPos = new THREE.Vector3(Math.cos(CORE_ANGLE), 0, Math.sin(CORE_ANGLE)).multiplyScalar(2250);

  // Outer soft core glow
  const coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texHalo("255,226,180", 0.30, 0.13),
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false
  }));
  coreGlow.position.copy(coreLocalPos);
  coreGlow.scale.set(900, 520, 1);
  galaxy.add(coreGlow);

  // Inner hot core glow
  const coreGlowInner = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texHalo("255,243,214", 0.46, 0.16),
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false
  }));
  coreGlowInner.position.copy(coreLocalPos);
  coreGlowInner.scale.set(450, 260, 1);
  galaxy.add(coreGlowInner);

  // Layered Nebulae along the band (using natural, organic colors at low opacity)
  function addNebula(angle, lat, rgb, sx, sy, op) {
    const p = new THREE.Vector3(
      Math.cos(lat) * Math.cos(angle), Math.sin(lat), Math.cos(lat) * Math.sin(angle)
    ).multiplyScalar(2200);
    const neb = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texHalo(rgb, 0.55, 0.30),
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, opacity: op
    }));
    neb.position.copy(p);
    neb.scale.set(sx, sy, 1);
    galaxy.add(neb);
  }

  // Subtle colors: dusty gold, indigo, cyan, magenta
  // Plus larges et un peu plus opaques qu'avant : avec le profil en cloche
  // elles ne forment plus de pastille, donc elles peuvent enfin se voir.
  addNebula(CORE_ANGLE - 0.5, 0.02, "230,170,120", 1250, 620, 0.20);  // Voile de poussiere chaude
  addNebula(CORE_ANGLE + 0.7, 0.05, "139,92,246", 1060, 640, 0.16);   // Indigo
  addNebula(CORE_ANGLE - 1.3, -0.08, "6,182,212", 940, 580, 0.13);    // Cyan profond
  addNebula(CORE_ANGLE + 1.2, -0.03, "180,120,240", 1100, 620, 0.15); // Gaz violet
  addNebula(CORE_ANGLE + 2.1, 0.15, "236,72,153", 1180, 700, 0.10);   // H-alpha rose
  addNebula(CORE_ANGLE - 2.2, 0.08, "100,160,240", 980, 540, 0.17);   // Nuage bleu exterieur
  addNebula(CORE_ANGLE + 3.0, -0.05, "240,130,180", 1180, 590, 0.11); // Rose diffus

  /* ---------- Sun ---------- */
  // 64 segments suffisent : au-delà, la différence ne se voit pas à l'écran
  // mais chaque sphère coûte quatre fois plus de sommets.
  const segs = isMobile ? 40 : 64;
  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(20, segs, segs),
    new THREE.MeshBasicMaterial({ map: tex("sun.jpg") })
  );
  scene.add(sun);

  // Halo diffus : coeur serre + longue traine, au lieu des trois arrets
  // lineaires de radialTexture(). Un degrade lineaire donne un bord net a
  // mi-course — c'est exactement ce qui faisait lire le Soleil et les
  // nebuleuses comme des pastilles collees sur le fond.
  function texHalo(rgb, aCoeur, aTraine) {
    const s = 256, cv = document.createElement("canvas");
    cv.width = cv.height = s;
    const ctx = cv.getContext("2d");
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const a = aCoeur * Math.exp(-t * t * 16) + aTraine * Math.pow(1 - t, 2.6);
      g.addColorStop(t, "rgba(" + rgb + "," + a.toFixed(4) + ")");
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    const t = new THREE.CanvasTexture(cv);
    t.needsUpdate = true;
    return t;
  }

  // Soft additive glow sprite around the sun
  function radialTexture(c0, c1) {
    const s = 256, cv = document.createElement("canvas");
    cv.width = cv.height = s;
    const ctx = cv.getContext("2d");
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, c0); g.addColorStop(0.4, c1); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    return new THREE.CanvasTexture(cv);
  }
  // Le limbe. La sphere est en MeshBasicMaterial : son bord est donc un
  // cercle parfaitement net, ce qui la faisait lire comme un autocollant
  // jaune. Ce halo tres serre (a peine plus large que la sphere) noie ce
  // bord et masque au passage la couture verticale de la texture.
  const limbe = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texHalo("255,238,205", 0.0, 0.85),
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false
  }));
  limbe.scale.set(46, 46, 1);
  sun.add(limbe);

  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texHalo("255,232,186", 0.80, 0.30),
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false
  }));
  glow.scale.set(104, 104, 1);
  sun.add(glow);

  // Couronne externe : etalee et tres faible — elle donne l'echelle de
  // l'etoile. Volontairement peu saturee : en additif, un orange trop
  // franc etale un voile brun sur le titre du hero, qui est juste devant.
  const corona = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texHalo("255,206,152", 0.13, 0.07),
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false
  }));
  corona.scale.set(200, 200, 1);
  sun.add(corona);

  /* ---------- Planets (radius, distance, angle, texture, spin) ---------- */
  // Angles fan gently outward. Distances (d) are greatly increased to spread
  // planets far apart. Radii (r) are enlarged for beautiful close-ups.
  // inc = orbital inclination (rad), node = longitude of ascending node (rad).
  // Real inclinations, gently exaggerated (~x3-4) and given varied nodes so the
  // system has real relief and the orbits don't all tilt the same way.
  const planetDefs = [
    { name: "mercury", r: 3.3, d: 133, a: 0.30, tx: "mercury.jpg", spin: 0.0014, rough: 0.8, glow: "rgba(138,126,114,0.3)", speed: 0.0012, theta: 1.2, inc: 0.262, node: 0.8 },
    { name: "venus", r: 5.8, d: 210, a: 0.66, tx: "venus.jpg", spin: 0.0010, rough: 0.7, glow: "rgba(227,187,118,0.35)", speed: 0.0009, theta: 3.5, inc: 0.175, node: 2.1 },
    { name: "earth", r: 6.0, d: 270, a: 1.02, tx: "earth.jpg", spin: 0.0030, moon: true, rough: 0.35, glow: "rgba(100,165,255,0.6)", speed: 0.0007, theta: 0.0, inc: 0.0, node: 0.0 },
    { name: "mars", r: 4.1, d: 370, a: 1.42, tx: "mars.jpg", spin: 0.0028, rough: 0.9, glow: "rgba(194,91,56,0.35)", speed: 0.00055, theta: 4.8, inc: 0.105, node: 3.8 },
    { name: "jupiter", r: 25.6, d: 933, a: 1.86, tx: "jupiter.jpg", spin: 0.0042, rough: 0.6, glow: "rgba(212,163,115,0.3)", speed: 0.00035, theta: 2.1, inc: 0.070, node: 1.5 },
    { name: "saturn", r: 23.1, d: 1471, a: 2.26, tx: "saturn.jpg", spin: 0.0038, ring: true, rough: 0.6, glow: "rgba(229,193,133,0.3)", speed: 0.00025, theta: 5.5, inc: 0.122, node: 5.2 },
    { name: "uranus", r: 13.8, d: 2478, a: 2.66, tx: "uranus.jpg", spin: 0.0024, rough: 0.5, glow: "rgba(112,214,209,0.35)", speed: 0.00018, theta: 1.8, inc: 0.052, node: 2.7 },
    { name: "neptune", r: 13.5, d: 3465, a: 3.02, tx: "neptune.jpg", spin: 0.0024, rough: 0.5, glow: "rgba(58,95,214,0.35)", speed: 0.00012, theta: 3.9, inc: 0.087, node: 4.4 },
    // Pluto far in the distance, past the Kuiper Belt (non-visitable) — steeply inclined like the real one
    { name: "pluton", r: 2.1, d: 4253, a: 3.42, tx: "moon.jpg", spin: 0.0015, rough: 0.9, glow: "rgba(180,180,180,0.25)", speed: 0.00008, theta: 0.8, inc: 0.524, node: 1.9 }
  ];

  const planets = [];
  const orbitGroup = new THREE.Group();
  scene.add(orbitGroup);

  planetDefs.forEach((def, idx) => {
    def.currentAngle = def.theta; // Initialize live angle (match the initial placement)
    // Keplerian orbital speed simulation (Kepler's Third Law: speed is proportional to d^-1.5)
    // boosted by a custom factor for clear real-time website visualization
    const baseOrbitSpeed = 1.20;
    def.speed = baseOrbitSpeed * Math.pow(def.d, -1.5);

    // Specialized high-fidelity standard material for Earth (shiny oceans, beautiful gloss)
    let mat;
    if (def.name === "earth") {
      mat = new THREE.MeshStandardMaterial({
        map: tex(def.tx),
        roughness: 0.32,  // shinier water highlights
        metalness: 0.05
      });
    } else if (def.name === "pluton") {
      const plutoTex = createPlutoTexture();
      mat = new THREE.MeshStandardMaterial({
        map: plutoTex,
        roughness: 0.9,
        metalness: 0.05
      });
    } else {
      mat = new THREE.MeshStandardMaterial({
        map: tex(def.tx),
        roughness: def.rough,
        metalness: 0.05
      });
    }

    // Base container to handle both orbital position and spin
    const mesh = new THREE.Group();
    // Place on the inclined orbit (gives the system real 3D relief)
    mesh.position.copy(planetPosition(def, def.theta));
    mesh.rotation.z = 0.25;
    scene.add(mesh);

    // Ethereal atmospheric glow around each planet
    const glowTex = radialTexture(def.glow, "rgba(0,0,0,0)");
    const planetGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false
    }));
    planetGlow.scale.set(def.r * 2.8, def.r * 2.8, 1);

    const body = new THREE.Mesh(new THREE.SphereGeometry(def.r, segs, segs), mat);
    mesh.add(body);
    body.add(planetGlow);

    const planetObj = { mesh: mesh, spin: def.spin };

    // Earth's moon
    if (def.moon) {
      const moonTex = createMoonTexture();
      const moon = new THREE.Mesh(
        new THREE.SphereGeometry(2.5, 32, 32),
        new THREE.MeshStandardMaterial({ 
          map: moonTex, 
          bumpMap: moonTex, 
          bumpScale: 0.12, 
          roughness: 0.95, 
          metalness: 0.0 
        })
      );
      moon.position.set(def.r + 8.5, 0, 0);
      mesh.add(moon);
      planetObj.moon = moon;
      planetObj.moonAngle = Math.random() * Math.PI * 2;
      planetObj.moonDist = def.r + 8.5;
      planetObj.moonSpeed = 0.012;
    }

    // Jupiter's Galilean moons (Io, Europa, Ganymede, Callisto)
    if (def.name === "jupiter") {
      planetObj.jMoons = [];
      const jMoons = [
        { name: "io", r: 0.9, d: 26, speed: 0.018, color: "#e3e35d" },
        { name: "europa", r: 0.8, d: 34, speed: 0.013, color: "#d2e4ff" },
        { name: "ganymede", r: 1.4, d: 43, speed: 0.009, color: "#b5ae9e" },
        { name: "callisto", r: 1.3, d: 53, speed: 0.006, color: "#7a7469" }
      ];
      jMoons.forEach(m => {
        const moonMesh = new THREE.Mesh(
          new THREE.SphereGeometry(m.r, 16, 16),
          new THREE.MeshStandardMaterial({
            color: new THREE.Color(m.color),
            roughness: 0.9,
            metalness: 0.1
          })
        );
        moonMesh.position.set(m.d, 0, 0);
        mesh.add(moonMesh);
        planetObj.jMoons.push({
          mesh: moonMesh,
          d: m.d,
          speed: m.speed,
          angle: Math.random() * Math.PI * 2
        });
      });
    }

    // Planet rings (Saturn & Uranus)
    if (def.ring) {
      const isSaturn = def.name === "saturn";
      const innerR = isSaturn ? def.r + 3 : def.r + 2.0;
      const outerR = isSaturn ? def.r + 15 : def.r + 5.5;
      const ringGeo = new THREE.RingGeometry(innerR, outerR, 128);

      // Fix UV mapping to be concentric (cylindrical projection)
      const posAttr = ringGeo.attributes.position;
      const uvAttr = ringGeo.attributes.uv;
      for (let i = 0; i < posAttr.count; i++) {
        const x = posAttr.getX(i);
        const y = posAttr.getY(i);
        const r = Math.sqrt(x * x + y * y);
        const theta = Math.atan2(y, x);

        // U is radial progress (0 to 1)
        const u = (r - innerR) / (outerR - innerR);
        // V is angular progress (0 to 1)
        const v = (theta + Math.PI) / (2 * Math.PI);

        uvAttr.setXY(i, u, v);
      }
      uvAttr.needsUpdate = true;

      const cv = document.createElement("canvas");
      cv.width = 512; cv.height = 1;
      const c = cv.getContext("2d");
      for (let i = 0; i < 512; i++) {
        const posNorm = i / 512;
        let alpha = 0.12 + Math.random() * 0.58;

        if (isSaturn) {
          // Cassini Division (major gap) around 70% to 75% distance
          if (posNorm > 0.68 && posNorm < 0.74) {
            alpha = 0.01;
          }
          // Encke Gap (minor gap) around 91% to 93% distance
          if (posNorm > 0.90 && posNorm < 0.92) {
            alpha = 0.01;
          }
          const sat = 18 + Math.random() * 15;
          const lum = 50 + Math.random() * 25;
          c.fillStyle = `hsla(36, ${sat}%, ${lum}%, ${alpha})`;
        } else {
          // Uranus rings are very thin, subtle and delicate with sharp ice gaps!
          if ((posNorm > 0.18 && posNorm < 0.23) || (posNorm > 0.42 && posNorm < 0.47) || (posNorm > 0.80 && posNorm < 0.84)) {
            alpha = 0.01; // fine gaps
          }
          const sat = 45 + Math.random() * 20;
          const lum = 65 + Math.random() * 15;
          c.fillStyle = `hsla(180, ${sat}%, ${lum}%, ${alpha * 0.55})`;
        }
        c.fillRect(i, 0, 1, 1);
      }
      const ringTex = new THREE.CanvasTexture(cv);
      if ("encoding" in ringTex) ringTex.encoding = THREE.sRGBEncoding;
      const ringMat = new THREE.MeshStandardMaterial({
        map: ringTex,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: isSaturn ? 0.95 : 0.75,
        roughness: isSaturn ? 0.7 : 0.4,
        metalness: 0.05,
        depthWrite: false
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);

      if (isSaturn) {
        ring.rotation.x = Math.PI / 2.2;
      } else {
        // Uranus is famous for its extreme 98-degree tilt (nearly vertical rings!)
        ring.rotation.x = Math.PI / 2.0;
        ring.rotation.y = Math.PI / 6.0;
      }
      mesh.add(ring);
    }

    planets.push(planetObj);
  });

  /* ---------- Asteroid belt (between Mars and Jupiter) ---------- */
  if (!isMobile) {
    const count = 4500;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      // Volumetric ring spacing (between Mars d=370 and Jupiter d=933)
      const rad = 550 + (Math.random() - 0.5) * 120;
      pos[i * 3] = Math.cos(ang) * rad;
      pos[i * 3 + 1] = (Math.random() - 0.5) * (Math.random() - 0.5) * 22;
      pos[i * 3 + 2] = Math.sin(ang) * rad;

      // Warm stellar minerals (copper, glowing bronze, carbonaceous gray)
      const r = Math.random();
      let color;
      if (r < 0.35) {
        color = new THREE.Color(0xa39d91); // space gray rock
      } else if (r < 0.70) {
        color = new THREE.Color(0xd1aa7f); // glowing bronze dust
      } else {
        color = new THREE.Color(0x595249); // dark silicate
      }
      col[i * 3] = color.r;
      col[i * 3 + 1] = color.g;
      col[i * 3 + 2] = color.b;
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));

    const beltMat = new THREE.PointsMaterial({
      map: starTex,
      vertexColors: true,
      size: 2.2,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    asteroidBelt = new THREE.Points(g, beltMat);
    // Tilt the belt slightly off the ecliptic so the system isn't perfectly flat.
    const asteroidTilt = new THREE.Group();
    asteroidTilt.rotation.x = 0.05;
    asteroidTilt.rotation.z = 0.025;
    asteroidTilt.add(asteroidBelt);
    scene.add(asteroidTilt);
  }

  /* ---------- Kuiper Belt (beyond Neptune) ---------- */
  let kuiperBelt = null;
  if (!isMobile) {
    const kCount = 5500;
    const kPos = new Float32Array(kCount * 3);
    const kCol = new Float32Array(kCount * 3);

    for (let i = 0; i < kCount; i++) {
      const ang = Math.random() * Math.PI * 2;
      // Spread past Neptune (d=3465) to past Pluto (d=4253)
      const rad = 4700 + (Math.random() - 0.5) * 1200;
      kPos[i * 3] = Math.cos(ang) * rad;
      kPos[i * 3 + 1] = (Math.random() - 0.5) * (Math.random() - 0.5) * 35; // slightly thicker than asteroid belt
      kPos[i * 3 + 2] = Math.sin(ang) * rad;

      // Icy/cold mineral colors
      const r = Math.random();
      let color;
      if (r < 0.4) {
        color = new THREE.Color(0x8fa1b3); // icy blue-gray
      } else if (r < 0.75) {
        color = new THREE.Color(0xbcccd9); // frosty white
      } else {
        color = new THREE.Color(0x56606b); // dark cold rock
      }
      kCol[i * 3] = color.r;
      kCol[i * 3 + 1] = color.g;
      kCol[i * 3 + 2] = color.b;
    }

    const kg = new THREE.BufferGeometry();
    kg.setAttribute("position", new THREE.BufferAttribute(kPos, 3));
    kg.setAttribute("color", new THREE.BufferAttribute(kCol, 3));

    const kMat = new THREE.PointsMaterial({
      map: starTex,
      vertexColors: true,
      size: 2.6,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    kuiperBelt = new THREE.Points(kg, kMat);
    // Slight tilt (and opposite roll) so Kuiper reads as a real 3D ring far out.
    const kuiperTilt = new THREE.Group();
    kuiperTilt.rotation.x = 0.08;
    kuiperTilt.rotation.z = -0.04;
    kuiperTilt.add(kuiperBelt);
    scene.add(kuiperTilt);
  }

  /* ---------- Voyager 1 Model & Ping ---------- */
  const voyagerGroup = new THREE.Group();
  const vDist = 6200;
  const vTheta = 5.2; // deep space, far from Pluto
  voyagerGroup.position.set(Math.cos(vTheta) * vDist, 0, Math.sin(vTheta) * vDist);

  const voyagerModel = createVoyager1Mesh();
  voyagerModel.scale.set(2.0, 2.0, 2.0); // scaled up for beautiful details
  const targetSun = new THREE.Vector3(0, 0, 0).sub(voyagerGroup.position);
  voyagerModel.lookAt(targetSun);
  voyagerGroup.add(voyagerModel);

  const vRingMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
  const vRing = new THREE.Mesh(
    new THREE.RingGeometry(3, 5, 32),
    vRingMat
  );
  vRing.rotation.x = Math.PI / 2;
  voyagerGroup.add(vRing);

  /* ---------- Labels Overlay (Vue d'ensemble) ---------- */
  scene.add(voyagerGroup);
  let voyagerPingScale = 1.0;

  const labelsContainer = document.getElementById("space-labels");
  const spaceLabels = [];

  function createLabel(text, subtext, obj3d, color, clickHandler) {
    if (!labelsContainer) return null;
    const el = document.createElement("div");
    el.className = "space-label";

    const nameEl = document.createElement("span");
    nameEl.className = "label-name";
    nameEl.textContent = text;
    el.appendChild(nameEl);

    if (subtext) {
      const typeEl = document.createElement("span");
      typeEl.className = "label-type";
      typeEl.textContent = subtext;
      el.appendChild(typeEl);
    }

    if (color) el.style.color = color;
    if (clickHandler) {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        clickHandler();
      });
    }
    labelsContainer.appendChild(el);
    const lblObj = { text, obj3d, el };
    spaceLabels.push(lblObj);
    return lblObj;
  }

  // Create labels for all main celestial bodies
  createLabel("SOLEIL", "Étoile (G2V) — Notre système", sun, "#ffcc00", () => {
    enterScope(); // frame the whole solar system + reveal the planet names
  });

  const planetTypes = [
    "Planète tellurique", // Mercury
    "Planète tellurique", // Venus
    "Planète tellurique", // Earth
    "Planète tellurique", // Mars
    "Géante gazeuse",      // Jupiter
    "Géante gazeuse",      // Saturn
    "Géante de glace",     // Uranus
    "Géante de glace",     // Neptune
    "Planète naine"        // Pluto
  ];

  const planetFrenchNames = [
    "MERCURE",
    "VÉNUS",
    "TERRE",
    "MARS",
    "JUPITER",
    "SATURNE",
    "URANUS",
    "NEPTUNE",
    "PLUTON"
  ];

  const sectionSelectors = [
    '#about',     // Mercury
    '#resume',    // Venus
    '#stats',     // Earth
    '#ambition',  // Mars
    '#projects',  // Jupiter
    '#showcase',  // Saturn
    '#passions',  // Uranus
    '#contact'    // Neptune
  ];

  for (let i = 0; i < planetDefs.length; i++) {
    const def = planetDefs[i];
    const frenchName = planetFrenchNames[i];
    const type = planetTypes[i];

    if (def.name === "pluton") {
      createLabel(frenchName, type, planets[i].mesh, null, () => {
        zoomToInspect(planets[i].mesh, def.r, "PLUTON", "PLANÈTE NAINE // ASTRE", (def.d / 270).toFixed(2) + " AU", (29.78 / Math.sqrt(def.d / 270)).toFixed(2) + " KM/S");
      });
    } else {
      createLabel(frenchName, type, planets[i].mesh, null, () => inspectPlanetWithSection(i));
    }
  }

  const kbLabelPos = new THREE.Object3D();
  kbLabelPos.position.set(4700, 0, 0); // Position sur l'anneau au-delà de Neptune
  scene.add(kbLabelPos);
  createLabel("CEINTURE DE KUIPER", "Zone de débris", kbLabelPos, "#a0c0d0", () => {
    zoomToInspect(kbLabelPos, 15, "CEINTURE DE KUIPER", "ZONE D'ASTRES GLACÉS", "17.40 AU", "—");
  });

  createLabel("VOYAGER 1", "Sonde interstellaire", voyagerGroup, "#06b6d4", () => {
    zoomToInspect(voyagerGroup, 3.0, "VOYAGER 1", "SONDE INTERSTELLAIRE", "154.20 AU", "17.00 KM/S");
  });

  /* ---------- Voyage stations: Sun -> each planet ---------- */
  const stations = [];
  const UP = new THREE.Vector3(0, 1, 0);

  // Maps each non-hero section to a planet index. Order: about, resume, stats,
  // projects, showcase, passions, contact.
  // Projects gets Jupiter (4) — the biggest section on the biggest planet — and
  // showcase gets Saturn (5). Mars (3) and Pluto (8) are not voyage stations;
  // Mars stays clickable in the scene and leads to the projects section.
  const planetStationIndices = [0, 1, 2, 3, 4, 5, 6, 7];

  stations.push({
    cam: new THREE.Vector3(-100, 30, 200),
    look: new THREE.Vector3(0, 0, 0)
  });

  planetStationIndices.forEach((planetIdx, i) => {
    const def = planetDefs[planetIdx];
    const pp = planetPosition(def, def.theta);

    // Radial points outwards from Sun, Tangent is 90° along the orbit
    const radial = pp.clone().normalize();
    const tangent = new THREE.Vector3().crossVectors(UP, radial).normalize();

    let side = (planetIdx % 2 === 0) ? -1 : 1;
    const dist = def.r * 2.4 + 14;

    const cam = new THREE.Vector3().copy(pp)
      .addScaledVector(tangent, dist * 0.40 * side)
      .addScaledVector(radial, dist * 0.92)
      .addScaledVector(UP, dist * 0.30 + def.r * 0.25);

    const look = pp.clone().addScaledVector(tangent, def.r * 0.9 * -side);

    stations.push({ cam: cam, look: look });
  });

  // Generate smooth 3D curves passing through all camera and look points!
  // This removes all sharp linear angles, creating a cinematic, flowing ride.
  const camPoints = stations.map(s => s.cam);
  const lookPoints = stations.map(s => s.look);
  const camCurve = new THREE.CatmullRomCurve3(camPoints);
  const lookCurve = new THREE.CatmullRomCurve3(lookPoints);

  const desiredCam = camera.position.clone();
  const desiredLook = new THREE.Vector3(0, 0, 0);
  const currentLook = new THREE.Vector3(0, 0, 0);

  // Stellar HUD DOM Elements
  const hudPlanet = document.getElementById("hud-planet");
  const hudDist = document.getElementById("hud-dist");
  const hudVel = document.getElementById("hud-vel");
  const hudSpeed = document.getElementById("hud-speed");
  const hudCoords = document.getElementById("hud-coords");
  const hudStatus = document.getElementById("hud-status");

  const hudToggle = document.getElementById("hud-toggle");
  const stellarHud = document.getElementById("stellar-hud");
  if (hudToggle && stellarHud) {
    // Replie par defaut : le HUD ne montre que sa pastille radar tant qu'on ne
    // l'ouvre pas. Deplie, il mangeait tout le coin bas-gauche de l'ecran.
    stellarHud.classList.add("collapsed");

    hudToggle.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      stellarHud.classList.toggle("collapsed");
      const replie = stellarHud.classList.contains("collapsed");
      const icon = hudToggle.querySelector("i");
      if (icon) icon.className = replie ? "bi bi-radar" : "bi bi-chevron-down";
      hudToggle.setAttribute("aria-expanded", String(!replie));
    });
  }

  // DOM Elements of the sections to lock camera positions exactly to them
  const sectionIds = ['#hero', '#about', '#resume', '#stats', '#ambition', '#projects', '#showcase', '#passions', '#contact'];
  let sectionEls = [];

  function initSections() {
    sectionEls = sectionIds.map(id => document.querySelector(id)).filter(el => el !== null);
  }

  // Get active scroll segment dynamically based on which DOM section is currently centered
  function getScrollSegment() {
    if (sectionEls.length === 0) initSections();
    if (sectionEls.length === 0) return 0;

    const y = window.scrollY;
    const viewCenter = y + window.innerHeight / 2;
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;

    // Find the absolute top and height of each section by traversing offset parents
    const secPositions = sectionEls.map(el => {
      let top = 0;
      let curr = el;
      while (curr) {
        top += curr.offsetTop;
        curr = curr.offsetParent;
      }
      return { top: top, height: el.offsetHeight };
    });

    // Check if we are at the very top of the page
    if (y <= 5) return 0;
    // Check if we are at the very bottom of the page
    if (y >= maxScroll - 5) return sectionEls.length - 1;

    // Find which section covers the viewport center
    for (let i = 0; i < secPositions.length; i++) {
      const sec = secPositions[i];
      if (viewCenter >= sec.top && viewCenter < sec.top + sec.height) {
        // We are inside section i!
        // Calculate progress within this section (0 = top of section, 1 = bottom of section)
        const frac = (viewCenter - sec.top) / sec.height;

        // We want the camera to be exactly locked at station i when we are at the CENTER of the section (frac = 0.5).
        // If frac < 0.5, we are transitioning from section i-1 (from i - 0.5 to i).
        // If frac > 0.5, we are transitioning to section i+1 (from i to i + 0.5).
        // So we can map this linearly:
        let seg = i + (frac - 0.5);

        // Clamp between 0 and max segment
        return Math.min(sectionEls.length - 1, Math.max(0, seg));
      }
    }

    // Fallback: search closest
    let closestIdx = 0;
    let minDiff = Infinity;
    for (let i = 0; i < secPositions.length; i++) {
      const secCenter = secPositions[i].top + secPositions[i].height / 2;
      const diff = Math.abs(viewCenter - secCenter);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    }
    return closestIdx;
  }

  let scrollSegment = 0;

  /* ---------- View contexts: voyage / solar explorer ---------- */
  // overviewMode = a free-look framing of the whole solar system (OrbitControls
  // take over once we've arrived). Any scroll re-engages the scroll-driven
  // portfolio voyage.
  let overviewMode = false;
  const DEFAULT_FOV = 55, OVERVIEW_FOV = 74;
  let desiredFov = DEFAULT_FOV; // smoothed toward in the render loop (no instant snap)

  // Frames the Sun out to the Kuiper belt.
  const solarOverviewCam = new THREE.Vector3(0, 4500, 8500);
  const solarOverviewLook = new THREE.Vector3(0, 0, 0);

  // The preset currently in effect.
  const activeOverviewCam = solarOverviewCam.clone();
  const activeOverviewLook = solarOverviewLook.clone();

  const backBtn = document.getElementById("nav-back");
  const close3dBtn = document.getElementById("nav-close-3d");
  const menuSolarBtn = document.getElementById("menu-solar");

  function updateNavUI() {
    const inExplorer = overviewMode || !!inspectTarget;
    if (backBtn) backBtn.classList.toggle("visible", inExplorer);
    if (close3dBtn) close3dBtn.classList.toggle("visible", inExplorer);
    if (menuSolarBtn) menuSolarBtn.classList.toggle("active", inExplorer);
  }

  function setOverview(on) {
    overviewMode = on && !reduceMotion;
    desiredFov = overviewMode ? OVERVIEW_FOV : DEFAULT_FOV;
    if (reduceMotion) { camera.fov = desiredFov; camera.updateProjectionMatrix(); }

    if (overviewMode) {
      document.body.classList.add("overview-active");
      overviewTransition = true;
      if (inspectTarget) {
        inspectTarget = null;
        document.body.classList.remove("inspect-active");
      }
    } else {
      document.body.classList.remove("overview-active");
      overviewTransition = false;
      if (controls) controls.enabled = false;
    }
    updateNavUI();
  }

  // Enter the whole-system overview (the menu button).
  function enterScope() {
    inspectStack = [];
    inspectTarget = null;
    document.body.classList.remove("inspect-active");
    activeOverviewCam.copy(solarOverviewCam);
    activeOverviewLook.copy(solarOverviewLook);
    setOverview(true);
  }

  // "Back": step out one level — sub-body -> system -> overview -> voyage.
  function navBack() {
    if (inspectTarget) {
      if (inspectStack.length) {
        const prev = inspectStack.pop();
        zoomToInspect(prev.obj3d, prev.radius, prev.name, prev.type, prev.distAU, prev.velKMS, true);
      } else {
        inspectTarget = null;
        document.body.classList.remove("inspect-active");
        setOverview(true); // back to the system overview
      }
    } else if (overviewMode) {
      inspectStack = [];
      setOverview(false); // exit explorer -> resume voyage
    }
  }

  if (menuSolarBtn) menuSolarBtn.addEventListener("click", (e) => { e.preventDefault(); enterScope(); });
  if (backBtn) backBtn.addEventListener("click", (e) => { e.preventDefault(); navBack(); });
  if (close3dBtn) {
    close3dBtn.addEventListener("click", (e) => {
      e.preventDefault();
      inspectStack = [];
      inspectTarget = null;
      document.body.classList.remove("inspect-active");
      setOverview(false);
    });
  }

  function onScroll() {
    if (ignoreScroll) return;
    if (overviewMode || inspectTarget) return; // Don't let scroll exit these modes
    scrollSegment = getScrollSegment();
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  initSections();
  onScroll();

  // Capture mouse wheel on canvas to prevent page scroll during overview/inspect
  canvas.addEventListener("wheel", (e) => {
    if (overviewMode || inspectTarget) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, { passive: false });

  /* ---------- 3D Raycasting / Planet Clicking ---------- */
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  function onCanvasClick(event) {
    if (!overviewMode && !inspectTarget) return;
    if (isDragging) return; // Ignore click if dragging camera
    if (event.target.closest('button, a, .space-label, .lang-menu, .stellar-hud')) return;

    // Calculate mouse position in normalized device coordinates
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    const targets = [sun];
    planets.forEach(p => targets.push(p.mesh));
    targets.push(voyagerGroup);

    const intersects = raycaster.intersectObjects(targets, true);

    if (intersects.length > 0) {
      let current = intersects[0].object;
      while (current && current !== scene) {
        if (current === sun) {
          // Hierarchical: frame the whole solar system so the planet names show.
          enterScope();
          return;
        }
        for (let i = 0; i < planets.length; i++) {
          if (current === planets[i].mesh) {
            const def = planetDefs[i];
            if (def.name === "pluton") {
              zoomToInspect(planets[i].mesh, def.r, "PLUTON", "PLANÈTE NAINE // ASTRE", (def.d / 270).toFixed(2) + " AU", (29.78 / Math.sqrt(def.d / 270)).toFixed(2) + " KM/S");
            } else {
              inspectPlanetWithSection(i);
            }
            return;
          }
        }
        if (current === voyagerGroup) {
          zoomToInspect(voyagerGroup, 3.0, "VOYAGER 1", "SONDE INTERSTELLAIRE", "154.20 AU", "17.00 KM/S");
          return;
        }

        current = current.parent;
      }
    }
  }

  window.addEventListener("mousedown", (e) => {
    isDragging = false;
    startX = e.clientX;
    startY = e.clientY;
  });

  window.addEventListener("mouseup", (e) => {
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.sqrt(dx * dx + dy * dy) > 8) {
      isDragging = true;
    }
  });

  window.addEventListener("click", onCanvasClick);

  // Sigmoid plateau easing to hold the camera on the planet during the section
  // and fly smoothly to the next planet during transitions
  function plateau(x) {
    if (x < 0.20) return 0;
    if (x > 0.80) return 1;
    const t = (x - 0.20) / 0.60;
    return t * t * (3 - 2 * t);
  }

  // Dynamic collision avoidance and bypass system to contour celestial bodies
  function avoidCollisions(pos) {
    // 1. Sun collision check
    const distToSun = pos.distanceTo(sun.position);
    const safeSunRad = 35.0; // Sun radius is 20, safe buffer of 15
    if (distToSun < safeSunRad) {
      const dir = new THREE.Vector3().subVectors(pos, sun.position).normalize();
      pos.copy(sun.position).addScaledVector(dir, safeSunRad);
    }

    // 2. Planets collision check
    planetDefs.forEach((def, idx) => {
      const p = planets[idx].mesh;
      const distToPlanet = pos.distanceTo(p.position);
      // Scaled safety buffer (larger buffer for giant planets like Jupiter/Uranus, smaller for rocky planets)
      const safeRad = def.r * 1.25 + 1.2;
      if (distToPlanet < safeRad) {
        const dir = new THREE.Vector3().subVectors(pos, p.position).normalize();
        pos.copy(p.position).addScaledVector(dir, safeRad);
      }
    });
  }

  function sampleVoyage(seg) {
    const n = stations.length - 1;
    let i = Math.floor(seg);
    if (i >= n) i = n - 1;
    if (i < 0) i = 0;

    const x = seg - i;
    const t = plateau(x);

    // Smooth plateau transition along the Catmull-Rom spline
    const plateauedP = (i + t) / n;

    desiredCam.copy(camCurve.getPoint(plateauedP));
    desiredLook.copy(lookCurve.getPoint(plateauedP));

    // Contour planets and Sun to prevent clipping through their surfaces
    avoidCollisions(desiredCam);
  }

  /* ---------- Resize / visibility ---------- */
  window.addEventListener("resize", () => {
    width = window.innerWidth; height = window.innerHeight;
    camera.aspect = width / height; camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  });
  document.addEventListener("visibilitychange", () => {
    running = !document.hidden;
    if (running && !frameId) loop();
  });

  /* ---------- Render loop ---------- */
  let derniereSection = -1;
  // Sur un écran 120/144 Hz, requestAnimationFrame tourne deux fois plus vite :
  // on plafonne à ~60 i/s, le mouvement étant de toute façon lissé par dt.
  const PAS_MIN = 1000 / 62;
  let derniereImage = 0;
  // Qualité adaptative : si la moyenne des images dépasse ~24 ms (< 42 i/s), on
  // baisse la densité de rendu d'un cran ; si la machine a de la marge, on remonte.
  let cumulTemps = 0, cumulImages = 0;
  function ajusterQualite(ecart) {
    cumulTemps += ecart; cumulImages++;
    if (cumulTemps < 2000) return;
    const moyenne = cumulTemps / cumulImages;
    cumulTemps = 0; cumulImages = 0;
    let q = qualite;
    if (moyenne > 24 && q > DPR_MIN) q = Math.max(DPR_MIN, q - 0.25);
    else if (moyenne < 18 && q < DPR_MAX) q = Math.min(DPR_MAX, q + 0.25);
    if (q !== qualite) {
      qualite = q;
      renderer.setPixelRatio(qualite);
      renderer.setSize(width, height, false);
    }
  }

  function loop(now) {
    if (!running) { frameId = null; return; }
    frameId = requestAnimationFrame(loop);
    now = now || performance.now();
    const ecart = now - derniereImage;
    if (ecart < PAS_MIN) return;
    // Une modale (fond à 93 % d'opacité) recouvre le canvas : rien à redessiner.
    if (document.body.classList.contains("modale-ouverte")) { derniereImage = now; return; }
    // Un écart énorme = onglet repris ou modale refermée, pas une image lente.
    if (derniereImage && ecart < 250) ajusterQualite(ecart);
    derniereImage = now;

    // Freeze every orbit while inspecting so the target stays still and the
    // camera can fully settle on it (otherwise it chases a moving body = nausea).
    orbitsRunning = !inspectTarget;

    // 1. Update planetary orbits in real-time — frozen while inspecting so the
    //    target body stays still and the camera can settle without chasing it.
    if (orbitsRunning) {
      planetDefs.forEach((def, idx) => {
        def.currentAngle += def.speed;
        planets[idx].mesh.position.copy(planetPosition(def, def.currentAngle));
      });
    }

    // 2. Update camera stations dynamically to track the moving planets in live orbit!
    planetStationIndices.forEach((planetIdx, i) => {
      const def = planetDefs[planetIdx];
      const pp = planetPosition(def, def.currentAngle);

      const radial = pp.clone().normalize();
      const tangent = new THREE.Vector3().crossVectors(UP, radial).normalize();

      let side = (planetIdx % 2 === 0) ? -1 : 1;
      const dist = def.r * 2.4 + 14;

      const cam = new THREE.Vector3().copy(pp)
        .addScaledVector(tangent, dist * 0.40 * side)
        .addScaledVector(radial, dist * 0.92)
        .addScaledVector(UP, dist * 0.30 + def.r * 0.25);

      const look = pp.clone().addScaledVector(tangent, def.r * 0.9 * -side);

      // Update the Vector3 values in-place so the curves update instantly!
      stations[i + 1].cam.copy(cam);
      stations[i + 1].look.copy(look);
    });

    if (inspectTarget) {
      inspectTarget.update();
      desiredCam.copy(inspectTarget.camPos);
      desiredLook.copy(inspectTarget.lookPos);
    } else if (overviewMode) {
      if (overviewTransition) {
        desiredCam.copy(activeOverviewCam);
        desiredLook.copy(activeOverviewLook);

        // "Close enough" scales with the trip length so the flight out hands off
        // to OrbitControls without waiting on the exponential tail forever.
        const arriveTol = activeOverviewCam.length() * 0.01 + 20;
        const posDist = camera.position.distanceTo(activeOverviewCam);
        const lookDist = currentLook.distanceTo(activeOverviewLook);
        if (posDist < arriveTol && lookDist < 30.0) {
          overviewTransition = false;
          if (controls) {
            controls.target.copy(activeOverviewLook);
            controls.update();
            controls.enabled = true;
          }
        }
      }
    } else {
      sampleVoyage(scrollSegment);
    }

    // Framerate-independent eased smoothing — ONE factor for position, look AND
    // fov. This (with frozen orbits while inspecting) is what kills the nausea:
    // the old code lerped position and look at different rates so the view swam.
    const nowT = (typeof performance !== "undefined") ? performance.now() : Date.now();
    const dt = Math.min(0.05, Math.max(0.001, (nowT - lastFrameTime) / 1000));
    lastFrameTime = nowT;
    const smooth = 1 - Math.exp(-CAM_LAMBDA * dt);

    if (overviewMode && !overviewTransition) {
      if (controls) {
        controls.update();
        currentLook.copy(controls.target);
        desiredLook.copy(controls.target);
        desiredCam.copy(camera.position);
      }
    } else {
      // Single eased follow: position and look move together so the view never
      // "swims". avoidCollisions only runs in voyage (inspect/overview targets
      // are already outside every body, so no hard snaps during those flights).
      camera.position.lerp(desiredCam, smooth);
      if (!inspectTarget && !overviewMode) avoidCollisions(camera.position);
      currentLook.lerp(desiredLook, smooth);
      camera.lookAt(currentLook);
    }

    // Smooth the field of view toward its target (no instant lens snaps).
    if (Math.abs(camera.fov - desiredFov) > 0.01) {
      camera.fov += (desiredFov - camera.fov) * smooth;
      camera.updateProjectionMatrix();
    }

    // Movement speed for the HUD (units/second, smoothed, framerate-independent).
    // Shown in every mode so the visitor always sees how fast they're travelling.
    const frameDist = camera.position.distanceTo(lastCamPos);
    displaySpeed = displaySpeed * 0.9 + (frameDist / dt) * 0.1;
    lastCamPos.copy(camera.position);

    // Stabilize the stars and Milky Way by anchoring their group position to the camera position
    starField.position.copy(camera.position);
    galaxy.position.copy(camera.position);

    // Update fill light position and target to act as a headlight shining directly on the planet
    camLight.position.copy(camera.position);
    camLight.target.position.copy(currentLook);

    // Planets keep a slow, realistic axial spin; stars stay fixed.
    sun.rotation.y += 0.0004;
    glow.material.rotation += 0.0006;
    if (asteroidBelt) asteroidBelt.rotation.y += 0.00015;
    if (kuiperBelt) kuiperBelt.rotation.y += 0.00008;

    // Update planetary rotations and moon orbits
    for (let i = 0; i < planets.length; i++) {
      planets[i].mesh.rotation.y += planets[i].spin;
      
      // Update Earth's Moon
      if (planets[i].moon) {
        planets[i].moonAngle += planets[i].moonSpeed;
        const mx = Math.cos(planets[i].moonAngle) * planets[i].moonDist;
        const mz = Math.sin(planets[i].moonAngle) * planets[i].moonDist;
        planets[i].moon.position.set(mx, 0, mz);
      }
      
      // Update Jupiter's moons
      if (planets[i].jMoons) {
        planets[i].jMoons.forEach(jm => {
          jm.angle += jm.speed;
          const jmx = Math.cos(jm.angle) * jm.d;
          const jmz = Math.sin(jm.angle) * jm.d;
          jm.mesh.position.set(jmx, 0, jmz);
        });
      }
    }

    // Voyager 1 ping animation
    voyagerPingScale += 0.06;
    if (voyagerPingScale > 16) voyagerPingScale = 1.0;
    vRing.scale.set(voyagerPingScale, voyagerPingScale, 1);
    vRing.material.opacity = Math.max(0, 1.0 - (voyagerPingScale / 16));

    // Update 2D Space Labels in Overview Mode or Inspect Mode
    if ((overviewMode || inspectTarget) && labelsContainer) {
      const halfW = width / 2;
      const halfH = height / 2;
      
      // Determine what system is currently being inspected
      // Project all labels to 2D screen space
      const projectedLabels = spaceLabels.map(lbl => {
        const pos = new THREE.Vector3();
        lbl.obj3d.getWorldPosition(pos);
        pos.project(camera);
        const x = (pos.x * halfW) + halfW;
        const y = -(pos.y * halfH) + halfH;
        
        // Base visibility: check if object is in front of the camera
        let visible = (pos.z <= 1.0);
        
        // Our own system's top-level markers.
        const isSystemLevel = (
          lbl.text === "SOLEIL" ||
          lbl.text === "VOYAGER 1" ||
          lbl.text === "CEINTURE DE KUIPER"
        );
        // Is this a solar system planet label?
        const isSolarPlanet = !isSystemLevel;

        if (visible) {
          if (overviewMode) {
            visible = isSolarPlanet || isSystemLevel;
          } else if (inspectTarget) {
            // Inspect mode: keep the planets + the Sun for context.
            visible = isSolarPlanet || lbl.text === "SOLEIL";
          }
        }
        
        return { lbl, x, y, visible };
      });

      // Find the Sun's projected position for decluttering
      const sunProj = projectedLabels.find(item => item.lbl.text === "SOLEIL");

      projectedLabels.forEach(item => {
        const { lbl, x, y, visible } = item;
        if (!visible) {
          lbl.el.style.opacity = '0';
          lbl.el.style.pointerEvents = 'none';
        } else {
          lbl.el.style.opacity = '1';
          lbl.el.style.pointerEvents = 'auto';
          lbl.el.style.left = x + 'px';
          lbl.el.style.top = y + 'px';

          // Declutter check: if it's close to the Sun, make it compact
          if (sunProj && lbl.text !== "SOLEIL" && lbl.text !== "VOYAGER 1" && lbl.text !== "CEINTURE DE KUIPER") {
            const dx = x - sunProj.x;
            const dy = y - sunProj.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 150) {
              lbl.el.classList.add("compact");
            } else {
              lbl.el.classList.remove("compact");
            }
          } else {
            lbl.el.classList.remove("compact");
          }
        }
      });
    } else if (labelsContainer) {
      // Hide all labels when neither overview nor inspect target is active
      spaceLabels.forEach(lbl => {
        lbl.el.style.opacity = '0';
        lbl.el.style.pointerEvents = 'none';
      });
    }

    // Dynamically update the Cyberpunk Space Navigation HUD telemetry
    const n = stations.length - 1;
    let idx = Math.round(scrollSegment);
    if (idx < 0) idx = 0;
    if (idx > n) idx = n;

    // Update active class on DOM sections to trigger high-tech CSS entry animations
    if (idx !== derniereSection) {
      derniereSection = idx;
      sectionEls.forEach((el, index) => {
        el.classList.toggle("active-stellar-section", index === idx);
      });
    }

    // HUD replié : sa télémétrie est invisible, inutile de réécrire le DOM à
    // chaque image (chaque textContent relance style et mise en page).
    const hudVisible = !stellarHud || !stellarHud.classList.contains("collapsed");
    if (hudPlanet && hudVisible) {
      if (inspectTarget) {
        hudPlanet.textContent = inspectTarget.name;
        if (hudDist) hudDist.textContent = inspectTarget.distAU;
        if (hudVel) hudVel.textContent = inspectTarget.velKMS;
        if (hudStatus) {
          hudStatus.textContent = inspectTarget.type;
          hudStatus.className = "hud-val warn";
        }
      } else if (overviewMode) {
        hudPlanet.textContent = "SYSTEME SOLAIRE";
        if (hudDist) hudDist.textContent = (camera.position.length() / 270).toFixed(1) + " AU";
        if (hudVel) hudVel.textContent = "—";
        if (hudStatus) { hudStatus.textContent = "VUE_ENSEMBLE"; hudStatus.className = "hud-val ok"; }
      } else if (idx === 0) {
        hudPlanet.textContent = "LE SOLEIL";
        if (hudDist) hudDist.textContent = "0.00 AU";
        if (hudVel) hudVel.textContent = "0.00 KM/S";
        if (hudStatus) { hudStatus.textContent = "SYS_STABLE"; hudStatus.className = "hud-val ok"; }
      } else {
        const planetIdx = planetStationIndices[idx - 1];
        const def = planetDefs[planetIdx];
        hudPlanet.textContent = def.name.toUpperCase();
        // Earth (d=270) normalizes to 1 AU
        const distAU = def.d / 270;
        if (hudDist) hudDist.textContent = distAU.toFixed(2) + " AU";
        // Keplerian orbital speed (Earth is ~29.78 km/s)
        const velKMS = 29.78 / Math.sqrt(distAU);
        if (hudVel) hudVel.textContent = velKMS.toFixed(2) + " KM/S";
        if (hudStatus) {
          hudStatus.textContent = "LOCK_ON // ALIGNED";
          hudStatus.className = "hud-val warn";
        }
      }
    }
    // Movement speed — always visible, in every mode.
    if (hudSpeed && hudVisible) {
      const sp = displaySpeed * 2.5;
      hudSpeed.textContent = (sp >= 1000 ? Math.round(sp).toString() : sp.toFixed(1)) + " KM/S";
    }
    if (hudCoords && hudVisible) {
      hudCoords.textContent = `X:${Math.round(camera.position.x)} Y:${Math.round(camera.position.y)} Z:${Math.round(camera.position.z)}`;
    }

    renderer.render(scene, camera);
  }

  if (reduceMotion) {
    // Static frame at the sun station
    sampleVoyage(0);
    camera.position.copy(desiredCam);
    currentLook.copy(desiredLook);
    camera.lookAt(currentLook);
    // textures may still be loading; render a couple of frames shortly after
    renderer.render(scene, camera);
    setTimeout(() => renderer.render(scene, camera), 600);
    setTimeout(() => renderer.render(scene, camera), 1500);
  } else {
    loop();
  }
})();

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
  let running = true, frameId = null;

  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, alpha: true, powerPreference: "high-performance" });
  } catch (e) {
    console.warn("[solar] WebGL unavailable — keeping CSS background.");
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height, false);
  renderer.setClearColor(0x000000, 1); // opaque matte-black void
  if ("outputEncoding" in renderer) renderer.outputEncoding = THREE.sRGBEncoding;

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x000000, 0.00009);
  camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 6000);
  camera.position.set(0, 15, 130);

  const loader = new THREE.TextureLoader();
  function tex(file) {
    const t = loader.load(TEX + file);
    if ("encoding" in t) t.encoding = THREE.sRGBEncoding;
    return t;
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
      pos[i * 3]     = rr * Math.sin(phi) * Math.cos(theta);
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
  starField.add(makeStars(isMobile ? 1100 : 2200, 2.0, 0.75, 2400));
  starField.add(makeStars(isMobile ? 300 : 650, 3.0, 0.95, 2200));
  if (!isMobile) starField.add(makeStars(70, 4.5, 1.0, 2050));
  scene.add(starField);

  /* ---------- Sun ---------- */
  const segs = isMobile ? 64 : 128;
  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(20, segs, segs),
    new THREE.MeshBasicMaterial({ map: tex("sun.png") })
  );
  scene.add(sun);

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
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTexture("rgba(255,240,200,0.95)", "rgba(255,170,70,0.45)"),
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false
  }));
  glow.scale.set(95, 95, 1);
  sun.add(glow);

  // Softer outer corona for a richer, layered sun
  const corona = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTexture("rgba(255,220,160,0.5)", "rgba(255,140,50,0.16)"),
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false
  }));
  corona.scale.set(150, 150, 1);
  sun.add(corona);

  /* ---------- Planets (radius, distance, angle, texture, spin) ---------- */
  // Angles fan gently outward. Distances (d) are greatly increased to spread
  // planets far apart. Radii (r) are enlarged for beautiful close-ups.
  const planetDefs = [
    { name: "mercury", r: 3.8,  d: 110, a: 0.30, tx: "mercury.png", spin: 0.0014, rough: 0.8, glow: "rgba(138,126,114,0.3)", speed: 0.0012 },
    { name: "venus",   r: 5.8,  d: 190, a: 0.66, tx: "venus.png",   spin: 0.0010, rough: 0.7, glow: "rgba(227,187,118,0.35)", speed: 0.0009 },
    { name: "earth",   r: 6.8,  d: 270, a: 1.02, tx: "earth.png",   spin: 0.0030, moon: true, rough: 0.35, glow: "rgba(100,165,255,0.6)", speed: 0.0007 },
    { name: "mars",    r: 5.2,  d: 350, a: 1.42, tx: "mars.png",    spin: 0.0028, rough: 0.9, glow: "rgba(194,91,56,0.35)", speed: 0.00055 },
    { name: "jupiter", r: 17.5, d: 480, a: 1.86, tx: "jupiter.png", spin: 0.0042, rough: 0.6, glow: "rgba(212,163,115,0.3)", speed: 0.00035 },
    { name: "saturn",  r: 14.5, d: 620, a: 2.26, tx: "saturn.png",  spin: 0.0038, ring: true, rough: 0.6, glow: "rgba(229,193,133,0.3)", speed: 0.00025 },
    { name: "uranus",  r: 10.0, d: 750, a: 2.66, tx: "uranus.png",  spin: 0.0024, rough: 0.5, glow: "rgba(112,214,209,0.35)", speed: 0.00018 },
    { name: "neptune", r: 9.5,  d: 880, a: 3.02, tx: "neptune.png", spin: 0.0024, rough: 0.5, glow: "rgba(58,95,214,0.35)", speed: 0.00012 }
  ];

  const planets = [];
  const orbitGroup = new THREE.Group();
  scene.add(orbitGroup);

  planetDefs.forEach((def, idx) => {
    def.currentAngle = def.a; // Initialize live angle
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
    } else {
      mat = new THREE.MeshStandardMaterial({
        map: tex(def.tx),
        roughness: def.rough,
        metalness: 0.05
      });
    }

    const mesh = new THREE.Mesh(new THREE.SphereGeometry(def.r, segs, segs), mat);
    const x = Math.cos(def.a) * def.d;
    const z = Math.sin(def.a) * def.d;
    // Stagger heights vertically using a sine wave to make the 3D space less linear
    const y = Math.sin(def.a * 2.0) * 16.0;
    mesh.position.set(x, y, z);
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
    mesh.add(planetGlow);

    // Earth's moon
    if (def.moon) {
      const moon = new THREE.Mesh(
        new THREE.SphereGeometry(1.5, 32, 32),
        new THREE.MeshStandardMaterial({ map: tex("moon.png"), roughness: 0.9, metalness: 0.0 })
      );
      moon.position.set(def.r + 6.0, 1.5, 2.5);
      mesh.add(moon);
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

    planets.push({ mesh: mesh, spin: def.spin });
  });

  /* ---------- Asteroid belt (between Mars and Jupiter) ---------- */
  if (!isMobile) {
    const count = 4500;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      // Volumetric ring spacing
      const rad = 410 + (Math.random() - 0.5) * 60;
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
    scene.add(asteroidBelt);
  }

  /* ---------- Voyage stations: Sun -> each planet ---------- */
  const stations = [];
  const UP = new THREE.Vector3(0, 1, 0);
  const planetStationIndices = [0, 1, 2, 3, 4, 5, 5, 6]; // Earth (2), Mars (3), Jupiter (4), Saturn (5) for stats, Saturn (5) for projects, Uranus (6) for contact!
  
  // Sun station (hero): big sun with glow in center
  stations.push({ cam: new THREE.Vector3(0, 22, 170), look: new THREE.Vector3(0, 0, 0) });
  
  planetStationIndices.forEach((planetIdx) => {
    const p = planets[planetIdx];
    const def = planetDefs[planetIdx];
    const pp = p.mesh.position;
    const radial = new THREE.Vector3(pp.x, 0, pp.z).normalize();      // away from the sun
    const tangent = new THREE.Vector3().crossVectors(UP, radial).normalize();
    
    // Viewport sides: Mercury, Earth, Jupiter on the RIGHT; Venus, Mars, Saturn, Neptune on the LEFT
    let side;
    if (def.name === "mercury" || def.name === "earth" || def.name === "jupiter" || def.name === "uranus") {
      side = -1; // Planet on the RIGHT of screen
    } else {
      side = 1;  // Planet on the LEFT of screen
    }

    // Set a slightly more distanced majestic close-up (r * 1.95 + 2.5) to give more breathing room
    const dist = def.r * 1.95 + 2.5;

    // Place camera on one side of the planet, accentuating the tangent sideways offset (factor 0.52)
    const cam = new THREE.Vector3().copy(pp)
      .addScaledVector(tangent, dist * 0.52 * side)
      .addScaledVector(radial, dist * 0.82)
      .addScaledVector(UP, def.r * 0.15 + 0.5);
      
    // Frame off-center: Accentuate the look-at target offset sideways (factor 0.55) in the opposite direction
    // to push the planet even more toward the edge, revealing more empty space for text!
    const look = pp.clone().addScaledVector(tangent, def.r * 0.55 * -side);
      
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
  const hudCoords = document.getElementById("hud-coords");
  const hudStatus = document.getElementById("hud-status");

  // DOM Elements of the sections to lock camera positions exactly to them
  const sectionIds = ['#hero', '#about', '#resume', '#services', '#claude', '#ai', '#stats', '#projects', '#contact'];
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
  function onScroll() {
    scrollSegment = getScrollSegment();
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  initSections();
  onScroll();

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
  function loop() {
    if (!running) { frameId = null; return; }
    frameId = requestAnimationFrame(loop);

    // 1. Update planetary orbits in real-time
    planetDefs.forEach((def, idx) => {
      def.currentAngle += def.speed;
      const mesh = planets[idx].mesh;
      const x = Math.cos(def.currentAngle) * def.d;
      const z = Math.sin(def.currentAngle) * def.d;
      const y = Math.sin(def.currentAngle * 2.0) * 16.0;
      mesh.position.set(x, y, z);
    });

    // 2. Update camera stations dynamically to track the moving planets in live orbit!
    planetStationIndices.forEach((planetIdx, idx) => {
      const p = planets[planetIdx];
      const def = planetDefs[planetIdx];
      const pp = p.mesh.position;
      const radial = new THREE.Vector3(pp.x, 0, pp.z).normalize();
      const tangent = new THREE.Vector3().crossVectors(UP, radial).normalize();
      
      const side = (def.name === "mercury" || def.name === "earth" || def.name === "jupiter" || def.name === "uranus") ? -1 : 1;
      const dist = def.r * 1.95 + 2.5;

      const cam = new THREE.Vector3().copy(pp)
        .addScaledVector(tangent, dist * 0.52 * side)
        .addScaledVector(radial, dist * 0.82)
        .addScaledVector(UP, def.r * 0.15 + 0.5);
        
      const look = pp.clone().addScaledVector(tangent, def.r * 0.55 * -side);
      
      // Update the Vector3 values in-place so the curves update instantly!
      stations[idx + 1].cam.copy(cam);
      stations[idx + 1].look.copy(look);
    });

    sampleVoyage(scrollSegment);

    // Cinematic highly-dampened camera tracking to eliminate dizziness
    camera.position.lerp(desiredCam, 0.045);
    
    // Double-layered protection: apply collision avoidance directly to physical camera position
    // to prevent corner-cutting inside gas giants like Jupiter or Uranus during dampening!
    avoidCollisions(camera.position);
    currentLook.lerp(desiredLook, 0.035);
    camera.lookAt(currentLook);

    // Update fill light position and target to act as a headlight shining directly on the planet
    camLight.position.copy(camera.position);
    camLight.target.position.copy(currentLook);

    // Planets keep a slow, realistic axial spin; stars stay fixed.
    sun.rotation.y += 0.0004;
    glow.material.rotation += 0.0006;
    if (asteroidBelt) asteroidBelt.rotation.y += 0.00015;
    for (let i = 0; i < planets.length; i++) planets[i].mesh.rotation.y += planets[i].spin;

    // Dynamically update the Cyberpunk Space Navigation HUD telemetry
    const n = stations.length - 1;
    let idx = Math.round(scrollSegment);
    if (idx < 0) idx = 0;
    if (idx > n) idx = n;

    // Update active class on DOM sections to trigger high-tech CSS entry animations
    sectionEls.forEach((el, index) => {
      if (index === idx) {
        if (!el.classList.contains("active-stellar-section")) {
          el.classList.add("active-stellar-section");
        }
      } else {
        el.classList.remove("active-stellar-section");
      }
    });

    if (hudPlanet) {
      if (idx === 0) {
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
    if (hudCoords) {
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

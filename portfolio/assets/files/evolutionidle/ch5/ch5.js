// ch5.js - Babylon.js Neural Core Scene BEAUTIFIED & EVOLVED - organic motion, glow, soft particles, dynamic background gradient

const canvas = document.getElementById("renderCanvas");
const engine = new BABYLON.Engine(canvas, true);
const scene = new BABYLON.Scene(engine);
scene.clearColor = new BABYLON.Color4(0.02, 0.03, 0.1, 1);

// Camera setup
const camera = new BABYLON.ArcRotateCamera("Camera", Math.PI / 2, Math.PI / 2.5, 20, BABYLON.Vector3.Zero(), scene);
camera.attachControl(canvas, true);
camera.useAutoRotationBehavior = true;
camera.autoRotationBehavior.idleRotationSpeed = 0.05;
camera.lowerRadiusLimit = 10;
camera.upperRadiusLimit = 30;

// Lighting
const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), scene);
light.intensity = 0.6;

// Glow layer
const glowLayer = new BABYLON.GlowLayer("glow", scene);
glowLayer.intensity = 0.8;

// Dynamic background gradient with fog
scene.fogMode = BABYLON.Scene.FOGMODE_EXP;
scene.fogColor = new BABYLON.Color3(0.02, 0.03, 0.1);
scene.fogDensity = 0.01;

// Background particle system for depth effect
const particleSystem = new BABYLON.ParticleSystem("particles", 1000, scene);
particleSystem.particleTexture = new BABYLON.Texture("https://playground.babylonjs.com/textures/flare.png", scene);
particleSystem.emitter = new BABYLON.Vector3(0, 0, 0);
particleSystem.minEmitBox = new BABYLON.Vector3(-15, -15, -15);
particleSystem.maxEmitBox = new BABYLON.Vector3(15, 15, 15);
particleSystem.color1 = new BABYLON.Color4(0.3, 0.8, 1, 0.5);
particleSystem.color2 = new BABYLON.Color4(1, 0.8, 0.3, 0.5);
particleSystem.minSize = 0.2;
particleSystem.maxSize = 0.5;
particleSystem.minLifeTime = 4;
particleSystem.maxLifeTime = 8;
particleSystem.emitRate = 100;
particleSystem.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
particleSystem.direction1 = new BABYLON.Vector3(-1, -1, -1);
particleSystem.direction2 = new BABYLON.Vector3(1, 1, 1);
particleSystem.start();

// Neural Core (organic center)
const core = BABYLON.MeshBuilder.CreateIcoSphere("core", { radius: 3, subdivisions: 5 }, scene);
const coreMaterial = new BABYLON.StandardMaterial("coreMat", scene);
coreMaterial.emissiveColor = new BABYLON.Color3(0.3, 0.8, 1);
coreMaterial.alpha = 0.95;
core.material = coreMaterial;

// Floating nodes
let nodes = [];
function createNodes(count) {
  nodes.forEach(n => n.dispose());
  nodes = [];
  for (let i = 0; i < count; i++) {
    const node = BABYLON.MeshBuilder.CreateSphere("node" + i, { diameter: 0.4 }, scene);
    node.position = new BABYLON.Vector3(
      (Math.random() - 0.5) * 12,
      (Math.random() - 0.5) * 12,
      (Math.random() - 0.5) * 12
    );
    const nodeMat = new BABYLON.StandardMaterial("nodeMat" + i, scene);
    nodeMat.emissiveColor = new BABYLON.Color3(1, 0.8, 0.3);
    nodeMat.alpha = 0.8;
    node.material = nodeMat;
    nodes.push(node);
  }
}
createNodes(30);

// Animate core + node floating + fog shift
scene.registerBeforeRender(() => {
  const time = performance.now() * 0.002;

  // Core organic scaling
  const scaleX = 1 + Math.sin(time) * 0.06;
  const scaleY = 1 + Math.sin(time + 2) * 0.07;
  const scaleZ = 1 + Math.sin(time + 4) * 0.08;
  core.scaling.set(scaleX, scaleY, scaleZ);

  // Glow breathing
  glowLayer.intensity = 0.7 + Math.sin(time * 0.5) * 0.2;
  coreMaterial.emissiveColor = new BABYLON.Color3(0.3 + 0.1 * Math.sin(time * 0.5), 0.8, 1);

  // Node floating and breathing
  nodes.forEach((node, i) => {
    node.position.x += Math.sin(time + i * 0.8) * 0.01;
    node.position.y += Math.cos(time + i * 1.2) * 0.01;
    node.position.z += Math.sin(time * 0.5 + i * 1.5) * 0.01;
    const variation = 0.3 + Math.sin(time + i) * 0.1;
    node.scaling.set(variation, variation, variation);
    node.material.alpha = 0.5 + 0.5 * Math.sin(time + i * 0.7);
  });

  // Dynamic fog shift (background gradient feeling)
  const fogShift = 0.01 + Math.abs(Math.sin(time * 0.2)) * 0.02;
  scene.fogDensity = fogShift;
});

// Handle resize
window.addEventListener("resize", () => {
  engine.resize();
});

// Run render loop
engine.runRenderLoop(() => {
  scene.render();
});
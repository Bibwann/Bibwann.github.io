import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const glbUrls = [
  'https://modelviewer.dev/shared-assets/models/Astronaut.glb',
];

const app = document.getElementById('app');
const statusEl = document.getElementById('status');
function setStatus(m){ if(statusEl) statusEl.textContent = m; }
function setError(m){ if(statusEl){ statusEl.textContent = m; statusEl.classList.add('err'); } console.error(m); }

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.setClearColor(0x0f1116, 1);
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f1116);
scene.fog = new THREE.Fog(0x0f1116, 20, 120);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(6, 4, 10);
const controls = new OrbitControls(camera, renderer.domElement);

scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 0.9));
const dir = new THREE.DirectionalLight(0xffffff, 1.0);
dir.position.set(5, 10, 7);
scene.add(dir);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshLambertMaterial({ color: 0x1a1f2b })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -1;
scene.add(ground);

const tex = new THREE.TextureLoader().load(
  'https://threejs.org/examples/textures/uv_grid_opengl.jpg',
  () => setStatus('texture ok'),
  undefined,
  () => setError('texture failed')
);
if (tex) tex.colorSpace = THREE.SRGBColorSpace;
const cube = new THREE.Mesh(
  new THREE.BoxGeometry(1.8, 1.8, 1.8),
  tex
    ? new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.05 })
    : new THREE.MeshStandardMaterial({ color: 0x3366ff })
);
cube.position.set(-3, 0, 0);
scene.add(cube);

async function loadFirstWorkingGLB(urls, onProgress) {
  const loader = new GLTFLoader();
  for (const url of urls) {
    try {
      const gltf = await new Promise((res, rej) => {
        loader.load(url, res, onProgress, rej);
      });
      console.log('loaded glb:', url);
      return gltf;
    } catch (e) {
      console.warn('failed url:', url);
    }
  }
  throw new Error('all glb urls failed');
}

loadFirstWorkingGLB(glbUrls, (ev) => {
  if (ev && ev.total) {
    const p = Math.round((ev.loaded / ev.total) * 100);
  }
})
.then((gltf) => {
  const model = gltf.scene || gltf.scenes[0];
  model.scale.set(2, 2, 2);
  model.position.set(3, 0, 0);
  scene.add(model);
})

renderer.setAnimationLoop(() => {
  cube.rotation.x += 0.01;
  cube.rotation.y += 0.013;
  controls.update();
  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
});

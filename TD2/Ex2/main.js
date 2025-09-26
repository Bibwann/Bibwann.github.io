const canvas = document.getElementById('renderCanvas');
const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });

const createScene = function () {
  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0.95, 0.97, 1.0, 1.0);
  
  const camera = new BABYLON.ArcRotateCamera('cam', Math.PI * 0.75, Math.PI * 0.5, 8, new BABYLON.Vector3(0, 1, 0), scene);
  camera.attachControl(canvas, true);

  const light = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0, 1, 0), scene);
  light.intensity = 0.9;

  const ground = BABYLON.MeshBuilder.CreateGround('g', { width: 40, height: 40 }, scene);
  ground.position.y = -1;

  const gmat = new BABYLON.StandardMaterial('gmat', scene);
  gmat.diffuseColor = new BABYLON.Color3(0.92, 0.94, 0.98);
  ground.material = gmat;

  const sphere = BABYLON.MeshBuilder.CreateSphere('s', { diameter: 2, segments: 32 }, scene);
  sphere.position.y = 1;
  
  const box = BABYLON.MeshBuilder.CreateBox('b', { size: 1.5 }, scene);
  box.position.x = -3;

  const torus = BABYLON.MeshBuilder.CreateTorus('t', { diameter: 2, thickness: 0.4 }, scene);
  torus.position.x = 3;
  
  scene.onBeforeRenderObservable.add(() => {
    const dt = scene.getEngine().getDeltaTime() * 0.001;
    box.rotation.y += dt * 1.2;
    torus.rotation.x += dt * 1.0;
  });

  return scene;
};

const scene = createScene();
engine.runRenderLoop(() => scene.render());
window.addEventListener('resize', () => engine.resize());

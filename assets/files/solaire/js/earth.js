// ============================================
// TD IA - TerraSense 3D
// earth.js : globe + nuages + helpers lat/lon
// Version avec fallback de textures (évite checkerboard)
// ============================================

/**
 * Charge une texture en testant une liste d'URLs jusqu'à succès.
 * @param {string[]} urls
 * @param {BABYLON.Scene} scene
 * @returns {Promise<BABYLON.Texture>}
 */
function loadTextureWithFallback(urls, scene) {
  return new Promise((resolve, reject) => {
    let i = 0;
    const tryNext = () => {
      if (i >= urls.length) return reject(new Error("Aucune texture valide."));
      const url = urls[i++];
      const tex = new BABYLON.Texture(
        url,
        scene,
        true,
        false,
        BABYLON.Texture.TRILINEAR_SAMPLINGMODE,
        () => resolve(tex),
        () => {
          console.warn("Texture KO:", url);
          tryNext();
        }
      );
      tex.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
      tex.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
    };
    tryNext();
  });
}

/**
 * Convertit latitude/longitude en position 3D sur la sphère.
 */
export function latLonToVector3(lat, lon, radius = 1) {
  const phi = (90 - lat) * Math.PI / 180;
  const theta = (lon + 180) * Math.PI / 180;
  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return new BABYLON.Vector3(x, y, z);
}

/**
 * Crée la sphère Terre avec textures + une couche de nuages.
 * Fallbacks multi-CDN pour éviter les carrés rouges/noirs.
 */
export async function buildEarth(scene, parent) {
  const sphere = BABYLON.MeshBuilder.CreateSphere("earth", { diameter: 2, segments: 128 }, scene);
  sphere.parent = parent;

  const matEarth = new BABYLON.StandardMaterial("matEarth", scene);

  const earthURLs = [
    "https://www.babylonjs-playground.com/textures/earth.jpg",
    "https://cdn.babylonjs.com/textures/earth.jpg",
    "https://raw.githubusercontent.com/BabylonJS/Assets/master/Textures/earth/earth.jpg"
  ];

  const cloudURLs = [
    "https://www.babylonjs-playground.com/textures/cloud.png",
    "https://cdn.babylonjs.com/textures/cloud.png",
    "https://raw.githubusercontent.com/BabylonJS/Assets/master/Textures/earth/cloud.png"
  ];

  sphere.material = matEarth;

  try {
    matEarth.diffuseTexture = await loadTextureWithFallback(earthURLs, scene);
  } catch {
    console.warn("Impossible de charger la texture de la Terre — couleur par défaut.");
    matEarth.diffuseColor = new BABYLON.Color3(0.15, 0.15, 0.18);
  }

  matEarth.specularColor = new BABYLON.Color3(0.15, 0.15, 0.15);
  matEarth.emissiveColor = new BABYLON.Color3(0.0, 0.0, 0.0);

  // --- Couche de nuages ---
  const clouds = BABYLON.MeshBuilder.CreateSphere("clouds", { diameter: 2.02, segments: 128 }, scene);
  clouds.parent = parent;

  const matClouds = new BABYLON.StandardMaterial("matClouds", scene);
  try {
    const tex = await loadTextureWithFallback(cloudURLs, scene);
    tex.hasAlpha = true;
    matClouds.diffuseTexture = tex;
    matClouds.opacityTexture = tex;
  } catch {
    matClouds.alpha = 0.0;
  }

  matClouds.backFaceCulling = false;
  matClouds.specularColor = new BABYLON.Color3(0, 0, 0);
  clouds.material = matClouds;

  // --- Rotation lente des nuages ---
  scene.onBeforeRenderObservable.add(() => {
    clouds.rotation.y += 0.0004;
  });

  return sphere;
}

/**
 * Crée un marqueur sphérique pour un pays.
 */
export function createMarker(scene, countryInfos, options) {
  const marker = BABYLON.MeshBuilder.CreateSphere("marker", { diameter: options.diameter || 0.04 }, scene);
  marker.position = options.position;
  marker.material = options.material;
  marker.metadata = { __country: countryInfos };
  return marker;
}
  
export async function buildSolarSystem(scene){
  scene.clearColor = new BABYLON.Color4(0,0,0,1);
  const parent=new BABYLON.TransformNode('solar',scene);
  const glow=new BABYLON.GlowLayer('glow',scene); glow.intensity=0.18;

  const sunMat=new BABYLON.StandardMaterial('sunMat',scene);
  sunMat.emissiveTexture=new BABYLON.Texture('assets/textures/sun.png',scene);
  const sun=BABYLON.MeshBuilder.CreateSphere('sun',{diameter:6},scene); sun.material=sunMat; sun.parent=parent;

  const light=new BABYLON.PointLight('sunlight', new BABYLON.Vector3(0,0,0), scene); light.intensity=1.4;
  const ambient = new BABYLON.HemisphericLight('ambient', new BABYLON.Vector3(0,1,0), scene); ambient.intensity=0.2;

  const planetsData=[
    {name:'Mercure',file:'mercury.png',r:0.76,dist:10,speed:0.015},
    {name:'Vénus',file:'venus.png',r:0.95,dist:14,speed:0.012},
    {name:'Terre',file:'earth.png',r:1,dist:18,speed:0.01,moon:true},
    {name:'Mars',file:'mars.png',r:0.53,dist:22,speed:0.009},
    {name:'Jupiter',file:'jupiter.png',r:3,dist:30,speed:0.006},
    {name:'Saturne',file:'saturn.png',r:2.7,dist:38,speed:0.005,ring:true},
    {name:'Uranus',file:'uranus.png',r:2,dist:46,speed:0.004},
    {name:'Neptune',file:'neptune.png',r:2,dist:54,speed:0.0035}
  ];

  const orbitMat = new BABYLON.StandardMaterial('orbitMat', scene);
  orbitMat.emissiveColor = new BABYLON.Color3(0.4, 0.7, 1.0); orbitMat.alpha = 0.22;

  const planets=[];
  for (const p of planetsData){
    const mat=new BABYLON.StandardMaterial(p.name,scene);
    mat.diffuseTexture=new BABYLON.Texture('assets/textures/'+p.file,scene);
    mat.specularColor = new BABYLON.Color3(0.05,0.05,0.05);
    const mesh=BABYLON.MeshBuilder.CreateSphere(p.name,{diameter:p.r*2},scene); mesh.material=mat;
    const pivot=new BABYLON.TransformNode(p.name+'_pivot',scene); mesh.parent=pivot; pivot.parent=parent;
    mesh.position.x=p.dist;
    planets.push({mesh,pivot,speed:p.speed});

    const ring = BABYLON.MeshBuilder.CreateTorus(p.name+'_orbit', {thickness:0.02, diameter: p.dist*2, tessellation: 128}, scene);
    ring.rotation.x = Math.PI/2; ring.material = orbitMat; ring.parent = parent;

    if(p.ring){
      const ringMat = new BABYLON.StandardMaterial('saturnRing', scene);
      ringMat.diffuseColor = new BABYLON.Color3(0.9,0.85,0.7);
      ringMat.alpha = 0.7; ringMat.backFaceCulling=false;
      const ringMesh = BABYLON.MeshBuilder.CreateDisc('saturn_disc', {radius:3.8, tessellation: 64}, scene);
      ringMesh.parent = mesh; ringMesh.rotation.x = Math.PI/2; ringMesh.material = ringMat;
      ringMesh.scaling = new BABYLON.Vector3(1.9,1,1.9);
    }

    if(p.moon){
      const moonMat=new BABYLON.StandardMaterial('moonMat',scene);
      moonMat.diffuseTexture=new BABYLON.Texture('assets/textures/moon.png',scene);
      moonMat.specularColor = new BABYLON.Color3(0.02,0.02,0.02);
      const moon=BABYLON.MeshBuilder.CreateSphere('moon',{diameter:0.27},scene);
      const moonPivot=new BABYLON.TransformNode('moon_pivot',scene);
      moon.parent=moonPivot; moonPivot.parent=mesh; moon.position.x=2.4;
      scene.onBeforeRenderObservable.add(()=>{ moonPivot.rotation.y += 0.02; moon.rotate(BABYLON.Axis.Y,0.002,BABYLON.Space.LOCAL);});
    }
  }

  scene.onBeforeRenderObservable.add(()=>{
    planets.forEach(p=>{ p.pivot.rotation.y += p.speed; p.mesh.rotate(BABYLON.Axis.Y,0.0015,BABYLON.Space.LOCAL);});
  });


  
  // Create starfield AFTER planets are ready (to appear only once scene is built)
  const bgMat=new BABYLON.StandardMaterial('starfield',scene);
  bgMat.disableLighting = true;
  // Dynamic texture with sparse, subtle stars
  const texW=2048, texH=1024;
  const dynTex = new BABYLON.DynamicTexture('starsDyn', {width:texW, height:texH}, scene, false);
  const ctx = dynTex.getContext();
  ctx.fillStyle = '#000'; ctx.fillRect(0,0,texW,texH);
  const N = 1200; // fewer stars for realism
  for(let i=0;i<N;i++){
    const x = Math.random()*texW, y = Math.random()*texH;
    const bright = 0.6 + Math.random()*0.4;
    const r = Math.random()<0.08 ? 1.3 : 0.7; // a few brighter stars
    ctx.globalAlpha = bright;
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fillStyle = '#ffffff'; ctx.fill();
  }
  ctx.globalAlpha = 1;
  dynTex.update();
  bgMat.emissiveTexture = dynTex;
  bgMat.backFaceCulling=false;
  const bg=BABYLON.MeshBuilder.CreateSphere('stars',{diameter:2000, sideOrientation:BABYLON.Mesh.BACKSIDE},scene);
  bg.material=bgMat;

  return parent;
}
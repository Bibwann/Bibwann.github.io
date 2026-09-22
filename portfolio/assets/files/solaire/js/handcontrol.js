import { clamp, lerp, ExpSmoother } from './utils.js';

export class HandController{
  constructor(scene, camera, video){
    this.scene=scene; this.camera=camera; this.video=video; this.enabled=false;

    // Targets & smoothing
    this.defaults = { alpha: camera.alpha, beta: camera.beta, radius: camera.radius };
    this._targetAlpha=camera.alpha; this._targetBeta=camera.beta; this._targetRadius=camera.radius;
    this._smooth=0.22;
    this._sDX=new ExpSmoother(0.35,0); this._sDY=new ExpSmoother(0.35,0);
    this._zoomSmooth=new ExpSmoother(0.35,0);

    this.hands=new Hands({locateFile:(f)=>`https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`});
    this.hands.setOptions({
      maxNumHands:2, modelComplexity:0, selfieMode:true,
      minDetectionConfidence:0.6, minTrackingConfidence:0.6
    });
    this.hands.onResults(this._onResults.bind(this));

    // Apply camera easing each frame
    scene.onBeforeRenderObservable.add(()=>{
      this.camera.alpha = lerp(this.camera.alpha, this._targetAlpha, this._smooth);
      this.camera.beta  = lerp(this.camera.beta,  this._targetBeta,  this._smooth);
      this.camera.radius= lerp(this.camera.radius,this._targetRadius,this._smooth);
    });
  }

  setEnabled(v){ this.enabled=!!v; }

  async start(){
    try{
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio:false });
      this.video.srcObject = stream; await this.video.play();
      this.enabled=true;
      const onFrame = async () => {
        if(!this.enabled) return;
        await this.hands.send({ image: this.video });
        requestAnimationFrame(onFrame);
      };
      requestAnimationFrame(onFrame);
    }catch(e){
      console.error('[HandController] camera error', e);
      this.enabled=false;
    }
  }

  stop(){
    this.enabled=false;
    const s=this.video.srcObject; if(s){ try{ s.getTracks().forEach(t=>t.stop()); }catch{} }
    this.video.srcObject=null;
  }

  on(cb){ (this.listeners||(this.listeners=[])).push(cb); }

  _onResults(res){
    // Notify listeners (AI preview, etc.)
    (this.listeners||[]).forEach(fn=>{ try{ fn({res, video:this.video}); }catch{} });

    if(!this.enabled || !res.multiHandLandmarks || res.multiHandLandmarks.length===0){
      // no hands -> return to defaults smoothly
      this._targetAlpha = lerp(this._targetAlpha, this.defaults.alpha, 0.08);
      this._targetBeta  = lerp(this._targetBeta,  this.defaults.beta,  0.08);
      this._targetRadius= lerp(this._targetRadius,this.defaults.radius,0.08);
      return;
    }

    // Build list of hands with classification (Left/Right)
    const hands = res.multiHandLandmarks.map((lm, i)=>{
      const handed = (res.multiHandedness && res.multiHandedness[i] && res.multiHandedness[i].label) || 'Right';
      return { lm, handed };
    });

    // Coordinates are 0..1 with selfieMode flipped horizontally by MediaPipe (natural for webcams).
    // Right hand -> orbit (alpha/beta) via index tip
    // Left hand  -> zoom via pinch strength (index tip - thumb tip distance)
    const getIndex = (h)=>h.lm[8];
    const getThumb = (h)=>h.lm[4];

    const right = hands.find(h=>h.handed.toLowerCase()==='right');
    const left  = hands.find(h=>h.handed.toLowerCase()==='left');

    // Deadzone to avoid jitter
    const DZ = 0.02;

    if(right){
      const idx = getIndex(right);
      const nx = idx.x;  // already mirrored for selfieMode
      const ny = idx.y;

      let dx = this._sDX.next(nx - 0.5);
      let dy = this._sDY.next(ny - 0.5);
      if (Math.abs(dx) < DZ) dx = 0;
      if (Math.abs(dy) < DZ) dy = 0;

      // Natural direction: move hand right -> rotate right (decrease alpha), move up -> tilt down slightly
      // Adjust signs for intuitive control
      this._targetAlpha += -dx * 0.28;
      this._targetBeta   = clamp(this._targetBeta + dy * 0.28, 0.15, Math.PI-0.15);
    }

    // Zoom from left hand pinch
    if(left){
      const idx = getIndex(left);
      const th  = getThumb(left);
      const pinch = Math.hypot(idx.x - th.x, idx.y - th.y); // 0 (closed) -> ~0.2 (open)
      // Normalize pinch to [-1..+1] zoom intent: closed = zoom in, open = zoom out
      const zIntent = clamp((0.12 - pinch)/0.12, -1, 1); // center around 0
      const z = this._zoomSmooth.next(zIntent);

      // Zoom proportional to distance (faster when far, gentler when close)
      const step = (this._targetRadius * 0.015) * z;
      this._targetRadius = clamp(this._targetRadius - step, 18, 220);
    }

    // If both hands present, the above naturally combines rotation + zoom.
  }
}

export function bindHandControls(scene,camera){
  const video = document.getElementById('handCam');
  const btn = document.getElementById('handToggle');
  const ctrl = new HandController(scene,camera,video);
  btn.addEventListener('click', async ()=>{
    if(ctrl.enabled){ ctrl.stop(); btn.classList.remove('on'); btn.textContent='✋ Contrôle main : OFF'; }
    else{ await ctrl.start(); btn.classList.add('on'); btn.textContent='✋ Contrôle main : ON'; }
  });
  return ctrl;
}

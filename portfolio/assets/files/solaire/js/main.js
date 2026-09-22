import { buildSolarSystem } from './solar.js';
import { bindHandControls } from './handcontrol.js';

export async function createScene(engine,canvas){
  const scene=new BABYLON.Scene(engine);
  const camera=new BABYLON.ArcRotateCamera('cam',Math.PI/2,Math.PI/3,80,new BABYLON.Vector3(0,0,0),scene);
  camera.lowerRadiusLimit=20; camera.upperRadiusLimit=180; camera.panningSensibility=0;
  camera.attachControl(canvas,true);

  await buildSolarSystem(scene);
  const ctrl = bindHandControls(scene,camera);
  return { scene, camera, ctrl };
}

export function bindAICanvas(ctrl, canvas){
  const ctx = canvas.getContext('2d');
  const draw = ({res, video})=>{
    try{
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0,0,w,h);
      // camera frame (mirrored for selfieMode)
      const vw = video.videoWidth || 640, vh = video.videoHeight || 480;
      const scale = Math.min(w/vw, h/vh);
      const dw = vw*scale, dh = vh*scale;
      const ox = (w-dw)/2, oy = (h-dh)/2;
      ctx.save();
      ctx.translate(ox+dw, oy);
      ctx.scale(-scale, scale); // mirror X only
      ctx.globalAlpha = 0.85;
      ctx.drawImage(video, 0, 0, vw, vh);
      ctx.restore();
      ctx.globalAlpha = 1;

      // landmarks
      if(res && res.multiHandLandmarks){
        for(let i=0;i<res.multiHandLandmarks.length;i++){
          const lm = res.multiHandLandmarks[i];
          const handed = (res.multiHandedness && res.multiHandedness[i] && res.multiHandedness[i].label) || 'R';
          // pick color per hand (green for right, cyan for left)
          ctx.strokeStyle = handed.toLowerCase().startsWith('right') ? '#00e676' : '#00e5ff';
          ctx.fillStyle   = ctx.strokeStyle;

          // draw small points
          for(const p of lm){
            const x = ox + p.x*dw; const y = oy + p.y*dh;
            ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI*2); ctx.fill();
          }
          // highlight index tip
          const tip = lm[8];
          const cx = ox + tip.x*dw, cy = oy + tip.y*dh;
          ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI*2); ctx.stroke();

          // label
          ctx.font = '12px system-ui'; ctx.lineWidth = 2;
          ctx.strokeText(handed, cx+10, cy);
          ctx.fillText(handed, cx+10, cy);
        }
      }
    }catch(e){}
  };
  ctrl.on(draw);
}


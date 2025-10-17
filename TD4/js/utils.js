export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const lerp=(a,b,t)=>a+(b-a)*t;
export class ExpSmoother { constructor(alpha=0.2, init=0){ this.a=alpha; this.y=init; this.inited=false; } next(v){ if(!this.inited){ this.y=v; this.inited=true; return v; } this.y=this.a*v+(1-this.a)*this.y; return this.y; } }

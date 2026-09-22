import * as THREE from 'three';

// Constantes physiques de la simulation
// [SLIDE 2] Force de trainée (Air Resistance) : Fd = -kv
const AIR_DRAG = 0.5;
// [SLIDE 2] Poids : P = mg (g = -9.81 m/s^2)
export const GRAVITY = -9.81;

/**
 * Moteur physique personnalisé pour gérer les collisions et mouvements
 * dans la scène Three.js.
 */
export class PhysicsEngine {
    constructor() {
        this.gravity = new THREE.Vector3(0, GRAVITY, 0);
        this.balls = [];    
        this.boxes = [];    
        
        // --- Vecteurs temporaires pour les calculs ---
        this._tempVec = new THREE.Vector3();
        this._localPos = new THREE.Vector3();
        this._closest = new THREE.Vector3();
        this._normal = new THREE.Vector3();
    }

    addBall(mesh, radius) {
        const ball = {
            mesh: mesh,
            radius: radius,
            pos: mesh.position.clone(),
            vel: new THREE.Vector3(0, 0, 0),
            friction: 1.0,
            bounciness: 0.2, // [SLIDE 2] Coefficient de restitution 'e'
            counted: false,
            idx: -1
        };
        this.balls.push(ball);
        return ball;
    }

    addBox(position, quaternion, halfSize) {
        this.boxes.push({
            pos: position.clone(),
            quat: quaternion.clone(),
            invQuat: quaternion.clone().invert(),
            halfSize: halfSize.clone()
        });
    }

    reset() { 
        this.balls = []; 
    }

    clearStatic() {
        this.boxes = [];
    }

    /**
     * Résout la collision Sphère vs Boite
     * [SLIDE 2] Modèle de collision (principe général d'impulsion)
     */
    resolveSphereBox(ball, box) {
        // Changement de repère (Monde -> Local) pour simplifier le calcul
        this._localPos.copy(ball.pos).sub(box.pos).applyQuaternion(box.invQuat);

        // Clamping (Trouver le point le plus proche sur la boite AABB)
        this._closest.copy(this._localPos).clamp(
            this._tempVec.copy(box.halfSize).negate(),
            box.halfSize
        );

        const distVec = this._tempVec.copy(this._localPos).sub(this._closest);
        const distance = distVec.length();

        // Si contact détecté
        if (distance < ball.radius && distance > 0.00001) {
            const normalLocal = distVec.normalize();
            this._normal.copy(normalLocal).applyQuaternion(box.quat);

            // Correction de position (éviter l'enfoncement)
            const overlap = ball.radius - distance;
            ball.pos.addScaledVector(this._normal, overlap);

            // [SLIDE 2] Rebond : v_new = -e * v_old
            const vDotN = ball.vel.dot(this._normal);
            if (vDotN < 0) {
                // Formule d'impulsion j
                const j = -(1 + ball.bounciness) * vDotN;
                ball.vel.addScaledVector(this._normal, j);

                // Friction tangentielle simple
                const tangent = this._tempVec.copy(ball.vel).sub(this._normal.clone().multiplyScalar(vDotN));
                ball.vel.sub(tangent.multiplyScalar(0.0001));
            }
            return true;
        }
        return false;
    }

    /**
     * Boucle principale
     * [SLIDE 1] Discrétisation Numérique
     */
    step(dt, subSteps = 8) {
        // [SLIDE 1] Gestion de la Stabilité : Le Sub-stepping
        // Formule : dt_calcul = DeltaT_frame / 8
        const stepDt = dt / subSteps;

        // Boucle de sous-étapes pour éviter l'effet tunnel
        for(let s=0; s<subSteps; s++) {
            
            for (let ball of this.balls) {
                
                // --- INTEGRATION EULER EXPLICITE [SLIDE 1] ---
                
                // 1. Mise à jour de la vitesse : v(n+1) = v(n) + g * dt
                // [SLIDE 2] Application 2ème loi de Newton (F=ma => a=g)
                ball.vel.addScaledVector(this.gravity, stepDt);
                
                // 2. Application du Damping (Frottement) [SLIDE 1]
                // Formule : v(final) = v(n+1) * (1 - drag * dt)
                const damp = Math.max(0, 1 - AIR_DRAG * stepDt);
                ball.vel.multiplyScalar(damp);
                
                // 3. Mise à jour de la position [SLIDE 1]
                // Formule : x(n+1) = x(n) + v(n+1) * dt
                ball.pos.addScaledVector(ball.vel, stepDt);


                // --- GESTION DES COLLISIONS [SLIDE 2] ---

                // Collisions avec le décor
                for (let box of this.boxes) {
                    this.resolveSphereBox(ball, box);
                }

                // Collisions Balle vs Balle
                for (let other of this.balls) {
                    if (ball === other) continue;

                    // [SLIDE 2] Détection : distance < somme des rayons
                    const distSq = ball.pos.distanceToSquared(other.pos);
                    const radSum = ball.radius + other.radius;
                    
                    if (distSq < radSum * radSum) {
                        const dist = Math.sqrt(distSq);
                        
                        // [SLIDE 2] Séparation (Code les écarte de Overlap/2)
                        const overlap = radSum - dist;
                        this._normal.subVectors(ball.pos, other.pos).normalize();
                        
                        ball.pos.addScaledVector(this._normal, overlap * 0.5);
                        other.pos.addScaledVector(this._normal, -overlap * 0.5);

                        // [SLIDE 2] Calcul de l'impulsion j
                        const relVel = this._tempVec.subVectors(ball.vel, other.vel);
                        const velAlongNormal = relVel.dot(this._normal);
                        
                        if (velAlongNormal < 0) {
                            // Application de l'amortissement (Choc semi-élastique)
                            // Mise à jour des vitesses dans directions opposées
                            const j = -(1 + 0.5) * velAlongNormal;
                            ball.vel.addScaledVector(this._normal, j * 0.5);
                            other.vel.addScaledVector(this._normal, -j * 0.5);
                        }
                    }
                }

                // Mise à jour visuelle (Three.js)
                ball.mesh.position.copy(ball.pos);
                
                // Rotation esthétique
                ball.mesh.rotation.x += ball.vel.z * stepDt * 1.5; 
                ball.mesh.rotation.z -= ball.vel.x * stepDt * 1.5;
            }
        }
    }
}
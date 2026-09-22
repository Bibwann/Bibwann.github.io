import * as THREE from 'three';
import { BALLS } from './scene.js';

// =================================================================================================
// -------------------------------------------------------------------------------------------------
//                                      CONFIGURATION LOGIQUE
// -------------------------------------------------------------------------------------------------
// =================================================================================================

/**
 * Paramètres théoriques de la machine utilisés pour la VALIDATION.
 * Ces valeurs doivent être cohérentes avec celles définies dans scene.js.
 * Elles servent à calculer "où la balle aurait dû tomber" pour vérifier si le tri est correct.
 */
const MACHINE = { 
    startX: -10,    // Début des rails
    length: 45,     // Longueur des rails
    gapStart: 0.5,  // Écartement initial
    gapEnd: 3.5     // Écartement final
};

// Marge d'erreur / Décalage pour aligner la zone de détection logique avec les bacs visuels
const OFFSET_BACS = 5.0;

/**
 * Classe principale gérant les règles du jeu, le comptage des points
 * et le déroulement des séquences de test (Benchmark).
 */
export class GameLogic {
    
    /**
     * @param {THREE.Scene} scene - La scène pour ajouter/supprimer les balles visuellement
     * @param {PhysicsEngine} physics - Le moteur physique pour suivre les balles
     * @param {Function} onStatsUpdate - Callback pour notifier l'interface graphique (UI)
     */
    constructor(scene, physics, onStatsUpdate) {
        this.scene = scene;
        this.physics = physics;
        this.onStatsUpdate = onStatsUpdate;

        // Tableaux de comptage : index n = nombre de balles de type n correctement triées
        this.counts = new Array(BALLS.length).fill(0);
        
        // Compteurs globaux
        this.totalSuccess = 0; // Balles dans le bon bac
        this.totalMissed = 0;  // Balles tombées à côté ou dans le mauvais bac

        // Gestion du spawn automatique (setInterval)
        this.autoInterval = null;
        this.currentDelay = 1000; // Délai par défaut entre deux balles (ms)
        
        // État du benchmark
        this.isBenchmarking = false;
    }

    // =================================================================================================
    // -------------------------------------------------------------------------------------------------
    //                                      BOUCLE DE VÉRIFICATION
    // -------------------------------------------------------------------------------------------------
    // =================================================================================================

    /**
     * Vérifie l'état de chaque balle active pour déterminer si elle est triée.
     * Cette méthode est appelée à chaque frame dans la boucle principale.
     */
    checkBalls() {
        let statsChanged = false; // Optimisation : on ne met à jour l'UI que si nécessaire

        // On parcourt toutes les balles gérées par le moteur physique
        this.physics.balls.forEach(b => {
            // Condition de fin : La balle est tombée sous le niveau des rails (y < -2)
            // ET elle n'a pas encore été comptabilisée.
            if (b.pos.y < -2 && !b.counted) {
                b.counted = true; // Marquage pour ne pas la recompter à la prochaine frame
                statsChanged = true;

                // 1. Vérification : Est-elle tombée dans la zone des bacs ou à l'extérieur ?
                // Math.abs(b.pos.z) < 6.0 signifie qu'elle est bien centrée sur la largeur
                const insideWidth = Math.abs(b.pos.z) < 6.0;

                if (!insideWidth) {
                    // ÉCHEC : La balle est tombée hors de la machine (sur les côtés)
                    this.totalMissed++;
                    // Feedback visuel : La balle devient GRIS FONCÉ (déchet)
                    b.mesh.material.color.setHex(0x333333);
                } else {
                    // 2. Identification du bac : Dans quel bac est-elle tombée réellement ?
                    // On utilise sa position X au moment de la chute
                    const detectedBinIdx = this.getExpectedBinIndex(b.pos.x);

                    if (detectedBinIdx === -1) {
                        // ÉCHEC : Tombée dans une zone inconnue (avant ou après les bacs)
                        this.totalMissed++;
                        b.mesh.material.color.setHex(0x333333);
                    } 
                    else if (detectedBinIdx === b.idx) {
                        // SUCCÈS : Le bac détecté correspond à l'index (type) de la balle
                        this.totalSuccess++;
                        this.counts[b.idx]++;
                        // Pas de changement de couleur, on garde la couleur originale
                    } 
                    else {
                        // ÉCHEC CRITIQUE : La balle est tombée dans le MAUVAIS bac
                        // (ex: une petite balle dans le bac des grosses)
                        this.totalMissed++;
                        // Feedback visuel : ROUGE CLIGNOTANT (via émissif)
                        b.mesh.material.color.setHex(0xff0000);
                        b.mesh.material.emissive.setHex(0x550000);
                    }
                }
            }
        });

        // Si les scores ont changé, on envoie les nouvelles stats à l'UI
        if (statsChanged && this.onStatsUpdate) {
            this.onStatsUpdate({ counts: this.counts, success: this.totalSuccess, missed: this.totalMissed });
        }
    }

    /**
     * Calcule l'index du bac correspondant à une position X donnée.
     * C'est la "Vérité Terrain" théorique basée sur la configuration des rails.
     * 
     * @param {number} xPosition - La position X où la balle a chuté
     * @returns {number} L'index du bac (0 à 4) ou -1 si hors zone
     */
    getExpectedBinIndex(xPosition) {
        let prevDropX = MACHINE.startX;
        
        // On itère sur chaque catégorie de balle pour reconstruire les intervalles des bacs
        for (let i = 0; i < BALLS.length; i++) {
            const b = BALLS[i];
            const diam = b.r * 2;
            
            // Formule théorique de Thales : A quel X l'écartement des rails égale-t-il le diamètre ?
            const ratio = (diam - MACHINE.gapStart) / (MACHINE.gapEnd - MACHINE.gapStart);
            let dropX = MACHINE.startX + (MACHINE.length * ratio) + OFFSET_BACS;
            
            // Le dernier bac va jusqu'à la fin (et même un peu plus loin pour tout attraper)
            if (i === BALLS.length - 1) dropX = MACHINE.startX + MACHINE.length + 10;
            
            // Si la position X est comprise dans cet intervalle [DébutBac, FinBac[
            if (xPosition >= prevDropX && xPosition < dropX) return i;
            
            // Le début du prochain bac est la fin de celui-ci
            prevDropX = dropX;
        }
        return -1; // Aucun bac trouvé à cette position
    }

    // =================================================================================================
    // -------------------------------------------------------------------------------------------------
    //                                      ACTIONS DE JEU
    // -------------------------------------------------------------------------------------------------
    // =================================================================================================

    /**
     * Fait apparaître une nouvelle balle dans la scène.
     * @param {number} [idx] - Index de la balle forcée (0-4). Si omis, aléatoire.
     */
    spawn(idx) {
        // Choix aléatoire si non spécifié
        if (idx === undefined) idx = Math.floor(Math.random() * BALLS.length);
        
        const def = BALLS[idx]; // Récupération des propriétés (rayon, couleur)
        
        // Création du Mesh (Visuel)
        const mesh = new THREE.Mesh(
            new THREE.SphereGeometry(def.r, 32, 32),
            new THREE.MeshPhysicalMaterial({ color: def.color, clearcoat: 1, roughness: 0.1, metalness: 0.1 })
        );
        mesh.castShadow = true;
        this.scene.add(mesh);
        
        // Ajout au moteur physique
        const ball = this.physics.addBall(mesh, def.r);
        ball.idx = idx; // On mémorise son type pour la vérification future
        
        // Position initiale : Au-dessus de l'entonnoir, avec un léger offset aléatoire en Z
        // pour ne pas qu'elles tombent toutes exactement au même endroit (pile behavior)
        ball.pos.set(-20, 16, (Math.random() - 0.5) * 3);
        
        // Vitesse initiale vers le bas
        ball.vel.set(0, -1, 0);
    }

    /**
     * Réinitialise totalement la simulation (Balles, Scores).
     * Les murs ne sont pas touchés (voir physics.clearStatic pour ça).
     */
    reset() {
        this.stopAuto(); // Arrête le générateur automatique
        
        // Supprime visuellement toutes les balles
        this.physics.balls.forEach(b => this.scene.remove(b.mesh));
        
        // Vide le moteur physique
        this.physics.reset();
        
        // Remise à zéro des compteurs
        this.counts.fill(0);
        this.totalSuccess = 0;
        this.totalMissed = 0;
        
        // Mise à jour de l'interface
        if (this.onStatsUpdate) this.onStatsUpdate({ counts: this.counts, success: 0, missed: 0 });
    }

    /**
     * Règle la vitesse de spawn automatique.
     * @param {number} ms - Intervalle en millisecondes entre deux spawns
     */
    setSpeed(ms) {
        this.currentDelay = parseInt(ms);
        // Si ça tourne déjà, on redémarre avec le nouveau délai
        if (this.autoInterval) {
            clearInterval(this.autoInterval);
            this.autoInterval = setInterval(() => this.spawn(), this.currentDelay);
        }
    }

    /**
     * Active/Désactive le spawn automatique.
     * @param {HTMLElement} btnElement - Le bouton UI à mettre à jour (couleur/texte)
     * @returns {boolean} État final (Actif ou non)
     */
    toggleAuto(btnElement) {
        if (this.autoInterval) {
            this.stopAuto();
            if(btnElement) { btnElement.innerHTML = "Auto: OFF"; btnElement.style.background = "#27ae60"; }
        } else {
            this.spawn(); // Spawn immédiat pour le feedback instantané
            this.autoInterval = setInterval(() => this.spawn(), this.currentDelay);
            if(btnElement) { btnElement.innerHTML = "Auto: ON"; btnElement.style.background = "#ff6b6b"; }
        }
        return !!this.autoInterval;
    }

    /**
     * Coupe le spawn automatique proprement.
     */
    stopAuto() {
        if (this.autoInterval) {
            clearInterval(this.autoInterval);
            this.autoInterval = null;
        }
    }

    // =================================================================================================
    // -------------------------------------------------------------------------------------------------
    //                                      SYSTÈME DE BENCHMARK
    // -------------------------------------------------------------------------------------------------
    // =================================================================================================

    /**
     * Exécute une batterie de tests automatisés avec différentes vitesses.
     * @param {Function} uiCallback - Fonction pour afficher la progression à l'utilisateur
     * @returns {Array} Résultats du test
     */
    async runBenchmark(uiCallback) {
        if(this.isBenchmarking) return []; // Sécurité anti-clic multiple
        this.isBenchmarking = true;
        
        // Les vitesses à tester (de lent à très rapide)
        const speeds = [1000, 500, 250, 10]; 
        const DURATION = 30000; // Durée de chaque phase (30 secondes)
        const results = [];

        console.log("=== DÉBUT DU BENCHMARK ===");

        for (let ms of speeds) {
            // Feedback
            if(uiCallback) uiCallback(`Test vitesse: ${ms}ms...`);
            
            // Reset complet avant chaque phase
            this.reset();
            
            // Configuration et lancement
            this.setSpeed(ms);
            this.autoInterval = setInterval(() => this.spawn(), this.currentDelay);
            
            // Attente asynchrone (la boucle animate continue de tourner en arrière-plan)
            await new Promise(resolve => setTimeout(resolve, DURATION));

            // Arrêt de la génération
            this.stopAuto();
            if(uiCallback) uiCallback(`Finalisation ${ms}ms...`);
            
            // On attend 2 secondes pour que les dernières balles finissent de tomber
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Collecte des résultats
            const total = this.totalSuccess + this.totalMissed;
            const accuracy = total > 0 ? ((this.totalSuccess / total) * 100).toFixed(1) : 0;
            
            results.push({
                speed: ms,
                spawned: total,
                success: this.totalSuccess,
                missed: this.totalMissed,
                accuracy: accuracy + "%"
            });
        }
        
        // Nettoyage final
        this.reset();
        this.isBenchmarking = false;
        return results;
    }
}
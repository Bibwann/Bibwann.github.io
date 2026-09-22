import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PhysicsEngine } from './moteur.js';
import { buildScene, BALLS } from './scene.js';
import { GameLogic } from './logic.js';

// =================================================================================================
// -------------------------------------------------------------------------------------------------
//                                      INITIALISATION DE LA SCÈNE 3D
// -------------------------------------------------------------------------------------------------
// =================================================================================================

/**
 * Création de la scène Three.js qui contient tous les objets 3D.
 * C'est le conteneur principal du monde virtuel.
 */
const scene = new THREE.Scene();

// Configuration de l'arrière-plan avec une couleur sombre (Gris bleuté)
scene.background = new THREE.Color(0x2f3640); 

// Ajout d'un brouillard exponentiel pour donner de la profondeur et fondre l'horizon
scene.fog = new THREE.FogExp2(0x2f3640, 0.015);

/**
 * Configuration de la caméra (Perspective).
 * - FOV: 45 degrés (champ de vision naturel)
 * - Aspect Ratio: Largeur/Hauteur de l'écran
 * - Near/Far: Distance d'affichage min (0.1) et max (100 mètres)
 */
const camera = new THREE.PerspectiveCamera(45, window.innerWidth/window.innerHeight, 0.1, 100);
// Positionnement initial en "vue d'oiseau" isométrique
camera.position.set(35, 25, 45);

/**
 * Configuration du moteur de rendu WebGL.
 * C'est lui qui dessine les pixels à l'écran.
 */
const renderer = new THREE.WebGLRenderer({ antialias: true }); // Antialias pour lisser les bords
renderer.setSize(window.innerWidth, window.innerHeight);       // Plein écran
renderer.shadowMap.enabled = true;                             // Activation des ombres dynamiques
renderer.shadowMap.type = THREE.PCFSoftShadowMap;              // Ombres douces (plus réalistes)

// Injection du canvas (la zone de dessin) dans le HTML
document.body.appendChild(renderer.domElement);

/**
 * Contrôles de caméra "Orbit".
 * Permet à l'utilisateur de tourner autour de la scène avec la souris.
 */
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; // Ajoute de l'inertie pour un mouvement fluide
controls.target.set(5, -5, 0); // Point que la caméra regarde (Centre de la machine)

// =================================================================================================
// -------------------------------------------------------------------------------------------------
//                                      INITIALISATION DU JEU
// -------------------------------------------------------------------------------------------------
// =================================================================================================

// Instanciation de notre moteur physique maison
const physics = new PhysicsEngine();

// Variable d'état pour le type de rail actuel ('toit' = plaques angulaires, 'tige' = cylindres)
let currentRailMode = 'toit'; 

// Construction initiale de la scène (Murs, Rails, Lumières)
buildScene(scene, physics, currentRailMode);

// Instanciation de la logique de jeu (Gestion des vagues, comptage des points)
// On lui passe une callback pour mettre à jour l'interface utilisateur à chaque changement
const game = new GameLogic(scene, physics, (stats) => updateUI(stats));

// =================================================================================================
// -------------------------------------------------------------------------------------------------
//                                      INTERFACE UTILISATEUR (UI)
// -------------------------------------------------------------------------------------------------
// =================================================================================================

/**
 * Met à jour les éléments HTML de l'overlay (Scores, Cartes de balles, Graphique).
 * Appelée automatiquement par GameLogic quand les stats changent.
 * 
 * @param {Object} stats - Objet contenant les statistiques actuelles (success, missed, counts...)
 */
function updateUI(stats) {
    const container = document.getElementById('stats-container');
    
    // Génération dynamique des "Cartes" pour chaque type de balle
    // On utilise les données de config BALLS (couleur, label) importées de scene.js
    container.innerHTML = BALLS.map((b, i) => `
        <div class="card" style="--c: #${b.color.toString(16)}">
            <span class="num" style="color:#${b.color.toString(16)}">${stats.counts[i]}</span>
            <span class="lbl">${b.label}</span>
        </div>
    `).join('');

    // Calcul du pourcentage de précision
    const total = stats.success + stats.missed;
    let percent = 100;
    if (total > 0) percent = ((stats.success / total) * 100).toFixed(1);
    
    // Mise à jour de l'affichage du pourcentage avec code couleur
    const lblAcc = document.getElementById('accuracy-lbl');
    lblAcc.innerText = percent + "%";
    
    // Vert si > 98%, Jaune si > 90%, Rouge sinon
    if(percent >= 98) lblAcc.style.color = "#2ecc71";
    else if(percent >= 90) lblAcc.style.color = "#f1c40f";
    else lblAcc.style.color = "#e74c3c";

    // Mise à jour des compteurs bruts
    document.getElementById('success-lbl').innerText = stats.success;
    document.getElementById('miss-lbl').innerText = stats.missed;
    
    // Redessine le petit histogramme en bas
    drawGraph(stats.counts);
}

/**
 * Dessine un histogramme simple dans le canvas HTML pour visualiser la répartition des balles.
 * 
 * @param {number[]} counts - Tableau des comptes par type de balle
 */
function drawGraph(counts) {
    const canvas = document.getElementById('ratioCanvas');
    if (!canvas) return; // Sécurité si l'élément n'existe pas
    
    const ctx = canvas.getContext('2d');
    const W = canvas.width; const H = canvas.height;
    
    // Efface le canvas
    ctx.clearRect(0, 0, W, H);
    
    // On cherche la valeur max pour normaliser la hauteur des barres (échelle relative)
    const maxVal = Math.max(...counts, 1); 
    const barWidth = (W / counts.length) - 4; // Largeur d'une barre avec une marge
    
    counts.forEach((count, i) => {
        // Hauteur proportionnelle au max
        const barHeight = (count / maxVal) * (H - 15); 
        
        const x = i * (W / counts.length) + 2;
        const y = H - barHeight; // Le canvas a l'origine (0,0) en haut à gauche
        
        // Couleur correspondant à la balle
        ctx.fillStyle = '#' + BALLS[i].color.toString(16);
        ctx.fillRect(x, y, barWidth, barHeight);
        
        // Affiche le nombre au-dessus de la barre si non nul
        if (count > 0) {
            ctx.fillStyle = '#fff'; ctx.font = '9px Arial'; ctx.textAlign = 'center';
            ctx.fillText(count, x + barWidth/2, y - 4);
        }
    });
}

// Appel initial pour avoir une UI propre au démarrage (tout à zéro)
updateUI({ counts: new Array(BALLS.length).fill(0), success: 0, missed: 0 });

// =================================================================================================
// -------------------------------------------------------------------------------------------------
//                                      SYSTÈME DE CHANGEMENT DE SCÈNE
// -------------------------------------------------------------------------------------------------
// =================================================================================================

/**
 * Change dynamiquement le type de rail et re-génère toute la scène.
 * Cette fonction est "destructive" : elle supprime tout et reconstruit.
 * 
 * @param {string} modeName - 'toit' ou 'tige'
 */
function setRailMode(modeName) {
    // Optimisation : si on est déjà dans ce mode et que la scène est chargée, on ne fait rien
    if(currentRailMode === modeName && scene.children.length > 5) return; 
    
    currentRailMode = modeName;
    
    // Mise à jour du texte du bouton dans l'UI
    const btn = document.getElementById('btnRail');
    if(btn) btn.innerText = (currentRailMode === 'toit') ? 'Rail: TOIT' : 'Rail: TIGE';
    
    // 1. Reset logique du jeu
    window.resetSim(); 
    
    // 2. Reset physique (supprime les murs invisibles)
    physics.clearStatic();
    
    // 3. Reset graphique (supprime tous les meshes de la scène)
    // On boucle à l'envers pour supprimer sans casser les index
    for (let i = scene.children.length - 1; i >= 0; i--) {
        const obj = scene.children[i];
        // On ne garde rien (sauf peut-être caméras internes invisible, mais ici on wipe tout)
        if (obj.isMesh || obj.type === 'Group') {
            if(obj.geometry) obj.geometry.dispose(); // Libère la mémoire GPU
            scene.remove(obj);
        }
    }
    
    // 4. Re-construit la scène avec la nouvelle configuration
    buildScene(scene, physics, currentRailMode);
}

// =================================================================================================
// -------------------------------------------------------------------------------------------------
//                                      LOGIQUE DE BENCHMARK (TESTS AUTO)
// -------------------------------------------------------------------------------------------------
// =================================================================================================

// Fonctions exposées globalement (window.) pour être appelées par les boutons HTML
window.openBenchMenu = () => { document.getElementById('bench-choice-modal').style.display = 'flex'; };
window.closeBenchMenu = () => { document.getElementById('bench-choice-modal').style.display = 'none'; };

/**
 * Lance une séquence de test automatisée.
 * Test un mode de rail, ou les deux à la suite, et génère un rapport.
 * 
 * @param {string} choice - 'toit', 'tige', ou 'both'
 */
window.runBenchmarkSequence = async (choice) => {
    closeBenchMenu();
    const btn = document.getElementById('btnBench');
    if(btn) btn.disabled = true; // Désactive le bouton pour éviter le spam

    const toast = document.getElementById('clean-toast');
    const updateStatus = (msg) => { toast.innerText = msg; toast.style.opacity = 1; };

    // Détermine la liste des modes à tester
    let modesToTest = (choice === 'both') ? ['toit', 'tige'] : [choice];
    let globalResults = [];

    // Boucle asynchrone pour traiter les séquences une par une
    for (let mode of modesToTest) {
        updateStatus(`Configuration: Rail ${mode.toUpperCase()}...`);
        
        // Change la scène
        setRailMode(mode);
        
        // Petite pause pour laisser le temps au moteur de respirer (et à l'utilisateur de voir)
        await new Promise(r => setTimeout(r, 1000));

        const modeLabel = mode.toUpperCase();
        
        // Lance le benchmark via GameLogic (c'est lui qui fait spawner les 1000 balles)
        // On passe une callback pour mettre à jour le toast de progression
        const results = await game.runBenchmark((msg) => {
            updateStatus(`[${modeLabel}] ${msg}`);
        });
        
        // Marque les résultats avec le type de rail utilisé
        results.forEach(res => res.railType = modeLabel);
        
        // Agrège les résultats
        globalResults = [...globalResults, ...results];
    }

    // Fin du test
    toast.style.opacity = 0;
    if(btn) btn.disabled = false;
    
    // Affichage de la modale de rapport final
    showReport(globalResults);
};

/**
 * Génère le tableau HTML des résultats du benchmark.
 */
function showReport(results) {
    const modal = document.getElementById('report-modal');
    const content = document.getElementById('report-content');
    
    let html = `
        <table style="width:100%; border-collapse: collapse; margin-top:10px; font-size:14px;">
            <tr style="background:#444; text-align:left;">
                <th style="padding:8px;">Rail</th>
                <th style="padding:8px;">Vitesse</th>
                <th style="padding:8px;">Total</th>
                <th style="padding:8px;">Succès</th>
                <th style="padding:8px;">Ratés</th>
                <th style="padding:8px;">Précision</th>
            </tr>
    `;
    results.forEach(row => {
        const railColor = row.railType === 'TOIT' ? '#f39c12' : '#3498db';
        html += `
            <tr style="border-bottom:1px solid #555;">
                <td style="padding:8px; color:${railColor}; font-weight:bold;">${row.railType}</td>
                <td style="padding:8px;">${row.speed} ms</td>
                <td style="padding:8px;">${row.spawned}</td>
                <td style="padding:8px; color:#2ecc71">${row.success}</td>
                <td style="padding:8px; color:#e74c3c">${row.missed}</td>
                <td style="padding:8px; font-weight:bold">${row.accuracy}</td>
            </tr>
        `;
    });
    html += `</table>`;
    content.innerHTML = html;
    modal.style.display = 'flex';
}

window.closeReport = () => { document.getElementById('report-modal').style.display = 'none'; };

// =================================================================================================
// -------------------------------------------------------------------------------------------------
//                                      LISTENERS & BOUCLE PRINCIPALE
// -------------------------------------------------------------------------------------------------
// =================================================================================================

// Expose les fonctions de contrôle manuel pour les boutons de l'interface
window.spawn = (idx) => game.spawn(idx);
window.resetSim = () => {
    game.reset();
    const btn = document.getElementById('btnAuto');
    if(btn) { btn.innerHTML = "Auto: OFF"; btn.style.background = "#27ae60"; }
};
window.toggleAuto = () => {
    const btn = document.getElementById('btnAuto');
    game.toggleAuto(btn);
};
window.updateSpeed = (val) => {
    document.getElementById('speedValue').innerText = val + 'ms';
    game.setSpeed(val);
};
window.toggleRailMode = () => {
    const nextMode = (currentRailMode === 'toit') ? 'tige' : 'toit';
    setRailMode(nextMode);
};

// Horloge pour mesurer le temps écoulé entre deux frames (Delta Time)
const clock = new THREE.Clock();

/**
 * BOUCLE DE RENDU ET DE SIMULATION (Game Loop).
 * Appelée 60 fois par seconde (ou plus selon l'écran).
 */
function animate() {
    requestAnimationFrame(animate); // Planifie la prochaine frame
    
    // Calcul du temps écoulé, plafonné à 0.1s pour éviter les bugs si le navigateur freeze
    const dt = Math.min(clock.getDelta(), 0.1);
    
    // 1. Mise à jour de la physique (mouvements, collisions)
    physics.step(dt);
    
    // 2. Logique de jeu (Vérifier si les balles sont tombées dans les bacs)
    game.checkBalls();
    
    // 3. Mise à jour des contrôles caméra (inertie)
    controls.update();
    
    // 4. Dessin de la scène
    renderer.render(scene, camera);
}

// Lancement de la boucle
animate();

// Gestion du redimensionnement de la fenêtre
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight; // Recalcul du ratio
    camera.updateProjectionMatrix();                        // Mise à jour de la matrice de projection
    renderer.setSize(window.innerWidth, window.innerHeight); // Mise à jour du canvas
});

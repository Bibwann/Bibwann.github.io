import * as THREE from 'three';

// =================================================================================================
// -------------------------------------------------------------------------------------------------
//                                      CONFIGURATION GLOBALE
// -------------------------------------------------------------------------------------------------
// =================================================================================================

/**
 * Configuration des balles à trier.
 * Chaque objet définit :
 * - r : Rayon de la balle (détermine la taille physique et visuelle)
 * - color : Couleur hexadécimale pour le rendu visuel
 * - label : Nom de la catégorie (pour info ou débogage)
 */
export const BALLS = [
    { r: 0.40, color: 0x00d2d3, label: 'MINI' },    // Plus petite balle
    { r: 0.60, color: 0x54a0ff, label: 'SMALL' },   // Balle petite
    { r: 0.80, color: 0x5f27cd, label: 'MEDIUM' },  // Balle moyenne
    { r: 1.00, color: 0xff9f43, label: 'LARGE' },   // Balle grande
    { r: 1.20, color: 0xe74c3c, label: 'XLARGE' }   // Plus grande balle
];

/**
 * Paramètres géométriques de la machine de tri.
 * Ces valeurs définissent la forme et les dimensions des rails.
 */
const MACHINE_CONFIG = {
    startX: -10,      // Position X de départ des rails (haut de la pente)
    length: 45,       // Longueur totale horizontale des rails
    slope: 0.10,      // Pente des rails (dy/dx), détermine l'inclinaison
    railY: 5,         // Hauteur Y de départ des rails
    gapStart: 0.5,    // Écartement initial entre les rails (doit être < plus petite balle)
    gapEnd: 3.5       // Écartement final entre les rails (doit être > plus grande balle)
};

/**
 * Palette de couleurs utilisée pour les différents éléments de la scène.
 */
const COLORS = {
    FLOOR: 0x2d3436,        // Couleur du sol infini au fond
    MACHINE: 0x636e72,      // Couleur de la structure métallique principale
    RAIL: 0xdfe6e9,         // Couleur claire des rails
    WALL_DIVIDER: 0xffffff, // Couleur des séparateurs de bacs
};

// =================================================================================================
// -------------------------------------------------------------------------------------------------
//                                      FONCTIONS UTILITAIRES DE CONSTRUCTION
// -------------------------------------------------------------------------------------------------
// =================================================================================================

/**
 * Crée un mur statique basique (boîte) et l'ajoute à la scène et à la physique.
 * 
 * @param {THREE.Scene} scene - La scène Three.js
 * @param {PhysicsEngine} physics - Le moteur physique pour les collisions
 * @param {number} x, y, z - Position du centre du mur
 * @param {number} w, h, d - Dimensions (Largeur, Hauteur, Profondeur)
 * @param {number} color - Couleur du mur
 * @param {boolean} isGlass - Si vrai, utilise un matériau transparent type verre
 * @returns {THREE.Mesh} Le mesh créé
 */
function createWall(scene, physics, x, y, z, w, h, d, color, isGlass = false) {
    let mat;
    
    // Si c'est du verre, on utilise un matériau physique complexe pour la transparence et les reflets
    if (isGlass) {
        mat = new THREE.MeshPhysicalMaterial({
            color: color, 
            metalness: 0.1, 
            roughness: 0.05, 
            transmission: 0.7, // Laisse passer la lumière
            thickness: 1.5,    // Épaisseur simulée pour la réfraction
            transparent: true, 
            opacity: 0.5, 
            side: THREE.DoubleSide // Rendu des deux côtés des faces
        });
    } else {
        // Sinon, matériau standard, un peu rugueux pour le sol ou les murs opaques
        mat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.4, metalness: 0.3 });
    }

    // Création de la géométrie et du mesh
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    
    // Configuration des ombres : le verre ne porte pas d'ombre portée opaque
    mesh.castShadow = !isGlass; 
    mesh.receiveShadow = true;
    
    // Ajout à la scène graphique
    scene.add(mesh);
    
    // Ajout à la simulation physique (boîte statique)
    // On passe les demi-dimensions (halfSize) car le moteur physique calcule depuis le centre
    physics.addBox(mesh.position, mesh.quaternion, new THREE.Vector3(w/2, h/2, d/2));
    
    return mesh;
}

/**
 * Crée un mur physique avec une rotation spécifique (Quaternion).
 * Utilisé pour les parties inclinées de la machine (entonnoir de départ).
 * 
 * @param {THREE.Scene} scene ...
 * @param {PhysicsEngine} physics ...
 * @param {number} w, h, d - Dimensions
 * @param {number} x, y, z - Position
 * @param {THREE.Quaternion} quat - Rotation à appliquer
 */
function createWallPhys(scene, physics, w, h, d, x, y, z, quat) {
    const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d), 
        new THREE.MeshStandardMaterial({ color: COLORS.MACHINE, metalness: 0.3, roughness: 0.5 })
    );
    
    // Application de la position et de la rotation
    mesh.position.set(x, y, z);
    mesh.quaternion.copy(quat);
    
    // Ombres
    mesh.castShadow = true; 
    mesh.receiveShadow = true;
    
    scene.add(mesh);
    
    // Ajout physique en respectant la rotation fournie
    physics.addBox(mesh.position, mesh.quaternion, new THREE.Vector3(w/2, h/2, d/2));
}

/**
 * Crée un rail de type "Plaque" (style toit/équerre).
 * Calcule automatiquement l'orientation pour relier le point p1 au point p2.
 * 
 * @param {THREE.Scene} scene ...
 * @param {PhysicsEngine} physics ...
 * @param {THREE.Vector3} p1 - Point de départ du rail
 * @param {THREE.Vector3} p2 - Point d'arrivée du rail
 * @param {boolean} isLeft - Définit si c'est le rail gauche ou droit (pour l'inclinaison latérale)
 */
function createRailPlate(scene, physics, p1, p2, isLeft) {
    // Calcul du vecteur direction entre p1 et p2
    const vec = new THREE.Vector3().subVectors(p2, p1);
    const len = vec.length(); // Longueur nécessaire du rail
    
    // Le centre du rail est le milieu entre p1 et p2
    const center = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
    
    // Calcule le quaternion pour orienter l'axe Y (vertical par défaut) vers la direction du rail
    const quatSlope = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0), vec.clone().normalize());

    // Dimensions de la plaque
    const plateHeight = 1.2; 
    const plateThickness = 0.1; 
    const depth = plateHeight * 2.0; 
    
    const geom = new THREE.BoxGeometry(plateThickness, len, depth);
    const mat = new THREE.MeshStandardMaterial({ color: COLORS.RAIL, metalness: 0.5, roughness: 0.4 });

    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.copy(center);
    
    // Applique l'orientation de la pente
    mesh.setRotationFromQuaternion(quatSlope);
    
    // Ajoute une rotation latérale ("tilt") pour former un V
    const tiltAngle = Math.PI / 5; // ~36 degrés
    mesh.rotateY(isLeft ? tiltAngle : -tiltAngle); // Rotation locale Y (qui est maintenant l'axe du rail)
    
    // Ajustement fin de la position Z pour que la surface de contact soit correcte
    const deltaZ = (depth - plateHeight) / 2 * (isLeft ? -1 : 1);
    mesh.position.z += deltaZ; // Décalage latéral léger
    
    mesh.updateMatrixWorld(); // Force la mise à jour des matrices pour avoir la bonne position mondiale

    mesh.castShadow = true; 
    mesh.receiveShadow = true; 
    scene.add(mesh);
    
    // Ajout de la collision physique
    physics.addBox(mesh.position, mesh.quaternion, new THREE.Vector3(plateThickness/2, len/2, depth/2));
}

/**
 * Crée un rail de type "Tige" (Cylindre).
 * Alternative visuelle aux rails plaques.
 */
function createRailRod(scene, physics, p1, p2) {
    const vec = new THREE.Vector3().subVectors(p2, p1);
    const len = vec.length();
    const center = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
    
    // Orientation du cylindre le long du vecteur direction
    const quatSlope = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0), vec.clone().normalize());
    
    const radius = 0.15; // Rayon de la tige
    const geom = new THREE.CylinderGeometry(radius, radius, len, 16);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.8, roughness: 0.2 });
    
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.copy(center);
    mesh.setRotationFromQuaternion(quatSlope);
    
    mesh.castShadow = true; 
    mesh.receiveShadow = true;
    scene.add(mesh);
    
    // Collision (approximée par une boîte car le moteur physique simple ne gère que Sphère/Boîte)
    physics.addBox(center, quatSlope, new THREE.Vector3(radius, len/2, radius));
}

// =================================================================================================
// -------------------------------------------------------------------------------------------------
//                                      FONCTION PRINCIPALE
// -------------------------------------------------------------------------------------------------
// =================================================================================================

/**
 * Construit l'intégralité de la scène 3D : lumières, murs, rails d'alimentation et bacs de tri.
 * 
 * @param {THREE.Scene} scene - La scène Three.js active
 * @param {PhysicsEngine} physics - Le moteur physique pour enregistrer les obstacles
 * @param {string} railStyle - Style visuel des rails ('toit' ou autre)
 */
export function buildScene(scene, physics, railStyle = 'toit') {
    
    // 1. GESTION DE L'ÉCLAIRAGE
    // On vérifie s'il y a déjà des lumières pour ne pas les dupliquer au reset
    if (scene.children.filter(c => c.isLight).length === 0) {
        // Lumière ambiante douce pour déboucher les ombres
        scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        
        // Lumière directionnelle (Soleil) pour créer des ombres marquées
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.4);
        dirLight.position.set(-30, 80, 40); 
        dirLight.castShadow = true;
        // Augmentation de la résolution des ombres
        dirLight.shadow.mapSize.set(4096, 4096);
        scene.add(dirLight);
    }

    // Déstructuration des configs pour un accès facile
    const { startX, length, slope, railY, gapStart, gapEnd } = MACHINE_CONFIG;
    
    // Calcul des coordonnées de fin des rails
    const endX = startX + length;
    const endY = railY - (length * slope); // On descend selon la pente

    // 2. CRÉATION DU SOL
    // Grand sol gris sous toute la machine
    createWall(scene, physics, 20, -6.5, 0, 150, 0.5, 100, COLORS.FLOOR);

    // ---------------------------------------------------------
    // 3. SECTION ALIMENTATION (LE BAC DE DÉPART)
    // ---------------------------------------------------------
    const binLen = 10;          // Longueur du bac d'attente
    const feederLen = 12;       // Longueur de la section entonnoir
    const totalLen = binLen + feederLen;
    const zWide = 12.0;         // Largeur max (début)
    const zNarrow = 3.8;        // Largeur min (fin, avant les rails)
    
    // Pente plus forte pour l'alimentation afin que les boules tombent vite
    const feederSlope = 0.12; 
    const angle = Math.atan(feederSlope);
    // Rotation globale de toute la structure d'alimentation
    const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1), -angle);

    // Calcul du centre de la structure d'alimentation
    const centerX = startX - (totalLen / 2) * Math.cos(angle);
    const centerY = railY + (totalLen / 2) * Math.sin(angle);

    // Sol de l'alimentation
    const floorMesh = new THREE.Mesh(
        new THREE.BoxGeometry(totalLen, 0.4, zWide),
        new THREE.MeshStandardMaterial({ color: COLORS.MACHINE, metalness: 0.4, roughness: 0.4 })
    );
    // Positionnement ajusté un peu sous le niveau théorique
    floorMesh.position.set(centerX, centerY - 0.2, 0);
    floorMesh.quaternion.copy(quat);
    floorMesh.castShadow = true; floorMesh.receiveShadow = true;
    scene.add(floorMesh);
    // Ajout physique
    physics.addBox(floorMesh.position, quat, new THREE.Vector3(totalLen/2, 0.2, zWide/2));

    const wallH = 4.0; // Hauteur des murs latéraux

    // A. SECTION RECTANGULAIRE (GRAND BAC ARRIÈRE)
    // C'est là où les balles "spawnent"
    const binCenterX = startX - (feederLen + binLen/2) * Math.cos(angle);
    const binCenterY = railY + (feederLen + binLen/2) * Math.sin(angle);
    
    // Mur gauche
    createWallPhys(scene, physics, binLen, wallH, 0.4, binCenterX, binCenterY + wallH/2 - 0.2, -zWide/2, quat);
    // Mur droit
    createWallPhys(scene, physics, binLen, wallH, 0.4, binCenterX, binCenterY + wallH/2 - 0.2, zWide/2, quat);
    
    // Mur du fond (Butée arrière)
    const backX = startX - totalLen * Math.cos(angle);
    const backY = railY + totalLen * Math.sin(angle);
    createWallPhys(scene, physics, 0.4, wallH, zWide, backX, backY + wallH/2 - 0.2, 0, quat);

    // B. ENTONNOIR INCURVÉ (SECTION DE RÉTRÉCISSEMENT)
    // On utilise plusieurs segments rectilignes pour approximer une courbe fluide
    const segments = 12; 
    const segLen = feederLen / segments;

    for (let i = 0; i < segments; i++) {
        const xStartRel = i * segLen;
        const xEndRel = (i + 1) * segLen;
        
        // Fonction d'interpolation cosinus pour une courbe douce (ease-in-out)
        // Calcule la largeur Z à une position X donnée
        const getZAtX = (xRel) => {
            const t = xRel / feederLen; // Progression 0 à 1
            const curve = (1 - Math.cos(t * Math.PI)) / 2; 
            // Interpole entre Largeur Max et Largeur Min
            return (zWide / 2) - curve * ((zWide - zNarrow) / 2);
        };

        const zStart = getZAtX(xStartRel);
        const zEnd = getZAtX(xEndRel);
        
        // Position X du segment dans le monde
        const localX = (xStartRel + xEndRel) / 2;
        const worldX = startX - (feederLen - localX) * Math.cos(angle);
        const worldY = railY + (feederLen - localX) * Math.sin(angle);
        
        // Calcul de l'angle du mur latéral pour qu'il suive le rétrécissement
        const segAngleW = Math.atan((zStart - zEnd) / segLen);
        
        // Rotations combinées : Pente globale + Angle de rétrécissement
        const segQuatL = quat.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -segAngleW));
        const segQuatR = quat.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), segAngleW));

        // Création des murs de l'entonnoir (Gauche et Droite)
        createWallPhys(scene, physics, segLen + 0.15, wallH, 0.4, worldX, worldY + wallH/2 - 0.2, -(zStart + zEnd)/2, segQuatL);
        createWallPhys(scene, physics, segLen + 0.15, wallH, 0.4, worldX, worldY + wallH/2 - 0.2, (zStart + zEnd)/2, segQuatR);
    }

    // ---------------------------------------------------------
    // 4. CRÉATION DES RAILS DE TRI
    // ---------------------------------------------------------
    if (railStyle === 'toit') {
        const railOffset = 0.45;
        // Rail gauche (incliné vers le centre)
        createRailPlate(scene, physics, new THREE.Vector3(startX, railY, -gapStart/2 - railOffset), new THREE.Vector3(endX, endY, -gapEnd/2 - railOffset), true);
        // Rail droit (incliné vers le centre)
        createRailPlate(scene, physics, new THREE.Vector3(startX, railY, gapStart/2 + railOffset), new THREE.Vector3(endX, endY, gapEnd/2 + railOffset), false);
    } else {
        // Version tiges simples
        createRailRod(scene, physics, new THREE.Vector3(startX, railY, -gapStart/2 - 0.15), new THREE.Vector3(endX, endY, -gapEnd/2 - 0.15));
        createRailRod(scene, physics, new THREE.Vector3(startX, railY, gapStart/2 + 0.15), new THREE.Vector3(endX, endY, gapEnd/2 + 0.15));
    }

    // ---------------------------------------------------------
    // 5. CRÉATION DES BACS DE RÉCEPTION
    // ---------------------------------------------------------
    let prevDropX = startX;
    const OFFSET_BACS = 5.0; // Décalage pour ajuster visuellement la zone de chute
    
    // Paramètres des bacs
    const binH = 8;    // Hauteur importante pour éviter que les balles re-sortent
    const binY = -4;   // Position Y (sous les rails)
    const binD = 10;   // Profondeur des bacs (Largeur Z)

    // Pour chaque type de balle, on calcule où elle va tomber et on crée un bac
    BALLS.forEach((b, i) => {
        const diam = b.r * 2;
        
        // Calcul théorique de la position de chute :
        // "Où l'écartement des rails devient-il plus grand que le diamètre ?"
        // ratio = (DiamètreBalle - ÉcartDébut) / (ÉcartFin - ÉcartDébut)
        const ratio = (diam - gapStart) / (gapEnd - gapStart);
        let dropX = startX + (length * ratio) + OFFSET_BACS;
        
        // Sécurité pour la dernière catégorie : on étend le bac jusqu'à la fin
        if (i === BALLS.length - 1) dropX = endX + 8;
        
        // Le bac commence là où le précédent s'est arrêté
        const binStart = prevDropX + 0.5;
        const binEnd = dropX;
        const binW = binEnd - binStart; // Largeur du bac
        const binCenter = (binStart + binEnd) / 2;

        // On ne crée le bac que s'il a une largeur sensée (> 1 mètre)
        if (binW > 1) {
            // Vitres colorées translucides (devant et derrière) pour voir les balles tomber
            createWall(scene, physics, binCenter, binY, -binD/2, binW, binH, 0.2, b.color, true);
            createWall(scene, physics, binCenter, binY, binD/2, binW, binH, 0.2, b.color, true);
            
            // Mur séparateur de droite (fin du bac)
            createWall(scene, physics, binEnd, binY, 0, 0.3, binH, binD, COLORS.WALL_DIVIDER, false);
            
            // Mur séparateur de gauche (seulement pour le tout premier bac)
            if (i === 0) createWall(scene, physics, binStart, binY, 0, 0.3, binH, binD, COLORS.WALL_DIVIDER, false);
            
            // Fond du bac (sol sur lequel les balles atterrissent)
            createWall(scene, physics, binCenter, binY - binH/2, 0, binW, 0.2, binD, b.color, false);
        }
        
        // Mise à jour de la position de départ pour le prochain bac
        prevDropX = dropX;
    });
}
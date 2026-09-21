import * as THREE from 'three';
import { CAR_WIDTH, CAR_LENGTH } from './constants.js';

// Construction visuelle centralisée des voitures procédurales (joueur, et
// fallback pour le trafic quand aucun modèle GLB n'est disponible). Ce
// module ne connaît RIEN de la logique de jeu (voies, vitesse, collisions...) :
// il expose uniquement `buildCarMesh(type, options)`, qui renvoie un mesh
// Three.js prêt à être placé dans un `group` piloté ailleurs (car.js,
// traffic.js/vehicleModels.js).
//
// Les dimensions globales (CAR_WIDTH / CAR_LENGTH) restent celles utilisées
// pour les collisions : les proportions ci-dessous sont calées dessus, mais
// ne les redéfinissent jamais.

// --- Types de voitures disponibles pour le trafic (fallback) --------------
export const CAR_TYPES = ['sedan', 'suv', 'sport', 'compact'];

// --- Matériaux partagés par TOUT le jeu -----------------------------------
const glassMaterial = new THREE.MeshStandardMaterial({
    color: 0x1c2b3a,
    transparent: true,
    opacity: 0.55,
    metalness: 0.6,
    roughness: 0.12
});

const tireMaterial = new THREE.MeshStandardMaterial({
    color: 0x0d0d0d,
    roughness: 0.9,
    metalness: 0
});

const rimMaterial = new THREE.MeshStandardMaterial({
    color: 0xcfcfcf,
    roughness: 0.25,
    metalness: 0.85
});

const headlightMaterial = new THREE.MeshStandardMaterial({
    color: 0xfff8dd,
    emissive: 0xfff2b0,
    emissiveIntensity: 1.1,
    roughness: 0.4
});

const taillightMaterial = new THREE.MeshStandardMaterial({
    color: 0x550000,
    emissive: 0xd60000,
    emissiveIntensity: 1.0,
    roughness: 0.4
});

const mirrorMaterial = new THREE.MeshStandardMaterial({
    color: 0x161616,
    roughness: 0.5,
    metalness: 0.2
});

// --- Proportions par type --------------------------------------------------
const TYPE_PROPORTIONS = {
    sedan: {
        bodyWidth: 1.7, bodyHeight: 0.5, bodyLength: 3.3, bodyY: 0.42,
        hoodWidth: 1.6, hoodHeight: 0.34, hoodLength: 0.9, hoodY: 0.38, hoodZ: -1.55,
        trunkWidth: 1.65, trunkHeight: 0.34, trunkLength: 0.9, trunkY: 0.38, trunkZ: 1.55,
        cabinWidth: 1.3, cabinHeight: 0.55, cabinLength: 1.6, cabinY: 0.92, cabinZ: -0.15,
        wheelRadius: 0.38, wheelWidth: 0.32,
        wheelX: 0.95, wheelZFront: -1.3, wheelZRear: 1.3
    },
    suv: {
        bodyWidth: 1.72, bodyHeight: 0.62, bodyLength: 3.3, bodyY: 0.52,
        hoodWidth: 1.62, hoodHeight: 0.42, hoodLength: 0.7, hoodY: 0.5, hoodZ: -1.5,
        trunkWidth: 1.7, trunkHeight: 0.6, trunkLength: 0.75, trunkY: 0.55, trunkZ: 1.55,
        cabinWidth: 1.34, cabinHeight: 0.68, cabinLength: 1.9, cabinY: 1.08, cabinZ: -0.05,
        wheelRadius: 0.44, wheelWidth: 0.36,
        wheelX: 0.95, wheelZFront: -1.3, wheelZRear: 1.3
    },
    sport: {
        bodyWidth: 1.75, bodyHeight: 0.4, bodyLength: 3.5, bodyY: 0.32,
        hoodWidth: 1.65, hoodHeight: 0.28, hoodLength: 1.3, hoodY: 0.3, hoodZ: -1.65,
        trunkWidth: 1.68, trunkHeight: 0.3, trunkLength: 0.6, trunkY: 0.32, trunkZ: 1.7,
        cabinWidth: 1.25, cabinHeight: 0.38, cabinLength: 1.15, cabinY: 0.68, cabinZ: -0.35,
        wheelRadius: 0.4, wheelWidth: 0.34,
        wheelX: 0.95, wheelZFront: -1.3, wheelZRear: 1.3
    },
    compact: {
        bodyWidth: 1.62, bodyHeight: 0.48, bodyLength: 2.9, bodyY: 0.4,
        hoodWidth: 1.5, hoodHeight: 0.32, hoodLength: 0.55, hoodY: 0.36, hoodZ: -1.25,
        trunkWidth: 1.55, trunkHeight: 0.46, trunkLength: 0.55, trunkY: 0.4, trunkZ: 1.25,
        cabinWidth: 1.28, cabinHeight: 0.58, cabinLength: 1.55, cabinY: 0.94, cabinZ: 0.0,
        wheelRadius: 0.36, wheelWidth: 0.3,
        wheelX: 0.88, wheelZFront: -1.15, wheelZRear: 1.15
    }
};

// --- Cache de géométries, une seule fois par type -------------------------
const geometryCache = new Map();

function getOrCreateGeometrySet(type) {
    if (geometryCache.has(type)) return geometryCache.get(type);

    const p = TYPE_PROPORTIONS[type];

    const set = {
        body: new THREE.BoxGeometry(p.bodyWidth, p.bodyHeight, p.bodyLength),
        hood: new THREE.BoxGeometry(p.hoodWidth, p.hoodHeight, p.hoodLength),
        trunk: new THREE.BoxGeometry(p.trunkWidth, p.trunkHeight, p.trunkLength),
        roof: new THREE.BoxGeometry(p.cabinWidth, p.cabinHeight, p.cabinLength),
        windshield: new THREE.BoxGeometry(p.cabinWidth * 0.94, 0.06, p.cabinLength * 0.5),
        sideWindow: new THREE.BoxGeometry(0.04, p.cabinHeight * 0.72, p.cabinLength * 0.82),
        tire: new THREE.CylinderGeometry(p.wheelRadius, p.wheelRadius, p.wheelWidth, 16),
        rim: new THREE.CylinderGeometry(p.wheelRadius * 0.58, p.wheelRadius * 0.58, p.wheelWidth + 0.02, 10),
        headlight: new THREE.BoxGeometry(0.28, 0.14, 0.06),
        taillight: new THREE.BoxGeometry(0.3, 0.14, 0.05),
        mirror: new THREE.BoxGeometry(0.12, 0.12, 0.22)
    };

    geometryCache.set(type, set);
    return set;
}

/**
 * Crée une roue complète (pneu + jante) sous la forme d'un pivot : le pivot
 * est positionné à l'emplacement de la roue sur la voiture, et c'est LUI
 * qu'on fera tourner (rotation.x) pour simuler le roulement.
 */
function createWheelAssembly(geometrySet, x, y, z) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);

    const tire = new THREE.Mesh(geometrySet.tire, tireMaterial);
    tire.rotation.z = Math.PI / 2;
    pivot.add(tire);

    const rim = new THREE.Mesh(geometrySet.rim, rimMaterial);
    rim.rotation.z = Math.PI / 2;
    pivot.add(rim);

    return pivot;
}

/**
 * Construit un mesh complet de voiture (carrosserie, capot, coffre,
 * habitacle, vitres, phares, feux, rétroviseurs, 4 roues) pour le `type`
 * demandé, avec la couleur de carrosserie `options.bodyColor`.
 */
export function buildCarMesh(type, options = {}) {
    const p = TYPE_PROPORTIONS[type] ?? TYPE_PROPORTIONS.sedan;
    const geometrySet = getOrCreateGeometrySet(TYPE_PROPORTIONS[type] ? type : 'sedan');
    const bodyColor = options.bodyColor ?? 0xffffff;

    const group = new THREE.Group();

    const bodyMaterial = new THREE.MeshStandardMaterial({
        color: bodyColor,
        roughness: 0.35,
        metalness: 0.18
    });

    const body = new THREE.Mesh(geometrySet.body, bodyMaterial);
    body.position.y = p.bodyY;
    group.add(body);

    const hood = new THREE.Mesh(geometrySet.hood, bodyMaterial);
    hood.position.set(0, p.hoodY, p.hoodZ);
    group.add(hood);

    const trunk = new THREE.Mesh(geometrySet.trunk, bodyMaterial);
    trunk.position.set(0, p.trunkY, p.trunkZ);
    group.add(trunk);

    const roof = new THREE.Mesh(geometrySet.roof, bodyMaterial);
    roof.position.set(0, p.cabinY, p.cabinZ);
    group.add(roof);

    const windshield = new THREE.Mesh(geometrySet.windshield, glassMaterial);
    windshield.position.set(0, p.cabinY + p.cabinHeight * 0.3, p.cabinZ - p.cabinLength * 0.42);
    windshield.rotation.x = -0.5;
    group.add(windshield);

    const rearWindow = new THREE.Mesh(geometrySet.windshield, glassMaterial);
    rearWindow.position.set(0, p.cabinY + p.cabinHeight * 0.3, p.cabinZ + p.cabinLength * 0.42);
    rearWindow.rotation.x = 0.5;
    group.add(rearWindow);

    const sideWindowLeft = new THREE.Mesh(geometrySet.sideWindow, glassMaterial);
    sideWindowLeft.position.set(-p.cabinWidth / 2, p.cabinY + p.cabinHeight * 0.08, p.cabinZ);
    group.add(sideWindowLeft);

    const sideWindowRight = sideWindowLeft.clone();
    sideWindowRight.position.x = p.cabinWidth / 2;
    group.add(sideWindowRight);

    const headlightZ = p.hoodZ - p.hoodLength / 2 - 0.03;
    const lightX = p.bodyWidth * 0.32;

    const headlightLeft = new THREE.Mesh(geometrySet.headlight, headlightMaterial);
    headlightLeft.position.set(-lightX, p.hoodY, headlightZ);
    group.add(headlightLeft);

    const headlightRight = headlightLeft.clone();
    headlightRight.position.x = lightX;
    group.add(headlightRight);

    const taillightZ = p.trunkZ + p.trunkLength / 2 + 0.02;

    const taillightLeft = new THREE.Mesh(geometrySet.taillight, taillightMaterial);
    taillightLeft.position.set(-lightX, p.trunkY, taillightZ);
    group.add(taillightLeft);

    const taillightRight = taillightLeft.clone();
    taillightRight.position.x = lightX;
    group.add(taillightRight);

    const mirrorZ = p.cabinZ - p.cabinLength * 0.32;
    const mirrorX = p.cabinWidth / 2 + 0.1;
    const mirrorY = p.cabinY + p.cabinHeight * 0.05;

    const mirrorLeft = new THREE.Mesh(geometrySet.mirror, mirrorMaterial);
    mirrorLeft.position.set(-mirrorX, mirrorY, mirrorZ);
    group.add(mirrorLeft);

    const mirrorRight = mirrorLeft.clone();
    mirrorRight.position.x = mirrorX;
    group.add(mirrorRight);

    const wheelPositions = [
        [-p.wheelX, p.wheelRadius, p.wheelZFront],
        [p.wheelX, p.wheelRadius, p.wheelZFront],
        [-p.wheelX, p.wheelRadius, p.wheelZRear],
        [p.wheelX, p.wheelRadius, p.wheelZRear]
    ];

    const wheelPivots = wheelPositions.map(([x, y, z]) =>
        createWheelAssembly(geometrySet, x, y, z)
    );
    for (const pivot of wheelPivots) {
        group.add(pivot);
    }

    group.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    return {
        group,
        bodyMaterial,
        wheelPivots,
        wheelRadius: p.wheelRadius
    };
}

export { CAR_WIDTH, CAR_LENGTH };

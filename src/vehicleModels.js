import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CAR_WIDTH, CAR_LENGTH } from './constants.js';
import { buildCarMesh, CAR_TYPES } from './carModels.js';

// Ce module gère le chargement RÉEL des modèles .glb (GLTFLoader), leur
// mise en cache, leur normalisation (taille/position/orientation), et leur
// clonage pour chaque TrafficCar. C'est le SEUL endroit du projet où un
// chemin de .glb est écrit.
//
// Active ce flag pour voir dans la console exactement ce qui est chargé et
// assigné à chaque voiture — utile pour vérifier que les GLB sont
// réellement utilisés, et pour inspecter les matériaux/textures réels de
// chaque modèle (voir logDebugMaterials ci-dessous).
export const DEBUG_TRAFFIC_MODELS = false;

function debugLog(...args) {
    if (DEBUG_TRAFFIC_MODELS) {
        console.log('[Highway Rush]', ...args);
    }
}

/**
 * Log de diagnostic : parcourt le modèle fraîchement chargé et affiche,
 * pour chaque mesh, si un matériau et une texture couleur sont bien
 * présents. Purement informatif, aucun effet sur le rendu.
 *
 * On ne fait AUCUNE hypothèse ici sur la façon dont la texture est fournie
 * (embarquée dans le .glb, ou fichier externe comme
 * Textures/colormap.png) : on se contente de lire ce que GLTFLoader a
 * réellement résolu sur gltf.scene une fois le chargement terminé. Si
 * `hasColorMap` est true, `colorMapName` affiche l'URL résolue de l'image
 * (via `material.map.image.src`) — pratique pour vérifier d'un coup d'œil
 * que le chemin pointe bien vers .../models/cars/Textures/colormap.png.
 */
function logDebugMaterials(root, path) {
    if (!DEBUG_TRAFFIC_MODELS) return;

    root.traverse((child) => {
        if (!child.isMesh) return;

        const materials = Array.isArray(child.material) ? child.material : [child.material];

        for (const material of materials) {
            debugLog(`[${path}] mesh="${child.name}"`, {
                materialType: material?.type,
                hasColorMap: Boolean(material?.map),
                colorMapName: material?.map?.name || material?.map?.image?.src || null,
                colorMapColorSpace: material?.map?.colorSpace,
                baseColor: material?.color ? `#${material.color.getHexString()}` : null,
                roughness: material?.roughness,
                metalness: material?.metalness
            });
        }
    });
}

// --- Liste centralisée des modèles ----------------------------------------
// Fichiers réellement présents dans public/models/cars/ (confirmés par
// capture d'écran du dossier, à jour après l'ajout des nouveaux assets).
//
// Ajoutés dans cette passe (véhicules de route réellement nouveaux, non
// inventés) : van.glb, truck.glb, truck-flat.glb.
//
// sedan-sports.glb et suv-luxury.glb ont été déplacés côté joueur
// (public/models/player-cars/) : ils ne sont donc plus listés ici pour le
// trafic ennemi.
//
// Volontairement TOUJOURS exclus, et pourquoi :
// - debris-*.glb : pack d'effets de destruction/collision, pas des voitures.
// - kart-oobi/oodi/ooli/oopi/oozi.glb : silhouette de kart, pas une voiture
//   de route (déjà exclus avant cette passe).
// - tractor.glb, tractor-police.glb, tractor-shovel.glb : véhicules
//   agricoles, hors-thème pour un trafic d'autoroute. Si tu veux les
//   inclure quand même, ajoute-les simplement ici — rien d'autre à changer.
// - wheel-*.glb (wheel-dark, wheel-default, wheel-racing, wheel-truck,
//   wheel-tractor-*) : ce sont des roues/jantes isolées (pièces de
//   kit-bashing), pas des véhicules complets utilisables tels quels.
//
// C'est le SEUL endroit à changer pour ajouter/retirer un modèle de trafic.
export const TRAFFIC_MODEL_PATHS = [
    '/models/cars/ambulance.glb',
    '/models/cars/delivery.glb',
    '/models/cars/delivery-flat.glb',
    '/models/cars/firetruck.glb',
    '/models/cars/garbage-truck.glb',
    '/models/cars/hatchback-sports.glb',
    '/models/cars/police.glb',
    '/models/cars/sedan.glb',
    '/models/cars/suv.glb',
    '/models/cars/truck.glb',
    '/models/cars/truck-flat.glb',
    '/models/cars/van.glb'
];

// Si l'avant d'un modèle ne pointe pas vers -Z (convention du jeu : la
// route avance vers les Z négatifs), on corrige ici, PAR CHEMIN, plutôt que
// de toucher à la logique de déplacement (traffic.js / car.js restent
// inchangés).
//
// Cette collection d'assets (nommage cohérent, même date d'export) provient
// d'un même pack low-poly (Kenney "Car Kit"-like) : ils partagent donc la
// même convention d'orientation, avec l'avant du modèle qui pointe vers
// +Z dans le fichier source — soit l'opposé du sens de déplacement du jeu
// (-Z). D'où une correction de 180° (Math.PI) appliquée à tous les modèles
// par défaut.
//
// IMPORTANT : vérifie visuellement en jeu après cette correction (test 9 de
// la checklist). Si un modèle en particulier regarde encore dans le
// mauvais sens (ou à 90°), ajuste UNIQUEMENT sa valeur ici — par exemple
// Math.PI / 2 ou -Math.PI / 2 — sans toucher au reste.
const MODEL_YAW_CORRECTIONS = {
    '/models/cars/ambulance.glb': Math.PI,
    '/models/cars/delivery.glb': Math.PI,
    '/models/cars/delivery-flat.glb': Math.PI,
    '/models/cars/firetruck.glb': Math.PI,
    '/models/cars/garbage-truck.glb': Math.PI,
    '/models/cars/hatchback-sports.glb': Math.PI,
    '/models/cars/police.glb': Math.PI,
    '/models/cars/sedan.glb': Math.PI,
    '/models/cars/suv.glb': Math.PI,
    '/models/cars/truck.glb': Math.PI,
    '/models/cars/truck-flat.glb': Math.PI,
    '/models/cars/van.glb': Math.PI
};

// --- Cache réseau des ressources (textures) --------------------------
// Le kit utilise un unique atlas de couleurs partagé, référencé en URI
// RELATIVE depuis chaque .glb : public/models/cars/Textures/colormap.png.
// THREE.Cache est désactivé par défaut ; on l'active ici pour que ce même
// fichier (12 Ko) ne soit récupéré qu'UNE SEULE FOIS sur le réseau, même
// si plusieurs modèles le référencent chacun indépendamment au préchargement
// (toujours avant startGame(), jamais pendant une frame de jeu).
THREE.Cache.enabled = true;

// --- Diagnostic précis des ressources manquantes ----------------------
// Un LoadingManager dédié permet de savoir EXACTEMENT quelle ressource a
// échoué (modèle .glb OU texture externe qu'il référence, comme
// Textures/colormap.png) et quelle URL a été réellement tentée — au lieu
// d'un simple échec silencieux ou d'un message générique. GLTFLoader
// délègue le chargement des textures externes à ce même manager, donc un
// 404 sur colormap.png remonte ici aussi, pas seulement les échecs de .glb.
const loadingManager = new THREE.LoadingManager();
loadingManager.onError = (url) => {
    console.error(
        `[Highway Rush] Ressource introuvable (404 ou erreur réseau) : "${url}". ` +
        'Vérifie que ce chemin existe réellement dans public/ (la partie "/models/..." ' +
        'correspond à public/models/... sur le disque) et que la casse correspond exactement.'
    );
};

// --- Cache : un seul GLTFLoader, un seul chargement par modèle ------------
const loader = new GLTFLoader(loadingManager);

// Map<path, { normalizedRoot: THREE.Object3D | null, valid: boolean }>
const modelCache = new Map();

let preloadPromise = null;

/**
 * Normalise UNE SEULE FOIS (par modèle, pas par clone) : oriente, échelle
 * pour que la longueur (axe Z) corresponde à CAR_LENGTH, recentre, pose au
 * sol, active les ombres — sans jamais toucher à CAR_WIDTH/CAR_LENGTH
 * eux-mêmes (dimensions gameplay, inchangées).
 *
 * ORDRE IMPORTANT (c'était le bug) : la correction d'orientation (yaw) est
 * appliquée EN PREMIER, avant tout calcul de bounding box / recentrage.
 * `position` n'est pas affecté par la propre rotation de l'objet (la
 * matrice locale se compose comme translation · rotation · échelle), donc
 * calculer le centre AVANT de tourner puis appliquer position.x/z sur ce
 * centre "non tourné" produit un mauvais recentrage dès que la rotation
 * n'est pas nulle (le modèle finit décalé par rapport à sa hitbox
 * logique). En tournant d'abord, la bounding box calculée ensuite reflète
 * directement l'orientation finale du modèle, et le recentrage reste
 * correct quelle que soit la valeur de MODEL_YAW_CORRECTIONS.
 */
function normalizeModel(root, path) {
    root.rotation.y = MODEL_YAW_CORRECTIONS[path] ?? 0;
    root.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const safeLength = size.z > 0.0001 ? size.z : CAR_LENGTH;
    const scale = CAR_LENGTH / safeLength;

    root.scale.setScalar(scale);
    root.position.x = -center.x * scale;
    root.position.z = -center.z * scale;
    root.position.y = -box.min.y * scale; // pose exactement au sol

    root.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    const wrapper = new THREE.Group();
    wrapper.add(root);

    const finalWidth = size.x * scale;
    if (finalWidth > CAR_WIDTH * 2.2 || finalWidth < CAR_WIDTH * 0.4) {
        console.warn(
            `[Highway Rush] Le modèle "${path}" a une largeur visuelle (${finalWidth.toFixed(2)}) ` +
            `très différente de CAR_WIDTH (${CAR_WIDTH}) après normalisation.`
        );
    }

    return wrapper;
}

function loadSingleModel(path) {
    return new Promise((resolve) => {
        loader.load(
            path,
            (gltf) => {
                try {
                    // Diagnostic AVANT normalisation : montre exactement ce que
                    // GLTFLoader a résolu depuis le .glb (matériaux, textures —
                    // embarquées ou externes comme Textures/colormap.png),
                    // avant toute modification de rotation/échelle.
                    logDebugMaterials(gltf.scene, path);

                    const normalizedRoot = normalizeModel(gltf.scene, path);
                    modelCache.set(path, { normalizedRoot, valid: true });
                    debugLog(`Loaded: ${path}`);
                } catch (error) {
                    console.error(`[Highway Rush] Failed to load traffic model: ${path}`, error);
                    modelCache.set(path, { normalizedRoot: null, valid: false });
                }
                resolve();
            },
            undefined,
            (error) => {
                console.error(`[Highway Rush] Failed to load traffic model: ${path}`, error);
                modelCache.set(path, { normalizedRoot: null, valid: false });
                resolve(); // un échec ne doit jamais bloquer le préchargement global
            }
        );
    });
}

/**
 * À appeler UNE SEULE FOIS avant startGame() (voir main.js). Charge tous
 * les modèles de TRAFFIC_MODEL_PATHS en parallèle, une seule fois chacun.
 */
export function preloadVehicleModels() {
    if (!preloadPromise) {
        debugLog('Traffic models loading...');
        preloadPromise = Promise.all(TRAFFIC_MODEL_PATHS.map(loadSingleModel)).then(() => {
            const validCount = TRAFFIC_MODEL_PATHS.filter((path) => modelCache.get(path)?.valid).length;
            if (validCount === 0) {
                console.warn(
                    '[Highway Rush] Aucun modèle .glb valide trouvé dans public/models/cars/. ' +
                    "Le trafic utilisera le modèle procédural de secours jusqu'à ce que des fichiers .glb soient ajoutés."
                );
            } else {
                debugLog(`${validCount}/${TRAFFIC_MODEL_PATHS.length} modèles GLB chargés avec succès.`);
            }
        });
    }
    return preloadPromise;
}

function getValidModelPaths() {
    return TRAFFIC_MODEL_PATHS.filter((path) => modelCache.get(path)?.valid);
}

/**
 * Clone un modèle GLB déjà normalisé. Les matériaux sont clonés
 * individuellement (pas les géométries) : deux voitures partageant le même
 * modèle n'affectent jamais les mêmes objets Material. `Material.clone()`
 * copie bien la référence à `map` (et aux autres textures) — la texture
 * elle-même n'est PAS dupliquée (inutile, elle est en lecture seule côté
 * GPU), seuls les paramètres du matériau (couleur, opacité, etc.) le sont,
 * ce qui est exactement ce qu'il faut pour pouvoir teinter/altérer une
 * instance sans affecter les autres clones.
 */
function cloneVisual(path) {
    const entry = modelCache.get(path);
    if (!entry || !entry.valid) return null;

    const clone = entry.normalizedRoot.clone(true);
    clone.traverse((child) => {
        if (child.isMesh) {
            child.material = Array.isArray(child.material)
                ? child.material.map((mat) => mat.clone())
                : child.material.clone();
        }
    });

    return clone;
}

/**
 * Point d'entrée utilisé par traffic.js. Renvoie { object3d, modelPath,
 * isFallback, fallbackBodyMaterial? }.
 *
 * - S'il existe au moins un modèle GLB valide dans le cache : clone un
 *   modèle choisi aléatoirement parmi eux.
 * - Sinon : fallback vers l'ancien modèle procédural (carModels.js), pour
 *   que le jeu reste toujours jouable même sans .glb.
 */
export function createTrafficVehicleVisual() {
    const validPaths = getValidModelPaths();

    if (validPaths.length > 0) {
        const path = validPaths[Math.floor(Math.random() * validPaths.length)];
        const object3d = cloneVisual(path);
        if (object3d) {
            debugLog(`Traffic model assigned: ${path.split('/').pop()}`);
            return { object3d, modelPath: path, isFallback: false };
        }
    }

    const proceduralType = CAR_TYPES[Math.floor(Math.random() * CAR_TYPES.length)];
    const { group, bodyMaterial } = buildCarMesh(proceduralType, { bodyColor: 0xffffff });

    return {
        object3d: group,
        modelPath: null,
        isFallback: true,
        fallbackBodyMaterial: bodyMaterial
    };
}

/** Utile pour un affichage debug/console : état réel du cache à l'instant T. */
export function getLoadedModelSummary() {
    return TRAFFIC_MODEL_PATHS.map((path) => ({
        path,
        valid: Boolean(modelCache.get(path)?.valid)
    }));
}

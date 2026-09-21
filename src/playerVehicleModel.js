import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CAR_WIDTH, CAR_LENGTH } from './constants.js';

export const PLAYER_VEHICLES = [
    {
        id: 'forklift',
        name: 'Forklift',
        path: '/models/player-cars/forklilft.glb',
        maxSpeed: 58,
        acceleration: 24,
        brakePower: 68,
        naturalDeceleration: 17,
        laneChangeRate: 8.2,
        yawCorrection: Math.PI
    },
    {
        id: 'taxi',
        name: 'Taxi',
        path: '/models/player-cars/taxi.glb',
        maxSpeed: 65,
        acceleration: 32,
        brakePower: 58,
        naturalDeceleration: 14,
        laneChangeRate: 11,
        yawCorrection: Math.PI
    },
    {
        id: 'race',
        name: 'Race',
        path: '/models/player-cars/race.glb',
        maxSpeed: 75,
        acceleration: 39,
        brakePower: 54,
        naturalDeceleration: 13,
        laneChangeRate: 13.2,
        yawCorrection: Math.PI
    },
    {
        id: 'race-future',
        name: 'Race Future',
        path: '/models/player-cars/race-future.glb',
        maxSpeed: 85,
        acceleration: 35,
        brakePower: 50,
        naturalDeceleration: 12,
        laneChangeRate: 10.4,
        yawCorrection: Math.PI
    }
];

export const DEFAULT_PLAYER_VEHICLE_ID = PLAYER_VEHICLES[0].id;

THREE.Cache.enabled = true;

const loadingManager = new THREE.LoadingManager();
loadingManager.setURLModifier((url) => {
    if (url.endsWith('/models/player-cars/Textures/colormap.png') || url.endsWith('Textures/colormap.png')) {
        return '/models/cars/Textures/colormap.png';
    }
    return url;
});

const loader = new GLTFLoader(loadingManager);
const modelCache = new Map();

export function getPlayerVehicleConfig(vehicleId = DEFAULT_PLAYER_VEHICLE_ID) {
    return PLAYER_VEHICLES.find((vehicle) => vehicle.id === vehicleId) ?? PLAYER_VEHICLES[0];
}

function cloneMaterial(material) {
    if (!material) return material;
    return Array.isArray(material)
        ? material.map((entry) => entry.clone())
        : material.clone();
}

function clonePlayerVisual(vehicleId) {
    const entry = modelCache.get(vehicleId);
    if (!entry?.normalizedRoot) return null;

    const clone = entry.normalizedRoot.clone(true);
    clone.traverse((child) => {
        if (child.isMesh) {
            child.material = cloneMaterial(child.material);
        }
    });

    return clone;
}

function normalizePlayerVisual(root, vehicle) {
    root.rotation.y = vehicle.yawCorrection ?? 0;
    root.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const safeLength = size.z > 0.0001 ? size.z : CAR_LENGTH;
    const safeWidth = size.x > 0.0001 ? size.x : CAR_WIDTH;
    const scale = Math.min(CAR_LENGTH / safeLength, CAR_WIDTH / safeWidth);

    root.scale.setScalar(scale);
    root.position.x = -center.x * scale;
    root.position.z = -center.z * scale;
    root.position.y = -box.min.y * scale;

    root.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    const wrapper = new THREE.Group();
    wrapper.add(root);
    return wrapper;
}

export function loadPlayerVehicleVisual(vehicleId = DEFAULT_PLAYER_VEHICLE_ID) {
    const vehicle = getPlayerVehicleConfig(vehicleId);

    if (!modelCache.has(vehicle.id)) {
        const preloadPromise = new Promise((resolve, reject) => {
            loader.load(
                vehicle.path,
                (gltf) => {
                    const normalizedRoot = normalizePlayerVisual(gltf.scene, vehicle);
                    modelCache.set(vehicle.id, { normalizedRoot, preloadPromise });
                    resolve({
                        object3d: clonePlayerVisual(vehicle.id),
                        scale: normalizedRoot.children[0]?.scale.x ?? 1,
                        rotationY: vehicle.yawCorrection ?? 0,
                        animations: gltf.animations.map((clip) => clip.name)
                    });
                },
                undefined,
                reject
            );
        });

        modelCache.set(vehicle.id, { normalizedRoot: null, preloadPromise });
    }

    return modelCache.get(vehicle.id).preloadPromise.then((summary) => ({
        ...summary,
        object3d: clonePlayerVisual(vehicle.id)
    }));
}

import * as THREE from 'three';
import { LANE_COUNT, CAR_WIDTH, CAR_LENGTH, getLaneX } from './constants.js';
import { findNearMissTrafficCars, findCollidingTrafficCar } from './collisions.js';
import { ACTIVE_CARS_START, ACTIVE_CARS_END } from './difficulty.js';
import { createTrafficVehicleVisual, DEBUG_TRAFFIC_MODELS } from './vehicleModels.js';

// --- Debug ---------------------------------------------------------------
const DEBUG_TRAFFIC = false;

// Affiche un BoxHelper autour de la hitbox logique (CAR_WIDTH x CAR_LENGTH)
// de chaque voiture de trafic active, pour vérifier visuellement que le
// modèle (GLB ou fallback) correspond bien à la zone de collision réelle.
const DEBUG_TRAFFIC_HITBOXES = false;

// --- Réglages du trafic ---------------------------------------------------
const TRAFFIC_CAR_POOL_SIZE = ACTIVE_CARS_END + 4;

const TRAFFIC_SPEED_MIN = 23;
const TRAFFIC_SPEED_MAX = 42;

const SPAWN_AHEAD_MIN = 165;
const SPAWN_AHEAD_MAX = 400;

const DESPAWN_BEHIND_DISTANCE = 30;
const RUNAWAY_AHEAD_BUFFER = 120;

// --- Distance de sécurité (dérivée des dimensions réelles des voitures) --
const MIN_BUMPER_GAP = 1.5;
const MIN_CENTER_DISTANCE = CAR_LENGTH + MIN_BUMPER_GAP;  // 4 + 1.5 = 5.5

const SPAWN_MIN_GAP = CAR_LENGTH * 4.5; // 18
const SPAWN_ATTEMPTS = 8;
const SPAWN_FALLBACK_STAGGER_ATTEMPTS = 10;

// Évite les "murs" de trafic : si une voiture spawn au même niveau que
// des voitures déjà présentes sur les deux autres voies, le joueur peut se
// retrouver bloqué sans vraie décision possible. On garde le trafic dense,
// mais on refuse les alignements qui bouchent les 3 voies dans une même zone.
const ROADBLOCK_HALF_DEPTH = CAR_LENGTH * 6.8;

const SAFE_TIME_TO_CLOSE = 2.5;

const FOLLOW_SPEED_SMOOTHING = 3;

const TRAFFIC_BRAKE_LIGHT_SPEED_DROP = 0.9;
const TRAFFIC_BRAKE_LIGHT_CRUISE_DEFICIT = 5.5;
const TRAFFIC_BRAKE_LIGHT_SMOOTHING = 10;
const TRAFFIC_TAIL_LIGHT_BASE_OPACITY = 0.46;
const TRAFFIC_TAIL_LIGHT_BRAKE_OPACITY = 1;
const TRAFFIC_TAIL_GLOW_BASE_OPACITY = 0.26;
const TRAFFIC_TAIL_GLOW_BRAKE_OPACITY = 0.78;

// --- Résolution active des bouchons ---------------------------------------
// Les règles de spawn empêchent beaucoup de murs, mais des bouchons peuvent
// encore se former naturellement quand plusieurs files lentes se retrouvent
// alignées. Ces réglages donnent au gestionnaire de trafic le droit de casser
// un mur avant que le joueur n'arrive dessus.
const ROADBLOCK_LOOKAHEAD_MIN = 35;
const ROADBLOCK_LOOKAHEAD_MAX = 260;
const ROADBLOCK_CLUSTER_HALF_DEPTH = CAR_LENGTH * 5.8;
const ROADBLOCK_ESCAPE_SPEED_BOOST = 7;
const ROADBLOCK_ESCAPE_BOOST_DURATION = 1.8;
const ROADBLOCK_CORRIDOR_DISTANCE = 125;

// --- Changements de voie du trafic ----------------------------------------
// Ils restent volontairement rares et très filtrés : l'objectif est de rendre
// le trafic plus vivant, pas de créer des voitures qui coupent injustement
// devant le joueur.
const TRAFFIC_LANE_CHANGE_RATE = 2.2;
const TRAFFIC_LANE_CHANGE_ROLL_ANGLE = THREE.MathUtils.degToRad(4);
const TRAFFIC_LANE_CHANGE_MIN_Z_GAP = CAR_LENGTH * 7;
const TRAFFIC_LANE_CHANGE_PLAYER_CUT_IN_DISTANCE = 92;
const TRAFFIC_LANE_CHANGE_PLAYER_REAR_DISTANCE = 18;
const TRAFFIC_LANE_CHANGE_BASE_CHANCE_PER_SECOND = 0.035;
const TRAFFIC_LANE_CHANGE_MAX_CHANCE_PER_SECOND = 0.09;
const TRAFFIC_CONGESTION_LANE_CHANGE_CHANCE_PER_SECOND = 0.45;
const TRAFFIC_CONGESTION_FORWARD_GAP = CAR_LENGTH * 8;
const TRAFFIC_CONGESTION_SPEED_DEFICIT = 4;
const TRAFFIC_LANE_CHANGE_MIN_COOLDOWN = 3.2;
const TRAFFIC_LANE_CHANGE_MAX_COOLDOWN = 6.5;
const TRAFFIC_LANE_CHANGE_SIGNAL_DURATION = 0.7;
const TRAFFIC_LANE_CHANGE_BLINK_RATE = 8;

// Palette de couleurs utilisée UNIQUEMENT pour le fallback procédural : un
// modèle GLB garde ses propres textures/matériaux et n'est jamais recoloré
// automatiquement.
const FALLBACK_CAR_COLORS = [0x2266dd, 0xf2c200, 0x2aa84a, 0xff6a00, 0xf4f4f4, 0x8f3fd6, 0x444444, 0xb33030];

let nextTrafficCarId = 1;

function randomBetween(min, max) {
    return min + Math.random() * (max - min);
}

function randomLane() {
    return Math.floor(Math.random() * LANE_COUNT);
}

function randomFallbackColor() {
    return FALLBACK_CAR_COLORS[Math.floor(Math.random() * FALLBACK_CAR_COLORS.length)];
}

function randomLaneChangeCooldown() {
    return randomBetween(TRAFFIC_LANE_CHANGE_MIN_COOLDOWN, TRAFFIC_LANE_CHANGE_MAX_COOLDOWN);
}

function shuffleInPlace(items) {
    for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
}

/**
 * Vitesse "cible" de confort pour une voiture qui suit une autre. Calcul de
 * CONFORT uniquement : la garantie réelle "jamais de chevauchement" vient
 * de la contrainte de position appliquée dans advanceTraffic().
 */
function computeComfortSpeed(car, aheadCar, currentGap) {
    const effectiveCruiseSpeed = car.cruiseSpeed
        + (car.roadblockBoostTime > 0 ? ROADBLOCK_ESCAPE_SPEED_BOOST : 0);

    if (!aheadCar) return effectiveCruiseSpeed;

    const bumperGap = currentGap - CAR_LENGTH;
    const availableMargin = bumperGap - MIN_BUMPER_GAP;
    const maxClosingSpeed = availableMargin / SAFE_TIME_TO_CLOSE;
    const maxAllowedSpeed = aheadCar.currentSpeed + maxClosingSpeed;

    return Math.min(effectiveCruiseSpeed, Math.max(0, maxAllowedSpeed));
}

function getEffectiveCruiseSpeed(car) {
    return car.cruiseSpeed + (car.roadblockBoostTime > 0 ? ROADBLOCK_ESCAPE_SPEED_BOOST : 0);
}

function getLaneSpeedBias(lane) {
    if (LANE_COUNT <= 1) return 1;

    const laneProgress = lane / (LANE_COUNT - 1);
    return THREE.MathUtils.lerp(1.08, 0.92, laneProgress);
}

function getRandomCruiseSpeedForLane(lane, speedRange) {
    const baseSpeed = randomBetween(speedRange.min, speedRange.max);
    const biasedSpeed = baseSpeed * getLaneSpeedBias(lane);

    return THREE.MathUtils.clamp(
        biasedSpeed,
        speedRange.min * 0.9,
        speedRange.max * 1.08
    );
}

// Géométrie/matériau partagés pour le BoxHelper de debug hitbox.
const hitboxGeometry = new THREE.BoxGeometry(CAR_WIDTH, 1.2, CAR_LENGTH);
const hitboxEdges = new THREE.EdgesGeometry(hitboxGeometry);
const hitboxMaterial = new THREE.LineBasicMaterial({ color: 0x00ff88 });

// Petits feux arrière toujours lisibles, ajoutés au conteneur gameplay des
// voitures de trafic. Ils restent volontairement en MeshBasicMaterial :
// visibles au crépuscule/nuit sans multiplier les vraies lumières dynamiques.
const tailLightGeometry = new THREE.BoxGeometry(0.28, 0.14, 0.06);
const tailLightGlowGeometry = new THREE.CircleGeometry(0.26, 16);
const turnSignalGeometry = new THREE.BoxGeometry(0.18, 0.12, 0.065);
const turnSignalGlowGeometry = new THREE.CircleGeometry(0.22, 16);

function createHitboxHelper() {
    const helper = new THREE.LineSegments(hitboxEdges, hitboxMaterial);
    helper.position.y = 0.6;
    helper.visible = DEBUG_TRAFFIC_HITBOXES;
    return helper;
}

function createTailLights() {
    const group = new THREE.Group();
    const turnSignals = { left: [], right: [] };
    const brakeLights = [];
    const brakeGlows = [];
    const lightX = CAR_WIDTH * 0.32;
    const signalX = CAR_WIDTH * 0.48;
    const lightY = 0.58;
    const lightZ = CAR_LENGTH / 2 + 0.08;

    for (const side of [-1, 1]) {
        const tailLightMaterial = new THREE.MeshBasicMaterial({
            color: 0xff2233,
            transparent: true,
            opacity: TRAFFIC_TAIL_LIGHT_BASE_OPACITY,
            toneMapped: false
        });
        const light = new THREE.Mesh(tailLightGeometry, tailLightMaterial);
        light.position.set(side * lightX, lightY, lightZ);
        group.add(light);

        const tailLightGlowMaterial = new THREE.MeshBasicMaterial({
            color: 0xff2233,
            transparent: true,
            opacity: TRAFFIC_TAIL_GLOW_BASE_OPACITY,
            depthWrite: false,
            side: THREE.DoubleSide,
            toneMapped: false
        });
        const glow = new THREE.Mesh(tailLightGlowGeometry, tailLightGlowMaterial);
        glow.position.set(side * lightX, lightY, lightZ + 0.04);
        group.add(glow);
        brakeLights.push(tailLightMaterial);
        brakeGlows.push(tailLightGlowMaterial);

        const signalMaterial = new THREE.MeshBasicMaterial({
            color: 0xffb12a,
            transparent: true,
            opacity: 0,
            toneMapped: false
        });
        const signal = new THREE.Mesh(turnSignalGeometry, signalMaterial);
        signal.position.set(side * signalX, lightY + 0.02, lightZ + 0.02);
        group.add(signal);

        const signalGlowMaterial = new THREE.MeshBasicMaterial({
            color: 0xffb12a,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            side: THREE.DoubleSide,
            toneMapped: false
        });
        const signalGlow = new THREE.Mesh(turnSignalGlowGeometry, signalGlowMaterial);
        signalGlow.position.set(side * signalX, lightY + 0.02, lightZ + 0.06);
        group.add(signalGlow);

        const sideKey = side < 0 ? 'left' : 'right';
        turnSignals[sideKey].push(signalMaterial, signalGlowMaterial);
    }

    group.userData.turnSignals = turnSignals;
    group.userData.brakeLights = brakeLights;
    group.userData.brakeGlows = brakeGlows;
    return group;
}

function setBrakeLightIntensity(car, targetIntensity, delta) {
    car.brakeLightIntensity = THREE.MathUtils.damp(
        car.brakeLightIntensity,
        THREE.MathUtils.clamp(targetIntensity, 0, 1),
        TRAFFIC_BRAKE_LIGHT_SMOOTHING,
        delta
    );

    const lightOpacity = THREE.MathUtils.lerp(
        TRAFFIC_TAIL_LIGHT_BASE_OPACITY,
        TRAFFIC_TAIL_LIGHT_BRAKE_OPACITY,
        car.brakeLightIntensity
    );
    const glowOpacity = THREE.MathUtils.lerp(
        TRAFFIC_TAIL_GLOW_BASE_OPACITY,
        TRAFFIC_TAIL_GLOW_BRAKE_OPACITY,
        car.brakeLightIntensity
    );

    for (const material of car.brakeLightMaterials) {
        material.opacity = lightOpacity;
    }
    for (const material of car.brakeGlowMaterials) {
        material.opacity = glowOpacity;
    }
}

function setTurnSignalOpacity(turnSignals, direction, opacity) {
    for (const material of turnSignals.left) {
        material.opacity = direction < 0 ? opacity : 0;
    }
    for (const material of turnSignals.right) {
        material.opacity = direction > 0 ? opacity : 0;
    }
}

/**
 * Une voiture de trafic individuelle : mesh + état. Toute la logique de
 * spawn/déplacement/file vit dans TrafficManager (INCHANGÉE). La
 * construction visuelle (modèle GLB ou fallback procédural) est déléguée à
 * vehicleModels.js : ce fichier ne s'occupe que de LOGIQUE de trafic.
 */
class TrafficCar {
    constructor() {
        this.id = nextTrafficCarId++;

        // `this.group` reste le conteneur GAMEPLAY : c'est lui qui porte
        // position/rotation utilisées par tout le reste du jeu
        // (collisions.js, advanceTraffic...). Le contenu visuel (modèle
        // GLB ou fallback) est un simple enfant de ce group.
        this.group = new THREE.Group();

        this.visualModelPath = null;
        this.isFallbackVisual = false;
        this.fallbackBodyMaterial = null;
        this.currentVisual = null;

        this.assignVisual();

        this.hitboxHelper = createHitboxHelper();
        this.group.add(this.hitboxHelper);

        this.tailLights = createTailLights();
        this.turnSignals = this.tailLights.userData.turnSignals;
        this.brakeLightMaterials = this.tailLights.userData.brakeLights;
        this.brakeGlowMaterials = this.tailLights.userData.brakeGlows;
        this.group.add(this.tailLights);

        this.lane = 0;

        this.cruiseSpeed = 0;
        this.currentSpeed = 0;

        this.active = false;

        this.isAheadOfPlayer = true;

        this.nearMissTriggered = false;

        this.wasNearPlayer = false;

        this.isChangingLane = false;
        this.laneChangeDirection = 0;
        this.pendingLaneChangeTarget = null;
        this.laneChangeSignalTime = 0;
        this.laneChangeBlinkTime = 0;
        this.laneChangeCooldown = randomLaneChangeCooldown();

        this.roadblockBoostTime = 0;
        this.brakeLightIntensity = 0;
    }

    /**
     * Attache un nouveau visuel au group gameplay, en retirant proprement
     * l'ancien s'il existe. Appelé à la construction, et à chaque
     * spawn/recyclage pour varier le modèle (voir TrafficManager.spawnCar).
     * Ne charge JAMAIS de fichier : lit uniquement le cache déjà rempli par
     * vehicleModels.js.
     */
    assignVisual() {
        if (this.currentVisual) {
            this.group.remove(this.currentVisual);
        }

        const { object3d, modelPath, isFallback, fallbackBodyMaterial } = createTrafficVehicleVisual();

        this.currentVisual = object3d;
        this.visualModelPath = modelPath;
        this.isFallbackVisual = isFallback;
        this.fallbackBodyMaterial = fallbackBodyMaterial ?? null;

        if (DEBUG_TRAFFIC_MODELS && isFallback) {
            console.log('[Highway Rush] Traffic car using procedural fallback (no valid GLB available).');
        }

        this.group.add(object3d);
    }

    /**
     * Applique une couleur À CE VÉHICULE UNIQUEMENT. Sans effet si le
     * visuel actuel est un modèle GLB (qui garde ses propres textures).
     */
    setColor(color) {
        if (this.fallbackBodyMaterial) {
            this.fallbackBodyMaterial.color.setHex(color);
        }
    }
}

/**
 * Gère un pool fixe de voitures de trafic, organisées en files par voie.
 * Garantie centrale (INCHANGÉE) : sur une même voie, deux voitures actives
 * ne peuvent jamais finir une frame à moins de MIN_CENTER_DISTANCE l'une de
 * l'autre, quel que soit `delta`.
 */
export class TrafficManager {
    constructor(scene, playerCar, initialActiveCount = ACTIVE_CARS_START) {
        this.cars = [];

        for (let i = 0; i < TRAFFIC_CAR_POOL_SIZE; i++) {
            const car = new TrafficCar();
            scene.add(car.group);
            this.cars.push(car);
        }

        this.speedRange = { min: TRAFFIC_SPEED_MIN, max: TRAFFIC_SPEED_MAX };
        this.spawnAheadRange = { min: SPAWN_AHEAD_MIN, max: SPAWN_AHEAD_MAX };

        this.reset(playerCar, initialActiveCount);
    }

    reset(playerCar, activeCarCount = ACTIVE_CARS_START) {
        for (const car of this.cars) {
            this.parkCar(car);
        }
        this.setActiveCount(playerCar, activeCarCount);
    }

    parkCar(car) {
        car.active = false;
        car.lane = -1;
        car.cruiseSpeed = 0;
        car.currentSpeed = 0;
        car.isAheadOfPlayer = true;
        car.nearMissTriggered = false;
        car.wasNearPlayer = false;
        car.isChangingLane = false;
        car.laneChangeDirection = 0;
        car.pendingLaneChangeTarget = null;
        car.laneChangeSignalTime = 0;
        car.laneChangeBlinkTime = 0;
        car.laneChangeCooldown = randomLaneChangeCooldown();
        car.roadblockBoostTime = 0;
        car.brakeLightIntensity = 0;
        setBrakeLightIntensity(car, 0, 1);
        setTurnSignalOpacity(car.turnSignals, 0, 0);
        car.group.rotation.z = 0;
        car.group.visible = false;
        car.group.position.set(0, -50, -100000);
    }

    setActiveCount(playerCar, desiredCount) {
        const clampedDesired = THREE.MathUtils.clamp(Math.round(desiredCount), 1, this.cars.length);
        const activeCars = this.cars.filter((car) => car.active);

        if (activeCars.length < clampedDesired) {
            const inactiveCars = this.cars.filter((car) => !car.active);
            const numberToActivate = Math.min(clampedDesired - activeCars.length, inactiveCars.length);
            for (let i = 0; i < numberToActivate; i++) {
                this.spawnCar(inactiveCars[i], playerCar);
            }
        } else if (activeCars.length > clampedDesired) {
            const sortedFarthestFirst = [...activeCars].sort((a, b) => {
                const distanceA = Math.abs(a.group.position.z - playerCar.group.position.z);
                const distanceB = Math.abs(b.group.position.z - playerCar.group.position.z);
                return distanceB - distanceA;
            });
            const numberToPark = activeCars.length - clampedDesired;
            for (let i = 0; i < numberToPark; i++) {
                this.parkCar(sortedFarthestFirst[i]);
            }
        }
    }

    getLaneOccupants(lane, excludedCar = null) {
        return this.cars
            .filter((car) => car.lane === lane && car !== excludedCar)
            .sort((a, b) => a.group.position.z - b.group.position.z);
    }

    computeGuaranteedSpawnZ(lane, excludedCar, desiredZ) {
        const occupants = this.getLaneOccupants(lane, excludedCar);
        if (occupants.length === 0) {
            return desiredZ;
        }
        const mostAheadZ = occupants[0].group.position.z;
        return Math.min(desiredZ, mostAheadZ - SPAWN_MIN_GAP);
    }

    isLaneSpotFree(excludedCar, lane, targetZ) {
        return this.getLaneOccupants(lane, excludedCar)
            .every((other) => Math.abs(other.group.position.z - targetZ) >= SPAWN_MIN_GAP);
    }

    getNearestLaneDistance(lane, excludedCar, targetZ) {
        const distances = this.getLaneOccupants(lane, excludedCar)
            .map((other) => Math.abs(other.group.position.z - targetZ));

        return distances.length > 0 ? Math.min(...distances) : Infinity;
    }

    getLocalLaneDensity(lane, excludedCar, targetZ, radius = 90) {
        return this.getLaneOccupants(lane, excludedCar)
            .filter((other) => Math.abs(other.group.position.z - targetZ) <= radius)
            .length;
    }

    getSpawnCandidateScore(lane, excludedCar, targetZ) {
        if (!this.isLaneSpotFree(excludedCar, lane, targetZ)
            || this.wouldCreateRoadblock(excludedCar, lane, targetZ)) {
            return -Infinity;
        }

        const nearestDistance = this.getNearestLaneDistance(lane, excludedCar, targetZ);
        const localDensity = this.getLocalLaneDensity(lane, excludedCar, targetZ);

        return Math.min(nearestDistance, 120) - localDensity * 18 + Math.random() * 5;
    }

    wouldCreateRoadblock(excludedCar, lane, targetZ) {
        let blockedLaneCount = 0;

        for (let laneIndex = 0; laneIndex < LANE_COUNT; laneIndex++) {
            if (laneIndex === lane) {
                blockedLaneCount += 1;
                continue;
            }

            const hasNearbyCar = this.getLaneOccupants(laneIndex, excludedCar)
                .some((other) => Math.abs(other.group.position.z - targetZ) <= ROADBLOCK_HALF_DEPTH);

            if (hasNearbyCar) {
                blockedLaneCount += 1;
            }
        }

        return blockedLaneCount >= LANE_COUNT;
    }

    findSafeSpawnZ(lane, excludedCar, desiredZ) {
        let candidateZ = this.computeGuaranteedSpawnZ(lane, excludedCar, desiredZ);

        for (let attempt = 0; attempt < SPAWN_FALLBACK_STAGGER_ATTEMPTS; attempt++) {
            if (this.isLaneSpotFree(excludedCar, lane, candidateZ)
                && !this.wouldCreateRoadblock(excludedCar, lane, candidateZ)) {
                return candidateZ;
            }

            candidateZ -= SPAWN_MIN_GAP;
        }

        return candidateZ;
    }

    updateTrafficTimers(delta) {
        for (const car of this.cars) {
            if (!car.active) continue;
            car.roadblockBoostTime = Math.max(0, car.roadblockBoostTime - delta);
        }
    }

    getForwardGap(car) {
        const occupants = this.getLaneOccupants(car.lane, null);
        const index = occupants.indexOf(car);
        if (index <= 0) return Infinity;

        const aheadCar = occupants[index - 1];
        return Math.max(0, car.group.position.z - aheadCar.group.position.z - MIN_CENTER_DISTANCE);
    }

    findRoadblockCluster(anchorCar, playerCar) {
        const distanceAhead = playerCar.group.position.z - anchorCar.group.position.z;
        if (distanceAhead < ROADBLOCK_LOOKAHEAD_MIN || distanceAhead > ROADBLOCK_LOOKAHEAD_MAX) {
            return null;
        }

        const blockersByLane = new Map();
        for (const car of this.cars) {
            if (!car.active) continue;

            const candidateDistanceAhead = playerCar.group.position.z - car.group.position.z;
            if (candidateDistanceAhead < ROADBLOCK_LOOKAHEAD_MIN
                || candidateDistanceAhead > ROADBLOCK_LOOKAHEAD_MAX) {
                continue;
            }

            if (Math.abs(car.group.position.z - anchorCar.group.position.z) > ROADBLOCK_CLUSTER_HALF_DEPTH) {
                continue;
            }

            const current = blockersByLane.get(car.lane);
            if (!current || Math.abs(car.group.position.z - anchorCar.group.position.z)
                < Math.abs(current.group.position.z - anchorCar.group.position.z)) {
                blockersByLane.set(car.lane, car);
            }
        }

        if (blockersByLane.size < LANE_COUNT) return null;

        return {
            z: anchorCar.group.position.z,
            distanceAhead,
            blockers: [...blockersByLane.values()]
        };
    }

    chooseRoadblockEscapeCar(cluster, playerCar) {
        const blockers = cluster.blockers.map((car) => ({
            car,
            forwardGap: this.getForwardGap(car),
            isPlayerLane: car.lane === playerCar.currentLane
        }));

        blockers.sort((a, b) => {
            if (a.isPlayerLane !== b.isPlayerLane) return a.isPlayerLane ? -1 : 1;
            return b.forwardGap - a.forwardGap;
        });

        return blockers[0]?.car ?? null;
    }

    getNearestBlockingCarInLane(lane, playerCar, maxDistance) {
        let nearestCar = null;
        let nearestDistance = Infinity;

        for (const car of this.cars) {
            if (!car.active || car.lane !== lane) continue;

            const distanceAhead = playerCar.group.position.z - car.group.position.z;
            if (distanceAhead < ROADBLOCK_LOOKAHEAD_MIN || distanceAhead > maxDistance) continue;

            if (distanceAhead < nearestDistance) {
                nearestCar = car;
                nearestDistance = distanceAhead;
            }
        }

        return nearestCar;
    }

    resolvePlayerCorridor(playerCar) {
        const blockers = [];

        for (let lane = 0; lane < LANE_COUNT; lane++) {
            const blocker = this.getNearestBlockingCarInLane(lane, playerCar, ROADBLOCK_CORRIDOR_DISTANCE);
            if (!blocker) return;
            blockers.push(blocker);
        }

        const playerLaneBlocker = blockers.find((car) => car.lane === playerCar.currentLane);
        const bestGapBlocker = blockers
            .map((car) => ({ car, forwardGap: this.getForwardGap(car) }))
            .sort((a, b) => b.forwardGap - a.forwardGap)[0]?.car ?? blockers[0];

        const escapeCar = playerLaneBlocker ?? bestGapBlocker;
        escapeCar.roadblockBoostTime = ROADBLOCK_ESCAPE_BOOST_DURATION;
        bestGapBlocker.roadblockBoostTime = ROADBLOCK_ESCAPE_BOOST_DURATION;
    }

    resolveRoadblocks(playerCar) {
        const checkedClusters = new Set();

        this.resolvePlayerCorridor(playerCar);

        for (const anchorCar of this.cars) {
            if (!anchorCar.active) continue;

            const cluster = this.findRoadblockCluster(anchorCar, playerCar);
            if (!cluster) continue;

            const clusterKey = Math.round(cluster.z / ROADBLOCK_CLUSTER_HALF_DEPTH);
            if (checkedClusters.has(clusterKey)) continue;
            checkedClusters.add(clusterKey);

            const escapeCar = this.chooseRoadblockEscapeCar(cluster, playerCar);
            if (!escapeCar) continue;

            escapeCar.roadblockBoostTime = ROADBLOCK_ESCAPE_BOOST_DURATION;
        }
    }

    hasNearbyLaneOccupant(lane, excludedCar, targetZ, minDistance) {
        return this.getLaneOccupants(lane, excludedCar)
            .some((other) => Math.abs(other.group.position.z - targetZ) < minDistance);
    }

    isLaneChangeSafe(car, targetLane, playerCar) {
        if (targetLane < 0 || targetLane >= LANE_COUNT || targetLane === car.lane) {
            return false;
        }

        const carZ = car.group.position.z;
        if (this.hasNearbyLaneOccupant(targetLane, car, carZ, TRAFFIC_LANE_CHANGE_MIN_Z_GAP)) {
            return false;
        }

        if (this.wouldCreateRoadblock(car, targetLane, carZ)) {
            return false;
        }

        if (targetLane === playerCar.currentLane) {
            const relativeZ = carZ - playerCar.group.position.z;
            const isAheadOfPlayer = relativeZ < 0;
            const distance = Math.abs(relativeZ);
            const playerIsClosing = playerCar.speed > car.currentSpeed;

            if (isAheadOfPlayer && distance < TRAFFIC_LANE_CHANGE_PLAYER_CUT_IN_DISTANCE && playerIsClosing) {
                return false;
            }

            if (!isAheadOfPlayer && distance < TRAFFIC_LANE_CHANGE_PLAYER_REAR_DISTANCE) {
                return false;
            }
        }

        return true;
    }

    chooseLaneChangeTarget(car, playerCar) {
        const candidates = shuffleInPlace([car.lane - 1, car.lane + 1])
            .filter((lane) => lane >= 0 && lane < LANE_COUNT);

        return candidates.find((lane) => this.isLaneChangeSafe(car, lane, playerCar)) ?? null;
    }

    startLaneChangeSignal(car, targetLane) {
        car.pendingLaneChangeTarget = targetLane;
        car.laneChangeDirection = Math.sign(targetLane - car.lane);
        car.laneChangeSignalTime = TRAFFIC_LANE_CHANGE_SIGNAL_DURATION;
        car.laneChangeBlinkTime = 0;
    }

    cancelLaneChangeSignal(car) {
        car.pendingLaneChangeTarget = null;
        car.laneChangeSignalTime = 0;
        car.laneChangeDirection = 0;
        car.laneChangeCooldown = randomLaneChangeCooldown();
        setTurnSignalOpacity(car.turnSignals, 0, 0);
    }

    startLaneChange(car, targetLane) {
        car.laneChangeDirection = Math.sign(targetLane - car.lane);
        car.lane = targetLane;
        car.pendingLaneChangeTarget = null;
        car.laneChangeSignalTime = 0;
        car.isChangingLane = true;
        car.laneChangeCooldown = randomLaneChangeCooldown();
    }

    updateLaneChangeIntents(delta, playerCar, difficultyProgress = 0) {
        const chancePerSecond = THREE.MathUtils.lerp(
            TRAFFIC_LANE_CHANGE_BASE_CHANCE_PER_SECOND,
            TRAFFIC_LANE_CHANGE_MAX_CHANCE_PER_SECOND,
            difficultyProgress
        );

        for (const car of this.cars) {
            if (!car.active) continue;

            car.laneChangeCooldown = Math.max(0, car.laneChangeCooldown - delta);

            if (car.pendingLaneChangeTarget !== null) {
                car.laneChangeSignalTime = Math.max(0, car.laneChangeSignalTime - delta);
                if (car.laneChangeSignalTime <= 0) {
                    if (this.isLaneChangeSafe(car, car.pendingLaneChangeTarget, playerCar)) {
                        this.startLaneChange(car, car.pendingLaneChangeTarget);
                    } else {
                        this.cancelLaneChangeSignal(car);
                    }
                }
                continue;
            }

            if (car.isChangingLane || car.laneChangeCooldown > 0) continue;

            const forwardGap = this.getForwardGap(car);
            const speedDeficit = getEffectiveCruiseSpeed(car) - car.currentSpeed;
            const isCongested = forwardGap < TRAFFIC_CONGESTION_FORWARD_GAP
                && speedDeficit > TRAFFIC_CONGESTION_SPEED_DEFICIT;
            const laneChangeChance = isCongested
                ? TRAFFIC_CONGESTION_LANE_CHANGE_CHANCE_PER_SECOND
                : chancePerSecond;

            if (Math.random() > laneChangeChance * delta) continue;

            const targetLane = this.chooseLaneChangeTarget(car, playerCar);
            if (targetLane === null) continue;

            this.startLaneChangeSignal(car, targetLane);
        }
    }

    updateLaneChangeSignals(delta) {
        for (const car of this.cars) {
            if (!car.active) continue;

            car.laneChangeBlinkTime += delta;
            const shouldSignal = car.pendingLaneChangeTarget !== null || car.isChangingLane;
            if (!shouldSignal) {
                setTurnSignalOpacity(car.turnSignals, 0, 0);
                continue;
            }

            const blinkAmount = Math.sin(car.laneChangeBlinkTime * TRAFFIC_LANE_CHANGE_BLINK_RATE) > 0 ? 1 : 0.18;
            setTurnSignalOpacity(car.turnSignals, car.laneChangeDirection, blinkAmount);
        }
    }

    updateLaneChangeMotion(delta) {
        for (const car of this.cars) {
            if (!car.active) continue;

            const targetX = getLaneX(car.lane);
            car.group.position.x = THREE.MathUtils.damp(
                car.group.position.x,
                targetX,
                TRAFFIC_LANE_CHANGE_RATE,
                delta
            );

            const distanceToLane = Math.abs(car.group.position.x - targetX);
            if (distanceToLane < 0.04) {
                car.group.position.x = targetX;
                car.isChangingLane = false;
                car.laneChangeDirection = 0;
                setTurnSignalOpacity(car.turnSignals, 0, 0);
            }

            const targetRoll = car.isChangingLane
                ? -car.laneChangeDirection * TRAFFIC_LANE_CHANGE_ROLL_ANGLE
                : 0;
            car.group.rotation.z = THREE.MathUtils.damp(car.group.rotation.z, targetRoll, 5, delta);
        }
    }

    /**
     * Place (ou replace) une voiture devant le joueur, sur une voie, à une
     * position qui ne chevauche jamais une voiture déjà présente. Logique
     * de spawn INCHANGÉE. Nouveau (visuel uniquement) : à chaque
     * spawn/recyclage, un nouveau modèle GLB est retiré au hasard parmi
     * ceux disponibles dans le cache (aucun rechargement de fichier).
     */
    spawnCar(car, playerCar, forcedAheadDistance = null) {
        let chosenLane = null;
        let chosenZ = null;
        let bestScore = -Infinity;

        for (let attempt = 0; attempt < SPAWN_ATTEMPTS; attempt++) {
            const aheadDistance = forcedAheadDistance ?? randomBetween(this.spawnAheadRange.min, this.spawnAheadRange.max);
            const targetZ = playerCar.group.position.z - aheadDistance;
            const candidateLanes = shuffleInPlace([...Array(LANE_COUNT).keys()]);

            for (const lane of candidateLanes) {
                const score = this.getSpawnCandidateScore(lane, car, targetZ);
                if (score > bestScore) {
                    bestScore = score;
                    chosenLane = lane;
                    chosenZ = targetZ;
                }
            }
        }

        if (chosenLane === null) {
            const desiredAheadDistance = forcedAheadDistance ?? randomBetween(this.spawnAheadRange.min, this.spawnAheadRange.max);
            const desiredZ = playerCar.group.position.z - desiredAheadDistance;
            const fallbackCandidates = [...Array(LANE_COUNT).keys()]
                .map((lane) => {
                    const safeZ = this.findSafeSpawnZ(lane, car, desiredZ);
                    return {
                        lane,
                        z: safeZ,
                        score: this.getSpawnCandidateScore(lane, car, safeZ)
                    };
                })
                .sort((a, b) => b.score - a.score);

            const bestFallback = fallbackCandidates[0];
            chosenLane = bestFallback.lane;
            chosenZ = bestFallback.z;
        }

        car.lane = chosenLane;
        car.cruiseSpeed = getRandomCruiseSpeedForLane(chosenLane, this.speedRange);
        car.currentSpeed = car.cruiseSpeed;

        car.assignVisual(); // nouveau modèle GLB tiré au hasard dans le cache (aucun rechargement)
        car.setColor(randomFallbackColor()); // sans effet si le visuel actuel est un modèle GLB

        car.group.position.set(getLaneX(chosenLane), 0, chosenZ);
        car.group.visible = true;
        car.active = true;
        car.isAheadOfPlayer = true;
        car.nearMissTriggered = false;
        car.wasNearPlayer = false;
        car.isChangingLane = false;
        car.laneChangeDirection = 0;
        car.pendingLaneChangeTarget = null;
        car.laneChangeSignalTime = 0;
        car.laneChangeBlinkTime = 0;
        car.laneChangeCooldown = randomLaneChangeCooldown();
        car.roadblockBoostTime = 0;
        car.brakeLightIntensity = 0;
        setBrakeLightIntensity(car, 0, 1);
        setTurnSignalOpacity(car.turnSignals, 0, 0);
        car.group.rotation.z = 0;
    }

    /**
     * Fait avancer tout le trafic d'une frame, voie par voie, avec une
     * garantie de position absolue. INCHANGÉ.
     */
    advanceTraffic(delta) {
        const laneGroups = new Map();
        for (const car of this.cars) {
            if (!car.active) continue;
            if (!laneGroups.has(car.lane)) laneGroups.set(car.lane, []);
            laneGroups.get(car.lane).push(car);
        }

        for (const carsInLane of laneGroups.values()) {
            carsInLane.sort((a, b) => a.group.position.z - b.group.position.z);

            let aheadCar = null;

            for (const car of carsInLane) {
                const previousZ = car.group.position.z;
                const previousSpeed = car.currentSpeed;
                const currentGap = aheadCar ? previousZ - aheadCar.group.position.z : Infinity;

                const targetSpeed = computeComfortSpeed(car, aheadCar, currentGap);
                const smoothedSpeed = THREE.MathUtils.damp(car.currentSpeed, targetSpeed, FOLLOW_SPEED_SMOOTHING, delta);

                let nextZ = previousZ - smoothedSpeed * delta;

                if (aheadCar) {
                    const minZ = aheadCar.group.position.z + MIN_CENTER_DISTANCE;
                    if (nextZ < minZ) {
                        nextZ = minZ;
                    }
                }

                car.group.position.z = nextZ;
                car.currentSpeed = delta > 0 ? (previousZ - nextZ) / delta : 0;
                const effectiveCruiseSpeed = getEffectiveCruiseSpeed(car);
                const decelerationAmount = Math.max(0, previousSpeed - car.currentSpeed) / TRAFFIC_BRAKE_LIGHT_SPEED_DROP;
                const cruiseDeficitAmount = Math.max(0, effectiveCruiseSpeed - targetSpeed) / TRAFFIC_BRAKE_LIGHT_CRUISE_DEFICIT;
                setBrakeLightIntensity(car, Math.max(decelerationAmount, cruiseDeficitAmount), delta);

                aheadCar = car;
            }
        }

        if (DEBUG_TRAFFIC) {
            this.verifyMinimumSpacing();
        }
    }

    verifyMinimumSpacing() {
        for (let lane = 0; lane < LANE_COUNT; lane++) {
            const occupants = this.getLaneOccupants(lane);

            for (let i = 1; i < occupants.length; i++) {
                const front = occupants[i - 1];
                const back = occupants[i];
                const gap = back.group.position.z - front.group.position.z;

                if (gap < MIN_CENTER_DISTANCE - 1e-6) {
                    console.error(
                        `[TRAFFIC DEBUG] Chevauchement détecté sur voie ${lane} : ` +
                        `voiture #${back.id} (Z=${back.group.position.z.toFixed(3)}) ` +
                        `est trop proche de voiture #${front.id} (Z=${front.group.position.z.toFixed(3)}). ` +
                        `Écart réel = ${gap.toFixed(3)}, écart minimum requis = ${MIN_CENTER_DISTANCE}.`
                    );
                }
            }
        }
    }

    getClosestHazardAhead(playerCar, maxDistance, minClosingSpeed) {
        let closestCar = null;
        let closestDistance = Infinity;
        let closestClosingSpeed = 0;

        for (const car of this.cars) {
            if (!car.active || car.lane !== playerCar.currentLane) continue;

            const relativeZ = car.group.position.z - playerCar.group.position.z;
            if (relativeZ >= 0) continue;

            const distance = -relativeZ;
            const closingSpeed = playerCar.speed - car.currentSpeed;
            if (distance > maxDistance || closingSpeed < minClosingSpeed) continue;

            if (distance < closestDistance) {
                closestCar = car;
                closestDistance = distance;
                closestClosingSpeed = closingSpeed;
            }
        }

        if (!closestCar) return null;

        const distanceIntensity = 1 - closestDistance / maxDistance;
        const closingIntensity = THREE.MathUtils.clamp((closestClosingSpeed - minClosingSpeed) / 24, 0, 1);

        return {
            car: closestCar,
            distance: closestDistance,
            intensity: THREE.MathUtils.clamp(distanceIntensity * 0.7 + closingIntensity * 0.3, 0, 1)
        };
    }

    update(delta, playerCar, difficultySnapshot = null) {
        if (difficultySnapshot) {
            this.speedRange = { min: difficultySnapshot.trafficSpeedMin, max: difficultySnapshot.trafficSpeedMax };
            this.spawnAheadRange = { min: difficultySnapshot.spawnAheadMin, max: difficultySnapshot.spawnAheadMax };
            this.setActiveCount(playerCar, difficultySnapshot.activeCarCount);
        }

        let overtakeCount = 0;
        const validatedNearMissCars = [];

        this.updateTrafficTimers(delta);
        this.resolveRoadblocks(playerCar);
        this.updateLaneChangeIntents(delta, playerCar, difficultySnapshot?.progress ?? 0);
        this.advanceTraffic(delta);
        this.resolveRoadblocks(playerCar);
        this.updateLaneChangeMotion(delta);
        this.updateLaneChangeSignals(delta);

        const nearMissCarsThisFrame = new Set(findNearMissTrafficCars(playerCar, this));
        const collidingCar = findCollidingTrafficCar(playerCar, this);

        for (const car of this.cars) {
            if (!car.active) continue;

            if (car.hitboxHelper.visible !== DEBUG_TRAFFIC_HITBOXES) {
                car.hitboxHelper.visible = DEBUG_TRAFFIC_HITBOXES;
            }

            const relativeZ = car.group.position.z - playerCar.group.position.z;

            if (car.isAheadOfPlayer && !car.nearMissTriggered && car !== collidingCar
                && nearMissCarsThisFrame.has(car)) {
                car.wasNearPlayer = true;
            }

            if (car.isAheadOfPlayer && relativeZ > 0) {
                car.isAheadOfPlayer = false;
                overtakeCount += 1;

                if (car.wasNearPlayer && !car.nearMissTriggered) {
                    car.nearMissTriggered = true;
                    validatedNearMissCars.push(car);
                }
            }

            const isTooFarBehind = relativeZ > DESPAWN_BEHIND_DISTANCE;
            const isTooFarAhead = relativeZ < -(this.spawnAheadRange.max + RUNAWAY_AHEAD_BUFFER);

            if (isTooFarBehind || isTooFarAhead) {
                this.spawnCar(car, playerCar);
            }
        }

        return { overtakeCount, nearMissCars: validatedNearMissCars };
    }
}

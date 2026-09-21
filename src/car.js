import * as THREE from 'three';
import { LANE_COUNT, ROAD_WIDTH, CAR_WIDTH, CAR_LENGTH, getLaneX } from './constants.js';
import { buildCarMesh } from './carModels.js';
import { DEFAULT_PLAYER_VEHICLE_ID, getPlayerVehicleConfig, loadPlayerVehicleVisual } from './playerVehicleModel.js';

// --- Accélération -------------------------------------------------------
const ACCELERATION_BASE = 32;
const ACCELERATION_MIN_FACTOR = 0.35;

const BRAKE_POWER = 55;

const NATURAL_DECELERATION = 14;

const LANE_CHANGE_RATE = 11;   // vitesse du glissement latéral entre les voies (plus haut = plus réactif)

const BRAKE_PITCH_MAX_ANGLE = THREE.MathUtils.degToRad(4);
const BRAKE_PITCH_SMOOTHING = 10;

const MAX_TILT_ANGLE = THREE.MathUtils.degToRad(14); // inclinaison max en virage
const TILT_RESPONSIVENESS = 0.18;                    // sensibilité de l'inclinaison à la vitesse latérale
const TILT_SMOOTHING = 8;                            // vitesse à laquelle la carrosserie revient à plat

const MAX_CAR_X = ROAD_WIDTH / 2 - CAR_WIDTH / 2;

// --- Apparence de la voiture du joueur ------------------------------------
const PLAYER_CAR_TYPE = 'sedan';
const PLAYER_BODY_COLOR = 0xd6002a;

const PLAYER_REAR_LIGHT_X = CAR_WIDTH * 0.33;
const PLAYER_REAR_LIGHT_Y = 0.66;
const PLAYER_REAR_LIGHT_Z = CAR_LENGTH / 2 + 0.11;
const PLAYER_REAR_LIGHT_BASE_OPACITY = 0.46;
const PLAYER_REAR_LIGHT_BRAKE_OPACITY = 1;
const PLAYER_REAR_GLOW_BASE_OPACITY = 0.12;
const PLAYER_REAR_GLOW_BRAKE_OPACITY = 0.62;

const playerRearLightGeometry = new THREE.BoxGeometry(0.28, 0.13, 0.06);
const playerRearGlowGeometry = new THREE.CircleGeometry(0.28, 18);

export class Car {
    constructor(vehicleId = DEFAULT_PLAYER_VEHICLE_ID) {
        this.fallbackMesh = this.createFallbackMesh();
        this.group = new THREE.Group();
        this.currentVisual = this.fallbackMesh.group;
        this.group.add(this.currentVisual);

        this.wheelPivots = this.fallbackMesh.wheelPivots;
        this.wheelRadius = this.fallbackMesh.wheelRadius;

        this.speed = 0;
        this.currentLane = 1; // on démarre sur la voie du milieu (0, 1 ou 2)

        this.justChangedLane = false;
        this.laneChangeDirection = 0;
        this.maxSpeedBonus = 0;

        this.group.position.x = getLaneX(this.currentLane);
        this.group.position.z = 0;

        this.rearLightMaterials = [];
        this.rearGlowMaterials = [];
        this.brakeLightIntensity = 0;
        this.rearLights = this.createRearLights();
        this.group.add(this.rearLights);

        this.visualLoadToken = 0;
        this.setVehicle(vehicleId);
    }

    createFallbackMesh() {
        return buildCarMesh(PLAYER_CAR_TYPE, { bodyColor: PLAYER_BODY_COLOR });
    }

    createRearLights() {
        const group = new THREE.Group();

        for (const side of [-1, 1]) {
            const lightMaterial = new THREE.MeshBasicMaterial({
                color: 0xff2020,
                transparent: true,
                opacity: PLAYER_REAR_LIGHT_BASE_OPACITY,
                toneMapped: false
            });
            const light = new THREE.Mesh(playerRearLightGeometry, lightMaterial);
            light.position.set(side * PLAYER_REAR_LIGHT_X, PLAYER_REAR_LIGHT_Y, PLAYER_REAR_LIGHT_Z);
            group.add(light);

            const glowMaterial = new THREE.MeshBasicMaterial({
                color: 0xff1d1d,
                transparent: true,
                opacity: PLAYER_REAR_GLOW_BASE_OPACITY,
                depthWrite: false,
                side: THREE.DoubleSide,
                toneMapped: false
            });
            const glow = new THREE.Mesh(playerRearGlowGeometry, glowMaterial);
            glow.position.set(side * PLAYER_REAR_LIGHT_X, PLAYER_REAR_LIGHT_Y, PLAYER_REAR_LIGHT_Z + 0.045);
            group.add(glow);

            this.rearLightMaterials.push(lightMaterial);
            this.rearGlowMaterials.push(glowMaterial);
        }

        return group;
    }

    updateRearLights(isBraking, delta) {
        const targetIntensity = isBraking ? 1 : 0;
        this.brakeLightIntensity = THREE.MathUtils.damp(
            this.brakeLightIntensity,
            targetIntensity,
            16,
            delta
        );

        const lightOpacity = THREE.MathUtils.lerp(
            PLAYER_REAR_LIGHT_BASE_OPACITY,
            PLAYER_REAR_LIGHT_BRAKE_OPACITY,
            this.brakeLightIntensity
        );
        const glowOpacity = THREE.MathUtils.lerp(
            PLAYER_REAR_GLOW_BASE_OPACITY,
            PLAYER_REAR_GLOW_BRAKE_OPACITY,
            this.brakeLightIntensity
        );

        for (const material of this.rearLightMaterials) {
            material.opacity = lightOpacity;
        }
        for (const material of this.rearGlowMaterials) {
            material.opacity = glowOpacity;
        }
    }

    setFallbackVisual() {
        if (this.currentVisual !== this.fallbackMesh.group) {
            this.group.remove(this.currentVisual);
            this.currentVisual = this.fallbackMesh.group;
            this.group.add(this.currentVisual);
        }
        this.wheelPivots = this.fallbackMesh.wheelPivots;
        this.wheelRadius = this.fallbackMesh.wheelRadius;
    }

    setVehicle(vehicleId) {
        const nextVehicle = getPlayerVehicleConfig(vehicleId);
        if (this.vehicle?.id === nextVehicle.id && this.currentVisual !== this.fallbackMesh.group) {
            return;
        }

        this.vehicle = nextVehicle;
        this.baseMaxSpeed = this.vehicle.maxSpeed;
        this.setFallbackVisual();
        this.loadPlayerVisual(this.vehicle.id);
    }

    async loadPlayerVisual(vehicleId) {
        const loadToken = ++this.visualLoadToken;

        try {
            const { object3d } = await loadPlayerVehicleVisual(vehicleId);
            if (!object3d || loadToken !== this.visualLoadToken) return;

            this.group.remove(this.currentVisual);
            this.currentVisual = object3d;
            this.group.add(this.currentVisual);

            // Le GLB contient des roues et animations, mais elles restent
            // volontairement statiques pour cette intégration visuelle.
            this.wheelPivots = [];
        } catch (error) {
            console.warn('[Highway Rush] Player GLB failed to load; keeping procedural fallback.', error);
        }
    }

    getSpeedRatio() {
        return this.speed / (this.baseMaxSpeed + this.maxSpeedBonus);
    }

    reset() {
        this.speed = 0;
        this.currentLane = 1;
        this.justChangedLane = false;
        this.laneChangeDirection = 0;
        this.maxSpeedBonus = 0;
        this.brakeLightIntensity = 0;
        this.updateRearLights(false, 1);
        this.group.position.set(getLaneX(this.currentLane), 0, 0);
        this.group.rotation.set(0, 0, 0);
    }

    setMaxSpeedBonus(bonus) {
        this.maxSpeedBonus = bonus;
    }

    update(delta, controls) {
        // --- Vitesse ---
        const effectiveMaxSpeed = this.baseMaxSpeed + this.maxSpeedBonus;
        const acceleration = this.vehicle.acceleration ?? ACCELERATION_BASE;
        const brakePower = this.vehicle.brakePower ?? BRAKE_POWER;
        const naturalDeceleration = this.vehicle.naturalDeceleration ?? NATURAL_DECELERATION;
        const laneChangeRate = this.vehicle.laneChangeRate ?? LANE_CHANGE_RATE;

        if (controls.isBraking()) {
            this.speed -= brakePower * delta;
        } else if (controls.isAccelerating()) {
            const speedRatio = this.speed / effectiveMaxSpeed;
            const accelCurveFactor = 1 - speedRatio * (1 - ACCELERATION_MIN_FACTOR);
            this.speed += acceleration * accelCurveFactor * delta;
        } else {
            this.speed -= naturalDeceleration * delta;
        }
        this.speed = THREE.MathUtils.clamp(this.speed, 0, effectiveMaxSpeed);
        this.updateRearLights(controls.isBraking() && this.speed > 0.5, delta);

        // --- Changement de voie ---
        const laneShift = controls.consumeLaneShift();
        this.justChangedLane = laneShift !== 0;
        this.laneChangeDirection = laneShift;
        if (laneShift !== 0) {
            this.currentLane = THREE.MathUtils.clamp(
                this.currentLane + laneShift,
                0,
                LANE_COUNT - 1
            );
        }

        const targetX = getLaneX(this.currentLane);
        const previousX = this.group.position.x;
        this.group.position.x = THREE.MathUtils.damp(
            this.group.position.x,
            targetX,
            laneChangeRate,
            delta
        );

        this.group.position.x = THREE.MathUtils.clamp(
            this.group.position.x,
            -MAX_CAR_X,
            MAX_CAR_X
        );

        // --- Inclinaison en virage ---
        const lateralVelocity = delta > 0
            ? (this.group.position.x - previousX) / delta
            : 0;
        const targetTilt = THREE.MathUtils.clamp(
            -lateralVelocity * TILT_RESPONSIVENESS,
            -MAX_TILT_ANGLE,
            MAX_TILT_ANGLE
        );
        this.group.rotation.z = THREE.MathUtils.damp(
            this.group.rotation.z,
            targetTilt,
            TILT_SMOOTHING,
            delta
        );

        // --- Piqué du nez au freinage ---
        const targetBrakePitch = controls.isBraking() ? BRAKE_PITCH_MAX_ANGLE : 0;
        this.group.rotation.x = THREE.MathUtils.damp(
            this.group.rotation.x,
            targetBrakePitch,
            BRAKE_PITCH_SMOOTHING,
            delta
        );

        // --- Avance sur la route ---
        this.group.position.z -= this.speed * delta;

        // --- Rotation visuelle des roues -----------------------------
        const wheelSpin = (this.speed * delta) / this.wheelRadius;
        for (const pivot of this.wheelPivots) {
            pivot.rotation.x -= wheelSpin;
        }
    }
}

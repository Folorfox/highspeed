import * as THREE from 'three';
import { createRoad } from './road.js';
import { Car } from './car.js';
import { Controls } from './controls.js';
import { TrafficManager } from './traffic.js';
import { EnvironmentManager } from './environment.js';
import { findCollidingTrafficCar } from './collisions.js';
import {
    AudioToggleButton,
    CountdownOverlay,
    GameOverScreen,
    PauseScreen,
    ScoreHud,
    SPEED_DISPLAY_KMH_PER_GAME_UNIT,
    SpeedEffectOverlay,
    StartScreen,
    TouchControlsOverlay
} from './ui.js';
import { getDistanceScoreFactor, ScoreManager } from './score.js';
import { DifficultyManager } from './difficulty.js';
import { EffectsManager } from './effects.js';
import { audio } from './audio.js';
import { PLAYER_VEHICLES } from './playerVehicleModel.js';
import { ObjectiveManager } from './objectives.js';
import {
    applyGameModeToDifficultySnapshot,
    DEFAULT_GAME_MODE_ID,
    GAME_MODES,
    getGameModeConfig
} from './gameModes.js';
import { loadGameSettings, saveGameSettings } from './settings.js';

const SKY_COLOR = 0x9ecfe8;

const MAX_RENDER_PIXEL_RATIO = 1.5;
const SUN_SHADOW_MAP_SIZE = 1024;
const ATMOSPHERE_UPDATE_INTERVAL = 1 / 20;

const CAMERA_OFFSET_Y = 4;
const CAMERA_OFFSET_Z = 8;
const CAMERA_LOOK_AHEAD = 10;
const CAMERA_LATERAL_SMOOTHING = 5;

const CAMERA_BASE_FOV = 65;
const CAMERA_MAX_FOV_BOOST = 12;
const CAMERA_MAX_PULLBACK = 3;
const CAMERA_FOV_SMOOTHING = 4;

const CAMERA_VERTICAL_BOB_AMPLITUDE = 0.05;
const CAMERA_VERTICAL_BOB_FREQUENCY = 9;

const IMPACT_SHAKE_DURATION = 0.4;
const IMPACT_SHAKE_POSITION_STRENGTH = 0.35;
const IMPACT_SHAKE_ROTATION_STRENGTH = 0.03;

const MINOR_SHAKE_DURATION = 0.15;
const LANE_CHANGE_SHAKE_STRENGTH = 0.05;
const NEAR_MISS_SHAKE_STRENGTH = 0.09;

const HIGH_SPEED_SHAKE_THRESHOLD = 0.88;
const HIGH_SPEED_SHAKE_STRENGTH = 0.02;

const CAMERA_LANE_ROLL_ANGLE = THREE.MathUtils.degToRad(3.5);
const CAMERA_ROLL_RETURN_SPEED = 6;

const BRAKE_EFFECT_MIN_SPEED = 14;
const BRAKE_EFFECT_COOLDOWN = 0.16;

const COMBO_SHAKE_MULTIPLIER_THRESHOLD = 3;
const COMBO_SHAKE_STRENGTH = 0.07;

const DANGER_WARNING_DISTANCE = 95;
const DANGER_WARNING_MIN_CLOSING_SPEED = 4;

const COUNTDOWN_NUMBER_COUNT = 3;
const COUNTDOWN_STEP_DURATION = 0.75;
const COUNTDOWN_GO_DURATION = 0.45;
const COUNTDOWN_TOTAL_DURATION = COUNTDOWN_NUMBER_COUNT * COUNTDOWN_STEP_DURATION + COUNTDOWN_GO_DURATION;
const METERS_PER_KMH_SECOND = 1000 / 3600;
const ARCADE_DISTANCE_SCALE = 6;

// --- Soleil / ombres ------------------------------------------------------
// Le soleil suit la voiture chaque frame (position + target), avec un
// frustum d'ombre resserré autour d'elle : la route fait 6000 unités, donc
// une shadow camera fixe couvrant tout le tracé serait inutilement lourde
// et peu précise. En la faisant suivre la voiture, on garde une résolution
// d'ombre correcte pour un coût constant, quelle que soit la distance
// parcourue.
const SUN_SHADOW_HALF_SIZE = 40;

const DAY_NIGHT_CYCLE_DURATION = 300;
const DAY_NIGHT_START_PROGRESS = 0.48;
const DAY_NIGHT_START_TIME = DAY_NIGHT_CYCLE_DURATION * DAY_NIGHT_START_PROGRESS;

const HEADLIGHT_SIDE_OFFSET = 0.62;
const HEADLIGHT_HEIGHT = 0.72;
const HEADLIGHT_FRONT_OFFSET = 1.45;
const HEADLIGHT_REACH = 42;
const HEADLIGHT_BEAM_WIDTH = 2.8;
const HEADLIGHT_BEAM_LENGTH = HEADLIGHT_REACH * 0.78;
const HEADLIGHT_BEAM_MAX_OPACITY = 0.34;

const DAY_NIGHT_STOPS = [
    {
        t: 0,
        background: new THREE.Color(0x9ecfe8),
        skyTop: new THREE.Color(0x5d9fd4),
        skyHorizon: new THREE.Color(0xffd0a4),
        fog: new THREE.Color(0xaed1dc),
        ambient: new THREE.Color(0xfff6e8),
        ambientIntensity: 0.32,
        hemiSky: new THREE.Color(0xc7e5f6),
        hemiGround: new THREE.Color(0x4f7a40),
        hemiIntensity: 0.62,
        sun: new THREE.Color(0xffc37d),
        sunIntensity: 1.35,
        sunOffset: new THREE.Vector3(-18, 14, -18),
        exposure: 0.95,
        headlightIntensity: 0,
        visibilityLightIntensity: 0
    },
    {
        t: 0.32,
        background: new THREE.Color(0x78b6e2),
        skyTop: new THREE.Color(0x2f6fb0),
        skyHorizon: new THREE.Color(0xd7edf8),
        fog: new THREE.Color(0x94c8df),
        ambient: new THREE.Color(0xffffff),
        ambientIntensity: 0.26,
        hemiSky: new THREE.Color(0xbfd8f2),
        hemiGround: new THREE.Color(0x4a7a3c),
        hemiIntensity: 0.58,
        sun: new THREE.Color(0xfff3d9),
        sunIntensity: 1.75,
        sunOffset: new THREE.Vector3(16, 25, 12),
        exposure: 1.0,
        headlightIntensity: 0,
        visibilityLightIntensity: 0
    },
    {
        t: 0.58,
        background: new THREE.Color(0x151b34),
        skyTop: new THREE.Color(0x10162f),
        skyHorizon: new THREE.Color(0xd98967),
        fog: new THREE.Color(0x151b34),
        ambient: new THREE.Color(0x7c86aa),
        ambientIntensity: 0.36,
        hemiSky: new THREE.Color(0x526aa0),
        hemiGround: new THREE.Color(0x203f2d),
        hemiIntensity: 0.68,
        sun: new THREE.Color(0xff9a5a),
        sunIntensity: 1.25,
        sunOffset: new THREE.Vector3(-18, 12, -24),
        exposure: 0.88,
        headlightIntensity: 1.7,
        visibilityLightIntensity: 0.28
    },
    {
        t: 0.76,
        background: new THREE.Color(0x070a18),
        skyTop: new THREE.Color(0x050714),
        skyHorizon: new THREE.Color(0x182845),
        fog: new THREE.Color(0x080d1f),
        ambient: new THREE.Color(0xa9b8ff),
        ambientIntensity: 0.48,
        hemiSky: new THREE.Color(0x334d8a),
        hemiGround: new THREE.Color(0x1a2d24),
        hemiIntensity: 0.82,
        sun: new THREE.Color(0x9fb8ff),
        sunIntensity: 0.42,
        sunOffset: new THREE.Vector3(8, 20, 18),
        exposure: 0.8,
        headlightIntensity: 5.8,
        visibilityLightIntensity: 0.9
    },
    {
        t: 0.92,
        background: new THREE.Color(0x1b263f),
        skyTop: new THREE.Color(0x17204a),
        skyHorizon: new THREE.Color(0xf0a06b),
        fog: new THREE.Color(0x1a2740),
        ambient: new THREE.Color(0x8b92ba),
        ambientIntensity: 0.38,
        hemiSky: new THREE.Color(0x6679aa),
        hemiGround: new THREE.Color(0x263b2d),
        hemiIntensity: 0.7,
        sun: new THREE.Color(0xffb47a),
        sunIntensity: 1.05,
        sunOffset: new THREE.Vector3(18, 14, -20),
        exposure: 0.9,
        headlightIntensity: 2.1,
        visibilityLightIntensity: 0.38
    },
    {
        t: 1,
        background: new THREE.Color(0x9ecfe8),
        skyTop: new THREE.Color(0x5d9fd4),
        skyHorizon: new THREE.Color(0xffd0a4),
        fog: new THREE.Color(0xaed1dc),
        ambient: new THREE.Color(0xfff6e8),
        ambientIntensity: 0.32,
        hemiSky: new THREE.Color(0xc7e5f6),
        hemiGround: new THREE.Color(0x4f7a40),
        hemiIntensity: 0.62,
        sun: new THREE.Color(0xffc37d),
        sunIntensity: 1.35,
        sunOffset: new THREE.Vector3(-18, 14, -18),
        exposure: 0.95,
        headlightIntensity: 0,
        visibilityLightIntensity: 0
    }
];

function createAtmosphereState() {
    return {
        background: new THREE.Color(),
        skyTop: new THREE.Color(),
        skyHorizon: new THREE.Color(),
        fog: new THREE.Color(),
        ambient: new THREE.Color(),
        hemiSky: new THREE.Color(),
        hemiGround: new THREE.Color(),
        sun: new THREE.Color(),
        sunOffset: new THREE.Vector3(),
        ambientIntensity: 0,
        hemiIntensity: 0,
        sunIntensity: 0,
        exposure: 1,
        headlightIntensity: 0,
        visibilityLightIntensity: 0
    };
}

function sampleDayNightAtmosphere(time, target) {
    const progress = ((time / DAY_NIGHT_CYCLE_DURATION) % 1 + 1) % 1;
    let from = DAY_NIGHT_STOPS[0];
    let to = DAY_NIGHT_STOPS[1];

    for (let i = 0; i < DAY_NIGHT_STOPS.length - 1; i++) {
        const current = DAY_NIGHT_STOPS[i];
        const next = DAY_NIGHT_STOPS[i + 1];
        if (progress >= current.t && progress <= next.t) {
            from = current;
            to = next;
            break;
        }
    }

    const span = Math.max(0.0001, to.t - from.t);
    const amount = THREE.MathUtils.smoothstep((progress - from.t) / span, 0, 1);

    target.background.lerpColors(from.background, to.background, amount);
    target.skyTop.lerpColors(from.skyTop, to.skyTop, amount);
    target.skyHorizon.lerpColors(from.skyHorizon, to.skyHorizon, amount);
    target.fog.lerpColors(from.fog, to.fog, amount);
    target.ambient.lerpColors(from.ambient, to.ambient, amount);
    target.hemiSky.lerpColors(from.hemiSky, to.hemiSky, amount);
    target.hemiGround.lerpColors(from.hemiGround, to.hemiGround, amount);
    target.sun.lerpColors(from.sun, to.sun, amount);
    target.sunOffset.copy(from.sunOffset).lerp(to.sunOffset, amount);
    target.ambientIntensity = THREE.MathUtils.lerp(from.ambientIntensity, to.ambientIntensity, amount);
    target.hemiIntensity = THREE.MathUtils.lerp(from.hemiIntensity, to.hemiIntensity, amount);
    target.sunIntensity = THREE.MathUtils.lerp(from.sunIntensity, to.sunIntensity, amount);
    target.exposure = THREE.MathUtils.lerp(from.exposure, to.exposure, amount);
    target.headlightIntensity = THREE.MathUtils.lerp(from.headlightIntensity, to.headlightIntensity, amount);
    target.visibilityLightIntensity = THREE.MathUtils.lerp(from.visibilityLightIntensity, to.visibilityLightIntensity, amount);

    return target;
}

function createHeadlightBeamTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 512;

    const context = canvas.getContext('2d');
    const lengthGradient = context.createLinearGradient(0, canvas.height, 0, 0);
    lengthGradient.addColorStop(0, 'rgba(255, 244, 194, 0)');
    lengthGradient.addColorStop(0.18, 'rgba(255, 244, 194, 0.52)');
    lengthGradient.addColorStop(0.72, 'rgba(255, 244, 194, 0.18)');
    lengthGradient.addColorStop(1, 'rgba(255, 244, 194, 0)');
    context.fillStyle = lengthGradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.globalCompositeOperation = 'destination-in';
    const widthGradient = context.createLinearGradient(0, 0, canvas.width, 0);
    widthGradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
    widthGradient.addColorStop(0.5, 'rgba(255, 255, 255, 1)');
    widthGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    context.fillStyle = widthGradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
}

function createHeadlightBeam(texture) {
    const geometry = new THREE.PlaneGeometry(HEADLIGHT_BEAM_WIDTH, HEADLIGHT_BEAM_LENGTH);
    const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false
    });

    const beam = new THREE.Mesh(geometry, material);
    beam.rotation.x = -Math.PI / 2;
    beam.renderOrder = 2;
    return beam;
}

function formatDuration(seconds) {
    const totalSeconds = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = String(totalSeconds % 60).padStart(2, '0');
    return `${minutes}:${remainingSeconds}`;
}

function formatDistanceKm(distanceMeters) {
    const kilometers = Math.max(0, distanceMeters) / 1000;
    return `${kilometers.toLocaleString('fr-FR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })} KM`;
}

export function startGame() {
    let gameSettings = loadGameSettings();
    audio.setVolumes(gameSettings);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(SKY_COLOR);

    const camera = new THREE.PerspectiveCamera(
        CAMERA_BASE_FOV,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);

    function getRenderPixelRatio() {
        return Math.min(window.devicePixelRatio, gameSettings.performanceMode ? 1 : MAX_RENDER_PIXEL_RATIO);
    }

    function applyRenderSettings() {
        renderer.setPixelRatio(getRenderPixelRatio());
        renderer.shadowMap.enabled = !gameSettings.performanceMode;
    }

    function shouldPlayVisualEffects() {
        return !gameSettings.performanceMode;
    }

    function shouldUseCameraShake() {
        return gameSettings.cameraShake;
    }

    function shouldUseSpeedEffects() {
        return gameSettings.speedEffects && !gameSettings.performanceMode;
    }

    applyRenderSettings();

    // Ombres portées douces. Le coût reste maîtrisé car seul un petit
    // frustum autour de la voiture (voir SUN_SHADOW_HALF_SIZE) est rendu
    // dans la shadow map, quelle que soit la longueur du tracé.
    renderer.shadowMap.type = THREE.PCFShadowMap;

    // --- Color management explicite -----------------------------------
    // Nécessaire pour que les matériaux/textures des modèles GLB (couleurs
    // de carrosserie, textures embarquées dans les .glb) s'affichent avec
    // leurs vraies teintes plutôt que d'être écrasés à blanc.
    //
    // `outputColorSpace` garantit un rendu final en espace sRGB cohérent
    // avec les textures couleur que GLTFLoader a déjà marquées en
    // SRGBColorSpace (les normal/roughness/metalness maps, elles, restent
    // en espace linéaire — GLTFLoader s'en occupe automatiquement, aucune
    // intervention manuelle nécessaire ici).
    //
    // `toneMapping` est la partie qui corrigeait réellement le problème des
    // "voitures toutes blanches" : sans tone mapping (valeur par défaut
    // NoToneMapping), toute valeur de lumière dépassant 1.0 sur un canal de
    // couleur est purement et simplement tronquée à blanc — un clip brutal,
    // pas un dégradé. Avec l'éclairage précédent (ambiante 1.5 + directionnelle
    // 2), n'importe quelle carrosserie claire sur un MeshStandardMaterial
    // (PBR, bien plus sensible à la sur-exposition qu'un MeshLambertMaterial)
    // finissait saturée sur les trois canaux, donc blanche — texture et
    // couleur perdues, peu importe leur contenu réel. ACESFilmicToneMapping
    // compresse ces hautes lumières en douceur au lieu de les couper net.
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.88;

    document.body.appendChild(renderer.domElement);

    // Ambiante réduite : la lumière hémisphérique ci-dessous apporte
    // maintenant l'essentiel de l'éclairage indirect, de façon plus
    // cohérente avec le ciel (bleuté en haut, verdâtre réfléchi par le sol).
    const ambientLight = new THREE.AmbientLight(0x7c86aa, 0.32);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0x526aa0, 0x203f2d, 0.65);
    scene.add(hemiLight);

    const sun = new THREE.DirectionalLight(0xff9a5a, 1.25);
    sun.castShadow = true;
    sun.shadow.mapSize.set(SUN_SHADOW_MAP_SIZE, SUN_SHADOW_MAP_SIZE);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 90;
    sun.shadow.camera.left = -SUN_SHADOW_HALF_SIZE;
    sun.shadow.camera.right = SUN_SHADOW_HALF_SIZE;
    sun.shadow.camera.top = SUN_SHADOW_HALF_SIZE;
    sun.shadow.camera.bottom = -SUN_SHADOW_HALF_SIZE;
    sun.shadow.bias = -0.0004;
    scene.add(sun);
    scene.add(sun.target);

    const headlightLeft = new THREE.SpotLight(0xfff0c7, 0, HEADLIGHT_REACH, THREE.MathUtils.degToRad(18), 0.45, 1.25);
    const headlightRight = new THREE.SpotLight(0xfff0c7, 0, HEADLIGHT_REACH, THREE.MathUtils.degToRad(18), 0.45, 1.25);
    scene.add(headlightLeft);
    scene.add(headlightLeft.target);
    scene.add(headlightRight);
    scene.add(headlightRight.target);

    const headlightBeamTexture = createHeadlightBeamTexture();
    const headlightBeamLeft = createHeadlightBeam(headlightBeamTexture);
    const headlightBeamRight = createHeadlightBeam(headlightBeamTexture);
    scene.add(headlightBeamLeft);
    scene.add(headlightBeamRight);

    const visibilityLight = new THREE.PointLight(0xb9c8ff, 0, 36, 1.5);
    scene.add(visibilityLight);

    const sunOffset = new THREE.Vector3();

    const road = createRoad(scene);

    const car = new Car();
    scene.add(car.group);

    function updateSunFollow() {
        sun.position.set(
            car.group.position.x + sunOffset.x,
            car.group.position.y + sunOffset.y,
            car.group.position.z + sunOffset.z
        );
        sun.target.position.copy(car.group.position);
        sun.target.updateMatrixWorld();
    }

    function updateVisibilityLights() {
        const carX = car.group.position.x;
        const carY = car.group.position.y;
        const carZ = car.group.position.z;

        headlightLeft.position.set(carX - HEADLIGHT_SIDE_OFFSET, carY + HEADLIGHT_HEIGHT, carZ - HEADLIGHT_FRONT_OFFSET);
        headlightRight.position.set(carX + HEADLIGHT_SIDE_OFFSET, carY + HEADLIGHT_HEIGHT, carZ - HEADLIGHT_FRONT_OFFSET);

        headlightLeft.target.position.set(carX - HEADLIGHT_SIDE_OFFSET * 1.25, carY + 0.22, carZ - HEADLIGHT_REACH);
        headlightRight.target.position.set(carX + HEADLIGHT_SIDE_OFFSET * 1.25, carY + 0.22, carZ - HEADLIGHT_REACH);
        headlightLeft.target.updateMatrixWorld();
        headlightRight.target.updateMatrixWorld();

        const beamZ = carZ - HEADLIGHT_FRONT_OFFSET - HEADLIGHT_BEAM_LENGTH / 2;
        headlightBeamLeft.position.set(carX - HEADLIGHT_SIDE_OFFSET, carY + 0.045, beamZ);
        headlightBeamRight.position.set(carX + HEADLIGHT_SIDE_OFFSET, carY + 0.045, beamZ);

        visibilityLight.position.set(carX, carY + 3.2, carZ + 2.5);
    }

    updateSunFollow();

    const difficulty = new DifficultyManager();
    const initialGameMode = getGameModeConfig(DEFAULT_GAME_MODE_ID);

    const traffic = new TrafficManager(
        scene,
        car,
        applyGameModeToDifficultySnapshot(difficulty.getSnapshot(), initialGameMode).activeCarCount
    );

    const environment = new EnvironmentManager(scene);
    environment.reset(car);

    const effects = new EffectsManager(scene);

    function snapCameraToCar() {
        camera.position.set(
            car.group.position.x,
            car.group.position.y + CAMERA_OFFSET_Y,
            car.group.position.z + CAMERA_OFFSET_Z
        );
        camera.fov = CAMERA_BASE_FOV;
        camera.rotation.z = 0;
        camera.updateProjectionMatrix();
    }

    snapCameraToCar();

    const controls = new Controls();
    const touchControls = new TouchControlsOverlay({
        onLeft: () => controls.shiftLeft(),
        onRight: () => controls.shiftRight(),
        onAccelerateChange: (active) => controls.setTouchAccelerating(active),
        onBrakeChange: (active) => controls.setTouchBraking(active)
    });

    let isGameStarted = false;
    let isGameOver = false;
    let isPaused = false;
    let shakeTimeRemaining = 0;
    let minorShakeTimeRemaining = 0;
    let minorShakeMagnitude = 0;
    let elapsedTime = 0;
    let previousDifficultyLevel = difficulty.getLevel();
    let cameraRoll = 0;
    let previousComboMultiplier = 0;
    let brakeEffectCooldown = 0;
    let dayNightTime = DAY_NIGHT_START_TIME;
    let atmosphereUpdateAccumulator = ATMOSPHERE_UPDATE_INTERVAL;
    let maxRunSpeed = 0;
    let runDistanceMeters = 0;
    let countdownTimeRemaining = 0;
    let currentGameMode = initialGameMode;
    let modeTimeRemaining = currentGameMode.timeLimit ?? null;
    const atmosphereState = createAtmosphereState();

    const scoreManager = new ScoreManager();
    const objectiveManager = new ObjectiveManager();
    const scoreHud = new ScoreHud();
    updatePrimaryHud();
    scoreHud.updateLevel(difficulty.getLevel());

    const speedEffectOverlay = new SpeedEffectOverlay();
    const countdownOverlay = new CountdownOverlay();
    let audioToggleButton = null;

    let startScreen = null;
    const gameOverScreen = new GameOverScreen(
        () => startRun(car.vehicle.id, currentGameMode.id),
        () => showVehicleSelection('home')
    );
    const pauseScreen = new PauseScreen(
        () => resumeGame(),
        () => quitRunToMenu()
    );
    audioToggleButton = new AudioToggleButton({
        muted: audio.isMuted(),
        onToggle: (muted) => {
            audio.setMuted(muted);
            audioToggleButton.update(audio.isMuted());

            if (!audio.isMuted() && isGameStarted && !isGameOver && !isPaused) {
                audio.startEngine();
            }
        }
    });
    startScreen = new StartScreen({
        vehicles: PLAYER_VEHICLES,
        modes: GAME_MODES,
        getVehicleBestScore: (vehicleId) => scoreManager.getVehicleBestScore(vehicleId),
        getModeBestScore: (modeId, metric) => scoreManager.getModeBestResult(modeId, metric),
        getCareerStats: () => scoreManager.getCareerStats(),
        getCareerMilestones: () => scoreManager.getCareerMilestones(),
        getVehicleUnlockInfo: (vehicle) => scoreManager.getVehicleUnlockInfo(vehicle),
        settings: gameSettings,
        onSettingsChange: (nextSettings) => {
            gameSettings = nextSettings;
            saveGameSettings(gameSettings);
            applyRenderSettings();
            audio.setVolumes(gameSettings);

            if (!shouldUseSpeedEffects()) {
                speedEffectOverlay.update(0);
            }
            if (!shouldPlayVisualEffects()) {
                effects.reset();
            }
            if (!shouldUseCameraShake()) {
                shakeTimeRemaining = 0;
                minorShakeTimeRemaining = 0;
                minorShakeMagnitude = 0;
            }
        },
        onSelectVehicle: (vehicleId) => car.setVehicle(vehicleId),
        onSelectMode: (modeId) => {
            currentGameMode = getGameModeConfig(modeId);
            if (!isGameStarted) {
                modeTimeRemaining = currentGameMode.timeLimit ?? null;
            }
            scoreHud.updateModeStatus({
                label: 'MODE',
                value: currentGameMode.name,
                progress: 1
            });
        },
        onRequestFullscreen: () => {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen?.();
            } else {
                document.exitFullscreen?.();
            }
        },
        onStart: (vehicleId, modeId) => startRun(vehicleId, modeId)
    });

    function updateTouchControlsVisibility() {
        touchControls.setVisible(isGameStarted && !isGameOver && !isPaused);
    }

    function pauseGame() {
        if (!isGameStarted || isGameOver || isPaused) return;

        isPaused = true;
        controls.clear();
        updateTouchControlsVisibility();
        pauseScreen.show();
        speedEffectOverlay.update(0);
        audio.stopEngine();
    }

    function resumeGame() {
        if (!isPaused) return;

        isPaused = false;
        controls.clear();
        pauseScreen.hide();
        updateTouchControlsVisibility();
        audio.startEngine();
    }

    function quitRunToMenu() {
        if (!isGameStarted || isGameOver) return;

        isGameStarted = false;
        isPaused = false;
        controls.clear();
        updateTouchControlsVisibility();
        audio.stopEngine();
        speedEffectOverlay.update(0);
        countdownOverlay.hide();
        scoreHud.updateDanger(null);
        scoreHud.updateObjective(null);
        resetGame();
        startScreen.show('home');
    }

    function togglePause() {
        if (isPaused) {
            resumeGame();
        } else {
            pauseGame();
        }
    }

    function getCurrentDifficultySnapshot() {
        return applyGameModeToDifficultySnapshot(difficulty.getSnapshot(), currentGameMode);
    }

    function updateModeHud() {
        if (currentGameMode.timeLimit) {
            const progress = modeTimeRemaining / (currentGameMode.timeBonusCap ?? currentGameMode.timeLimit);
            scoreHud.updateModeStatus({
                label: 'CHRONO',
                value: formatDuration(modeTimeRemaining),
                progress
            });
            return;
        }

        scoreHud.updateModeStatus({
            label: 'MODE',
            value: currentGameMode.name,
            progress: 1
        });
    }

    function isDistanceResultMode() {
        return currentGameMode.resultMetric === 'distance';
    }

    function getPrimaryResultDisplay() {
        if (isDistanceResultMode()) {
            return {
                value: runDistanceMeters,
                bestValue: scoreManager.getModeBestResult(currentGameMode.id, 'distance'),
                scoreLabel: 'DISTANCE',
                bestLabel: 'REC DISTANCE',
                formatValue: formatDistanceKm
            };
        }

        return {
            value: scoreManager.getScore(),
            bestValue: scoreManager.getBestScore(),
            scoreLabel: 'SCORE',
            bestLabel: 'MEILLEUR',
            formatValue: (value) => Math.floor(value).toLocaleString('fr-FR')
        };
    }

    function updatePrimaryHud() {
        const primaryDisplay = getPrimaryResultDisplay();
        scoreHud.update(
            primaryDisplay.value,
            primaryDisplay.bestValue,
            scoreManager.getComboMultiplier(),
            scoreManager.getComboProgress(),
            scoreManager.getComboTimeRemaining(),
            primaryDisplay
        );
    }

    function updateSpeedHud() {
        scoreHud.updateSpeed(
            car.speed,
            isDistanceResultMode() ? car.getSpeedRatio() : getDistanceScoreFactor(car.getSpeedRatio()),
            isDistanceResultMode() ? 'DISTANCE' : 'SCORE'
        );
    }

    function getSpeedMetersPerSecond(speed) {
        return speed * SPEED_DISPLAY_KMH_PER_GAME_UNIT * METERS_PER_KMH_SECOND * ARCADE_DISTANCE_SCALE;
    }

    function addModeTimeBonus(seconds) {
        if (!currentGameMode.timeLimit || seconds <= 0) return 0;

        const timeCap = currentGameMode.timeBonusCap ?? currentGameMode.timeLimit;
        const previousTime = modeTimeRemaining;
        modeTimeRemaining = Math.min(timeCap, modeTimeRemaining + seconds);
        const actualBonus = modeTimeRemaining - previousTime;

        if (actualBonus > 0) {
            scoreHud.showEventBonus('time-bonus', actualBonus);
            updateModeHud();
        }

        return actualBonus;
    }

    function applyDayNightAtmosphere() {
        sampleDayNightAtmosphere(dayNightTime, atmosphereState);

        scene.background.copy(atmosphereState.background);
        if (scene.fog) {
            scene.fog.color.copy(atmosphereState.fog);
        }

        environment.setSkyGradient(atmosphereState.skyTop, atmosphereState.skyHorizon);

        ambientLight.color.copy(atmosphereState.ambient);
        ambientLight.intensity = atmosphereState.ambientIntensity;

        hemiLight.color.copy(atmosphereState.hemiSky);
        hemiLight.groundColor.copy(atmosphereState.hemiGround);
        hemiLight.intensity = atmosphereState.hemiIntensity;

        sun.color.copy(atmosphereState.sun);
        sun.intensity = atmosphereState.sunIntensity;
        sunOffset.copy(atmosphereState.sunOffset);

        renderer.toneMappingExposure = atmosphereState.exposure;
        headlightLeft.intensity = atmosphereState.headlightIntensity;
        headlightRight.intensity = atmosphereState.headlightIntensity;
        visibilityLight.intensity = atmosphereState.visibilityLightIntensity;

        const beamOpacity = THREE.MathUtils.clamp(atmosphereState.headlightIntensity / 5.8, 0, 1)
            * HEADLIGHT_BEAM_MAX_OPACITY;
        headlightBeamLeft.material.opacity = beamOpacity;
        headlightBeamRight.material.opacity = beamOpacity;
        headlightBeamLeft.visible = beamOpacity > 0.01;
        headlightBeamRight.visible = beamOpacity > 0.01;
        road.userData.setReflectorIntensity?.(
            THREE.MathUtils.clamp(atmosphereState.headlightIntensity / 5.8, 0, 1)
        );
    }

    applyDayNightAtmosphere();
    updateSunFollow();
    updateVisibilityLights();

    function triggerGameOver(collidedCar = null, {
        title = 'GAME OVER',
        playCrashEffects = true
    } = {}) {
        isPaused = false;
        pauseScreen.hide();
        isGameOver = true;
        shakeTimeRemaining = playCrashEffects && shouldUseCameraShake() ? IMPACT_SHAKE_DURATION : 0;
        countdownTimeRemaining = 0;
        updateTouchControlsVisibility();

        audio.stopEngine();
        countdownOverlay.hide();
        scoreHud.updateDanger(null);
        scoreHud.updateObjective(null);
        updateModeHud();
        scoreManager.resetCombo();
        const previouslyUnlockedVehicleIds = new Set(
            PLAYER_VEHICLES
                .filter((vehicle) => scoreManager.getVehicleUnlockInfo(vehicle).unlocked)
                .map((vehicle) => vehicle.id)
        );
        const distanceResultMode = isDistanceResultMode();
        const previousPrimaryBest = distanceResultMode
            ? scoreManager.getModeBestResult(currentGameMode.id, 'distance')
            : scoreManager.getBestScore();
        const primaryResultValue = distanceResultMode ? runDistanceMeters : scoreManager.getScore();
        const careerResult = scoreManager.finalizeGame(car.vehicle.id, currentGameMode.id, {
            survivalTime: difficulty.getSurvivalTime(),
            maxSpeedKmh: Math.round(maxRunSpeed * SPEED_DISPLAY_KMH_PER_GAME_UNIT),
            modeResultMetric: currentGameMode.resultMetric,
            modeResultValue: primaryResultValue,
            scoreRecordsEnabled: !distanceResultMode
        });
        const newlyCompletedMilestones = careerResult.newlyCompletedMilestones ?? [];
        const newlyUnlockedVehicles = PLAYER_VEHICLES.filter((vehicle) =>
            scoreManager.getVehicleUnlockInfo(vehicle).unlocked && !previouslyUnlockedVehicleIds.has(vehicle.id)
        );
        const summaryItems = [
            { label: 'MODE', value: currentGameMode.name },
            ...(distanceResultMode ? [{ label: 'DISTANCE', value: formatDistanceKm(runDistanceMeters) }] : []),
            { label: 'TEMPS', value: formatDuration(difficulty.getSurvivalTime()) },
            {
                label: 'VITESSE MAX',
                value: `${Math.round(maxRunSpeed * SPEED_DISPLAY_KMH_PER_GAME_UNIT)} KM/H`
            },
            ...(distanceResultMode
                ? [{ label: 'REC DISTANCE', value: formatDistanceKm(scoreManager.getModeBestResult(currentGameMode.id, 'distance')) }]
                : [
                    { label: 'BONUS SCORE', value: `x${currentGameMode.scoreMultiplier.toFixed(2)}` },
                    { label: 'REC MODE', value: scoreManager.getModeBestScore(currentGameMode.id) },
                    { label: 'REC VÉHICULE', value: scoreManager.getVehicleBestScore(car.vehicle.id) }
                ]),
            { label: 'DÉPASSEMENTS', value: scoreManager.getOvertakeCount() },
            { label: 'NEAR MISS', value: scoreManager.getNearMissCount() },
            { label: 'COMBO MAX', value: `x${scoreManager.getMaxComboMultiplier()}` },
            { label: 'OBJECTIFS', value: scoreManager.getObjectiveCount() }
        ];

        if (primaryResultValue > previousPrimaryBest) {
            summaryItems.unshift({
                label: 'NOUVEAU RECORD',
                value: distanceResultMode ? formatDistanceKm(primaryResultValue) : Math.floor(primaryResultValue).toLocaleString('fr-FR'),
                highlight: true
            });
            audio.playProcedural('combo', { intensity: 1.25 });
        }

        if (newlyCompletedMilestones.length > 0) {
            summaryItems.unshift({
                label: newlyCompletedMilestones.length > 1 ? 'DÉFIS RÉUSSIS' : 'DÉFI RÉUSSI',
                value: newlyCompletedMilestones.length > 1
                    ? `${newlyCompletedMilestones.length} nouveaux`
                    : newlyCompletedMilestones[0].label,
                highlight: true
            });
        }

        if (newlyUnlockedVehicles.length > 0) {
            summaryItems.unshift({
                label: newlyUnlockedVehicles.length > 1 ? 'VOITURES DÉBLOQUÉES' : 'VOITURE DÉBLOQUÉE',
                value: newlyUnlockedVehicles.map((vehicle) => vehicle.name).join(', '),
                highlight: true
            });
        }

        const primaryDisplay = getPrimaryResultDisplay();
        gameOverScreen.showWithTitle(
            title,
            primaryDisplay.value,
            primaryDisplay.bestValue,
            summaryItems,
            {
                scoreLabel: primaryDisplay.scoreLabel,
                scoreText: primaryDisplay.formatValue(primaryDisplay.value),
                bestLabel: primaryDisplay.bestLabel,
                bestText: primaryDisplay.formatValue(primaryDisplay.bestValue)
            }
        );

        if (playCrashEffects) {
            if (shouldPlayVisualEffects()) {
                effects.playCollisionEffect(car.group.position);
            }
            audio.play('collision');
            audio.playProcedural('collision', {
                pan: collidedCar
                    ? THREE.MathUtils.clamp((collidedCar.group.position.x - car.group.position.x) / 5, -0.8, 0.8)
                    : 0,
                intensity: 1 + car.getSpeedRatio() * 0.25
            });

            car.group.rotation.z += (Math.random() - 0.5) * 0.5;
            car.group.rotation.x = Math.random() * 0.18;
        }
    }

    function resetGame() {
        car.reset();
        difficulty.reset();
        modeTimeRemaining = currentGameMode.timeLimit ?? null;
        traffic.reset(car, getCurrentDifficultySnapshot().activeCarCount);
        environment.reset(car);
        controls.consumeLaneShift();

        runDistanceMeters = 0;
        scoreManager.reset();
        scoreManager.setScoreMultiplier(currentGameMode.scoreMultiplier);
        objectiveManager.reset(currentGameMode.id);
        updatePrimaryHud();
        scoreHud.updateLevel(difficulty.getLevel());
        updateModeHud();
        updateSpeedHud();
        scoreHud.updateDanger(null);
        scoreHud.updateObjective(null);
        previousDifficultyLevel = difficulty.getLevel();
        previousComboMultiplier = 0;

        shakeTimeRemaining = 0;
        minorShakeTimeRemaining = 0;
        minorShakeMagnitude = 0;
        cameraRoll = 0;
        brakeEffectCooldown = 0;
        dayNightTime = DAY_NIGHT_START_TIME;
        atmosphereUpdateAccumulator = ATMOSPHERE_UPDATE_INTERVAL;
        maxRunSpeed = 0;
        countdownTimeRemaining = 0;
        isPaused = false;
        pauseScreen.hide();
        countdownOverlay.hide();
        updateTouchControlsVisibility();
        audio.stopEngine();
        effects.reset();
        applyDayNightAtmosphere();
        snapCameraToCar();
        updateSunFollow();
        updateVisibilityLights();
        road.userData.update(car);

        isGameOver = false;
    }

    function startCountdown() {
        countdownTimeRemaining = COUNTDOWN_TOTAL_DURATION;
        updateCountdownOverlay();
    }

    function updateCountdownOverlay() {
        if (countdownTimeRemaining <= 0) {
            countdownOverlay.hide();
            return;
        }

        const elapsed = COUNTDOWN_TOTAL_DURATION - countdownTimeRemaining;
        const numberPhaseDuration = COUNTDOWN_NUMBER_COUNT * COUNTDOWN_STEP_DURATION;

        if (elapsed < numberPhaseDuration) {
            const stepIndex = Math.floor(elapsed / COUNTDOWN_STEP_DURATION);
            const label = String(COUNTDOWN_NUMBER_COUNT - stepIndex);
            const phaseProgress = (elapsed % COUNTDOWN_STEP_DURATION) / COUNTDOWN_STEP_DURATION;
            countdownOverlay.update(label, phaseProgress, false);
        } else {
            const phaseProgress = (elapsed - numberPhaseDuration) / COUNTDOWN_GO_DURATION;
            countdownOverlay.update('GO !', phaseProgress, true);
        }
    }

    function startRun(vehicleId = car.vehicle.id, modeId = currentGameMode.id) {
        car.setVehicle(vehicleId);
        currentGameMode = getGameModeConfig(modeId);
        resetGame();
        isGameStarted = true;
        scoreHud.updateObjective(objectiveManager.getCurrentObjective());
        updateModeHud();
        updateTouchControlsVisibility();
        audio.startEngine();
        startCountdown();
    }

    function showVehicleSelection(panel = 'garage') {
        isGameStarted = false;
        audio.stopEngine();
        resetGame();
        updateTouchControlsVisibility();
        startScreen.show(panel);
    }

    const timer = new THREE.Timer();
    timer.connect(document);

    function animate() {
        requestAnimationFrame(animate);

        timer.update();
        const delta = timer.getDelta();

        if (isPaused) {
            renderer.render(scene, camera);
            return;
        }

        elapsedTime += delta;

        if (isGameStarted && !isGameOver) {
            if (countdownTimeRemaining > 0) {
                countdownTimeRemaining = Math.max(0, countdownTimeRemaining - delta);
                controls.consumeLaneShift();
                updateCountdownOverlay();
            } else {
                countdownOverlay.hide();

                if (currentGameMode.timeLimit) {
                    modeTimeRemaining = Math.max(0, modeTimeRemaining - delta);
                    updateModeHud();
                    if (modeTimeRemaining <= 0) {
                        triggerGameOver(null, {
                            title: 'TEMPS ÉCOULÉ',
                            playCrashEffects: false
                        });
                    }
                }

                if (!isGameOver) {
                    dayNightTime += delta;
                    atmosphereUpdateAccumulator += delta;
                    if (atmosphereUpdateAccumulator >= ATMOSPHERE_UPDATE_INTERVAL) {
                        applyDayNightAtmosphere();
                        atmosphereUpdateAccumulator = 0;
                    }

                    difficulty.update(delta);
                    const difficultySnapshot = getCurrentDifficultySnapshot();
                    car.setMaxSpeedBonus(difficultySnapshot.playerMaxSpeedBonus);

                    car.update(delta, controls);
                    maxRunSpeed = Math.max(maxRunSpeed, car.speed);
                    runDistanceMeters += getSpeedMetersPerSecond(car.speed) * delta;

                    environment.update(delta, car);

                    brakeEffectCooldown = Math.max(0, brakeEffectCooldown - delta);
                    if (controls.isBraking() && car.speed > BRAKE_EFFECT_MIN_SPEED && brakeEffectCooldown <= 0) {
                        if (shouldPlayVisualEffects()) {
                            effects.playBrakeEffect(car.group.position);
                            effects.playTireMarkEffect(car.group.position, {
                                intensity: THREE.MathUtils.clamp(car.getSpeedRatio(), 0.35, 1)
                            });
                        }
                        brakeEffectCooldown = BRAKE_EFFECT_COOLDOWN;
                    }

                    if (car.justChangedLane) {
                        cameraRoll = car.laneChangeDirection * CAMERA_LANE_ROLL_ANGLE;
                        if (shouldPlayVisualEffects() && car.speed > BRAKE_EFFECT_MIN_SPEED) {
                            effects.playTireMarkEffect(car.group.position, {
                                intensity: THREE.MathUtils.clamp(car.getSpeedRatio() * 0.72, 0.25, 0.75),
                                lateralDirection: car.laneChangeDirection,
                                isLaneChange: true
                            });
                        }
                        audio.playProcedural('laneChange', {
                            speedRatio: car.getSpeedRatio(),
                            pan: car.laneChangeDirection * 0.35
                        });
                    }

                    const { overtakeCount, nearMissCars } = traffic.update(delta, car, difficultySnapshot);
                    scoreHud.updateDanger(
                        traffic.getClosestHazardAhead(car, DANGER_WARNING_DISTANCE, DANGER_WARNING_MIN_CLOSING_SPEED)
                    );

                    scoreManager.addDistanceScore(car.speed, car.getSpeedRatio(), delta);
                    scoreManager.updateCombo(delta);

                    const overtakeEvents = scoreManager.registerOvertakes(overtakeCount);
                    if (overtakeEvents.length > 0) {
                        const totalOvertakeAmount = overtakeEvents.reduce((sum, event) => sum + event.amount, 0);
                        if (isDistanceResultMode()) {
                            scoreHud.showEventBonus(overtakeEvents.length > 1 ? `${overtakeEvents.length} DÉPASSEMENTS` : 'DÉPASSEMENT');
                        } else {
                            scoreHud.showEventBonus('overtake', totalOvertakeAmount);
                        }
                        if (shouldPlayVisualEffects()) {
                            effects.playOvertakeEffect();
                        }
                        audio.play('overtake', 0.45);
                        audio.playProcedural('overtake', {
                            speedRatio: car.getSpeedRatio(),
                            intensity: Math.min(1.25, 0.85 + overtakeEvents.length * 0.12)
                        });
                    }

                    if (nearMissCars.length > 0) {
                        let totalNearMissAmount = 0;
                        let nearMissPan = 0;
                        for (const nearMissCar of nearMissCars) {
                            const { amount } = scoreManager.registerNearMiss();
                            totalNearMissAmount += amount;
                            nearMissPan += THREE.MathUtils.clamp(
                                (nearMissCar.group.position.x - car.group.position.x) / 6,
                                -0.85,
                                0.85
                            );
                            if (shouldPlayVisualEffects()) {
                                effects.playNearMissEffect(nearMissCar.group.position);
                            }
                        }
                        if (isDistanceResultMode()) {
                            scoreHud.showEventBonus(nearMissCars.length > 1 ? `${nearMissCars.length} NEAR MISS` : 'NEAR MISS !');
                        } else {
                            scoreHud.showEventBonus('near-miss', totalNearMissAmount);
                        }
                        addModeTimeBonus((currentGameMode.timeBonusOnNearMiss ?? 0) * nearMissCars.length);
                        audio.play('nearMiss', 0.55);
                        audio.playProcedural('nearMiss', {
                            speedRatio: car.getSpeedRatio(),
                            pan: nearMissPan / nearMissCars.length,
                            intensity: Math.min(1.35, 0.9 + nearMissCars.length * 0.15)
                        });

                        if (shouldUseCameraShake()) {
                            minorShakeTimeRemaining = MINOR_SHAKE_DURATION;
                            minorShakeMagnitude = Math.max(minorShakeMagnitude, NEAR_MISS_SHAKE_STRENGTH);
                        }
                    }

                    const completedObjective = objectiveManager.update({
                        delta,
                        overtakeCount,
                        nearMissCount: nearMissCars.length,
                        speedRatio: car.getSpeedRatio()
                    });
                    if (completedObjective) {
                        const objectiveReward = scoreManager.registerObjectiveReward(completedObjective.reward);
                        if (isDistanceResultMode()) {
                            scoreHud.showEventBonus('OBJECTIF RÉUSSI');
                        } else {
                            scoreHud.showEventBonus('objective', objectiveReward);
                        }
                        addModeTimeBonus(currentGameMode.timeBonusOnObjective ?? 0);
                        if (shouldPlayVisualEffects()) {
                            effects.playComboEffect(COMBO_SHAKE_MULTIPLIER_THRESHOLD, car.group.position);
                        }
                        audio.play('combo', 0.45);
                    }
                    scoreHud.updateObjective(objectiveManager.getCurrentObjective());

                    if (car.justChangedLane && shouldUseCameraShake()) {
                        minorShakeTimeRemaining = MINOR_SHAKE_DURATION;
                        minorShakeMagnitude = Math.max(minorShakeMagnitude, LANE_CHANGE_SHAKE_STRENGTH);
                    }

                    updatePrimaryHud();
                    scoreHud.updateLevel(difficultySnapshot.level);
                    updateSpeedHud();

                    const currentComboMultiplier = scoreManager.getComboMultiplier();
                    if (currentComboMultiplier > previousComboMultiplier) {
                        if (shouldPlayVisualEffects()) {
                            effects.playComboEffect(currentComboMultiplier, car.group.position);
                        }
                        audio.play('combo', 0.5);

                        if (currentComboMultiplier >= COMBO_SHAKE_MULTIPLIER_THRESHOLD && shouldUseCameraShake()) {
                            minorShakeTimeRemaining = MINOR_SHAKE_DURATION;
                            minorShakeMagnitude = Math.max(minorShakeMagnitude, COMBO_SHAKE_STRENGTH);
                        }
                    }
                    previousComboMultiplier = currentComboMultiplier;

                    if (difficultySnapshot.level !== previousDifficultyLevel) {
                        previousDifficultyLevel = difficultySnapshot.level;
                        scoreHud.showEventBonus(`NIVEAU ${difficultySnapshot.level}`);
                    }

                    const collidedCar = findCollidingTrafficCar(car, traffic);
                    if (collidedCar) {
                        triggerGameOver(collidedCar);
                    }
                }
            }
        }

        updateSunFollow();
        updateVisibilityLights();
        road.userData.update(car);

        const speedRatio = car.getSpeedRatio();
        speedEffectOverlay.update(isGameOver || !shouldUseSpeedEffects() ? 0 : speedRatio);
        audio.updateEngine(speedRatio, {
            accelerating: controls.isAccelerating(),
            braking: controls.isBraking(),
            active: isGameStarted && !isGameOver && countdownTimeRemaining <= 0
        });

        effects.update(delta);

        cameraRoll = THREE.MathUtils.damp(cameraRoll, 0, CAMERA_ROLL_RETURN_SPEED, delta);

        camera.position.x = THREE.MathUtils.damp(
            camera.position.x,
            car.group.position.x,
            CAMERA_LATERAL_SMOOTHING,
            delta
        );

        const verticalBob = isGameStarted && !isGameOver
            ? Math.sin(elapsedTime * CAMERA_VERTICAL_BOB_FREQUENCY) * CAMERA_VERTICAL_BOB_AMPLITUDE * speedRatio
            : 0;
        camera.position.y = car.group.position.y + CAMERA_OFFSET_Y + verticalBob;
        camera.position.z = car.group.position.z + CAMERA_OFFSET_Z + speedRatio * CAMERA_MAX_PULLBACK;

        if (shakeTimeRemaining > 0 && shouldUseCameraShake()) {
            shakeTimeRemaining = Math.max(0, shakeTimeRemaining - delta);
            const shakeStrength = shakeTimeRemaining / IMPACT_SHAKE_DURATION;

            camera.position.x += (Math.random() - 0.5) * IMPACT_SHAKE_POSITION_STRENGTH * shakeStrength;
            camera.position.y += (Math.random() - 0.5) * IMPACT_SHAKE_POSITION_STRENGTH * shakeStrength;
        }

        if (minorShakeTimeRemaining > 0 && shouldUseCameraShake()) {
            minorShakeTimeRemaining = Math.max(0, minorShakeTimeRemaining - delta);
            const minorShakeStrength = (minorShakeTimeRemaining / MINOR_SHAKE_DURATION) * minorShakeMagnitude;

            camera.position.x += (Math.random() - 0.5) * minorShakeStrength;
            camera.position.y += (Math.random() - 0.5) * minorShakeStrength;

            if (minorShakeTimeRemaining === 0) {
                minorShakeMagnitude = 0;
            }
        }

        if (isGameStarted && !isGameOver && shouldUseCameraShake() && speedRatio > HIGH_SPEED_SHAKE_THRESHOLD) {
            const highSpeedFactor = (speedRatio - HIGH_SPEED_SHAKE_THRESHOLD) / (1 - HIGH_SPEED_SHAKE_THRESHOLD);
            camera.position.x += (Math.random() - 0.5) * HIGH_SPEED_SHAKE_STRENGTH * highSpeedFactor;
            camera.position.y += (Math.random() - 0.5) * HIGH_SPEED_SHAKE_STRENGTH * highSpeedFactor;
        }

        camera.lookAt(
            car.group.position.x,
            car.group.position.y + 0.5,
            car.group.position.z - CAMERA_LOOK_AHEAD
        );

        camera.rotation.z += cameraRoll;

        if (shakeTimeRemaining > 0 && shouldUseCameraShake()) {
            const shakeStrength = shakeTimeRemaining / IMPACT_SHAKE_DURATION;
            camera.rotation.z += (Math.random() - 0.5) * IMPACT_SHAKE_ROTATION_STRENGTH * shakeStrength;
        }

        const targetFov = CAMERA_BASE_FOV + speedRatio * CAMERA_MAX_FOV_BOOST;
        camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, CAMERA_FOV_SMOOTHING, delta);
        camera.updateProjectionMatrix();

        renderer.render(scene, camera);
    }

    animate();

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(getRenderPixelRatio());
    });

    window.addEventListener('keydown', (event) => {
        if (event.repeat) return;
        if (event.code !== 'Escape' && event.code !== 'KeyP') return;

        event.preventDefault();
        togglePause();
    });
}

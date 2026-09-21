import * as THREE from 'three';
import { LANE_WIDTH, LANE_COUNT, ROAD_WIDTH, ROAD_LENGTH } from './constants.js';

const SKY_COLOR = 0x9ecfe8;

const ROAD_START_BUFFER = 100;
const ROAD_CENTER_Z = -ROAD_LENGTH / 2 + ROAD_START_BUFFER;
const ROAD_SECTION_COUNT = 3;

// --- Bande d'arrêt d'urgence (nouveau) -------------------------------------
// Purement visuelle : ROAD_WIDTH (voies réellement jouables, utilisé par
// getLaneX/collisions/car.js pour les limites de déplacement) NE change
// PAS. Cette bande vient s'ajouter PAR-DESSUS, à l'extérieur des voies —
// la voiture du joueur ne peut donc jamais physiquement y rouler, elle est
// juste visible comme au bord d'une vraie autoroute.
const EMERGENCY_LANE_WIDTH = 2.2;

// Demi-largeur totale de la chaussée peinte (voies + bande d'arrêt
// d'urgence), de chaque côté du centre de la route.
const PAVED_HALF_WIDTH = ROAD_WIDTH / 2 + EMERGENCY_LANE_WIDTH;

// Largeur du bas-côté (transition chaussée → herbe), de chaque côté.
export const SHOULDER_WIDTH = 3;

// Distance du centre de la route jusqu'au bord extérieur du bas-côté :
// la frontière "tout ce qui est goudronné/gravillonné", au-delà de
// laquelle commence le terrain naturel. Exportée pour qu'environment.js
// (glissières, végétation, décor) place tout ce qui est hors chaussée à
// partir de ce même repère unique, sans redupliquer le calcul à plusieurs
// endroits — et sans oublier la bande d'arrêt d'urgence, qui pousse ce
// repère vers l'extérieur par rapport à avant.
export const OUTER_EDGE_OFFSET = PAVED_HALF_WIDTH + SHOULDER_WIDTH;

// --- Hauteurs Y de chaque surface du sol (route, bande d'arrêt d'urgence,
// bas-côté, marquages) -------------------------------------------------
// Centralisées ici pour qu'il soit facile de vérifier, en un coup d'œil,
// qu'aucune paire de surfaces qui se CHEVAUCHENT réellement en X/Z ne se
// retrouve à une hauteur quasi identique (cause classique de Z-fighting).
//
// Emprises en X de chaque famille de surface (voir createRoad) :
//   - route (voies)         : [-ROAD_WIDTH/2, ROAD_WIDTH/2]
//   - bande d'arrêt urgence : [ROAD_WIDTH/2, PAVED_HALF_WIDTH] (x2)
//   - bas-côtés             : [PAVED_HALF_WIDTH, PAVED_HALF_WIDTH + SHOULDER_WIDTH] (x2)
//   - bandes de terrain     : [OUTER_EDGE_OFFSET, +∞[ (x2, environment.js)
// Toutes ces surfaces se touchent bord à bord mais ne se CHEVAUCHENT
// jamais en X : un petit écart de hauteur entre elles suffit. La route et
// la bande d'arrêt d'urgence partagent donc la même hauteur (ROAD_SURFACE_Y)
// sans aucun risque, puisqu'elles ne sont jamais candidates aux mêmes
// pixels à l'écran.
// Les marquages au sol, eux, sont volontairement peints PAR-DESSUS la
// route (même emprise X/Z) : c'est le seul vrai chevauchement voulu, donc
// il reçoit une marge plus généreuse pour rester résolu par le depth
// buffer même à longue distance.
const SHOULDER_Y = 0.008;
const ROAD_SURFACE_Y = 0.01;
const ROAD_MARKINGS_Y = 0.035;

const POLE_SPACING = 25;
const POLE_HEIGHT = 4;
const POLE_RADIUS = 0.15;
const POLE_SIDE_OFFSET = OUTER_EDGE_OFFSET + 1.2;

const ROAD_STUD_SPACING = 24;
const ROAD_STUD_WIDTH = 0.16;
const ROAD_STUD_HEIGHT = 0.035;
const ROAD_STUD_LENGTH = 0.42;
const ROAD_STUD_Y = ROAD_MARKINGS_Y + 0.018;
const ROAD_STUD_GLOW_WIDTH = 0.58;
const ROAD_STUD_GLOW_LENGTH = 0.92;
const ROAD_STUD_GLOW_Y = ROAD_MARKINGS_Y + 0.026;
const ROAD_REFLECTOR_DAY_OPACITY = 0.04;
const ROAD_REFLECTOR_NIGHT_OPACITY = 0.42;
const ROAD_EDGE_REFLECTOR_NIGHT_OPACITY = 0.52;

// --- Relief de terrain -----------------------------------------------------
// Deux bandes texturées, une de chaque côté de la route, avec un léger
// relief (collines douces) qui s'estompe progressivement vers 0 sur les
// premiers mètres pour se raccorder proprement au bas-côté plat. Statique
// (créé une seule fois, jamais recyclé) : le tracé fait ROAD_LENGTH (6000
// unités) donc pas besoin d'un système de recyclage comme le trafic.
const TERRAIN_STRIP_WIDTH = 420;
const TERRAIN_WIDTH_SEGMENTS = 18;
const TERRAIN_LENGTH_SEGMENTS = 60;
const TERRAIN_BLEND_WIDTH = 90; // distance sur laquelle le relief apparaît progressivement

function randomBetween(min, max) {
    return min + Math.random() * (max - min);
}

function createDashTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 64;

    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height * 0.5);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;

    return texture;
}

/**
 * Texture procédurale d'asphalte : fond gris foncé, grain fin, et quelques
 * taches de "réparation" (bitume ravalé) pour casser l'effet de surface
 * parfaitement uniforme.
 */
function createAsphaltTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;

    const context = canvas.getContext('2d');
    context.fillStyle = '#38383b';
    context.fillRect(0, 0, canvas.width, canvas.height);

    const speckleCount = 3200;
    for (let i = 0; i < speckleCount; i++) {
        const shade = 38 + Math.floor(Math.random() * 46);
        context.fillStyle = `rgb(${shade}, ${shade}, ${shade + 2})`;
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const size = 0.6 + Math.random() * 1.8;
        context.fillRect(x, y, size, size);
    }

    // Taches de réparation : quelques dégradés radiaux discrets.
    const patchCount = 5;
    for (let i = 0; i < patchCount; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const radius = 14 + Math.random() * 26;
        const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
        const shade = 44 + Math.floor(Math.random() * 20);
        gradient.addColorStop(0, `rgba(${shade}, ${shade}, ${shade + 3}, 0.55)`);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;

    return texture;
}

/**
 * Texture procédurale de la bande d'arrêt d'urgence : même famille que
 * l'asphalte principal (cohérence visuelle : ça reste du bitume), mais
 * légèrement plus clair/plus "usé" pour qu'on distingue bien la bande sans
 * avoir besoin d'une ligne de marquage supplémentaire — comme sur une
 * vraie autoroute, où la BAU est souvent un poil plus fatiguée que les
 * voies de circulation.
 */
function createEmergencyLaneTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;

    const context = canvas.getContext('2d');
    context.fillStyle = '#47474b';
    context.fillRect(0, 0, canvas.width, canvas.height);

    const speckleCount = 2600;
    for (let i = 0; i < speckleCount; i++) {
        const shade = 50 + Math.floor(Math.random() * 50);
        context.fillStyle = `rgb(${shade}, ${shade}, ${shade + 2})`;
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const size = 0.6 + Math.random() * 1.8;
        context.fillRect(x, y, size, size);
    }

    const crackCount = 10;
    for (let i = 0; i < crackCount; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const radius = 8 + Math.random() * 16;
        const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, 'rgba(30, 30, 32, 0.4)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;

    return texture;
}

/**
 * Texture procédurale du bas-côté (gravier/terre).
 */
function createShoulderTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;

    const context = canvas.getContext('2d');
    context.fillStyle = '#8a7a5c';
    context.fillRect(0, 0, canvas.width, canvas.height);

    const speckleCount = 700;
    for (let i = 0; i < speckleCount; i++) {
        const shade = 110 + Math.floor(Math.random() * 50);
        context.fillStyle = `rgb(${shade}, ${Math.floor(shade * 0.88)}, ${Math.floor(shade * 0.62)})`;
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const size = 0.8 + Math.random() * 2;
        context.fillRect(x, y, size, size);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;

    return texture;
}

/**
 * Texture procédurale d'herbe (remplace l'ancien vert plat du sol).
 */
function createGrassTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;

    const context = canvas.getContext('2d');
    context.fillStyle = '#3f7a3a';
    context.fillRect(0, 0, canvas.width, canvas.height);

    const speckleCount = 1400;
    for (let i = 0; i < speckleCount; i++) {
        const shade = 40 + Math.floor(Math.random() * 55);
        const green = shade + 60;
        context.fillStyle = `rgb(${Math.floor(shade * 0.6)}, ${green}, ${Math.floor(shade * 0.5)})`;
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const size = 0.8 + Math.random() * 2.2;
        context.fillRect(x, y, size, size);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;

    return texture;
}

function createLaneMarking(xPosition) {
    const dashPeriod = 10;
    const texture = createDashTexture();
    texture.repeat.set(1, ROAD_LENGTH / dashPeriod);

    const geometry = new THREE.PlaneGeometry(0.3, ROAD_LENGTH);
    const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true
    });

    const line = new THREE.Mesh(geometry, material);
    line.rotation.x = -Math.PI / 2;
    line.position.set(xPosition, ROAD_MARKINGS_Y, ROAD_CENTER_Z);

    return line;
}

/**
 * Ligne blanche CONTINUE. Utilisée pour la ligne de rive entre la dernière
 * voie et la bande d'arrêt d'urgence (comme sur une vraie autoroute).
 */
function createEdgeLine(xPosition) {
    const geometry = new THREE.PlaneGeometry(0.25, ROAD_LENGTH);
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });

    const line = new THREE.Mesh(geometry, material);
    line.rotation.x = -Math.PI / 2;
    line.position.set(xPosition, ROAD_MARKINGS_Y, ROAD_CENTER_Z);

    return line;
}

/**
 * Bande d'arrêt d'urgence d'un seul côté (side = -1 ou 1). Vient se coller
 * directement à l'extérieur des voies jouables (ROAD_WIDTH), avant le
 * bas-côté.
 */
function createEmergencyLane(side) {
    const geometry = new THREE.PlaneGeometry(EMERGENCY_LANE_WIDTH, ROAD_LENGTH);
    const texture = createEmergencyLaneTexture();
    texture.repeat.set(EMERGENCY_LANE_WIDTH / 2, ROAD_LENGTH / 4);

    const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.95 });
    const lane = new THREE.Mesh(geometry, material);
    lane.rotation.x = -Math.PI / 2;
    lane.receiveShadow = true;

    const xPosition = side * (ROAD_WIDTH / 2 + EMERGENCY_LANE_WIDTH / 2);
    lane.position.set(xPosition, ROAD_SURFACE_Y, ROAD_CENTER_Z);

    return lane;
}

/**
 * Bande de bas-côté (chaussée → herbe) d'un seul côté. Poussée vers
 * l'extérieur par la présence de la bande d'arrêt d'urgence.
 */
function createShoulder(side) {
    const geometry = new THREE.PlaneGeometry(SHOULDER_WIDTH, ROAD_LENGTH);
    const texture = createShoulderTexture();
    texture.repeat.set(SHOULDER_WIDTH / 2, ROAD_LENGTH / 6);

    const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 1 });
    const shoulder = new THREE.Mesh(geometry, material);
    shoulder.rotation.x = -Math.PI / 2;
    shoulder.receiveShadow = true;

    const xPosition = side * (PAVED_HALF_WIDTH + SHOULDER_WIDTH / 2);
    shoulder.position.set(xPosition, SHOULDER_Y, ROAD_CENTER_Z);

    return shoulder;
}

/**
 * Hauteur de relief à une distance donnée du bord de route, pour une
 * position Z locale donnée. Bruit purement sinusoïdal (déterministe, aucune
 * dépendance externe), avec un fondu (smoothstep) proche de la route pour
 * rester plat au raccord avec le bas-côté.
 */
function terrainHeight(distanceFromRoad, zLocal) {
    const blend = THREE.MathUtils.smoothstep(distanceFromRoad, 0, TERRAIN_BLEND_WIDTH);
    const noise =
        Math.sin(distanceFromRoad * 0.015 + zLocal * 0.012) * 2.2 +
        Math.sin(distanceFromRoad * 0.05 - zLocal * 0.03) * 1.1 +
        Math.sin(distanceFromRoad * 0.008 + zLocal * 0.02) * 2.6;
    return noise * blend;
}

/**
 * Construit une bande de terrain vallonné d'un côté de la route (side = -1
 * ou 1). Géométrie déformée une seule fois à la construction : aucun calcul
 * pendant la partie.
 */
function buildTerrainStrip(side) {
    const geometry = new THREE.PlaneGeometry(
        TERRAIN_STRIP_WIDTH,
        ROAD_LENGTH,
        TERRAIN_WIDTH_SEGMENTS,
        TERRAIN_LENGTH_SEGMENTS
    );

    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
        const localX = position.getX(i);
        const localZ = position.getY(i);
        const distanceFromRoad = TERRAIN_STRIP_WIDTH / 2 + side * localX;
        position.setZ(i, terrainHeight(distanceFromRoad, localZ));
    }
    geometry.computeVertexNormals();

    const texture = createGrassTexture();
    texture.repeat.set(TERRAIN_STRIP_WIDTH / 12, ROAD_LENGTH / 30);

    const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 1 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;

    const innerEdge = OUTER_EDGE_OFFSET;
    const centerX = side * (innerEdge + TERRAIN_STRIP_WIDTH / 2);
    mesh.position.set(centerX, -0.05, ROAD_CENTER_Z);

    return mesh;
}

/**
 * Crée tous les poteaux de bord de route (des deux côtés) en une seule
 * InstancedMesh.
 */
function createRoadsidePoles() {
    const poleCount = Math.floor(ROAD_LENGTH / POLE_SPACING);
    const geometry = new THREE.CylinderGeometry(POLE_RADIUS, POLE_RADIUS, POLE_HEIGHT, 6);
    const material = new THREE.MeshStandardMaterial({ color: 0xf2f2f2 });

    const poles = new THREE.InstancedMesh(geometry, material, poleCount * 2);
    poles.castShadow = true;

    const dummy = new THREE.Object3D();
    let instanceIndex = 0;

    for (let i = 0; i < poleCount; i++) {
        const z = ROAD_START_BUFFER - i * POLE_SPACING;

        for (const side of [-1, 1]) {
            dummy.position.set(side * POLE_SIDE_OFFSET, POLE_HEIGHT / 2, z);
            dummy.updateMatrix();
            poles.setMatrixAt(instanceIndex, dummy.matrix);
            instanceIndex++;
        }
    }

    return poles;
}

function createRoadStudLayer({
    xPositions,
    studColor,
    glowColor,
    nightOpacity,
    reflectorMaterials
}) {
    const group = new THREE.Group();
    const studsPerLine = Math.floor(ROAD_LENGTH / ROAD_STUD_SPACING);
    const totalCount = studsPerLine * xPositions.length;

    const studGeometry = new THREE.BoxGeometry(ROAD_STUD_WIDTH, ROAD_STUD_HEIGHT, ROAD_STUD_LENGTH);
    const studMaterial = new THREE.MeshBasicMaterial({
        color: studColor,
        toneMapped: false
    });
    const studs = new THREE.InstancedMesh(studGeometry, studMaterial, totalCount);
    studs.frustumCulled = false;

    const glowGeometry = new THREE.PlaneGeometry(ROAD_STUD_GLOW_WIDTH, ROAD_STUD_GLOW_LENGTH);
    const glowMaterial = new THREE.MeshBasicMaterial({
        color: glowColor,
        transparent: true,
        opacity: ROAD_REFLECTOR_DAY_OPACITY,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false
    });
    const glows = new THREE.InstancedMesh(glowGeometry, glowMaterial, totalCount);
    glows.frustumCulled = false;
    glows.renderOrder = 2;

    reflectorMaterials.push({
        material: glowMaterial,
        dayOpacity: ROAD_REFLECTOR_DAY_OPACITY,
        nightOpacity
    });

    const studDummy = new THREE.Object3D();
    const glowDummy = new THREE.Object3D();
    glowDummy.rotation.x = -Math.PI / 2;

    let instanceIndex = 0;

    for (let i = 0; i < studsPerLine; i++) {
        const z = ROAD_START_BUFFER - i * ROAD_STUD_SPACING;

        for (const x of xPositions) {
            studDummy.position.set(x, ROAD_STUD_Y, z);
            studDummy.updateMatrix();
            studs.setMatrixAt(instanceIndex, studDummy.matrix);

            glowDummy.position.set(x, ROAD_STUD_GLOW_Y, z);
            glowDummy.updateMatrix();
            glows.setMatrixAt(instanceIndex, glowDummy.matrix);

            instanceIndex++;
        }
    }

    group.add(studs);
    group.add(glows);
    return group;
}

/**
 * Petits plots réfléchissants au sol : ils donnent des repères lisibles la
 * nuit et renforcent l'impression de vitesse, sans ajouter de vraies lumières.
 */
function createRoadStuds(reflectorMaterials) {
    const laneDividerXs = [];
    for (let i = 1; i < LANE_COUNT; i++) {
        laneDividerXs.push(-ROAD_WIDTH / 2 + i * LANE_WIDTH);
    }

    const edgeOffset = ROAD_WIDTH / 2 - 0.55;
    const group = new THREE.Group();

    group.add(createRoadStudLayer({
        xPositions: laneDividerXs,
        studColor: 0xf7fbff,
        glowColor: 0xcfe8ff,
        nightOpacity: ROAD_REFLECTOR_NIGHT_OPACITY,
        reflectorMaterials
    }));

    group.add(createRoadStudLayer({
        xPositions: [-edgeOffset, edgeOffset],
        studColor: 0xffcf72,
        glowColor: 0xffb64a,
        nightOpacity: ROAD_EDGE_REFLECTOR_NIGHT_OPACITY,
        reflectorMaterials
    }));

    return group;
}

function buildRoadSection(reflectorMaterials) {
    // NOTE (fix Z-fighting) : il n'y a PAS de grand plan "ground" plat ici.
    // Route (voies), bande d'arrêt d'urgence, bas-côtés et bandes de
    // terrain couvrent, à elles seules et SANS jamais se chevaucher en X,
    // la totalité du sol visible — il n'y a donc pas de plan "ground"
    // séparé en dessous, ni de nouvelle surface coplanaire réintroduite ici.
    const section = new THREE.Group();

    section.add(buildTerrainStrip(-1));
    section.add(buildTerrainStrip(1));

    section.add(createShoulder(-1));
    section.add(createShoulder(1));

    section.add(createEmergencyLane(-1));
    section.add(createEmergencyLane(1));

    const roadGeometry = new THREE.PlaneGeometry(ROAD_WIDTH, ROAD_LENGTH);
    const asphaltTexture = createAsphaltTexture();
    asphaltTexture.repeat.set(ROAD_WIDTH / 3, ROAD_LENGTH / 3);
    const roadMaterial = new THREE.MeshStandardMaterial({ map: asphaltTexture, roughness: 0.9 });
    const roadSurface = new THREE.Mesh(roadGeometry, roadMaterial);
    roadSurface.rotation.x = -Math.PI / 2;
    roadSurface.position.set(0, ROAD_SURFACE_Y, ROAD_CENTER_Z);
    roadSurface.receiveShadow = true;
    section.add(roadSurface);

    for (let i = 1; i < LANE_COUNT; i++) {
        const xPosition = -ROAD_WIDTH / 2 + i * LANE_WIDTH;
        section.add(createLaneMarking(xPosition));
    }

    // Ligne de rive continue entre la dernière voie et la bande d'arrêt
    // d'urgence (remplace l'ancienne ligne "de bord de route" : la
    // position ne change pas, mais son rôle est maintenant celui d'une
    // vraie ligne de rive puisqu'il y a quelque chose au-delà).
    const edgeLineOffset = ROAD_WIDTH / 2 - 0.18;
    section.add(createEdgeLine(-edgeLineOffset));
    section.add(createEdgeLine(edgeLineOffset));

    section.add(createRoadStuds(reflectorMaterials));

    section.add(createRoadsidePoles());

    return section;
}

function getRoadSectionIndex(playerZ) {
    return Math.floor((ROAD_START_BUFFER - playerZ) / ROAD_LENGTH);
}

function setRoadSectionIndex(section, sectionIndex) {
    section.userData.roadSectionIndex = sectionIndex;
    section.position.z = -sectionIndex * ROAD_LENGTH;
}

function placeRoadSectionsAround(sections, currentSectionIndex) {
    for (let i = 0; i < sections.length; i++) {
        setRoadSectionIndex(sections[i], currentSectionIndex + i - 1);
    }
}

export function createRoad(scene) {
    // Fog légèrement étendu pour fondre l'horizon (montagnes/skyline
    // lointaines) sans jamais "manger" la route de près.
    scene.fog = new THREE.Fog(SKY_COLOR, 70, 400);

    const group = new THREE.Group();
    const sections = [];
    const reflectorMaterials = [];

    for (let i = 0; i < ROAD_SECTION_COUNT; i++) {
        const section = buildRoadSection(reflectorMaterials);
        group.add(section);
        sections.push(section);
    }

    let currentRoadSectionIndex = 0;
    placeRoadSectionsAround(sections, currentRoadSectionIndex);

    group.userData.update = (playerCar) => {
        const nextSectionIndex = getRoadSectionIndex(playerCar.group.position.z);
        if (nextSectionIndex === currentRoadSectionIndex) return;

        if (Math.abs(nextSectionIndex - currentRoadSectionIndex) > 1) {
            placeRoadSectionsAround(sections, nextSectionIndex);
            currentRoadSectionIndex = nextSectionIndex;
            return;
        }

        const minVisibleSectionIndex = nextSectionIndex - 1;
        const maxVisibleSectionIndex = nextSectionIndex + 1;

        for (const section of sections) {
            if (section.userData.roadSectionIndex < minVisibleSectionIndex) {
                setRoadSectionIndex(section, maxVisibleSectionIndex);
            } else if (section.userData.roadSectionIndex > maxVisibleSectionIndex) {
                setRoadSectionIndex(section, minVisibleSectionIndex);
            }
        }

        currentRoadSectionIndex = nextSectionIndex;
    };

    group.userData.setReflectorIntensity = (intensity = 0) => {
        const clampedIntensity = THREE.MathUtils.clamp(intensity, 0, 1);

        for (const { material, dayOpacity, nightOpacity } of reflectorMaterials) {
            material.opacity = THREE.MathUtils.lerp(dayOpacity, nightOpacity, clampedIntensity);
        }
    };

    scene.add(group);

    return group;
}

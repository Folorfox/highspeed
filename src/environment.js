import * as THREE from 'three';
import { ROAD_LENGTH } from './constants.js';
import { OUTER_EDGE_OFFSET } from './road.js';

// Décor dynamique (arbres, buissons, rochers, panneaux, lampadaires,
// glissières) : ce module est TOTALEMENT indépendant du trafic, des
// collisions et du gameplay. Il ne connaît que la position de la voiture
// du joueur, pour savoir où recycler ses éléments — exactement comme
// TrafficManager recycle ses voitures, mais sans aucune notion de voie, de
// vitesse ou de détection de collision.
//
// OUTER_EDGE_OFFSET (importé de road.js) est le repère unique "bord
// extérieur de tout ce qui est goudronné/gravillonné" (voies + bande
// d'arrêt d'urgence + bas-côté) : tout ce module place son contenu à
// partir de CE repère, pour ne jamais dupliquer le calcul ni risquer un
// décalage si road.js change un jour sa largeur de chaussée.
//
// Ce module gère aussi : dôme de ciel en dégradé + montagnes/skyline
// lointaines. Ces éléments sont STATIQUES (créés une seule fois) car le
// tracé fait ROAD_LENGTH (6000 unités) : pas besoin de recyclage comme pour
// le trafic, donc aucun coût par frame.

function randomBetween(min, max) {
    return min + Math.random() * (max - min);
}

function pickWeighted(entries) {
    const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = Math.random() * total;
    for (const entry of entries) {
        if (roll < entry.weight) return entry.kind;
        roll -= entry.weight;
    }
    return entries[entries.length - 1].kind;
}

// --- Texture d'ombre au sol partagée --------------------------------------
function createShadowBlobTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;

    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.85)');
    gradient.addColorStop(0.7, 'rgba(0, 0, 0, 0.45)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    return new THREE.CanvasTexture(canvas);
}

// --- Géométries et matériaux partagés, créés UNE SEULE FOIS --------------
const shadowBlobGeometry = new THREE.CircleGeometry(1, 16);
const shadowMaterial = new THREE.MeshBasicMaterial({
    map: createShadowBlobTexture(),
    transparent: true,
    depthWrite: false,
    opacity: 0.4
});

const treeTrunkGeometry = new THREE.CylinderGeometry(0.14, 0.18, 1.4, 7);
const treeFoliageGeometry = new THREE.IcosahedronGeometry(1, 0);
const bushGeometry = new THREE.IcosahedronGeometry(0.55, 0);
const rockGeometry = new THREE.DodecahedronGeometry(0.55, 0);
const signPostGeometry = new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6);
const signPanelGeometry = new THREE.BoxGeometry(1.35, 0.76, 0.05);
const signSmallPanelGeometry = new THREE.BoxGeometry(0.95, 0.58, 0.05);
const signStripeGeometry = new THREE.BoxGeometry(0.72, 0.055, 0.025);
const signShortStripeGeometry = new THREE.BoxGeometry(0.42, 0.055, 0.025);
const signExitTabGeometry = new THREE.BoxGeometry(0.72, 0.18, 0.03);
const signArrowHeadGeometry = new THREE.ConeGeometry(0.1, 0.22, 3);
const signRoundFaceGeometry = new THREE.CircleGeometry(0.36, 32);
const signRoundBorderGeometry = new THREE.RingGeometry(0.29, 0.37, 32);
const signNumberBarGeometry = new THREE.BoxGeometry(0.06, 0.24, 0.02);

const lampPoleGeometry = new THREE.CylinderGeometry(0.06, 0.08, 3.2, 7);
const lampArmGeometry = new THREE.BoxGeometry(0.7, 0.06, 0.06);
const lampHeadGeometry = new THREE.SphereGeometry(0.18, 8, 8);

const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x5b3a29, roughness: 0.9 });

const foliageMaterials = [
    new THREE.MeshStandardMaterial({ color: 0x2f7d32, roughness: 0.85 }),
    new THREE.MeshStandardMaterial({ color: 0x3f9142, roughness: 0.85 }),
    new THREE.MeshStandardMaterial({ color: 0x256b29, roughness: 0.85 })
];

const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x8a8a83, roughness: 0.95 });
const signPostMaterial = new THREE.MeshStandardMaterial({ color: 0xb5b5b5, roughness: 0.5, metalness: 0.4 });

const signBlueMaterial = new THREE.MeshStandardMaterial({ color: 0x1c5fbf, roughness: 0.4 });
const signWhiteMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
const signYellowMaterial = new THREE.MeshBasicMaterial({ color: 0xf2c200, toneMapped: false });
const signRedMaterial = new THREE.MeshBasicMaterial({ color: 0xd6002a, toneMapped: false });
const signBlackMaterial = new THREE.MeshBasicMaterial({ color: 0x151515, toneMapped: false });

const lampMaterial = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.5, metalness: 0.55 });
const lampHeadMaterial = new THREE.MeshStandardMaterial({
    color: 0xfff4d6,
    emissive: 0xffe6a0,
    emissiveIntensity: 0.7,
    roughness: 0.4
});

const guardrailMetalMaterial = new THREE.MeshStandardMaterial({ color: 0xaeb4b8, roughness: 0.4, metalness: 0.6 });

function addShadowBlob(group, radius) {
    const shadow = new THREE.Mesh(shadowBlobGeometry, shadowMaterial);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.006;
    shadow.scale.set(radius, radius, 1);
    group.add(shadow);
}

// --- Constructeurs de décor (un Group complet par type) -------------------
function buildTree() {
    const group = new THREE.Group();
    addShadowBlob(group, 0.9);

    const trunk = new THREE.Mesh(treeTrunkGeometry, trunkMaterial);
    trunk.position.y = 0.7;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    group.add(trunk);

    const foliageMaterial = foliageMaterials[Math.floor(Math.random() * foliageMaterials.length)];
    const foliage = new THREE.Mesh(treeFoliageGeometry, foliageMaterial);
    foliage.position.y = 1.75;
    foliage.scale.set(0.9, 1.15, 0.9);
    foliage.castShadow = true;
    foliage.receiveShadow = true;
    group.add(foliage);

    return group;
}

function buildBush() {
    const group = new THREE.Group();
    addShadowBlob(group, 0.55);

    const bushMaterial = foliageMaterials[Math.floor(Math.random() * foliageMaterials.length)];
    const bush = new THREE.Mesh(bushGeometry, bushMaterial);
    bush.position.y = 0.4;
    bush.scale.set(1, 0.75, 1);
    bush.castShadow = true;
    bush.receiveShadow = true;
    group.add(bush);

    return group;
}

function buildRock() {
    const group = new THREE.Group();
    addShadowBlob(group, 0.5);

    const rock = new THREE.Mesh(rockGeometry, rockMaterial);
    rock.position.y = 0.3;
    rock.castShadow = true;
    rock.receiveShadow = true;
    group.add(rock);

    return group;
}

function addSignStripe(group, x, y, width = 0.72) {
    const geometry = width < 0.6 ? signShortStripeGeometry : signStripeGeometry;
    const stripe = new THREE.Mesh(geometry, signWhiteMaterial);
    stripe.position.set(x, y, 0.04);
    group.add(stripe);
}

function addSignArrow(group, x, y) {
    const arrowStem = new THREE.Mesh(signShortStripeGeometry, signWhiteMaterial);
    arrowStem.position.set(x - 0.08, y, 0.04);
    group.add(arrowStem);

    const arrowHead = new THREE.Mesh(signArrowHeadGeometry, signWhiteMaterial);
    arrowHead.position.set(x + 0.18, y, 0.045);
    arrowHead.rotation.z = -Math.PI / 2;
    group.add(arrowHead);
}

function addRoundSpeedSign(group) {
    const face = new THREE.Mesh(signRoundFaceGeometry, signWhiteMaterial);
    face.position.set(0, 1.5, 0.04);
    group.add(face);

    const border = new THREE.Mesh(signRoundBorderGeometry, signRedMaterial);
    border.position.set(0, 1.5, 0.045);
    group.add(border);

    const barLeft = new THREE.Mesh(signNumberBarGeometry, signBlackMaterial);
    barLeft.position.set(-0.13, 1.5, 0.052);
    barLeft.rotation.z = -0.18;
    group.add(barLeft);

    const barMiddle = new THREE.Mesh(signNumberBarGeometry, signBlackMaterial);
    barMiddle.position.set(0, 1.5, 0.052);
    group.add(barMiddle);

    const barRight = new THREE.Mesh(signNumberBarGeometry, signBlackMaterial);
    barRight.position.set(0.13, 1.5, 0.052);
    barRight.rotation.z = 0.18;
    group.add(barRight);
}

function buildDirectionSign() {
    const group = new THREE.Group();
    addShadowBlob(group, 0.35);

    const post = new THREE.Mesh(signPostGeometry, signPostMaterial);
    post.position.y = 0.8;
    post.castShadow = true;
    group.add(post);

    const panel = new THREE.Mesh(signPanelGeometry, signBlueMaterial);
    panel.position.y = 1.5;
    panel.castShadow = true;
    group.add(panel);

    addSignStripe(group, -0.18, 1.66, 0.72);
    addSignStripe(group, -0.26, 1.5, 0.42);
    addSignArrow(group, 0.34, 1.34);

    if (Math.random() < 0.5) {
        const exitTab = new THREE.Mesh(signExitTabGeometry, signYellowMaterial);
        exitTab.position.set(-0.22, 1.24, 0.055);
        group.add(exitTab);
    }

    return group;
}

function buildWarningSign() {
    const group = new THREE.Group();
    addShadowBlob(group, 0.35);

    const post = new THREE.Mesh(signPostGeometry, signPostMaterial);
    post.position.y = 0.8;
    post.castShadow = true;
    group.add(post);

    const panel = new THREE.Mesh(signSmallPanelGeometry, signYellowMaterial);
    panel.position.y = 1.5;
    panel.rotation.z = Math.PI / 4;
    panel.castShadow = true;
    group.add(panel);

    const symbol = new THREE.Mesh(signNumberBarGeometry, signBlackMaterial);
    symbol.position.set(0, 1.5, 0.06);
    symbol.scale.set(1.1, 1.4, 1);
    group.add(symbol);

    return group;
}

function buildSpeedSign() {
    const group = new THREE.Group();
    addShadowBlob(group, 0.32);

    const post = new THREE.Mesh(signPostGeometry, signPostMaterial);
    post.position.y = 0.8;
    post.castShadow = true;
    group.add(post);

    addRoundSpeedSign(group);

    return group;
}

function buildSign() {
    const variant = pickWeighted([
        { kind: 'direction', weight: 4 },
        { kind: 'speed', weight: 3 },
        { kind: 'warning', weight: 2 }
    ]);

    if (variant === 'speed') return buildSpeedSign();
    if (variant === 'warning') return buildWarningSign();
    return buildDirectionSign();
}

/**
 * Lampadaire routier : poteau + bras + tête lumineuse (matériau émissif
 * uniquement — pas de vraie THREE.Light, pour ne rien ajouter au coût des
 * ombres portées). Contrairement aux arbres/buissons/rochers (symétriques,
 * rotation totalement aléatoire), le bras doit être orienté vers la route :
 * voir placeDecorSlot, qui traite ce kind à part pour cette raison.
 */
function buildLamp() {
    const group = new THREE.Group();
    addShadowBlob(group, 0.3);

    const pole = new THREE.Mesh(lampPoleGeometry, lampMaterial);
    pole.position.y = 1.6;
    pole.castShadow = true;
    group.add(pole);

    const arm = new THREE.Mesh(lampArmGeometry, lampMaterial);
    arm.position.set(0.35, 3.15, 0);
    group.add(arm);

    const head = new THREE.Mesh(lampHeadGeometry, lampHeadMaterial);
    head.position.set(0.68, 3.05, 0);
    head.castShadow = true;
    group.add(head);

    return group;
}

const DECOR_BUILDERS = {
    tree: buildTree,
    bush: buildBush,
    rock: buildRock,
    sign: buildSign,
    lamp: buildLamp
};

// Le lampadaire reste volontairement rare ("certaines portions" plutôt que
// partout) : poids faible par rapport aux autres éléments.
const DECOR_KIND_WEIGHTS = [
    { kind: 'tree', weight: 4 },
    { kind: 'bush', weight: 3 },
    { kind: 'rock', weight: 2 },
    { kind: 'sign', weight: 1 },
    { kind: 'lamp', weight: 0.6 },
    { kind: null, weight: 3.4 }
];

const DECOR_LATERAL_RANGE = { min: 1.5, max: 13 };

const DECOR_SLOT_SPACING = 16;
const DECOR_MIN_SPAWN_AHEAD = 40;
const DECOR_SPAWN_AHEAD = 260;
const DECOR_DESPAWN_BEHIND = 40;

/**
 * Un emplacement fixe du pool de décor. `side` et `kind` ne changent JAMAIS
 * après construction : seuls position, rotation et échelle sont retirés au
 * sort à chaque recyclage.
 */
class DecorSlot {
    constructor(side) {
        this.side = side; // -1 = côté gauche, 1 = côté droit
        this.kind = pickWeighted(DECOR_KIND_WEIGHTS);

        const builder = this.kind ? DECOR_BUILDERS[this.kind] : null;
        this.group = builder ? builder() : new THREE.Group();
        this.group.visible = Boolean(this.kind);

        this.group.position.set(0, 0, 1000000);
    }
}

function placeDecorSlot(slot, playerCar, aheadDistanceOverride = null) {
    const aheadDistance = aheadDistanceOverride ?? randomBetween(DECOR_MIN_SPAWN_AHEAD, DECOR_SPAWN_AHEAD);
    const lateralDistance = randomBetween(DECOR_LATERAL_RANGE.min, DECOR_LATERAL_RANGE.max);
    const x = slot.side * (OUTER_EDGE_OFFSET + lateralDistance);
    const z = playerCar.group.position.z - aheadDistance;

    slot.group.position.set(x, 0, z);

    // Les lampadaires ont un bras directionnel : il doit pointer vers la
    // route, pas dans une direction aléatoire (tous les autres kinds sont
    // visuellement symétriques, donc une rotation aléatoire leur va bien).
    if (slot.kind === 'lamp') {
        slot.group.rotation.y = slot.side === 1 ? Math.PI : 0;
    } else if (slot.kind === 'sign') {
        slot.group.rotation.y = 0;
    } else {
        slot.group.rotation.y = Math.random() * Math.PI * 2;
    }

    const scaleJitter = 0.8 + Math.random() * 0.5;
    slot.group.scale.setScalar(scaleJitter);
}

// --- Glissières de sécurité -------------------------------------------------
const GUARDRAIL_SEGMENT_LENGTH = 9;
const GUARDRAIL_SEGMENT_GAP = 1;
const GUARDRAIL_SPACING = GUARDRAIL_SEGMENT_LENGTH + GUARDRAIL_SEGMENT_GAP;
const GUARDRAIL_MIN_SPAWN_AHEAD = 20;
const GUARDRAIL_SPAWN_AHEAD = 260;
const GUARDRAIL_DESPAWN_BEHIND = 20;

const GUARDRAIL_BLOCK_LENGTH = 70;
// Quasi-continues des deux côtés (demande explicite) : on garde le même
// système de blocs pseudo-aléatoires (pas d'état mémorisé, cohérent quel
// que soit le moment où un segment est recyclé à cette position), mais
// avec une présence très majoritaire. Les rares coupures restantes évitent
// un mur totalement uniforme sur 6000 unités, sans casser l'impression de
// continuité demandée.
const GUARDRAIL_PRESENCE_RATIO = 0.93;

const guardrailPostGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.7, 6);
const guardrailBeamGeometry = new THREE.BoxGeometry(GUARDRAIL_SEGMENT_LENGTH, 0.14, 0.05);

/**
 * Détermine si une glissière est présente à une position Z donnée, pour un
 * côté donné. Fonction PURE (aucun état mémorisé) : cohérente quel que soit
 * le moment où un segment est recyclé à cette position.
 */
function isGuardrailBlockActive(worldZ, side) {
    const blockIndex = Math.floor(worldZ / GUARDRAIL_BLOCK_LENGTH);
    const seed = Math.sin(blockIndex * 12.9898 + side * 78.233) * 43758.5453;
    const fractional = seed - Math.floor(seed);
    return fractional < GUARDRAIL_PRESENCE_RATIO;
}

function buildGuardrailSegment() {
    const group = new THREE.Group();

    const postLeft = new THREE.Mesh(guardrailPostGeometry, guardrailMetalMaterial);
    postLeft.position.set(-GUARDRAIL_SEGMENT_LENGTH / 2 + 0.3, 0.35, 0);
    postLeft.castShadow = true;
    postLeft.receiveShadow = true;
    group.add(postLeft);

    const postRight = new THREE.Mesh(guardrailPostGeometry, guardrailMetalMaterial);
    postRight.position.set(GUARDRAIL_SEGMENT_LENGTH / 2 - 0.3, 0.35, 0);
    postRight.castShadow = true;
    postRight.receiveShadow = true;
    group.add(postRight);

    const beam = new THREE.Mesh(guardrailBeamGeometry, guardrailMetalMaterial);
    beam.position.set(0, 0.55, 0);
    beam.castShadow = true;
    beam.receiveShadow = true;
    group.add(beam);

    return group;
}

class GuardrailSlot {
    constructor(side) {
        this.side = side;
        this.group = buildGuardrailSegment();
        this.group.rotation.y = Math.PI / 2;
        this.group.position.set(0, 0, 1000000);
    }
}

function placeGuardrailSlot(slot, playerCar, aheadDistanceOverride = null) {
    const aheadDistance = aheadDistanceOverride ?? randomBetween(GUARDRAIL_MIN_SPAWN_AHEAD, GUARDRAIL_SPAWN_AHEAD);
    const z = playerCar.group.position.z - aheadDistance;
    const x = slot.side * (OUTER_EDGE_OFFSET - 0.2);

    slot.group.position.set(x, 0, z);
    slot.group.visible = isGuardrailBlockActive(z, slot.side);
}

function computeSlotCount(spawnAhead, despawnBehind, spacing) {
    return Math.ceil((spawnAhead + despawnBehind) / spacing) + 2;
}

// --- Ciel en dégradé -------------------------------------------------------
// Grand dôme (BackSide) avec une couleur par sommet : bleu profond au
// zénith, plus clair vers l'horizon. Suit la voiture chaque frame (voir
// update()) pour ne jamais être "dépassé" malgré ses 500 unités de rayon.
function applySkyDomeGradient(dome, colorTop, colorHorizon) {
    const positions = dome.geometry.attributes.position;
    const colors = dome.geometry.attributes.color;

    for (let i = 0; i < positions.count; i++) {
        const y = positions.getY(i);
        const t = THREE.MathUtils.clamp(y / 500 + 0.12, 0, 1);
        const c = colorHorizon.clone().lerp(colorTop, t);
        colors.setXYZ(i, c.r, c.g, c.b);
    }

    colors.needsUpdate = true;
}

function createSkyDome(scene) {
    const geometry = new THREE.SphereGeometry(500, 24, 16);
    const colorTop = new THREE.Color(0x10162f);
    const colorHorizon = new THREE.Color(0xd98967);

    const positions = geometry.attributes.position;
    const colors = new Float32Array(positions.count * 3);

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.MeshBasicMaterial({
        vertexColors: true,
        side: THREE.BackSide,
        fog: false
    });

    const dome = new THREE.Mesh(geometry, material);
    applySkyDomeGradient(dome, colorTop, colorHorizon);
    scene.add(dome);
    return dome;
}

// --- Montagnes lointaines ---------------------------------------------------
// InstancedMesh statique, réparti sur toute la longueur de la route. Aucun
// recyclage nécessaire (la route fait une longueur finie de ROAD_LENGTH) :
// zéro coût par frame après la construction.
const mountainGeometry = new THREE.ConeGeometry(1, 1, 6);
const mountainMaterial = new THREE.MeshStandardMaterial({
    color: 0x7c92a6,
    roughness: 1,
    flatShading: true
});

function buildDistantMountains(scene) {
    const countPerSide = 70;
    const mesh = new THREE.InstancedMesh(mountainGeometry, mountainMaterial, countPerSide * 2);
    mesh.frustumCulled = false;

    const dummy = new THREE.Object3D();
    let index = 0;

    const zStart = 100;
    const zEnd = 100 - ROAD_LENGTH;

    for (const side of [-1, 1]) {
        for (let i = 0; i < countPerSide; i++) {
            const t = i / (countPerSide - 1);
            const z = THREE.MathUtils.lerp(zStart, zEnd, t) + randomBetween(-40, 40);
            const x = side * (520 + randomBetween(-60, 140));
            const radius = 60 + Math.random() * 90;
            const height = 90 + Math.random() * 160;

            dummy.position.set(x, height / 2 - 4, z);
            dummy.scale.set(radius, height, radius);
            dummy.rotation.y = Math.random() * Math.PI * 2;
            dummy.updateMatrix();
            mesh.setMatrixAt(index, dummy.matrix);
            index++;
        }
    }

    scene.add(mesh);
    return mesh;
}

// --- Silhouette de ville très éloignée --------------------------------------
// Décor purement atmosphérique, encore plus loin que les montagnes, pour
// casser l'impression que le monde s'arrête après l'horizon montagneux.
const skylineGeometry = new THREE.BoxGeometry(1, 1, 1);
const skylineMaterial = new THREE.MeshStandardMaterial({ color: 0x33404d, roughness: 1 });

function buildDistantSkyline(scene) {
    const count = 24;
    const mesh = new THREE.InstancedMesh(skylineGeometry, skylineMaterial, count);
    mesh.frustumCulled = false;

    const dummy = new THREE.Object3D();
    const zStart = -800;
    const zEnd = -2600;

    for (let i = 0; i < count; i++) {
        const t = i / (count - 1);
        const z = THREE.MathUtils.lerp(zStart, zEnd, t) + randomBetween(-100, 100);
        const side = Math.random() < 0.5 ? -1 : 1;
        const x = side * (760 + randomBetween(0, 260));
        const width = 20 + Math.random() * 30;
        const depth = 20 + Math.random() * 30;
        const height = 40 + Math.random() * 140;

        dummy.position.set(x, height / 2, z);
        dummy.scale.set(width, height, depth);
        dummy.rotation.y = Math.random() * Math.PI * 2;
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
    }

    scene.add(mesh);
    return mesh;
}

/**
 * Point d'entrée unique du décor dynamique. `update(delta, playerCar)` doit
 * être appelé une fois par frame pendant que la partie est en cours ;
 * `reset(playerCar)` au (re)démarrage d'une partie.
 */
export class EnvironmentManager {
    constructor(scene) {
        const decorSlotsPerSide = computeSlotCount(DECOR_SPAWN_AHEAD, DECOR_DESPAWN_BEHIND, DECOR_SLOT_SPACING);
        const guardrailSlotsPerSide = computeSlotCount(GUARDRAIL_SPAWN_AHEAD, GUARDRAIL_DESPAWN_BEHIND, GUARDRAIL_SPACING);

        this.decorSlots = [];
        for (const side of [-1, 1]) {
            for (let i = 0; i < decorSlotsPerSide; i++) {
                const slot = new DecorSlot(side);
                scene.add(slot.group);
                this.decorSlots.push(slot);
            }
        }
        this.decorSlotsPerSide = decorSlotsPerSide;

        this.guardrailSlots = [];
        for (const side of [-1, 1]) {
            for (let i = 0; i < guardrailSlotsPerSide; i++) {
                const slot = new GuardrailSlot(side);
                scene.add(slot.group);
                this.guardrailSlots.push(slot);
            }
        }
        this.guardrailSlotsPerSide = guardrailSlotsPerSide;

        // Éléments atmosphériques statiques (aucun recyclage nécessaire).
        this.skyDome = createSkyDome(scene);
        buildDistantMountains(scene);
        buildDistantSkyline(scene);
    }

    distributeInitial(slots, minAhead, maxAhead, playerCar, placeFn) {
        for (const side of [-1, 1]) {
            const sideSlots = slots.filter((slot) => slot.side === side);
            for (let i = 0; i < sideSlots.length; i++) {
                const t = sideSlots.length > 1 ? i / (sideSlots.length - 1) : 0;
                const baseAhead = minAhead + t * (maxAhead - minAhead);
                const jitteredAhead = Math.max(minAhead, baseAhead + randomBetween(-2, 2));
                placeFn(sideSlots[i], playerCar, jitteredAhead);
            }
        }
    }

    reset(playerCar) {
        this.distributeInitial(this.decorSlots, DECOR_MIN_SPAWN_AHEAD, DECOR_SPAWN_AHEAD, playerCar, placeDecorSlot);
        this.distributeInitial(this.guardrailSlots, GUARDRAIL_MIN_SPAWN_AHEAD, GUARDRAIL_SPAWN_AHEAD, playerCar, placeGuardrailSlot);
        this.skyDome.position.set(playerCar.group.position.x, 0, playerCar.group.position.z);
    }

    setSkyGradient(colorTop, colorHorizon) {
        applySkyDomeGradient(this.skyDome, colorTop, colorHorizon);
    }

    update(delta, playerCar) {
        this.skyDome.position.set(playerCar.group.position.x, 0, playerCar.group.position.z);

        for (const slot of this.decorSlots) {
            const relativeZ = slot.group.position.z - playerCar.group.position.z;
            const isTooFarBehind = relativeZ > DECOR_DESPAWN_BEHIND;
            const isTooFarAhead = relativeZ < -(DECOR_SPAWN_AHEAD + DECOR_SLOT_SPACING);

            if (isTooFarBehind || isTooFarAhead) {
                placeDecorSlot(slot, playerCar);
            }
        }

        for (const slot of this.guardrailSlots) {
            const relativeZ = slot.group.position.z - playerCar.group.position.z;
            const isTooFarBehind = relativeZ > GUARDRAIL_DESPAWN_BEHIND;
            const isTooFarAhead = relativeZ < -(GUARDRAIL_SPAWN_AHEAD + GUARDRAIL_SPACING);

            if (isTooFarBehind || isTooFarAhead) {
                placeGuardrailSlot(slot, playerCar);
            }
        }
    }
}

import * as THREE from 'three';
import { CAR_LENGTH, CAR_WIDTH } from './constants.js';

// Système d'effets visuels centralisé : particules + flash d'impact. Tout
// est construit UNE SEULE FOIS à la création (géométries, matériaux,
// texture, éléments DOM) ; le jeu n'a ensuite plus qu'à appeler les
// fonctions playXxxEffect(), sans jamais créer de nouvel objet Three.js ni
// de nouvel élément DOM pendant la partie.

// --- Texture de particule partagée -----------------------------------
// Un petit dégradé radial dessiné sur un canvas hors-écran, comme
// `createDashTexture` dans road.js : beaucoup plus léger qu'une image
// externe, et généré une seule fois pour toutes les particules du pool.
function createParticleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;

    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.85)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    return new THREE.CanvasTexture(canvas);
}

// Taille totale du pool : partagée par TOUS les effets (collision, near
// miss, combo, freinage). Largement suffisant pour plusieurs bursts
// simultanés sans jamais recycler une particule encore bien visible dans
// des conditions de jeu normales.
const PARTICLE_POOL_SIZE = 60;

/**
 * Pool fixe de sprites Three.js réutilisables. Aucune géométrie ni aucun
 * matériau n'est créé après la construction : `spawn()` se contente de
 * réinitialiser un slot existant (position, vitesse, durée de vie,
 * couleur, taille), et `update()` fait vivre/mourir les particules actives.
 *
 * Si tous les slots sont occupés au moment d'un `spawn()`, le plus ancien
 * (dans l'ordre d'écriture) est recyclé plutôt que de dépasser la taille du
 * pool — un léger "sacrifice" visuel largement préférable à une fuite
 * mémoire ou une création d'objet en plein jeu.
 */
class ParticlePool {
    constructor(scene, size, texture) {
        this.slots = [];

        for (let i = 0; i < size; i++) {
            const material = new THREE.SpriteMaterial({
                map: texture,
                transparent: true,
                depthWrite: false,
                color: 0xffffff
            });
            const sprite = new THREE.Sprite(material);
            sprite.visible = false;
            scene.add(sprite);

            this.slots.push({
                sprite,
                material,
                velocity: new THREE.Vector3(),
                gravity: 0,
                life: 0,
                maxLife: 0,
                baseSize: 0.5,
                active: false
            });
        }

        this.cursor = 0;
    }

    /** Trouve un slot libre, ou recycle le plus ancien si le pool est plein. */
    acquire() {
        for (let i = 0; i < this.slots.length; i++) {
            const index = (this.cursor + i) % this.slots.length;
            if (!this.slots[index].active) {
                this.cursor = (index + 1) % this.slots.length;
                return this.slots[index];
            }
        }

        const recycled = this.slots[this.cursor];
        this.cursor = (this.cursor + 1) % this.slots.length;
        return recycled;
    }

    /**
     * @param {THREE.Vector3} position - position de spawn (monde).
     * @param {object} options - { velocity, velocityX, velocityY, velocityZ, life, size, color, gravity }.
     */
    spawn(position, options = {}) {
        const slot = this.acquire();
        const {
            velocity = null,
            velocityX = 0,
            velocityY = 0,
            velocityZ = 0,
            life = 0.5,
            size = 0.5,
            color = 0xffffff,
            gravity = 0
        } = options;

        slot.sprite.position.copy(position);
        if (velocity) {
            slot.velocity.copy(velocity);
        } else {
            slot.velocity.set(velocityX, velocityY, velocityZ);
        }
        slot.gravity = gravity;
        slot.life = life;
        slot.maxLife = life;
        slot.baseSize = size;
        slot.material.color.setHex(color);
        slot.material.opacity = 1;
        slot.sprite.scale.set(size, size, 1);
        slot.sprite.visible = true;
        slot.active = true;
    }

    /** À appeler une fois par frame, toujours (même en Game Over : voir game.js). */
    update(delta) {
        for (const slot of this.slots) {
            if (!slot.active) continue;

            slot.life -= delta;
            if (slot.life <= 0) {
                slot.active = false;
                slot.sprite.visible = false;
                continue;
            }

            slot.velocity.y -= slot.gravity * delta;
            slot.sprite.position.addScaledVector(slot.velocity, delta);

            const lifeRatio = slot.life / slot.maxLife;
            slot.material.opacity = lifeRatio;
            const scale = slot.baseSize * (0.6 + 0.4 * lifeRatio);
            slot.sprite.scale.set(scale, scale, 1);
        }
    }

    /** Désactive immédiatement toutes les particules (utilisé au restart). */
    reset() {
        for (const slot of this.slots) {
            slot.active = false;
            slot.life = 0;
            slot.sprite.visible = false;
        }
    }
}

function spawnBurst(pool, position, count, buildParticleOptions) {
    for (let i = 0; i < count; i++) {
        pool.spawn(position, buildParticleOptions(i));
    }
}

// --- Réglages par type d'effet -----------------------------------------
const COLLISION_PARTICLE_COUNT = 16;
const COLLISION_PARTICLE_COLOR = 0xffa23a;
const COLLISION_PARTICLE_SPEED = 6;
const COLLISION_PARTICLE_LIFE = 0.5;
const COLLISION_FLASH_INTENSITY = 0.5;
const COLLISION_FLASH_DURATION = 0.32;

const NEAR_MISS_PARTICLE_COUNT = 7;
const NEAR_MISS_PARTICLE_COLOR = 0x7fe0ff;
const NEAR_MISS_PARTICLE_LIFE = 0.35;

// Le combo n'a un effet de particules qu'à partir de ce multiplicateur
// (un combo x2 reste discret, conformément à "ne rends pas l'effet excessif").
const COMBO_PARTICLE_MIN_MULTIPLIER = 3;
const COMBO_PARTICLE_COUNT = 10;
const COMBO_PARTICLE_COLOR = 0xffd23f;

const BRAKE_PARTICLE_COUNT = 2;
const BRAKE_PARTICLE_COLOR = 0xd8d8d8;
const BRAKE_PARTICLE_LIFE = 0.4;

const TIRE_MARK_POOL_SIZE = 42;
const TIRE_MARK_WIDTH = 0.16;
const TIRE_MARK_LENGTH = 1.25;
const TIRE_MARK_Y = 0.048;
const TIRE_MARK_LIFE = 2.8;
const TIRE_MARK_REAR_Z = CAR_LENGTH * 0.38;
const TIRE_MARK_SIDE_X = CAR_WIDTH * 0.31;
const TIRE_MARK_BRAKE_OPACITY = 0.24;
const TIRE_MARK_LANE_OPACITY = 0.16;

class TireMarkPool {
    constructor(scene, size) {
        this.slots = [];
        const geometry = new THREE.PlaneGeometry(1, 1);

        for (let i = 0; i < size; i++) {
            const material = new THREE.MeshBasicMaterial({
                color: 0x080808,
                transparent: true,
                opacity: 0,
                depthWrite: false
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.rotation.x = -Math.PI / 2;
            mesh.renderOrder = 1;
            mesh.visible = false;
            scene.add(mesh);

            this.slots.push({
                mesh,
                material,
                life: 0,
                maxLife: 0,
                baseOpacity: 0,
                active: false
            });
        }

        this.cursor = 0;
    }

    acquire() {
        for (let i = 0; i < this.slots.length; i++) {
            const index = (this.cursor + i) % this.slots.length;
            if (!this.slots[index].active) {
                this.cursor = (index + 1) % this.slots.length;
                return this.slots[index];
            }
        }

        const recycled = this.slots[this.cursor];
        this.cursor = (this.cursor + 1) % this.slots.length;
        return recycled;
    }

    spawn(position, {
        width = TIRE_MARK_WIDTH,
        length = TIRE_MARK_LENGTH,
        opacity = TIRE_MARK_BRAKE_OPACITY,
        yaw = 0,
        life = TIRE_MARK_LIFE
    } = {}) {
        const slot = this.acquire();

        slot.mesh.position.copy(position);
        slot.mesh.position.y = TIRE_MARK_Y;
        slot.mesh.rotation.set(-Math.PI / 2, yaw, 0);
        slot.mesh.scale.set(width, length, 1);
        slot.mesh.visible = true;
        slot.material.opacity = opacity;
        slot.life = life;
        slot.maxLife = life;
        slot.baseOpacity = opacity;
        slot.active = true;
    }

    update(delta) {
        for (const slot of this.slots) {
            if (!slot.active) continue;

            slot.life -= delta;
            if (slot.life <= 0) {
                slot.active = false;
                slot.mesh.visible = false;
                slot.material.opacity = 0;
                continue;
            }

            const lifeRatio = slot.life / slot.maxLife;
            slot.material.opacity = slot.baseOpacity * lifeRatio * lifeRatio;
        }
    }

    reset() {
        for (const slot of this.slots) {
            slot.active = false;
            slot.life = 0;
            slot.material.opacity = 0;
            slot.mesh.visible = false;
        }
    }
}

/**
 * Point d'entrée unique pour tous les effets visuels temporaires du jeu.
 * `update(delta)` doit être appelé une fois par frame (voir game.js),
 * `reset()` au redémarrage d'une partie.
 */
export class EffectsManager {
    constructor(scene) {
        this.pool = new ParticlePool(scene, PARTICLE_POOL_SIZE, createParticleTexture());
        this.tireMarks = new TireMarkPool(scene, TIRE_MARK_POOL_SIZE);
        this.tireMarkSpawnPosition = new THREE.Vector3();

        // Flash d'impact : un simple overlay DOM plein écran, dont
        // l'opacité décroît chaque frame — pas de création d'élément après
        // la construction.
        this.flashOverlay = document.createElement('div');
        this.flashOverlay.style.cssText = `
            position: fixed;
            inset: 0;
            z-index: 6;
            pointer-events: none;
            background: #ffffff;
            opacity: 0;
        `;
        document.body.appendChild(this.flashOverlay);
        this.flashOpacity = 0;
        this.flashDecayPerSecond = 0;
    }

    /** Flash bref (indépendant des particules) : utilisé par playCollisionEffect. */
    flash(intensity, duration) {
        this.flashOpacity = Math.max(this.flashOpacity, intensity);
        this.flashDecayPerSecond = intensity / Math.max(duration, 0.001);
    }

    /**
     * Impact avec une voiture de trafic : gerbe de particules "débris" +
     * flash bref. Le shake caméra et la posture de la voiture restent
     * gérés dans game.js (ils ne concernent pas les particules).
     */
    playCollisionEffect(position) {
        spawnBurst(this.pool, position, COLLISION_PARTICLE_COUNT, () => {
            const angle = Math.random() * Math.PI * 2;
            const speed = COLLISION_PARTICLE_SPEED * (0.5 + Math.random());
            return {
                velocityX: Math.cos(angle) * speed,
                velocityY: 2 + Math.random() * 4,
                velocityZ: Math.sin(angle) * speed,
                life: COLLISION_PARTICLE_LIFE * (0.7 + Math.random() * 0.6),
                size: 0.35 + Math.random() * 0.35,
                color: COLLISION_PARTICLE_COLOR,
                gravity: 12
            };
        });

        this.flash(COLLISION_FLASH_INTENSITY, COLLISION_FLASH_DURATION);
    }

    /**
     * Near miss validé : petite gerbe de particules discrètes autour de la
     * voiture frôlée. Volontairement différent d'une collision (couleur
     * froide, pas de flash, particules plus petites et plus courtes).
     */
    playNearMissEffect(position) {
        spawnBurst(this.pool, position, NEAR_MISS_PARTICLE_COUNT, () => {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1.5 + Math.random() * 1.5;
            return {
                velocityX: Math.cos(angle) * speed,
                velocityY: 1 + Math.random(),
                velocityZ: Math.sin(angle) * speed,
                life: NEAR_MISS_PARTICLE_LIFE * (0.8 + Math.random() * 0.4),
                size: 0.16 + Math.random() * 0.12,
                color: NEAR_MISS_PARTICLE_COLOR,
                gravity: 2
            };
        });
    }

    /**
     * Dépassement : volontairement sans particules (effet "moins important
     * que le near miss", voir la demande). Gardée comme fonction à part
     * entière pour que l'appelant (game.js) n'ait pas à savoir si un effet
     * visuel existe ou non pour ce type d'événement — et pour pouvoir y
     * ajouter quelque chose de très léger plus tard sans toucher à game.js.
     */
    playOvertakeEffect() {
        // Intentionnellement vide.
    }

    /** Combo : petite explosion de particules dorées, réservée aux gros combos. */
    playComboEffect(multiplier, position) {
        if (multiplier < COMBO_PARTICLE_MIN_MULTIPLIER) return;

        spawnBurst(this.pool, position, COMBO_PARTICLE_COUNT, () => {
            const angle = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 2;
            return {
                velocityX: Math.cos(angle) * speed,
                velocityY: 2 + Math.random() * 2,
                velocityZ: Math.sin(angle) * speed,
                life: 0.45 + Math.random() * 0.3,
                size: 0.2 + Math.random() * 0.18,
                color: COMBO_PARTICLE_COLOR,
                gravity: 3
            };
        });
    }

    /** Freinage appuyé : deux petits puffs de fumée légère derrière la voiture. */
    playBrakeEffect(position) {
        spawnBurst(this.pool, position, BRAKE_PARTICLE_COUNT, () => ({
            velocityX: (Math.random() - 0.5) * 0.6,
            velocityY: 0.4 + Math.random() * 0.3,
            velocityZ: 1 + Math.random(),
            life: BRAKE_PARTICLE_LIFE * (0.7 + Math.random() * 0.5),
            size: 0.3 + Math.random() * 0.2,
            color: BRAKE_PARTICLE_COLOR,
            gravity: 1
        }));
    }

    playTireMarkEffect(position, {
        intensity = 1,
        lateralDirection = 0,
        isLaneChange = false
    } = {}) {
        const clampedIntensity = THREE.MathUtils.clamp(intensity, 0, 1);
        const length = THREE.MathUtils.lerp(0.65, isLaneChange ? 1.05 : 1.55, clampedIntensity);
        const opacity = isLaneChange
            ? TIRE_MARK_LANE_OPACITY * clampedIntensity
            : TIRE_MARK_BRAKE_OPACITY * clampedIntensity;
        const yaw = lateralDirection * THREE.MathUtils.degToRad(5);

        for (const side of [-1, 1]) {
            this.tireMarkSpawnPosition.set(
                position.x + side * TIRE_MARK_SIDE_X,
                TIRE_MARK_Y,
                position.z + TIRE_MARK_REAR_Z + length * 0.35
            );
            this.tireMarks.spawn(
                this.tireMarkSpawnPosition,
                {
                    length,
                    opacity,
                    yaw,
                    life: isLaneChange ? TIRE_MARK_LIFE * 0.75 : TIRE_MARK_LIFE
                }
            );
        }
    }

    /** À appeler une fois par frame, que la partie soit en cours ou non. */
    update(delta) {
        this.pool.update(delta);
        this.tireMarks.update(delta);

        if (this.flashOpacity > 0) {
            this.flashOpacity = Math.max(0, this.flashOpacity - this.flashDecayPerSecond * delta);
            this.flashOverlay.style.opacity = String(this.flashOpacity);
        }
    }

    /** Supprime immédiatement tout effet temporaire encore actif (restart). */
    reset() {
        this.pool.reset();
        this.tireMarks.reset();
        this.flashOpacity = 0;
        this.flashOverlay.style.opacity = '0';
    }
}

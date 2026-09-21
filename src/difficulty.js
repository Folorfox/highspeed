// Système de difficulté progressive, centralisé et totalement indépendant
// du reste du jeu : ce module ne connaît ni Three.js, ni la scène, ni les
// voitures. Il transforme uniquement un temps de survie (en secondes) en un
// ensemble de paramètres de jeu (vitesse du trafic, densité, etc.), avec un
// plafond clair pour que la partie reste jouable indéfiniment.
//
// Les autres modules (traffic.js, car.js, game.js) lisent le "snapshot"
// renvoyé par getSnapshot() sans avoir besoin de connaître la logique de
// progression elle-même.

// --- Paliers de temps (en secondes) --------------------------------------
// Utilisés uniquement pour le NIVEAU affiché au joueur (HUD) : un nombre
// entier simple qui progresse par étapes claires, conformément aux repères
// demandés (0–30s facile, 30–90s moyen, 90–180s difficile, 180s+ très difficile).
const LEVEL_TIME_THRESHOLDS = [0, 30, 90, 180]; // démarrage des niveaux 1, 2, 3, 4

// Au-delà de ce temps, la difficulté ne progresse plus : c'est le plafond
// demandé, pour que le jeu reste jouable après plusieurs minutes plutôt que
// de devenir impossible. La rampe est un peu plus courte pour compenser les
// spawns plus lointains, qui donnent naturellement plus de temps au joueur.
const DIFFICULTY_RAMP_DURATION = 120;

// --- Plages de vitesse du trafic ------------------------------------------
// Valeurs de départ volontairement identiques à celles utilisées jusqu'ici
// dans traffic.js, pour que le tout début de partie ne change pas.
export const TRAFFIC_SPEED_MIN_START = 23;
export const TRAFFIC_SPEED_MIN_END = 35;
export const TRAFFIC_SPEED_MAX_START = 42;
export const TRAFFIC_SPEED_MAX_END = 58;

// --- Densité du trafic (nombre de voitures actives simultanément) --------
// Exportées pour que traffic.js puisse dimensionner son pool de voitures
// (taille max) et sa valeur de départ à partir de cette même source, sans
// dupliquer les chiffres à deux endroits différents.
export const ACTIVE_CARS_START = 12;
export const ACTIVE_CARS_END = 29;

// --- Distance de spawn devant le joueur -----------------------------------
// Les voitures réapparaissent loin devant le joueur : on évite l'effet de
// pop visible trop proche, tout en réduisant légèrement la marge quand la
// difficulté augmente pour garder de la pression en fin de partie.
const SPAWN_AHEAD_MIN_START = 165;
const SPAWN_AHEAD_MIN_END = 145;
const SPAWN_AHEAD_MAX_START = 400;
const SPAWN_AHEAD_MAX_END = 340;

// --- Vitesse maximale du joueur -------------------------------------------
// Progression volontairement très légère : la voiture reste maniable même
// en fin de partie, comme demandé.
const PLAYER_MAX_SPEED_BONUS_START = 0;
const PLAYER_MAX_SPEED_BONUS_END = 8;

function lerp(start, end, t) {
    return start + (end - start) * t;
}

/**
 * Courbe de progression douce : évite une rampe strictement linéaire, qui
 * "se sent" souvent trop mécanique, et donne à la place une accélération
 * progressive de la difficulté en milieu de rampe.
 */
function smoothstep(t) {
    const clamped = Math.min(1, Math.max(0, t));
    return clamped * clamped * (3 - 2 * clamped);
}

export class DifficultyManager {
    constructor() {
        this.survivalTime = 0;
        this.level = 1;
    }

    /** À appeler au (re)démarrage d'une partie. */
    reset() {
        this.survivalTime = 0;
        this.level = 1;
    }

    /**
     * À appeler une fois par frame, uniquement pendant que la partie est en
     * cours (comme le score ou le trafic : on ne veut pas que la difficulté
     * continue de grimper une fois le joueur en Game Over).
     */
    update(delta) {
        this.survivalTime += delta;
        this.level = this.computeLevel();
    }

    computeLevel() {
        let level = 1;
        for (let i = 1; i < LEVEL_TIME_THRESHOLDS.length; i++) {
            if (this.survivalTime >= LEVEL_TIME_THRESHOLDS[i]) {
                level = i + 1;
            }
        }
        return level;
    }

    getLevel() {
        return this.level;
    }

    getSurvivalTime() {
        return this.survivalTime;
    }

    /** Progression continue 0 → 1, plafonnée à DIFFICULTY_RAMP_DURATION secondes. */
    getProgress() {
        return smoothstep(this.survivalTime / DIFFICULTY_RAMP_DURATION);
    }

    /**
     * Calcule l'ensemble des paramètres de jeu correspondant à la
     * difficulté actuelle. Renvoie un objet "snapshot" simple, pratique à
     * transmettre tel quel à TrafficManager / Car sans qu'ils aient besoin
     * de connaître la logique de progression.
     */
    getSnapshot() {
        const progress = this.getProgress();

        return {
            level: this.level,
            progress,
            trafficSpeedMin: lerp(TRAFFIC_SPEED_MIN_START, TRAFFIC_SPEED_MIN_END, progress),
            trafficSpeedMax: lerp(TRAFFIC_SPEED_MAX_START, TRAFFIC_SPEED_MAX_END, progress),
            activeCarCount: Math.round(lerp(ACTIVE_CARS_START, ACTIVE_CARS_END, progress)),
            spawnAheadMin: lerp(SPAWN_AHEAD_MIN_START, SPAWN_AHEAD_MIN_END, progress),
            spawnAheadMax: lerp(SPAWN_AHEAD_MAX_START, SPAWN_AHEAD_MAX_END, progress),
            playerMaxSpeedBonus: lerp(PLAYER_MAX_SPEED_BONUS_START, PLAYER_MAX_SPEED_BONUS_END, progress)
        };
    }
}

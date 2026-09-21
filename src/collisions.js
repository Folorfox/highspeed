import { CAR_WIDTH, CAR_LENGTH } from './constants.js';

// Détection de collision volontairement simple : des boîtes englobantes
// alignées sur les axes (AABB), calculées sur le plan de la route (X/Z) à
// partir de la position réelle des voitures. Pas besoin de THREE.Box3 ici :
// les dimensions des voitures sont fixes et connues, donc un calcul manuel
// reste correct et beaucoup plus léger à exécuter chaque frame.

// On réduit légèrement les boîtes par rapport au mesh réel : ça évite des
// collisions "injustes" sur un simple effleurement des coins, tout en
// restant cohérent avec la position affichée des voitures.
const COLLISION_MARGIN = 0.85;
const HALF_WIDTH = (CAR_WIDTH / 2) * COLLISION_MARGIN;
const HALF_LENGTH = (CAR_LENGTH / 2) * COLLISION_MARGIN;

function getBounds(position) {
    return {
        minX: position.x - HALF_WIDTH,
        maxX: position.x + HALF_WIDTH,
        minZ: position.z - HALF_LENGTH,
        maxZ: position.z + HALF_LENGTH
    };
}

function boundsIntersect(a, b) {
    return a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
}

/**
 * Renvoie la première voiture de trafic en collision avec le joueur, ou
 * `null` s'il n'y en a aucune.
 */
export function findCollidingTrafficCar(playerCar, trafficManager) {
    const playerBounds = getBounds(playerCar.group.position);

    return trafficManager.cars.find((trafficCar) =>
        trafficCar.active && boundsIntersect(playerBounds, getBounds(trafficCar.group.position))
    ) ?? null;
}

// --- Near Miss -----------------------------------------------------------
// Petite marge ajoutée autour de la boîte de collision du joueur : une
// voiture de trafic qui entre dans cette zone élargie SANS qu'il y ait
// collision réelle est considérée comme un "frôlement" réussi.
const NEAR_MISS_DISTANCE = 2.0;

function getExpandedBounds(position, margin) {
    return {
        minX: position.x - HALF_WIDTH - margin,
        maxX: position.x + HALF_WIDTH + margin,
        minZ: position.z - HALF_LENGTH - margin,
        maxZ: position.z + HALF_LENGTH + margin
    };
}

/**
 * Renvoie toutes les voitures de trafic actuellement en "Near Miss" avec le
 * joueur : suffisamment proches à la fois latéralement (X) et
 * longitudinalement (Z) pour chevaucher la boîte du joueur élargie de
 * `NEAR_MISS_DISTANCE`, mais SANS chevaucher sa vraie boîte de collision
 * (sinon c'est une collision, pas un frôlement).
 *
 * Comme un chevauchement de boîtes (AABB) exige un recouvrement simultané
 * sur X ET sur Z, une voiture simplement proche en Z mais sur une voie
 * lointaine (ou proche en X mais très loin devant/derrière) ne déclenche
 * jamais de faux positif : il faut être proche sur les deux axes à la fois.
 *
 * Ne s'occupe volontairement d'aucun état de "déjà déclenché" : c'est un
 * calcul géométrique pur, comme `findCollidingTrafficCar` ; c'est à
 * l'appelant de filtrer les voitures ayant déjà déclenché leur Near Miss
 * pour ce passage (voir `TrafficCar.nearMissTriggered`).
 */
export function findNearMissTrafficCars(playerCar, trafficManager) {
    const playerBounds = getBounds(playerCar.group.position);
    const playerNearMissBounds = getExpandedBounds(playerCar.group.position, NEAR_MISS_DISTANCE);

    return trafficManager.cars.filter((trafficCar) => {
        if (!trafficCar.active) return false;

        const trafficBounds = getBounds(trafficCar.group.position);

        const isColliding = boundsIntersect(playerBounds, trafficBounds);
        if (isColliding) return false; // une vraie collision n'est pas un Near Miss

        return boundsIntersect(playerNearMissBounds, trafficBounds);
    });
}

// Valeurs partagées entre les différents modules du jeu (route, voiture, caméra...).
// Centraliser ces nombres ici évite d'avoir des valeurs différentes et
// incohérentes dans road.js et car.js.

export const LANE_WIDTH = 4;                        // largeur d'une voie
export const LANE_COUNT = 3;                         // nombre de voies sur l'autoroute
export const ROAD_WIDTH = LANE_WIDTH * LANE_COUNT;   // largeur totale de la route
export const ROAD_LENGTH = 6000;                     // longueur de la route (très longue pour donner une impression d'infini)

// Dimensions de carrosserie partagées entre la voiture du joueur et les
// voitures de trafic (mêmes proportions), pour que la détection de
// collision corresponde bien à ce qui est affiché à l'écran.
export const CAR_WIDTH = 1.8;
export const CAR_LENGTH = 4;

/**
 * Renvoie la position X (gauche/droite) du centre d'une voie.
 * laneIndex : 0 = voie de gauche, 1 = voie du milieu, 2 = voie de droite (pour 3 voies).
 */
export function getLaneX(laneIndex) {
    const centerLane = (LANE_COUNT - 1) / 2;
    return (laneIndex - centerLane) * LANE_WIDTH;
}

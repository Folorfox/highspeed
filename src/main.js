import { startGame } from './game.js';
import { preloadVehicleModels } from './vehicleModels.js';

// Précharge tous les modèles .glb AVANT de démarrer le jeu : garantit
// qu'aucun chargement n'a lieu pendant une frame de jeu (voir contrainte
// de performance dans vehicleModels.js). Si un ou plusieurs modèles
// échouent, preloadVehicleModels() résout quand même (chaque échec est
// mémorisé individuellement) : le jeu démarre toujours, avec fallback
// procédural pour les modèles manquants.
preloadVehicleModels().then(() => {
    startGame();
});

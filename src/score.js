// Gère l'état du score : accumulation pendant la partie, bonus de
// dépassement, et persistance du meilleur score dans le navigateur.
// Ne touche à aucun DOM ni à la scène 3D : c'est uniquement de l'état +
// des règles de calcul, l'affichage vit dans ui.js.

const BEST_SCORE_STORAGE_KEY = 'highwayRush.bestScore';
const VEHICLE_BEST_SCORES_STORAGE_KEY = 'highwayRush.vehicleBestScores';

// Le score de base est basé sur la distance réellement parcourue, mais il ne
// récompense plus la conduite trop lente : en dessous d'un certain rythme,
// le joueur survit peut-être, mais il ne "farme" pas de points gratuitement.
const SCORE_PER_UNIT_DISTANCE = 10;
const SCORE_MIN_SPEED_RATIO = 0.45;
const SCORE_FULL_SPEED_RATIO = 0.85;

const OVERTAKE_BONUS = 100;
const NEAR_MISS_BONUS = 250;

// --- Système de combo ---------------------------------------------------
// Un même compteur sert directement de multiplicateur (1 événement → x1,
// 2 → x2, ... plafonné à COMBO_MAX_MULTIPLIER). Near Miss et dépassement
// alimentent tous les deux ce même compteur : pas de système séparé par
// type d'événement.
const COMBO_TIMEOUT = 3.0;          // secondes pendant lesquelles le combo reste actif sans nouvel événement
const COMBO_MAX_MULTIPLIER = 5;

export function getDistanceScoreFactor(speedRatio) {
    if (speedRatio < SCORE_MIN_SPEED_RATIO) return 0;

    return Math.min(
        1,
        (speedRatio - SCORE_MIN_SPEED_RATIO) / (SCORE_FULL_SPEED_RATIO - SCORE_MIN_SPEED_RATIO)
    );
}

export class ScoreManager {
    constructor() {
        this.score = 0;
        this.bestScore = this.loadBestScore();
        this.vehicleBestScores = this.loadVehicleBestScores();

        // this.comboCount sert À LA FOIS de compteur d'événements chaînés
        // et de multiplicateur courant (0 = aucun combo actif).
        this.comboCount = 0;
        this.comboTimer = 0;
        this.overtakeCount = 0;
        this.nearMissCount = 0;
        this.maxComboMultiplier = 0;
        this.objectiveCount = 0;
    }

    loadBestScore() {
        try {
            const stored = window.localStorage.getItem(BEST_SCORE_STORAGE_KEY);
            const parsed = stored !== null ? parseInt(stored, 10) : 0;
            return Number.isFinite(parsed) ? parsed : 0;
        } catch (error) {
            // localStorage peut être indisponible (navigation privée stricte,
            // cookies désactivés...) : le jeu doit rester jouable même sans
            // sauvegarde persistante, simplement sans mémoriser le record.
            return 0;
        }
    }

    saveBestScore() {
        try {
            window.localStorage.setItem(BEST_SCORE_STORAGE_KEY, String(this.bestScore));
        } catch (error) {
            // Idem : on ignore silencieusement si le stockage n'est pas disponible.
        }
    }

    loadVehicleBestScores() {
        try {
            const stored = window.localStorage.getItem(VEHICLE_BEST_SCORES_STORAGE_KEY);
            if (!stored) return {};

            const parsed = JSON.parse(stored);
            if (!parsed || typeof parsed !== 'object') return {};

            return Object.fromEntries(
                Object.entries(parsed)
                    .map(([vehicleId, score]) => [vehicleId, parseInt(score, 10)])
                    .filter(([, score]) => Number.isFinite(score) && score >= 0)
            );
        } catch (error) {
            return {};
        }
    }

    saveVehicleBestScores() {
        try {
            window.localStorage.setItem(
                VEHICLE_BEST_SCORES_STORAGE_KEY,
                JSON.stringify(this.vehicleBestScores)
            );
        } catch (error) {
            // Comme pour le meilleur score global, le jeu reste jouable même
            // si le stockage persistant n'est pas disponible.
        }
    }

    /** À appeler chaque frame avec la vitesse courante du joueur. */
    addDistanceScore(speed, speedRatio, delta) {
        const speedScoreFactor = getDistanceScoreFactor(speedRatio);
        if (speedScoreFactor <= 0) return;

        this.score += speed * delta * SCORE_PER_UNIT_DISTANCE * speedScoreFactor;
    }

    /**
     * À appeler chaque frame (tant que la partie est en cours) pour faire
     * s'écouler la fenêtre de combo. Si le timer arrive à 0 sans nouvel
     * événement, le combo retombe à 0 (plus de multiplicateur affiché).
     */
    updateCombo(delta) {
        if (this.comboCount <= 0) return;

        this.comboTimer -= delta;
        if (this.comboTimer <= 0) {
            this.comboCount = 0;
            this.comboTimer = 0;
        }
    }

    /**
     * Cœur du système de combo, partagé par le Near Miss et le dépassement :
     * chaque événement réussi incrémente le compteur/multiplicateur (jusqu'à
     * COMBO_MAX_MULTIPLIER), relance la fenêtre COMBO_TIMEOUT, et applique ce
     * multiplicateur au bonus de base fourni. Renvoie le montant réellement
     * ajouté et le multiplicateur appliqué, pratique pour l'affichage HUD.
     */
    registerComboEvent(baseAmount) {
        this.comboCount = Math.min(this.comboCount + 1, COMBO_MAX_MULTIPLIER);
        this.comboTimer = COMBO_TIMEOUT;

        const multiplier = this.comboCount;
        const amount = baseAmount * multiplier;
        this.score += amount;
        this.maxComboMultiplier = Math.max(this.maxComboMultiplier, multiplier);

        return { amount, multiplier };
    }

    /** Un seul Near Miss réussi : alimente le combo comme n'importe quel autre événement. */
    registerNearMiss() {
        this.nearMissCount += 1;
        return this.registerComboEvent(NEAR_MISS_BONUS);
    }

    /**
     * `count` dépassements réalisés sur la même frame : chacun est un
     * événement de combo à part entière (donc chacun peut faire progresser
     * le multiplicateur), pas un simple bonus agrégé comme avant. Renvoie un
     * événement par dépassement (utile pour cumuler l'affichage HUD).
     */
    registerOvertakes(count) {
        const events = [];
        for (let i = 0; i < count; i++) {
            this.overtakeCount += 1;
            events.push(this.registerComboEvent(OVERTAKE_BONUS));
        }
        return events;
    }

    registerObjectiveReward(amount) {
        this.objectiveCount += 1;
        this.score += amount;
        return amount;
    }

    getComboMultiplier() {
        return this.comboCount;
    }

    getComboProgress() {
        if (this.comboCount <= 0) return 0;
        return Math.max(0, Math.min(1, this.comboTimer / COMBO_TIMEOUT));
    }

    getComboTimeRemaining() {
        if (this.comboCount <= 0) return 0;
        return Math.max(0, this.comboTimer);
    }

    /** Réinitialise le combo (collision, replay) sans toucher au score courant. */
    resetCombo() {
        this.comboCount = 0;
        this.comboTimer = 0;
    }

    /**
     * À appeler à la fin d'une partie (Game Over) : fige le score courant et
     * met à jour + sauvegarde le meilleur score si besoin.
     */
    finalizeGame(vehicleId = null) {
        const finalScore = this.getScore();

        if (finalScore > this.bestScore) {
            this.bestScore = finalScore;
            this.saveBestScore();
        }

        if (vehicleId) {
            const currentVehicleBest = this.getVehicleBestScore(vehicleId);
            if (finalScore > currentVehicleBest) {
                this.vehicleBestScores[vehicleId] = finalScore;
                this.saveVehicleBestScores();
            }
        }
    }

    /** Remet le score courant à zéro pour une nouvelle partie (le meilleur score, lui, reste). */
    reset() {
        this.score = 0;
        this.overtakeCount = 0;
        this.nearMissCount = 0;
        this.maxComboMultiplier = 0;
        this.objectiveCount = 0;
        this.resetCombo();
    }

    getScore() {
        return Math.floor(this.score);
    }

    getBestScore() {
        return this.bestScore;
    }

    getVehicleBestScore(vehicleId) {
        return this.vehicleBestScores[vehicleId] ?? 0;
    }

    getOvertakeCount() {
        return this.overtakeCount;
    }

    getNearMissCount() {
        return this.nearMissCount;
    }

    getMaxComboMultiplier() {
        return this.maxComboMultiplier;
    }

    getObjectiveCount() {
        return this.objectiveCount;
    }
}

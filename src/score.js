// Gère l'état du score : accumulation pendant la partie, bonus de
// dépassement, et persistance du meilleur score dans le navigateur.
// Ne touche à aucun DOM ni à la scène 3D : c'est uniquement de l'état +
// des règles de calcul, l'affichage vit dans ui.js.

const BEST_SCORE_STORAGE_KEY = 'highwayRush.bestScore';
const VEHICLE_BEST_SCORES_STORAGE_KEY = 'highwayRush.vehicleBestScores';
const MODE_BEST_SCORES_STORAGE_KEY = 'highwayRush.modeBestScores';
const MODE_BEST_RESULTS_STORAGE_KEY = 'highwayRush.modeBestResults';
const CAREER_STATS_STORAGE_KEY = 'highwayRush.careerStats';

const DEFAULT_CAREER_STATS = {
    runs: 0,
    totalScore: 0,
    totalOvertakes: 0,
    totalNearMisses: 0,
    totalObjectives: 0,
    bestCombo: 0,
    bestSurvivalTime: 0,
    bestSpeedKmh: 0
};

const CAREER_MILESTONE_DEFINITIONS = [
    {
        id: 'first-run',
        label: 'Première sortie',
        description: 'Termine 1 course',
        stat: 'runs',
        target: 1,
        format: 'number'
    },
    {
        id: 'regular-driver',
        label: 'Pilote régulier',
        description: 'Termine 5 courses',
        stat: 'runs',
        target: 5,
        format: 'number'
    },
    {
        id: 'score-hunter',
        label: 'Chasseur de score',
        description: 'Cumule 25 000 points',
        stat: 'totalScore',
        target: 25000,
        format: 'number'
    },
    {
        id: 'overtake-specialist',
        label: 'Spécialiste dépassement',
        description: 'Réalise 50 dépassements',
        stat: 'totalOvertakes',
        target: 50,
        format: 'number'
    },
    {
        id: 'near-miss-master',
        label: 'Maîtrise du risque',
        description: 'Réussis 20 near miss',
        stat: 'totalNearMisses',
        target: 20,
        format: 'number'
    },
    {
        id: 'two-minutes',
        label: 'Longue distance',
        description: 'Survis 2 minutes',
        stat: 'bestSurvivalTime',
        target: 120,
        format: 'duration'
    },
    {
        id: 'combo-chain',
        label: 'Combo parfait',
        description: 'Atteins un combo x5',
        stat: 'bestCombo',
        target: 5,
        format: 'combo'
    },
    {
        id: 'top-speed',
        label: 'Plein gaz',
        description: 'Atteins 160 KM/H',
        stat: 'bestSpeedKmh',
        target: 160,
        format: 'speed'
    },
    {
        id: 'objective-runner',
        label: 'Mission en chaîne',
        description: 'Termine 12 objectifs',
        stat: 'totalObjectives',
        target: 12,
        format: 'number'
    }
];

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

function sanitizePositiveNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function getCareerStatValue(stats, statName) {
    return sanitizePositiveNumber(stats?.[statName]);
}

export class ScoreManager {
    constructor() {
        this.score = 0;
        this.bestScore = this.loadBestScore();
        this.vehicleBestScores = this.loadVehicleBestScores();
        this.modeBestScores = this.loadModeBestScores();
        this.modeBestResults = this.loadModeBestResults();
        this.careerStats = this.loadCareerStats();

        // this.comboCount sert À LA FOIS de compteur d'événements chaînés
        // et de multiplicateur courant (0 = aucun combo actif).
        this.comboCount = 0;
        this.comboTimer = 0;
        this.overtakeCount = 0;
        this.nearMissCount = 0;
        this.maxComboMultiplier = 0;
        this.objectiveCount = 0;
        this.scoreMultiplier = 1;
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

    loadModeBestScores() {
        try {
            const stored = window.localStorage.getItem(MODE_BEST_SCORES_STORAGE_KEY);
            if (!stored) return {};

            const parsed = JSON.parse(stored);
            if (!parsed || typeof parsed !== 'object') return {};

            return Object.fromEntries(
                Object.entries(parsed)
                    .map(([modeId, score]) => [modeId, parseInt(score, 10)])
                    .filter(([, score]) => Number.isFinite(score) && score >= 0)
            );
        } catch (error) {
            return {};
        }
    }

    loadModeBestResults() {
        try {
            const stored = window.localStorage.getItem(MODE_BEST_RESULTS_STORAGE_KEY);
            if (!stored) return {};

            const parsed = JSON.parse(stored);
            if (!parsed || typeof parsed !== 'object') return {};

            return Object.fromEntries(
                Object.entries(parsed)
                    .filter(([, metrics]) => metrics && typeof metrics === 'object')
                    .map(([modeId, metrics]) => [
                        modeId,
                        {
                            distance: sanitizePositiveNumber(metrics.distance)
                        }
                    ])
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

    saveModeBestScores() {
        try {
            window.localStorage.setItem(
                MODE_BEST_SCORES_STORAGE_KEY,
                JSON.stringify(this.modeBestScores)
            );
        } catch (error) {
            // Même logique : le jeu reste jouable si la sauvegarde navigateur est bloquée.
        }
    }

    saveModeBestResults() {
        try {
            window.localStorage.setItem(
                MODE_BEST_RESULTS_STORAGE_KEY,
                JSON.stringify(this.modeBestResults)
            );
        } catch (error) {
            // Même logique : le jeu reste jouable si la sauvegarde navigateur est bloquée.
        }
    }

    loadCareerStats() {
        try {
            const stored = window.localStorage.getItem(CAREER_STATS_STORAGE_KEY);
            if (!stored) return { ...DEFAULT_CAREER_STATS };

            const parsed = JSON.parse(stored);
            if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_CAREER_STATS };

            return {
                runs: Math.floor(sanitizePositiveNumber(parsed.runs)),
                totalScore: Math.floor(sanitizePositiveNumber(parsed.totalScore)),
                totalOvertakes: Math.floor(sanitizePositiveNumber(parsed.totalOvertakes)),
                totalNearMisses: Math.floor(sanitizePositiveNumber(parsed.totalNearMisses)),
                totalObjectives: Math.floor(sanitizePositiveNumber(parsed.totalObjectives)),
                bestCombo: Math.floor(sanitizePositiveNumber(parsed.bestCombo)),
                bestSurvivalTime: sanitizePositiveNumber(parsed.bestSurvivalTime),
                bestSpeedKmh: Math.floor(sanitizePositiveNumber(parsed.bestSpeedKmh))
            };
        } catch (error) {
            return { ...DEFAULT_CAREER_STATS };
        }
    }

    saveCareerStats() {
        try {
            window.localStorage.setItem(
                CAREER_STATS_STORAGE_KEY,
                JSON.stringify(this.careerStats)
            );
        } catch (error) {
            // La carrière est un bonus : aucune erreur de stockage ne doit bloquer le jeu.
        }
    }

    /** À appeler chaque frame avec la vitesse courante du joueur. */
    addDistanceScore(speed, speedRatio, delta) {
        const speedScoreFactor = getDistanceScoreFactor(speedRatio);
        if (speedScoreFactor <= 0) return;

        this.score += speed * delta * SCORE_PER_UNIT_DISTANCE * speedScoreFactor * this.scoreMultiplier;
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
        const amount = baseAmount * multiplier * this.scoreMultiplier;
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
        const multipliedAmount = amount * this.scoreMultiplier;
        this.score += multipliedAmount;
        return multipliedAmount;
    }

    setScoreMultiplier(multiplier = 1) {
        this.scoreMultiplier = Math.max(0.1, Number.isFinite(multiplier) ? multiplier : 1);
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
    finalizeGame(vehicleId = null, modeId = null, runStats = {}) {
        const finalScore = this.getScore();
        const scoreRecordsEnabled = runStats.scoreRecordsEnabled !== false;
        const previouslyCompletedMilestoneIds = new Set(
            this.getCareerMilestones()
                .filter((milestone) => milestone.completed)
                .map((milestone) => milestone.id)
        );

        if (scoreRecordsEnabled && finalScore > this.bestScore) {
            this.bestScore = finalScore;
            this.saveBestScore();
        }

        if (scoreRecordsEnabled && vehicleId) {
            const currentVehicleBest = this.getVehicleBestScore(vehicleId);
            if (finalScore > currentVehicleBest) {
                this.vehicleBestScores[vehicleId] = finalScore;
                this.saveVehicleBestScores();
            }
        }

        if (modeId) {
            if (runStats.modeResultMetric === 'distance') {
                const finalDistance = sanitizePositiveNumber(runStats.modeResultValue);
                const currentDistanceBest = this.getModeBestResult(modeId, 'distance');
                if (finalDistance > currentDistanceBest) {
                    this.modeBestResults[modeId] = {
                        ...this.modeBestResults[modeId],
                        distance: finalDistance
                    };
                    this.saveModeBestResults();
                }
            } else {
                const currentModeBest = this.getModeBestScore(modeId);
                if (finalScore > currentModeBest) {
                    this.modeBestScores[modeId] = finalScore;
                    this.saveModeBestScores();
                }
            }
        }

        this.careerStats.runs += 1;
        if (scoreRecordsEnabled) {
            this.careerStats.totalScore += finalScore;
        }
        this.careerStats.totalOvertakes += this.overtakeCount;
        this.careerStats.totalNearMisses += this.nearMissCount;
        this.careerStats.totalObjectives += this.objectiveCount;
        this.careerStats.bestCombo = Math.max(this.careerStats.bestCombo, this.maxComboMultiplier);
        this.careerStats.bestSurvivalTime = Math.max(
            this.careerStats.bestSurvivalTime,
            sanitizePositiveNumber(runStats.survivalTime)
        );
        this.careerStats.bestSpeedKmh = Math.max(
            this.careerStats.bestSpeedKmh,
            Math.floor(sanitizePositiveNumber(runStats.maxSpeedKmh))
        );
        this.saveCareerStats();

        const newlyCompletedMilestones = this.getCareerMilestones()
            .filter((milestone) => milestone.completed && !previouslyCompletedMilestoneIds.has(milestone.id));

        return { newlyCompletedMilestones };
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

    getModeBestScore(modeId) {
        return this.modeBestScores[modeId] ?? 0;
    }

    getModeBestResult(modeId, metric = 'score') {
        if (metric === 'distance') {
            return this.modeBestResults[modeId]?.distance ?? 0;
        }

        return this.getModeBestScore(modeId);
    }

    getCareerStats() {
        return { ...this.careerStats };
    }

    getVehicleUnlockInfo(vehicle) {
        const requirement = vehicle?.unlockRequirement;
        if (!requirement) {
            return {
                unlocked: true,
                label: 'Disponible',
                value: 1,
                target: 1,
                format: 'number',
                progressRatio: 1
            };
        }

        const value = getCareerStatValue(this.careerStats, requirement.stat);
        const target = sanitizePositiveNumber(requirement.target);
        const progressRatio = target > 0 ? Math.min(1, value / target) : 1;

        return {
            unlocked: value >= target,
            label: requirement.label ?? 'Défi carrière',
            value,
            target,
            format: requirement.format ?? 'number',
            progressRatio
        };
    }

    getCareerMilestones() {
        return CAREER_MILESTONE_DEFINITIONS.map((milestone) => {
            const value = getCareerStatValue(this.careerStats, milestone.stat);
            const progressRatio = milestone.target > 0
                ? Math.min(1, value / milestone.target)
                : 1;

            return {
                ...milestone,
                value,
                completed: value >= milestone.target,
                progressRatio
            };
        });
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

export const GAME_MODES = [
    {
        id: 'arcade',
        name: 'Arcade',
        status: 'CLASSIQUE',
        description: 'Expérience équilibrée actuelle.',
        scoreMultiplier: 1,
        trafficSpeedMultiplier: 1,
        activeCarMultiplier: 1,
        spawnDistanceMultiplier: 1,
        playerBonusMultiplier: 1,
        timeLimit: null
    },
    {
        id: 'time-attack',
        name: 'Contre-la-montre',
        status: '90 S',
        description: 'Parcours le plus de kilomètres possible avant la fin du chrono.',
        resultMetric: 'distance',
        scoreMultiplier: 1,
        trafficSpeedMultiplier: 1.02,
        activeCarMultiplier: 0.95,
        spawnDistanceMultiplier: 1,
        playerBonusMultiplier: 1,
        timeLimit: 90,
        timeBonusOnNearMiss: 0,
        timeBonusOnObjective: 0,
        timeBonusCap: 90
    },
    {
        id: 'survival',
        name: 'Survie',
        status: 'INTENSE',
        description: 'La difficulté monte plus vite et le trafic va plus fort.',
        scoreMultiplier: 1.25,
        trafficSpeedMultiplier: 1.1,
        activeCarMultiplier: 1.08,
        spawnDistanceMultiplier: 0.94,
        playerBonusMultiplier: 0.75,
        timeLimit: null
    },
    {
        id: 'dense-traffic',
        name: 'Trafic dense',
        status: 'DENSE',
        description: 'Plus de voitures, plus de décisions, plus de bonus.',
        scoreMultiplier: 1.35,
        trafficSpeedMultiplier: 0.98,
        activeCarMultiplier: 1.18,
        spawnDistanceMultiplier: 0.96,
        playerBonusMultiplier: 0.9,
        timeLimit: null
    }
];

export const DEFAULT_GAME_MODE_ID = GAME_MODES[0].id;

export function getGameModeConfig(modeId = DEFAULT_GAME_MODE_ID) {
    return GAME_MODES.find((mode) => mode.id === modeId) ?? GAME_MODES[0];
}

export function applyGameModeToDifficultySnapshot(snapshot, mode) {
    return {
        ...snapshot,
        trafficSpeedMin: snapshot.trafficSpeedMin * mode.trafficSpeedMultiplier,
        trafficSpeedMax: snapshot.trafficSpeedMax * mode.trafficSpeedMultiplier,
        activeCarCount: Math.round(snapshot.activeCarCount * mode.activeCarMultiplier),
        spawnAheadMin: snapshot.spawnAheadMin * mode.spawnDistanceMultiplier,
        spawnAheadMax: snapshot.spawnAheadMax * mode.spawnDistanceMultiplier,
        playerMaxSpeedBonus: snapshot.playerMaxSpeedBonus * mode.playerBonusMultiplier
    };
}

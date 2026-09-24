const DEFAULT_OBJECTIVE_MODE_ID = 'arcade';

const OBJECTIVE_SEQUENCES = {
    arcade: [
        {
            type: 'overtake',
            label: 'DÉPASSEMENTS',
            description: 'Dépasse {target} voitures',
            target: 4,
            targetIncrease: 2,
            reward: 300,
            rewardIncrease: 80
        },
        {
            type: 'near-miss',
            label: 'NEAR MISS',
            description: 'Réussis {target} near miss',
            target: 2,
            targetIncrease: 1,
            reward: 500,
            rewardIncrease: 120
        },
        {
            type: 'high-speed',
            label: 'PLEIN GAZ',
            description: 'Reste très rapide {target}s',
            target: 5,
            targetIncrease: 1,
            reward: 400,
            rewardIncrease: 100,
            speedRatioThreshold: 0.82
        }
    ],
    'time-attack': [
        {
            type: 'overtake',
            label: 'RYTHME',
            description: 'Dépasse {target} voitures',
            target: 5,
            targetIncrease: 3,
            reward: 360,
            rewardIncrease: 100
        },
        {
            type: 'high-speed',
            label: 'SPRINT',
            description: 'Reste à haute vitesse {target}s',
            target: 7,
            targetIncrease: 2,
            reward: 480,
            rewardIncrease: 120,
            speedRatioThreshold: 0.84
        },
        {
            type: 'near-miss',
            label: 'RISQUE BONUS',
            description: 'Réussis {target} near miss',
            target: 2,
            targetIncrease: 1,
            reward: 560,
            rewardIncrease: 140
        }
    ],
    survival: [
        {
            type: 'high-speed',
            label: 'TENIR LE RYTHME',
            description: 'Garde une bonne vitesse {target}s',
            target: 8,
            targetIncrease: 2,
            reward: 520,
            rewardIncrease: 130,
            speedRatioThreshold: 0.78
        },
        {
            type: 'near-miss',
            label: 'SANG-FROID',
            description: 'Réussis {target} near miss',
            target: 3,
            targetIncrease: 1,
            reward: 680,
            rewardIncrease: 150
        },
        {
            type: 'overtake',
            label: 'SORTIE DE PRESSION',
            description: 'Dépasse {target} voitures',
            target: 6,
            targetIncrease: 2,
            reward: 460,
            rewardIncrease: 110
        }
    ],
    'dense-traffic': [
        {
            type: 'near-miss',
            label: 'FRÔLEMENT',
            description: 'Réussis {target} near miss',
            target: 3,
            targetIncrease: 2,
            reward: 720,
            rewardIncrease: 160
        },
        {
            type: 'overtake',
            label: 'FILE LIBRE',
            description: 'Dépasse {target} voitures',
            target: 6,
            targetIncrease: 3,
            reward: 430,
            rewardIncrease: 110
        },
        {
            type: 'high-speed',
            label: 'TROUÉE',
            description: 'Reste rapide {target}s',
            target: 5,
            targetIncrease: 1,
            reward: 470,
            rewardIncrease: 120,
            speedRatioThreshold: 0.8
        }
    ]
};

function getObjectiveSequence(modeId) {
    return OBJECTIVE_SEQUENCES[modeId] ?? OBJECTIVE_SEQUENCES[DEFAULT_OBJECTIVE_MODE_ID];
}

function createObjective(index, modeId) {
    const sequence = getObjectiveSequence(modeId);
    const template = sequence[index % sequence.length];
    const tier = Math.floor(index / sequence.length);
    const target = template.target + tier * template.targetIncrease;

    return {
        ...template,
        target,
        reward: template.reward + tier * template.rewardIncrease,
        progress: 0,
        descriptionText: template.description.replace('{target}', target)
    };
}

function formatProgress(objective) {
    if (objective.type === 'high-speed') {
        return `${Math.floor(objective.progress)} / ${objective.target}s`;
    }

    return `${Math.floor(objective.progress)} / ${objective.target}`;
}

export class ObjectiveManager {
    constructor() {
        this.reset();
    }

    reset(modeId = DEFAULT_OBJECTIVE_MODE_ID) {
        this.modeId = OBJECTIVE_SEQUENCES[modeId] ? modeId : DEFAULT_OBJECTIVE_MODE_ID;
        this.objectiveIndex = 0;
        this.currentObjective = createObjective(this.objectiveIndex, this.modeId);
    }

    completeCurrentObjective() {
        const completed = { ...this.currentObjective };
        this.objectiveIndex += 1;
        this.currentObjective = createObjective(this.objectiveIndex, this.modeId);
        return completed;
    }

    update({ delta, overtakeCount = 0, nearMissCount = 0, speedRatio = 0 }) {
        const objective = this.currentObjective;

        if (objective.type === 'overtake') {
            objective.progress += overtakeCount;
        } else if (objective.type === 'near-miss') {
            objective.progress += nearMissCount;
        } else if (objective.type === 'high-speed') {
            if (speedRatio >= objective.speedRatioThreshold) {
                objective.progress += delta;
            } else {
                objective.progress = Math.max(0, objective.progress - delta * 0.65);
            }
        }

        if (objective.progress >= objective.target) {
            return this.completeCurrentObjective();
        }

        return null;
    }

    getCurrentObjective() {
        const objective = this.currentObjective;
        const progressRatio = Math.max(0, Math.min(1, objective.progress / objective.target));

        return {
            label: objective.label,
            description: objective.descriptionText,
            progressLabel: formatProgress(objective),
            progressRatio,
            reward: objective.reward
        };
    }
}

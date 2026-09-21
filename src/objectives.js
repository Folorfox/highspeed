const OBJECTIVE_SEQUENCE = [
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
];

function createObjective(index) {
    const template = OBJECTIVE_SEQUENCE[index % OBJECTIVE_SEQUENCE.length];
    const tier = Math.floor(index / OBJECTIVE_SEQUENCE.length);
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

    reset() {
        this.objectiveIndex = 0;
        this.currentObjective = createObjective(this.objectiveIndex);
    }

    completeCurrentObjective() {
        const completed = { ...this.currentObjective };
        this.objectiveIndex += 1;
        this.currentObjective = createObjective(this.objectiveIndex);
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

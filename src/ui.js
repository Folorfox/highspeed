// Écrans en overlay DOM (par-dessus le <canvas> Three.js). On reste
// volontairement en DOM plutôt qu'en 3D : c'est beaucoup plus simple à
// afficher/positionner/styler pour du texte + des boutons, et ça n'a aucun
// impact sur la scène 3D ou les performances de rendu.

export class StartScreen {
    /**
     * @param {object} options
     * @param {(vehicleId: string) => void} options.onStart - appelé quand le joueur clique sur "JOUER".
     * @param {Array<{ id: string, name: string, maxSpeed: number, acceleration?: number, brakePower?: number, laneChangeRate?: number }>} options.vehicles
     * @param {(vehicleId: string) => void} options.onSelectVehicle
     * @param {(vehicleId: string) => number} options.getVehicleBestScore
     */
    constructor({
        onStart,
        vehicles = [],
        onSelectVehicle = () => {},
        getVehicleBestScore = () => 0
    }) {
        this.onStart = onStart;
        this.vehicles = vehicles;
        this.onSelectVehicle = onSelectVehicle;
        this.getVehicleBestScore = getVehicleBestScore;
        this.selectedVehicleId = vehicles[0]?.id ?? null;

        this.element = this.buildElement();
        document.body.appendChild(this.element);

        this.startButton = this.element.querySelector('[data-role="start"]');
        this.startButton.addEventListener('click', () => {
            this.hide();
            this.onStart(this.selectedVehicleId);
        });

        this.vehicleButtons = [...this.element.querySelectorAll('[data-vehicle-id]')];
        for (const button of this.vehicleButtons) {
            button.addEventListener('click', () => {
                this.selectedVehicleId = button.dataset.vehicleId;
                this.updateVehicleSelection();
                this.onSelectVehicle(this.selectedVehicleId);
            });
        }

        this.updateVehicleSelection();
        if (this.selectedVehicleId) {
            this.onSelectVehicle(this.selectedVehicleId);
        }
    }

    getVehicleStatRatio(vehicle, statName) {
        const values = this.vehicles
            .map((entry) => entry[statName])
            .filter((value) => Number.isFinite(value));

        if (values.length <= 1 || !Number.isFinite(vehicle[statName])) return 1;

        const min = Math.min(...values);
        const max = Math.max(...values);
        if (Math.abs(max - min) < 0.0001) return 1;

        return Math.max(0, Math.min(1, (vehicle[statName] - min) / (max - min)));
    }

    renderVehicleStat(label, ratio) {
        const width = Math.round((0.18 + ratio * 0.82) * 100);
        return `
            <span style="display: grid; grid-template-columns: 42px 1fr; align-items: center; gap: 7px; width: 100%; font-size: 0.64rem; font-weight: 850; color: rgba(255, 255, 255, 0.72);">
                <span style="text-align: right;">${label}</span>
                <span style="height: 5px; border-radius: 999px; overflow: hidden; background: rgba(255, 255, 255, 0.16);">
                    <span style="display: block; width: ${width}%; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #ffd23f, #ff5a3f);"></span>
                </span>
            </span>
        `;
    }

    formatVehicleBestScore(vehicleId) {
        return Math.floor(this.getVehicleBestScore(vehicleId)).toLocaleString('fr-FR');
    }

    buildElement() {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-direction: column;
            gap: 18px;
            padding: 24px;
            background: rgba(8, 14, 24, 0.62);
            z-index: 12;
            font-family: system-ui, -apple-system, sans-serif;
            color: #ffffff;
            text-align: center;
        `;

        const title = document.createElement('h1');
        title.textContent = 'HIGHWAY RUSH';
        title.style.cssText = `
            margin: 0;
            font-size: clamp(2.4rem, 8vw, 5rem);
            font-weight: 900;
            letter-spacing: 0.08em;
            text-shadow: 0 3px 18px rgba(0, 0, 0, 0.75);
        `;

        const subtitle = document.createElement('p');
        subtitle.textContent = 'Choisis ton véhicule et fonce sur l’autoroute';
        subtitle.style.cssText = `
            margin: 0;
            font-size: clamp(1rem, 2.6vw, 1.35rem);
            font-weight: 700;
            color: #ffd23f;
            text-shadow: 0 2px 12px rgba(0, 0, 0, 0.75);
        `;

        const vehicleList = document.createElement('div');
        vehicleList.style.cssText = `
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(138px, 1fr));
            gap: 10px;
            width: min(92vw, 760px);
        `;

        for (const vehicle of this.vehicles) {
            const maxSpeed = Math.round(vehicle.maxSpeed * SPEED_DISPLAY_KMH_PER_GAME_UNIT);
            const speedRatio = this.getVehicleStatRatio(vehicle, 'maxSpeed');
            const accelerationRatio = this.getVehicleStatRatio(vehicle, 'acceleration');
            const brakeRatio = this.getVehicleStatRatio(vehicle, 'brakePower');
            const handlingRatio = this.getVehicleStatRatio(vehicle, 'laneChangeRate');
            const option = document.createElement('button');
            option.type = 'button';
            option.dataset.vehicleId = vehicle.id;
            option.style.cssText = `
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                min-height: 132px;
                padding: 10px;
                border: 2px solid rgba(255, 255, 255, 0.22);
                border-radius: 8px;
                background: rgba(0, 0, 0, 0.32);
                color: #ffffff;
                cursor: pointer;
                box-shadow: 0 6px 18px rgba(0, 0, 0, 0.22);
            `;
            option.innerHTML = `
                <span style="font-size: 0.9rem; font-weight: 850; letter-spacing: 0.04em;">${vehicle.name}</span>
                <span style="margin-top: 5px; font-size: 0.74rem; font-weight: 750; color: rgba(255, 255, 255, 0.78);">${maxSpeed} KM/H</span>
                <span data-role="vehicle-best" style="margin-top: 5px; font-size: 0.68rem; font-weight: 800; color: #ffd23f;">REC ${this.formatVehicleBestScore(vehicle.id)}</span>
                <span style="display: grid; gap: 4px; width: 100%; margin-top: 9px;">
                    ${this.renderVehicleStat('VIT', speedRatio)}
                    ${this.renderVehicleStat('ACC', accelerationRatio)}
                    ${this.renderVehicleStat('FREIN', brakeRatio)}
                    ${this.renderVehicleStat('MAN', handlingRatio)}
                </span>
            `;
            vehicleList.appendChild(option);
        }

        const controls = document.createElement('p');
        controls.textContent = 'Z/W accélérer • S freiner • Q/A gauche • D droite';
        controls.style.cssText = `
            margin: 0;
            max-width: min(90vw, 620px);
            font-size: clamp(0.85rem, 2.2vw, 1rem);
            font-weight: 650;
            line-height: 1.5;
            color: rgba(255, 255, 255, 0.88);
            text-shadow: 0 2px 10px rgba(0, 0, 0, 0.75);
        `;

        const button = document.createElement('button');
        button.dataset.role = 'start';
        button.textContent = 'JOUER';
        button.style.cssText = `
            margin-top: 8px;
            padding: 14px 44px;
            font-size: 1.1rem;
            font-weight: 800;
            letter-spacing: 0.08em;
            border: none;
            border-radius: 8px;
            background: #ff3b3b;
            color: #ffffff;
            cursor: pointer;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.32);
        `;

        overlay.appendChild(title);
        overlay.appendChild(subtitle);
        overlay.appendChild(vehicleList);
        overlay.appendChild(controls);
        overlay.appendChild(button);
        return overlay;
    }

    updateVehicleSelection() {
        for (const button of this.vehicleButtons) {
            const isSelected = button.dataset.vehicleId === this.selectedVehicleId;
            button.style.borderColor = isSelected ? '#ffd23f' : 'rgba(255, 255, 255, 0.22)';
            button.style.background = isSelected ? 'rgba(255, 210, 63, 0.24)' : 'rgba(0, 0, 0, 0.32)';
            button.style.transform = isSelected ? 'translateY(-2px)' : 'translateY(0)';
        }
    }

    refreshVehicleBestScores() {
        for (const button of this.vehicleButtons) {
            const bestElement = button.querySelector('[data-role="vehicle-best"]');
            if (bestElement) {
                bestElement.textContent = `REC ${this.formatVehicleBestScore(button.dataset.vehicleId)}`;
            }
        }
    }

    show() {
        this.refreshVehicleBestScores();
        this.element.style.display = 'flex';
    }

    hide() {
        this.element.style.display = 'none';
    }
}

export class GameOverScreen {
    /**
     * @param {() => void} onReplay - appelé quand le joueur clique sur "REJOUER".
     */
    constructor(onReplay) {
        this.element = this.buildElement();
        document.body.appendChild(this.element);

        this.scoreElement = this.element.querySelector('[data-role="final-score"]');
        this.bestElement = this.element.querySelector('[data-role="final-best"]');
        this.summaryElement = this.element.querySelector('[data-role="run-summary"]');
        this.replayButton = this.element.querySelector('button');
        this.replayButton.addEventListener('click', () => {
            this.hide();
            onReplay();
        });
    }

    buildElement() {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            display: none;
            align-items: center;
            justify-content: center;
            flex-direction: column;
            gap: 20px;
            background: rgba(0, 0, 0, 0.68);
            z-index: 10;
            font-family: system-ui, -apple-system, sans-serif;
        `;

        const title = document.createElement('h1');
        title.textContent = 'GAME OVER';
        title.style.cssText = `
            margin: 0;
            font-size: clamp(2.2rem, 8vw, 4rem);
            font-weight: 800;
            letter-spacing: 0.08em;
            color: #ff3b3b;
            text-shadow: 0 2px 16px rgba(0, 0, 0, 0.7);
        `;

        const scoreLine = document.createElement('p');
        scoreLine.dataset.role = 'final-score';
        scoreLine.style.cssText = `
            margin: 0;
            font-size: 1.4rem;
            font-weight: 700;
            color: #ffffff;
            text-shadow: 0 1px 8px rgba(0, 0, 0, 0.7);
        `;

        const bestLine = document.createElement('p');
        bestLine.dataset.role = 'final-best';
        bestLine.style.cssText = `
            margin: 0;
            font-size: 1.1rem;
            font-weight: 600;
            color: #ffd23f;
            text-shadow: 0 1px 8px rgba(0, 0, 0, 0.7);
        `;

        const summary = document.createElement('div');
        summary.dataset.role = 'run-summary';
        summary.style.cssText = `
            display: grid;
            grid-template-columns: repeat(2, minmax(118px, 1fr));
            gap: 10px;
            width: min(88vw, 420px);
        `;

        const button = document.createElement('button');
        button.textContent = 'REJOUER';
        button.style.cssText = `
            margin-top: 8px;
            padding: 14px 40px;
            font-size: 1.1rem;
            font-weight: 700;
            letter-spacing: 0.06em;
            border: none;
            border-radius: 8px;
            background: #ff3b3b;
            color: #ffffff;
            cursor: pointer;
        `;

        overlay.appendChild(title);
        overlay.appendChild(scoreLine);
        overlay.appendChild(bestLine);
        overlay.appendChild(summary);
        overlay.appendChild(button);
        return overlay;
    }

    /**
     * @param {number} finalScore - score obtenu pendant la partie qui vient de se terminer.
     * @param {number} bestScore - meilleur score enregistré (toutes parties confondues).
     * @param {Array<{ label: string, value: string | number }>} summaryItems - statistiques de la partie.
     */
    show(finalScore = 0, bestScore = 0, summaryItems = []) {
        this.scoreElement.textContent = `SCORE : ${finalScore}`;
        this.bestElement.textContent = `MEILLEUR : ${bestScore}`;
        this.summaryElement.textContent = '';

        for (const item of summaryItems) {
            const box = document.createElement('div');
            box.style.cssText = `
                min-height: 58px;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 8px 10px;
                border-radius: 8px;
                background: rgba(255, 255, 255, 0.1);
                box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);
            `;

            const label = document.createElement('span');
            label.textContent = item.label;
            label.style.cssText = `
                font-size: 0.72rem;
                font-weight: 750;
                letter-spacing: 0.08em;
                color: rgba(255, 255, 255, 0.68);
            `;

            const value = document.createElement('span');
            value.textContent = String(item.value);
            value.style.cssText = `
                margin-top: 4px;
                font-size: 1.08rem;
                font-weight: 900;
                color: #ffffff;
                text-shadow: 0 1px 8px rgba(0, 0, 0, 0.65);
            `;

            box.appendChild(label);
            box.appendChild(value);
            this.summaryElement.appendChild(box);
        }

        this.element.style.display = 'flex';
    }

    hide() {
        this.element.style.display = 'none';
    }
}

export class PauseScreen {
    /**
     * @param {() => void} onResume - appelé quand le joueur clique sur "REPRENDRE".
     */
    constructor(onResume) {
        this.element = this.buildElement();
        document.body.appendChild(this.element);

        this.resumeButton = this.element.querySelector('button');
        this.resumeButton.addEventListener('click', onResume);
    }

    buildElement() {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            display: none;
            align-items: center;
            justify-content: center;
            flex-direction: column;
            gap: 18px;
            background: rgba(8, 14, 24, 0.56);
            z-index: 11;
            font-family: system-ui, -apple-system, sans-serif;
            color: #ffffff;
            text-align: center;
        `;

        const title = document.createElement('h1');
        title.textContent = 'PAUSE';
        title.style.cssText = `
            margin: 0;
            font-size: clamp(2.4rem, 8vw, 4.6rem);
            font-weight: 900;
            letter-spacing: 0.12em;
            text-shadow: 0 3px 18px rgba(0, 0, 0, 0.8);
        `;

        const button = document.createElement('button');
        button.textContent = 'REPRENDRE';
        button.style.cssText = `
            padding: 14px 40px;
            font-size: 1.05rem;
            font-weight: 800;
            letter-spacing: 0.08em;
            border: none;
            border-radius: 8px;
            background: #ff3b3b;
            color: #ffffff;
            cursor: pointer;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.32);
        `;

        overlay.appendChild(title);
        overlay.appendChild(button);
        return overlay;
    }

    show() {
        this.element.style.display = 'flex';
    }

    hide() {
        this.element.style.display = 'none';
    }
}

export class CountdownOverlay {
    constructor() {
        this.element = this.buildElement();
        document.body.appendChild(this.element);

        this.valueElement = this.element.querySelector('[data-role="countdown-value"]');
    }

    buildElement() {
        const overlay = document.createElement('div');
        overlay.setAttribute('aria-hidden', 'true');
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 9;
            pointer-events: none;
            font-family: system-ui, -apple-system, sans-serif;
        `;

        const value = document.createElement('div');
        value.dataset.role = 'countdown-value';
        value.style.cssText = `
            min-width: 160px;
            text-align: center;
            font-size: clamp(4.5rem, 18vw, 9rem);
            font-weight: 950;
            letter-spacing: 0.04em;
            color: #ffffff;
            text-shadow:
                0 0 18px rgba(255, 210, 63, 0.9),
                0 5px 26px rgba(0, 0, 0, 0.85);
            transform: scale(1);
            opacity: 1;
        `;

        overlay.appendChild(value);
        return overlay;
    }

    update(label, phaseProgress = 0, isGo = false) {
        const clampedProgress = Math.max(0, Math.min(1, phaseProgress));
        const scale = isGo
            ? 1 + (1 - clampedProgress) * 0.18
            : 1.18 - clampedProgress * 0.24;
        const opacity = isGo
            ? 1 - clampedProgress * 0.55
            : 1 - clampedProgress * 0.18;

        this.valueElement.textContent = label;
        this.valueElement.style.color = isGo ? '#ffd23f' : '#ffffff';
        this.valueElement.style.transform = `scale(${scale})`;
        this.valueElement.style.opacity = String(opacity);
        this.element.style.display = 'flex';
        this.element.setAttribute('aria-hidden', 'false');
    }

    hide() {
        this.element.style.display = 'none';
        this.element.setAttribute('aria-hidden', 'true');
    }
}

export class AudioToggleButton {
    constructor({ muted = false, onToggle = () => {} } = {}) {
        this.muted = Boolean(muted);
        this.onToggle = onToggle;
        this.button = this.buildElement();

        this.button.addEventListener('click', () => {
            this.onToggle(!this.muted);
        });

        document.body.appendChild(this.button);
        this.update(this.muted);
    }

    buildElement() {
        const button = document.createElement('button');
        button.type = 'button';
        button.style.cssText = `
            position: fixed;
            right: 16px;
            bottom: 16px;
            z-index: 13;
            min-width: 88px;
            min-height: 40px;
            padding: 0 12px;
            border-radius: 8px;
            border: 1px solid rgba(255, 255, 255, 0.22);
            font-family: system-ui, -apple-system, sans-serif;
            font-size: 0.74rem;
            font-weight: 900;
            letter-spacing: 0.08em;
            color: #ffffff;
            cursor: pointer;
            text-shadow: 0 1px 6px rgba(0, 0, 0, 0.75);
            backdrop-filter: blur(8px);
        `;
        return button;
    }

    update(muted) {
        this.muted = Boolean(muted);
        this.button.textContent = this.muted ? 'SON OFF' : 'SON ON';
        this.button.title = this.muted ? 'Remettre le son' : 'Couper le son';
        this.button.setAttribute('aria-label', this.button.title);
        this.button.setAttribute('aria-pressed', String(this.muted));
        this.button.style.background = this.muted
            ? 'rgba(0, 0, 0, 0.42)'
            : 'rgba(255, 210, 63, 0.22)';
        this.button.style.borderColor = this.muted
            ? 'rgba(255, 255, 255, 0.22)'
            : 'rgba(255, 210, 63, 0.5)';
        this.button.style.boxShadow = this.muted
            ? '0 8px 22px rgba(0, 0, 0, 0.26)'
            : '0 8px 22px rgba(255, 210, 63, 0.16)';
    }
}

// --- Styles du HUD ---------------------------------------------------------
// Injectés une seule fois (balise <style> globale) : nécessaire pour les
// animations @keyframes, impossibles à exprimer avec de simples
// `element.style.cssText`. On vérifie l'ID avant d'injecter pour rester
// robuste si jamais plusieurs ScoreHud étaient créés (ex. hot-reload).
const HUD_STYLE_ID = 'highway-rush-hud-styles';

function injectHudStylesOnce() {
    if (document.getElementById(HUD_STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = HUD_STYLE_ID;
    style.textContent = `
        .hr-hud-zone {
            position: fixed;
            z-index: 5;
            font-family: system-ui, -apple-system, sans-serif;
            color: #ffffff;
            text-shadow: 0 1px 6px rgba(0, 0, 0, 0.8);
            pointer-events: none;
            user-select: none;
        }

        /* --- Zone 1 : score (haut-gauche) --- */
        .hr-score-hud {
            top: 16px;
            left: 16px;
            line-height: 1.4;
        }
        .hr-score-hud .hr-score-label,
        .hr-score-hud .hr-best-label {
            font-size: clamp(0.65rem, 1.6vw, 0.78rem);
            font-weight: 600;
            letter-spacing: 0.12em;
            opacity: 0.75;
        }
        .hr-score-hud .hr-score-value {
            font-size: clamp(1.4rem, 4vw, 1.9rem);
            font-weight: 800;
            letter-spacing: 0.02em;
        }
        .hr-score-hud .hr-best-value {
            font-size: clamp(0.95rem, 2.4vw, 1.15rem);
            font-weight: 600;
            color: #ffd23f;
            margin-bottom: 4px;
        }

        /* --- Zone 2 : niveau (haut-droite) --- */
        .hr-level-hud {
            top: 16px;
            right: 16px;
            text-align: right;
        }
        .hr-level-hud .hr-level-value {
            display: inline-block;
            font-size: clamp(0.85rem, 2.2vw, 1.05rem);
            font-weight: 700;
            letter-spacing: 0.08em;
            color: #9fd8ff;
            transform-origin: right center;
        }
        .hr-level-hud .hr-level-value.hr-level-pulse {
            animation: hr-level-pulse 0.55s ease-out;
        }

        /* --- Zone 3 : combo (droite, sous le niveau) --- */
        .hr-combo-hud {
            top: 56px;
            right: 16px;
            text-align: right;
            min-height: 1.6rem;
        }
        .hr-combo-box {
            display: inline-flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 5px;
            opacity: 0;
            transform: translateY(-6px);
            transition: opacity 0.18s ease, transform 0.18s ease;
        }
        .hr-combo-box.hr-combo-visible {
            opacity: 1;
            transform: translateY(0);
        }
        .hr-combo-hud .hr-combo-value {
            display: inline-block;
            font-size: clamp(1rem, 2.8vw, 1.3rem);
            font-weight: 800;
            letter-spacing: 0.04em;
            color: #ffd23f;
        }
        .hr-combo-timer {
            font-size: clamp(0.62rem, 1.6vw, 0.72rem);
            font-weight: 850;
            letter-spacing: 0.08em;
            color: rgba(255, 255, 255, 0.76);
        }
        .hr-combo-row {
            display: inline-flex;
            align-items: center;
            gap: 8px;
        }
        .hr-combo-meter {
            width: 88px;
            height: 4px;
            border-radius: 999px;
            overflow: hidden;
            background: rgba(255, 255, 255, 0.18);
        }
        .hr-combo-fill {
            height: 100%;
            width: 0%;
            border-radius: inherit;
            background: linear-gradient(90deg, #ff5a3f, #ffd23f);
            transition: width 0.08s linear;
        }

        /* --- Zone 4 : objectif courant (haut-centre) --- */
        .hr-objective-hud {
            top: 16px;
            left: 50%;
            width: min(42vw, 300px);
            transform: translateX(-50%) translateY(-6px);
            opacity: 0;
            transition: opacity 0.18s ease, transform 0.18s ease;
        }
        .hr-objective-hud.hr-objective-visible {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }
        .hr-objective-panel {
            padding: 8px 10px;
            border-radius: 8px;
            background: rgba(0, 0, 0, 0.28);
            box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);
        }
        .hr-objective-topline {
            display: flex;
            justify-content: space-between;
            gap: 10px;
            align-items: baseline;
        }
        .hr-objective-label {
            font-size: clamp(0.62rem, 1.5vw, 0.72rem);
            font-weight: 900;
            letter-spacing: 0.12em;
            color: #ffd23f;
        }
        .hr-objective-reward {
            font-size: clamp(0.62rem, 1.5vw, 0.72rem);
            font-weight: 850;
            color: rgba(255, 255, 255, 0.72);
        }
        .hr-objective-description {
            display: block;
            margin-top: 3px;
            font-size: clamp(0.76rem, 1.9vw, 0.9rem);
            font-weight: 800;
            color: #ffffff;
        }
        .hr-objective-progress {
            display: block;
            margin-top: 2px;
            font-size: clamp(0.64rem, 1.6vw, 0.75rem);
            font-weight: 800;
            color: rgba(255, 255, 255, 0.7);
        }
        .hr-objective-meter {
            height: 4px;
            margin-top: 7px;
            border-radius: 999px;
            overflow: hidden;
            background: rgba(255, 255, 255, 0.16);
        }
        .hr-objective-fill {
            height: 100%;
            width: 0%;
            border-radius: inherit;
            background: linear-gradient(90deg, #7fe0ff, #ffd23f);
            transition: width 0.12s linear;
        }

        /* --- Zone 5 : file de notifications d'événements (droite, sous le combo) --- */
        .hr-notifications-hud {
            top: 108px;
            right: 16px;
            max-width: min(70vw, 320px);
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 6px;
        }
        .hr-notification {
            font-size: clamp(0.85rem, 2.4vw, 1.05rem);
            font-weight: 700;
            color: #ffd23f;
            background: rgba(0, 0, 0, 0.28);
            padding: 3px 10px;
            border-radius: 6px;
            white-space: nowrap;
            animation: hr-notification-in 0.22s ease-out;
        }
        .hr-notification.hr-notification-leaving {
            animation: hr-notification-out 0.28s ease-in forwards;
        }

        /* --- Zone 6 : compteur de vitesse (bas-gauche) --- */
        .hr-speed-hud {
            left: 16px;
            bottom: 16px;
            min-width: 108px;
            text-align: left;
            line-height: 1;
        }
        .hr-speed-hud .hr-speed-value {
            display: inline-block;
            min-width: 3ch;
            font-size: clamp(1.65rem, 4.5vw, 2.4rem);
            font-weight: 900;
            letter-spacing: 0.02em;
        }
        .hr-speed-hud .hr-speed-unit {
            margin-left: 4px;
            font-size: clamp(0.7rem, 1.8vw, 0.85rem);
            font-weight: 800;
            letter-spacing: 0.08em;
            color: rgba(255, 255, 255, 0.72);
        }
        .hr-speed-score-label {
            display: block;
            margin-top: 7px;
            font-size: clamp(0.62rem, 1.6vw, 0.72rem);
            font-weight: 900;
            letter-spacing: 0.1em;
            color: rgba(255, 255, 255, 0.68);
        }
        .hr-speed-score-meter {
            display: block;
            width: 118px;
            height: 5px;
            margin-top: 5px;
            border-radius: 999px;
            overflow: hidden;
            background: rgba(255, 255, 255, 0.16);
        }
        .hr-speed-score-fill {
            display: block;
            width: 0%;
            height: 100%;
            border-radius: inherit;
            background: linear-gradient(90deg, #ff5542, #ffd23f, #7fe0ff);
            transition: width 0.12s linear;
        }
        .hr-speed-hud.hr-speed-no-score .hr-speed-value {
            color: #ff6a4f;
        }
        .hr-speed-hud.hr-speed-scoring .hr-speed-value {
            color: #ffffff;
        }
        .hr-speed-hud.hr-speed-full-score .hr-speed-value {
            color: #7fe0ff;
        }

        /* --- Zone 7 : alerte danger (bas-centre) --- */
        .hr-danger-hud {
            left: 50%;
            bottom: 28px;
            transform: translateX(-50%) translateY(10px);
            opacity: 0;
            transition: opacity 0.16s ease, transform 0.16s ease;
        }
        .hr-danger-hud.hr-danger-visible {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }
        .hr-danger-indicator {
            min-width: 148px;
            padding: 8px 12px;
            border-radius: 8px;
            border: 1px solid rgba(255, 86, 58, 0.72);
            background: rgba(90, 12, 10, 0.46);
            box-shadow: 0 0 18px rgba(255, 58, 42, 0.28);
        }
        .hr-danger-hud.hr-danger-critical .hr-danger-indicator {
            animation: hr-danger-pulse 0.42s ease-in-out infinite alternate;
        }
        .hr-danger-title {
            display: block;
            font-size: clamp(0.72rem, 2vw, 0.82rem);
            font-weight: 900;
            letter-spacing: 0.12em;
            color: #ff6a4f;
        }
        .hr-danger-distance {
            display: block;
            margin-top: 2px;
            font-size: clamp(0.86rem, 2.2vw, 1rem);
            font-weight: 850;
            color: #ffffff;
        }
        .hr-danger-meter {
            height: 4px;
            margin-top: 7px;
            border-radius: 999px;
            overflow: hidden;
            background: rgba(255, 255, 255, 0.18);
        }
        .hr-danger-fill {
            height: 100%;
            width: 0%;
            border-radius: inherit;
            background: linear-gradient(90deg, #ffd23f, #ff4b34);
            transition: width 0.08s linear;
        }

        /* Notification à deux lignes (titre + montant), utilisée pour les
           dépassements et les near miss : chaque type a sa propre couleur et
           sa propre échelle, pour bien les différencier au premier coup d'œil. */
        .hr-notification-title,
        .hr-notification-amount {
            display: block;
            text-align: right;
            line-height: 1.15;
        }

        .hr-notification-overtake {
            color: #ffb347;
            background: rgba(0, 0, 0, 0.24);
        }
        .hr-notification-overtake .hr-notification-title {
            font-size: clamp(0.68rem, 1.9vw, 0.8rem);
            font-weight: 700;
            letter-spacing: 0.08em;
            opacity: 0.9;
        }
        .hr-notification-overtake .hr-notification-amount {
            font-size: clamp(0.85rem, 2.2vw, 1rem);
            font-weight: 800;
        }

        /* Le near miss est l'événement le plus "gratifiant" du jeu : notification
           plus grande, plus lumineuse, avec un petit effet de pop à l'apparition. */
        .hr-notification-near-miss {
            color: #7fe0ff;
            background: rgba(0, 36, 54, 0.38);
            animation: hr-notification-in 0.18s ease-out, hr-notification-pop 0.32s ease-out;
        }
        .hr-notification-near-miss .hr-notification-title {
            font-size: clamp(0.95rem, 2.6vw, 1.15rem);
            font-weight: 800;
            letter-spacing: 0.04em;
        }
        .hr-notification-near-miss .hr-notification-amount {
            font-size: clamp(1.05rem, 2.8vw, 1.3rem);
            font-weight: 800;
        }
        .hr-notification-objective {
            color: #ffffff;
            background: rgba(255, 210, 63, 0.22);
            box-shadow: inset 0 0 0 1px rgba(255, 210, 63, 0.35);
            animation: hr-notification-in 0.18s ease-out, hr-notification-pop 0.32s ease-out;
        }
        .hr-notification-objective .hr-notification-title {
            font-size: clamp(0.82rem, 2.2vw, 0.98rem);
            font-weight: 900;
            letter-spacing: 0.08em;
            color: #ffd23f;
        }
        .hr-notification-objective .hr-notification-amount {
            font-size: clamp(0.95rem, 2.5vw, 1.18rem);
            font-weight: 900;
        }

        @keyframes hr-level-pulse {
            0% { transform: scale(1); }
            35% { transform: scale(1.3); color: #ffffff; }
            100% { transform: scale(1); color: #9fd8ff; }
        }

        @keyframes hr-notification-in {
            from { opacity: 0; transform: translateX(24px); }
            to { opacity: 1; transform: translateX(0); }
        }

        @keyframes hr-notification-out {
            from { opacity: 1; transform: translateX(0); }
            to { opacity: 0; transform: translateX(24px); }
        }

        @keyframes hr-notification-pop {
            0% { transform: scale(0.7); }
            60% { transform: scale(1.12); }
            100% { transform: scale(1); }
        }

        @keyframes hr-danger-pulse {
            from { box-shadow: 0 0 14px rgba(255, 58, 42, 0.28); }
            to { box-shadow: 0 0 30px rgba(255, 88, 54, 0.62); }
        }

        /* Pulsation du combo : se déclenche à chaque VRAIE augmentation du
           multiplicateur (voir ScoreHud.update), pour faire "ressentir" la
           montée en puissance sans devoir la répéter à chaque frame. */
        .hr-combo-hud .hr-combo-value.hr-combo-pulse {
            animation: hr-combo-pulse 0.32s ease-out;
        }
        @keyframes hr-combo-pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.35); }
            100% { transform: scale(1); }
        }

        /* --- Lignes de vitesse : effet radial très léger, purement CSS/GPU
           (transform + opacity uniquement), toujours "en cours d'animation"
           mais invisible tant que l'intensité (pilotée en JS) est à 0. --- */
        .hr-speed-lines {
            position: fixed;
            inset: 0;
            z-index: 3;
            pointer-events: none;
            overflow: hidden;
            opacity: 0;
        }
        .hr-speed-line-spoke {
            position: absolute;
            top: 50%;
            left: 50%;
            width: 0;
            height: 0;
        }
        .hr-speed-line-bar {
            position: absolute;
            left: -1px;
            top: 0;
            width: 2px;
            height: 42vmax;
            background: linear-gradient(to bottom, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.85) 45%, rgba(255, 255, 255, 0) 100%);
            animation: hr-speed-line-stream 0.85s linear infinite;
        }
        @keyframes hr-speed-line-stream {
            0% { transform: translateY(6vmax) scaleY(0.35); opacity: 0; }
            18% { opacity: 1; }
            100% { transform: translateY(46vmax) scaleY(1); opacity: 0; }
        }

        /* --- Petits écrans : on resserre l'espacement vertical entre zones --- */
        @media (max-width: 480px) {
            .hr-objective-hud {
                top: 82px;
                width: min(72vw, 300px);
            }
            .hr-combo-hud { top: 50px; }
            .hr-notifications-hud { top: 146px; max-width: 60vw; }
            .hr-speed-hud { bottom: 12px; left: 12px; }
            .hr-danger-hud { bottom: 70px; }
            .hr-notification { padding: 2px 8px; }
        }
    `;
    document.head.appendChild(style);
}

// Combien de temps un popup d'événement reste pleinement visible avant de
// commencer à s'effacer (ms). La sortie animée elle-même (hr-notification-out)
// dure NOTIFICATION_EXIT_DURATION_MS, écoulé après ce délai.
const NOTIFICATION_VISIBLE_DURATION_MS = 1500;
const NOTIFICATION_EXIT_DURATION_MS = 280;

// Nombre maximum de notifications visibles simultanément dans la file : au
// delà, la plus ancienne est retirée immédiatement pour ne jamais laisser le
// HUD déborder si le joueur enchaîne beaucoup d'événements très vite.
const MAX_VISIBLE_NOTIFICATIONS = 4;

// Conversion purement visuelle : les unités de vitesse du gameplay restent
// inchangées, mais le compteur affiche une valeur plus crédible.
export const SPEED_DISPLAY_KMH_PER_GAME_UNIT = 2;

// Configuration des notifications "à deux lignes" (titre + montant) : le
// near miss est volontairement plus visible et reste affiché un peu plus
// longtemps que le dépassement, conformément à la demande "un near miss
// doit donner envie au joueur de recommencer" / "le dépassement doit être
// moins important que le near miss".
const NOTIFICATION_TYPES = {
    overtake: { title: 'DÉPASSEMENT', className: 'hr-notification-overtake', visibleDurationMs: 1100 },
    'near-miss': { title: 'NEAR MISS !', className: 'hr-notification-near-miss', visibleDurationMs: 1700 },
    objective: { title: 'OBJECTIF RÉUSSI', className: 'hr-notification-objective', visibleDurationMs: 1700 },
};

/**
 * HUD permanent, organisé en 4 zones DOM totalement indépendantes (score,
 * niveau, combo, notifications d'événements) : chacune a sa propre
 * `position: fixed`, donc aucune ne peut jamais se retrouver visuellement
 * "par-dessus" une autre, quel que soit l'enchaînement d'événements.
 */
export class ScoreHud {
    constructor() {
        injectHudStylesOnce();

        this.lastRenderedLevel = null;
        this.levelPulseTimeoutId = null;
        this.comboHideTimeoutId = null;
        this.lastRenderedCombo = 0;
        this.comboPulseTimeoutId = null;

        // File de notifications actives : chaque entrée { element, hideTimeoutId, removeTimeoutId }.
        this.activeNotifications = [];

        this.buildElements();
    }

    buildElements() {
        // --- Zone 1 : score ---
        this.scoreZone = document.createElement('div');
        this.scoreZone.className = 'hr-hud-zone hr-score-hud';
        this.scoreZone.innerHTML = `
            <div class="hr-best-label">MEILLEUR</div>
            <div class="hr-best-value" data-role="best"></div>
            <div class="hr-score-label">SCORE</div>
            <div class="hr-score-value" data-role="score"></div>
        `;
        this.scoreValueElement = this.scoreZone.querySelector('[data-role="score"]');
        this.bestValueElement = this.scoreZone.querySelector('[data-role="best"]');
        document.body.appendChild(this.scoreZone);

        // --- Zone 2 : niveau ---
        this.levelZone = document.createElement('div');
        this.levelZone.className = 'hr-hud-zone hr-level-hud';
        this.levelZone.innerHTML = '<span class="hr-level-value" data-role="level"></span>';
        this.levelValueElement = this.levelZone.querySelector('[data-role="level"]');
        document.body.appendChild(this.levelZone);

        // --- Zone 3 : combo ---
        this.comboZone = document.createElement('div');
        this.comboZone.className = 'hr-hud-zone hr-combo-hud';
        this.comboZone.innerHTML = `
            <span class="hr-combo-box" data-role="combo-box">
                <span class="hr-combo-value" data-role="combo"></span>
                <span class="hr-combo-row">
                    <span class="hr-combo-meter">
                        <span class="hr-combo-fill" data-role="combo-fill"></span>
                    </span>
                    <span class="hr-combo-timer" data-role="combo-timer"></span>
                </span>
            </span>
        `;
        this.comboBoxElement = this.comboZone.querySelector('[data-role="combo-box"]');
        this.comboValueElement = this.comboZone.querySelector('[data-role="combo"]');
        this.comboFillElement = this.comboZone.querySelector('[data-role="combo-fill"]');
        this.comboTimerElement = this.comboZone.querySelector('[data-role="combo-timer"]');
        document.body.appendChild(this.comboZone);

        // --- Zone 4 : objectif courant ---
        this.objectiveZone = document.createElement('div');
        this.objectiveZone.className = 'hr-hud-zone hr-objective-hud';
        this.objectiveZone.setAttribute('aria-hidden', 'true');
        this.objectiveZone.innerHTML = `
            <div class="hr-objective-panel">
                <span class="hr-objective-topline">
                    <span class="hr-objective-label" data-role="objective-label"></span>
                    <span class="hr-objective-reward" data-role="objective-reward"></span>
                </span>
                <span class="hr-objective-description" data-role="objective-description"></span>
                <span class="hr-objective-progress" data-role="objective-progress"></span>
                <div class="hr-objective-meter">
                    <div class="hr-objective-fill" data-role="objective-fill"></div>
                </div>
            </div>
        `;
        this.objectiveLabelElement = this.objectiveZone.querySelector('[data-role="objective-label"]');
        this.objectiveRewardElement = this.objectiveZone.querySelector('[data-role="objective-reward"]');
        this.objectiveDescriptionElement = this.objectiveZone.querySelector('[data-role="objective-description"]');
        this.objectiveProgressElement = this.objectiveZone.querySelector('[data-role="objective-progress"]');
        this.objectiveFillElement = this.objectiveZone.querySelector('[data-role="objective-fill"]');
        document.body.appendChild(this.objectiveZone);

        // --- Zone 5 : file de notifications d'événements ---
        this.notificationsZone = document.createElement('div');
        this.notificationsZone.className = 'hr-hud-zone hr-notifications-hud';
        document.body.appendChild(this.notificationsZone);

        // --- Zone 6 : compteur de vitesse ---
        this.speedZone = document.createElement('div');
        this.speedZone.className = 'hr-hud-zone hr-speed-hud';
        this.speedZone.innerHTML = `
            <span class="hr-speed-value" data-role="speed">0</span>
            <span class="hr-speed-unit">KM/H</span>
            <span class="hr-speed-score-label" data-role="speed-score-label">SCORE x0</span>
            <span class="hr-speed-score-meter">
                <span class="hr-speed-score-fill" data-role="speed-score-fill"></span>
            </span>
        `;
        this.speedValueElement = this.speedZone.querySelector('[data-role="speed"]');
        this.speedScoreLabelElement = this.speedZone.querySelector('[data-role="speed-score-label"]');
        this.speedScoreFillElement = this.speedZone.querySelector('[data-role="speed-score-fill"]');
        document.body.appendChild(this.speedZone);

        // --- Zone 7 : alerte danger ---
        this.dangerZone = document.createElement('div');
        this.dangerZone.className = 'hr-hud-zone hr-danger-hud';
        this.dangerZone.setAttribute('aria-hidden', 'true');
        this.dangerZone.innerHTML = `
            <div class="hr-danger-indicator">
                <span class="hr-danger-title">DANGER</span>
                <span class="hr-danger-distance" data-role="danger-distance"></span>
                <div class="hr-danger-meter">
                    <div class="hr-danger-fill" data-role="danger-fill"></div>
                </div>
            </div>
        `;
        this.dangerDistanceElement = this.dangerZone.querySelector('[data-role="danger-distance"]');
        this.dangerFillElement = this.dangerZone.querySelector('[data-role="danger-fill"]');
        document.body.appendChild(this.dangerZone);

        this.update(0, 0);
        this.updateLevel(1);
        this.updateSpeed(0);
        this.updateDanger(null);
        this.updateObjective(null);
    }

    /**
     * Met à jour l'indicateur de niveau (zone indépendante). Une courte
     * pulsation ne se déclenche QUE lorsque le niveau affiché change
     * réellement, pas à chaque appel (cette méthode est appelée en continu
     * depuis game.js).
     */
    updateLevel(level) {
        this.levelValueElement.textContent = `NIVEAU ${level}`;

        if (this.lastRenderedLevel !== null && level !== this.lastRenderedLevel) {
            this.levelValueElement.classList.remove('hr-level-pulse');
            // Force le redémarrage de l'animation même si elle est encore
            // en cours (double changement de niveau rapproché).
            // eslint-disable-next-line no-unused-expressions
            this.levelValueElement.offsetWidth;
            this.levelValueElement.classList.add('hr-level-pulse');

            if (this.levelPulseTimeoutId) clearTimeout(this.levelPulseTimeoutId);
            this.levelPulseTimeoutId = setTimeout(() => {
                this.levelValueElement.classList.remove('hr-level-pulse');
            }, 600);
        }

        this.lastRenderedLevel = level;
    }

    /**
     * @param {number} comboMultiplier - multiplicateur de combo courant (0 = aucun combo actif).
     */
    update(score, bestScore, comboMultiplier = 0, comboProgress = 0, comboTimeRemaining = 0) {
        this.scoreValueElement.textContent = Math.floor(score).toLocaleString('fr-FR');
        this.bestValueElement.textContent = Math.floor(bestScore).toLocaleString('fr-FR');

        if (comboMultiplier >= 1) {
            const clampedComboProgress = Math.max(0, Math.min(1, comboProgress));
            this.comboValueElement.textContent = `COMBO x${comboMultiplier}`;
            this.comboFillElement.style.width = `${Math.round(clampedComboProgress * 100)}%`;
            this.comboTimerElement.textContent = `${comboTimeRemaining.toFixed(1)}s`;
            this.comboBoxElement.classList.add('hr-combo-visible');

            // La pulsation ne se déclenche que sur une VRAIE augmentation du
            // multiplicateur affiché (pas à chaque appel, cette méthode
            // étant appelée en continu depuis game.js) : elle "ressent" la
            // montée en puissance sans jamais se répéter en boucle.
            if (comboMultiplier > this.lastRenderedCombo) {
                this.comboValueElement.classList.remove('hr-combo-pulse');
                // eslint-disable-next-line no-unused-expressions
                this.comboValueElement.offsetWidth;
                this.comboValueElement.classList.add('hr-combo-pulse');

                if (this.comboPulseTimeoutId) clearTimeout(this.comboPulseTimeoutId);
                this.comboPulseTimeoutId = setTimeout(() => {
                    this.comboValueElement.classList.remove('hr-combo-pulse');
                }, 350);
            }

            if (this.comboHideTimeoutId) clearTimeout(this.comboHideTimeoutId);
            // Le combo reste affiché tant qu'il est actif ; il n'est masqué
            // par updateCombo (côté score.js) que via un retour à 0/1 ici,
            // donc pas besoin de timer côté HUD au-delà d'une sécurité.
        } else {
            this.comboBoxElement.classList.remove('hr-combo-visible');
            this.comboValueElement.classList.remove('hr-combo-visible', 'hr-combo-pulse');
            this.comboFillElement.style.width = '0%';
            this.comboTimerElement.textContent = '';
        }

        this.lastRenderedCombo = comboMultiplier;
    }

    updateSpeed(speed, scoreFactor = 0) {
        const displaySpeed = Math.max(0, Math.round(speed * SPEED_DISPLAY_KMH_PER_GAME_UNIT));
        const clampedScoreFactor = Math.max(0, Math.min(1, scoreFactor));
        this.speedValueElement.textContent = displaySpeed.toLocaleString('fr-FR');
        this.speedScoreLabelElement.textContent = clampedScoreFactor <= 0
            ? 'SCORE x0'
            : `SCORE x${clampedScoreFactor.toFixed(1)}`;
        this.speedScoreFillElement.style.width = `${Math.round(clampedScoreFactor * 100)}%`;

        this.speedZone.classList.toggle('hr-speed-no-score', clampedScoreFactor <= 0);
        this.speedZone.classList.toggle('hr-speed-scoring', clampedScoreFactor > 0 && clampedScoreFactor < 1);
        this.speedZone.classList.toggle('hr-speed-full-score', clampedScoreFactor >= 1);
    }

    updateDanger(dangerInfo) {
        if (!dangerInfo) {
            this.dangerZone.classList.remove('hr-danger-visible', 'hr-danger-critical');
            this.dangerZone.setAttribute('aria-hidden', 'true');
            this.dangerFillElement.style.width = '0%';
            return;
        }

        const intensity = Math.max(0, Math.min(1, dangerInfo.intensity));
        const distance = Math.max(0, Math.round(dangerInfo.distance));

        this.dangerDistanceElement.textContent = `${distance} M`;
        this.dangerFillElement.style.width = `${Math.round(intensity * 100)}%`;
        this.dangerZone.classList.add('hr-danger-visible');
        this.dangerZone.setAttribute('aria-hidden', 'false');
        this.dangerZone.classList.toggle('hr-danger-critical', intensity >= 0.72);
    }

    updateObjective(objective) {
        if (!objective) {
            this.objectiveZone.classList.remove('hr-objective-visible');
            this.objectiveZone.setAttribute('aria-hidden', 'true');
            this.objectiveFillElement.style.width = '0%';
            return;
        }

        const progressRatio = Math.max(0, Math.min(1, objective.progressRatio));

        this.objectiveLabelElement.textContent = objective.label;
        this.objectiveRewardElement.textContent = `+${objective.reward}`;
        this.objectiveDescriptionElement.textContent = objective.description;
        this.objectiveProgressElement.textContent = objective.progressLabel;
        this.objectiveFillElement.style.width = `${Math.round(progressRatio * 100)}%`;
        this.objectiveZone.classList.add('hr-objective-visible');
        this.objectiveZone.setAttribute('aria-hidden', 'false');
    }

    /**
     * Ajoute un événement à la file de notifications, dans sa propre zone
     * indépendante du score, du niveau et du combo. Plusieurs appels
     * rapprochés s'empilent proprement (chacun son propre élément DOM) au
     * lieu de s'écraser.
     *
     * Deux façons de l'appeler :
     *   - `showEventBonus('NIVEAU 3')` : texte simple, une seule ligne
     *     (utilisé pour le changement de niveau, resté générique).
     *   - `showEventBonus('overtake', 100)` / `showEventBonus('near-miss', 250)` :
     *     notification à deux lignes (titre + montant), stylée selon le
     *     type (voir NOTIFICATION_TYPES) — dépassement discret, near miss
     *     plus marquant.
     */
    showEventBonus(typeOrText, amount) {
        const config = amount !== undefined ? NOTIFICATION_TYPES[typeOrText] : null;

        // Zone pleine : on retire immédiatement la plus ancienne pour
        // laisser la place, plutôt que de laisser le HUD déborder.
        if (this.activeNotifications.length >= MAX_VISIBLE_NOTIFICATIONS) {
            const oldest = this.activeNotifications.shift();
            if (oldest.hideTimeoutId) clearTimeout(oldest.hideTimeoutId);
            if (oldest.removeTimeoutId) clearTimeout(oldest.removeTimeoutId);
            oldest.element.remove();
        }

        const notificationElement = document.createElement('div');

        if (config) {
            notificationElement.className = `hr-notification ${config.className}`;
            notificationElement.innerHTML = `
                <span class="hr-notification-title">${config.title}</span>
                <span class="hr-notification-amount">+${Math.floor(amount)}</span>
            `;
        } else {
            notificationElement.className = 'hr-notification';
            notificationElement.textContent = typeOrText;
        }
        this.notificationsZone.appendChild(notificationElement);

        const entry = { element: notificationElement, hideTimeoutId: null, removeTimeoutId: null };
        this.activeNotifications.push(entry);

        const visibleDuration = config ? config.visibleDurationMs : NOTIFICATION_VISIBLE_DURATION_MS;

        entry.hideTimeoutId = setTimeout(() => {
            notificationElement.classList.add('hr-notification-leaving');
            entry.removeTimeoutId = setTimeout(() => {
                notificationElement.remove();
                const index = this.activeNotifications.indexOf(entry);
                if (index !== -1) this.activeNotifications.splice(index, 1);
            }, NOTIFICATION_EXIT_DURATION_MS);
        }, visibleDuration);
    }
}

// Nombre de "rayons" de lignes de vitesse, répartis autour de l'écran.
// Créés UNE SEULE FOIS à la construction : chaque frame ne fait ensuite que
// modifier une opacité globale sur le conteneur, jamais de création/suppression
// d'élément — coût quasi nul, même à haute fréquence d'appel.
const SPEED_LINE_COUNT = 10;
// Ratio de vitesse à partir duquel les lignes commencent à apparaître :
// volontairement plus haut que la vignette, pour rester un effet réservé
// aux toutes dernières fractions de vitesse maximale.
const SPEED_LINE_THRESHOLD = 0.62;

/**
 * Effet de vitesse : un léger assombrissement des bords de l'écran
 * (vignette) qui s'intensifie avec la vitesse, complété par de discrètes
 * lignes de vitesse radiales qui n'apparaissent qu'à très haute vitesse.
 * Aucun élément DOM n'est créé/détruit après la construction : chaque
 * appel à update() ne fait que modifier des propriétés CSS existantes.
 */
export class SpeedEffectOverlay {
    constructor() {
        // Partage la même feuille de style que ScoreHud (classes .hr-speed-*) ;
        // idempotent, donc sûr quel que soit l'ordre de construction des deux.
        injectHudStylesOnce();

        this.element = document.createElement('div');
        this.element.style.cssText = `
            position: fixed;
            inset: 0;
            z-index: 4;
            pointer-events: none;
            box-shadow: inset 0 0 0 rgba(0, 0, 0, 0);
        `;
        document.body.appendChild(this.element);

        this.linesContainer = this.buildSpeedLines();
    }

    /**
     * Construit les "rayons" de lignes de vitesse : chacun est un petit
     * pivot positionné au centre de l'écran et tourné à un angle fixe
     * (réparti sur 360°, avec une légère variation aléatoire pour éviter un
     * motif trop mécanique), contenant une barre qui s'anime en boucle via
     * CSS pur (transform + opacity) pour s'éloigner du centre.
     */
    buildSpeedLines() {
        const container = document.createElement('div');
        container.className = 'hr-speed-lines';

        for (let i = 0; i < SPEED_LINE_COUNT; i++) {
            const spoke = document.createElement('div');
            spoke.className = 'hr-speed-line-spoke';

            const angle = (360 / SPEED_LINE_COUNT) * i + (Math.random() * 14 - 7);
            const animationDelay = Math.random() * 0.85; // désynchronise les rayons entre eux
            spoke.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;

            const bar = document.createElement('div');
            bar.className = 'hr-speed-line-bar';
            bar.style.animationDelay = `-${animationDelay}s`;

            spoke.appendChild(bar);
            container.appendChild(spoke);
        }

        document.body.appendChild(container);
        return container;
    }

    /**
     * @param {number} speedRatio - 0 (à l'arrêt) à 1 (vitesse maximale).
     */
    update(speedRatio) {
        // L'effet ne démarre qu'à partir de 55% de la vitesse max, pour
        // rester totalement invisible en conduite normale.
        const rawIntensity = (speedRatio - 0.55) / 0.45;
        const intensity = Math.min(1, Math.max(0, rawIntensity));

        const blur = 40 + intensity * 110;
        const spread = -10 - intensity * 8;
        const opacity = intensity * 0.5;

        this.element.style.boxShadow = `inset 0 0 ${blur}px ${spread}px rgba(8, 8, 16, ${opacity})`;

        const lineIntensity = Math.min(1, Math.max(0, (speedRatio - SPEED_LINE_THRESHOLD) / (1 - SPEED_LINE_THRESHOLD)));
        this.linesContainer.style.opacity = String(lineIntensity * 0.8);
    }
}

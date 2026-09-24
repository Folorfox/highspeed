// Écrans en overlay DOM (par-dessus le <canvas> Three.js). On reste
// volontairement en DOM plutôt qu'en 3D : c'est beaucoup plus simple à
// afficher/positionner/styler pour du texte + des boutons, et ça n'a aucun
// impact sur la scène 3D ou les performances de rendu.

export class StartScreen {
    /**
     * @param {object} options
     * @param {(vehicleId: string) => void} options.onStart - appelé quand le joueur clique sur "JOUER".
     * @param {Array<{ id: string, name: string, maxSpeed: number, acceleration?: number, brakePower?: number, laneChangeRate?: number, profile?: string, unlockRequirement?: object }>} options.vehicles
     * @param {Array<{ id: string, name: string, status: string, description: string, resultMetric?: string, scoreMultiplier?: number, timeLimit?: number | null }>} options.modes
     * @param {(vehicleId: string) => void} options.onSelectVehicle
     * @param {(modeId: string) => void} options.onSelectMode
     * @param {(vehicleId: string) => number} options.getVehicleBestScore
     * @param {(modeId: string, metric?: string) => number} options.getModeBestScore
     * @param {() => { runs: number, totalScore: number, totalOvertakes: number, totalNearMisses: number, totalObjectives: number, bestCombo: number, bestSurvivalTime: number, bestSpeedKmh: number }} options.getCareerStats
     * @param {() => Array<{ id: string, label: string, description: string, value: number, target: number, format: string, completed: boolean, progressRatio: number }>} options.getCareerMilestones
     * @param {(vehicle: object) => { unlocked: boolean, label: string, value: number, target: number, format: string, progressRatio: number }} options.getVehicleUnlockInfo
     * @param {{ performanceMode: boolean, cameraShake: boolean, speedEffects: boolean }} options.settings
     * @param {(settings: object) => void} options.onSettingsChange
     */
    constructor({
        onStart,
        vehicles = [],
        modes = [],
        onSelectVehicle = () => {},
        onSelectMode = () => {},
        getVehicleBestScore = () => 0,
        getModeBestScore = () => 0,
        getCareerStats = () => ({}),
        getCareerMilestones = () => [],
        getVehicleUnlockInfo = () => ({ unlocked: true, label: 'Disponible', value: 1, target: 1, format: 'number', progressRatio: 1 }),
        settings = {},
        onSettingsChange = () => {}
    }) {
        this.onStart = onStart;
        this.vehicles = vehicles;
        this.modes = modes;
        this.onSelectVehicle = onSelectVehicle;
        this.onSelectMode = onSelectMode;
        this.getVehicleBestScore = getVehicleBestScore;
        this.getModeBestScore = getModeBestScore;
        this.getCareerStats = getCareerStats;
        this.getCareerMilestones = getCareerMilestones;
        this.getVehicleUnlockInfo = getVehicleUnlockInfo;
        this.settings = {
            performanceMode: false,
            cameraShake: true,
            speedEffects: true,
            ...settings
        };
        this.onSettingsChange = onSettingsChange;
        this.selectedVehicleId = vehicles.find((vehicle) => this.getVehicleUnlockInfo(vehicle).unlocked)?.id
            ?? vehicles[0]?.id
            ?? null;
        this.selectedModeId = modes[0]?.id ?? null;
        this.currentPanel = 'home';

        this.element = this.buildElement();
        document.body.appendChild(this.element);

        this.navButtons = [...this.element.querySelectorAll('[data-menu-panel]')];
        this.panelElements = [...this.element.querySelectorAll('[data-panel]')];
        this.selectedVehicleElements = [...this.element.querySelectorAll('[data-role="selected-vehicle"]')];
        this.selectedSpeedElements = [...this.element.querySelectorAll('[data-role="selected-speed"]')];
        this.selectedModeElements = [...this.element.querySelectorAll('[data-role="selected-mode"]')];
        this.selectedModeDetailElements = [...this.element.querySelectorAll('[data-role="selected-mode-detail"]')];
        this.settingButtons = [...this.element.querySelectorAll('[data-setting-key]')];

        for (const button of this.navButtons) {
            button.addEventListener('click', () => {
                if (button.disabled) return;
                this.setPanel(button.dataset.menuPanel);
            });
        }

        this.startButtons = [...this.element.querySelectorAll('[data-role="start"]')];
        for (const button of this.startButtons) {
            button.addEventListener('click', () => {
                this.hide();
                this.onStart(this.selectedVehicleId, this.selectedModeId);
            });
        }

        this.vehicleButtons = [...this.element.querySelectorAll('[data-vehicle-id]')];
        for (const button of this.vehicleButtons) {
            button.addEventListener('click', () => {
                if (!this.isVehicleUnlocked(button.dataset.vehicleId)) return;
                this.selectedVehicleId = button.dataset.vehicleId;
                this.updateVehicleSelection();
                this.onSelectVehicle(this.selectedVehicleId);
            });
        }

        this.modeButtons = [...this.element.querySelectorAll('[data-mode-id]')];
        for (const button of this.modeButtons) {
            button.addEventListener('click', () => {
                this.selectedModeId = button.dataset.modeId;
                this.updateModeSelection();
                this.onSelectMode(this.selectedModeId);
            });
        }

        for (const button of this.settingButtons) {
            button.addEventListener('click', () => {
                const key = button.dataset.settingKey;
                this.setSetting(key, !this.settings[key]);
            });
        }

        this.ensureUnlockedVehicleSelection();
        this.refreshVehicleUnlocks();
        this.updateVehicleSelection();
        this.updateModeSelection();
        this.refreshCareerStats();
        this.refreshCareerMilestones();
        this.updateSettingsDisplay();
        this.setPanel('home');
        if (this.selectedVehicleId) {
            this.onSelectVehicle(this.selectedVehicleId);
        }
        if (this.selectedModeId) {
            this.onSelectMode(this.selectedModeId);
        }
    }

    getSelectedVehicle() {
        return this.vehicles.find((vehicle) => vehicle.id === this.selectedVehicleId) ?? this.vehicles[0] ?? null;
    }

    getSelectedMode() {
        return this.modes.find((mode) => mode.id === this.selectedModeId) ?? this.modes[0] ?? null;
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

    getVehicleSpeedKmh(vehicle) {
        return Math.round((vehicle?.maxSpeed ?? 0) * SPEED_DISPLAY_KMH_PER_GAME_UNIT);
    }

    getVehicleProfile(vehicle) {
        if (!vehicle) return '-';
        if (vehicle.profile) return vehicle.profile;

        const speedRatio = this.getVehicleStatRatio(vehicle, 'maxSpeed');
        const accelerationRatio = this.getVehicleStatRatio(vehicle, 'acceleration');
        const brakeRatio = this.getVehicleStatRatio(vehicle, 'brakePower');
        const handlingRatio = this.getVehicleStatRatio(vehicle, 'laneChangeRate');

        if (speedRatio > 0.8 && handlingRatio < 0.55) return 'Vitesse pure';
        if (accelerationRatio > 0.78 && handlingRatio > 0.7) return 'Sportive';
        if (brakeRatio > 0.78 && speedRatio < 0.45) return 'Solide';
        return 'Équilibrée';
    }

    getGarageStatBarWidth(vehicle, statName) {
        return `${Math.round((0.16 + this.getVehicleStatRatio(vehicle, statName) * 0.84) * 100)}%`;
    }

    setRoleText(role, text) {
        for (const element of this.element.querySelectorAll(`[data-role="${role}"]`)) {
            element.textContent = text;
        }
    }

    setGarageText(role, text) {
        this.setRoleText(role, text);
    }

    setGarageStat(role, value, width) {
        this.setGarageText(`garage-${role}-value`, value);
        for (const element of this.element.querySelectorAll(`[data-role="garage-${role}-bar"]`)) {
            element.style.width = width;
        }
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

    formatModeBestScore(modeId) {
        const mode = this.getModeById(modeId);
        const metric = mode?.resultMetric ?? 'score';
        const value = this.getModeBestScore(modeId, metric);

        if (metric === 'distance') {
            return this.formatDistanceKm(value);
        }

        return Math.floor(value).toLocaleString('fr-FR');
    }

    formatDistanceKm(distanceMeters) {
        const kilometers = Math.max(0, Number(distanceMeters) || 0) / 1000;
        return `${kilometers.toLocaleString('fr-FR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })} KM`;
    }

    getModeBonusLabel(mode) {
        if (mode?.resultMetric === 'distance') return 'distance en km';

        const bonus = Math.round(((mode?.scoreMultiplier ?? 1) - 1) * 100);
        return bonus > 0 ? `+${bonus}% score` : 'score normal';
    }

    formatCareerNumber(value) {
        return Math.floor(Number(value) || 0).toLocaleString('fr-FR');
    }

    formatCareerDuration(seconds) {
        const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
        const minutes = Math.floor(safeSeconds / 60);
        const remainingSeconds = safeSeconds % 60;
        return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
    }

    formatMilestoneValue(value, format) {
        if (format === 'duration') return this.formatCareerDuration(value);
        if (format === 'speed') return `${this.formatCareerNumber(value)} KM/H`;
        if (format === 'combo') return `x${this.formatCareerNumber(value)}`;
        return this.formatCareerNumber(value);
    }

    getVehicleById(vehicleId) {
        return this.vehicles.find((vehicle) => vehicle.id === vehicleId) ?? null;
    }

    getModeById(modeId) {
        return this.modes.find((mode) => mode.id === modeId) ?? null;
    }

    isVehicleUnlocked(vehicleId) {
        const vehicle = this.getVehicleById(vehicleId);
        return vehicle ? this.getVehicleUnlockInfo(vehicle).unlocked : false;
    }

    getFirstUnlockedVehicleId() {
        return this.vehicles.find((vehicle) => this.getVehicleUnlockInfo(vehicle).unlocked)?.id
            ?? this.vehicles[0]?.id
            ?? null;
    }

    ensureUnlockedVehicleSelection() {
        if (this.selectedVehicleId && this.isVehicleUnlocked(this.selectedVehicleId)) return;
        this.selectedVehicleId = this.getFirstUnlockedVehicleId();
    }

    formatVehicleUnlockProgress(unlockInfo) {
        return `${this.formatMilestoneValue(unlockInfo.value, unlockInfo.format)} / ${this.formatMilestoneValue(unlockInfo.target, unlockInfo.format)}`;
    }

    createMenuButton(label, panel, { primary = false, disabled = false } = {}) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.menuPanel = panel;
        button.disabled = disabled;
        button.textContent = label;
        button.style.cssText = `
            min-height: 42px;
            padding: 0 16px;
            border: 1px solid rgba(255, 255, 255, 0.18);
            border-radius: 8px;
            background: ${primary ? 'rgba(255, 210, 63, 0.18)' : 'rgba(255, 255, 255, 0.07)'};
            color: ${disabled ? 'rgba(255, 255, 255, 0.38)' : '#ffffff'};
            font: inherit;
            font-size: 0.78rem;
            font-weight: 900;
            letter-spacing: 0.08em;
            cursor: ${disabled ? 'default' : 'pointer'};
            text-align: left;
        `;
        return button;
    }

    createStartButton(label = 'JOUER') {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.role = 'start';
        button.textContent = label;
        button.style.cssText = `
            min-height: 48px;
            padding: 0 28px;
            border: none;
            border-radius: 8px;
            background: #ff3b3b;
            color: #ffffff;
            cursor: pointer;
            font: inherit;
            font-size: 0.95rem;
            font-weight: 950;
            letter-spacing: 0.1em;
            box-shadow: 0 10px 28px rgba(0, 0, 0, 0.34);
        `;
        return button;
    }

    createVehicleList() {
        const vehicleList = document.createElement('div');
        vehicleList.style.cssText = `
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(138px, 1fr));
            gap: 10px;
            width: 100%;
        `;

        for (const vehicle of this.vehicles) {
            const maxSpeed = this.getVehicleSpeedKmh(vehicle);
            const speedRatio = this.getVehicleStatRatio(vehicle, 'maxSpeed');
            const accelerationRatio = this.getVehicleStatRatio(vehicle, 'acceleration');
            const brakeRatio = this.getVehicleStatRatio(vehicle, 'brakePower');
            const handlingRatio = this.getVehicleStatRatio(vehicle, 'laneChangeRate');
            const profile = this.getVehicleProfile(vehicle);
            const unlockInfo = this.getVehicleUnlockInfo(vehicle);
            const unlockLabel = unlockInfo.unlocked ? 'DISPONIBLE' : 'À DÉBLOQUER';
            const unlockDetail = unlockInfo.unlocked
                ? 'Prête à rouler'
                : `${unlockInfo.label} · ${this.formatVehicleUnlockProgress(unlockInfo)}`;
            const option = document.createElement('button');
            option.type = 'button';
            option.dataset.vehicleId = vehicle.id;
            option.disabled = !unlockInfo.unlocked;
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
                cursor: ${unlockInfo.unlocked ? 'pointer' : 'not-allowed'};
                opacity: ${unlockInfo.unlocked ? '1' : '0.48'};
                box-shadow: 0 6px 18px rgba(0, 0, 0, 0.22);
            `;
            option.innerHTML = `
                <span style="font-size: 0.9rem; font-weight: 850; letter-spacing: 0.04em;">${vehicle.name}</span>
                <span style="margin-top: 5px; padding: 3px 8px; border-radius: 999px; background: rgba(127, 224, 255, 0.14); color: #7fe0ff; font-size: 0.62rem; font-weight: 900; letter-spacing: 0.08em;">${profile.toUpperCase()}</span>
                <span style="margin-top: 5px; font-size: 0.74rem; font-weight: 750; color: rgba(255, 255, 255, 0.78);">${maxSpeed} KM/H</span>
                <span data-role="vehicle-unlock-status" style="margin-top: 5px; font-size: 0.64rem; font-weight: 950; letter-spacing: 0.08em; color: ${unlockInfo.unlocked ? '#89ffbf' : '#ffd23f'};">${unlockLabel}</span>
                <span data-role="vehicle-unlock-detail" style="margin-top: 3px; min-height: 1.8em; font-size: 0.62rem; font-weight: 760; line-height: 1.25; color: rgba(255, 255, 255, 0.62);">${unlockDetail}</span>
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

        return vehicleList;
    }

    createGarageStatRow(label, role) {
        const row = document.createElement('div');
        row.style.cssText = `
            display: grid;
            gap: 6px;
        `;
        row.innerHTML = `
            <span style="display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 0.72rem; font-weight: 900; color: rgba(255, 255, 255, 0.72);">
                <span>${label}</span>
                <span data-role="garage-${role}-value" style="color: #ffffff;">-</span>
            </span>
            <span style="display: block; height: 7px; border-radius: 999px; overflow: hidden; background: rgba(255, 255, 255, 0.14);">
                <span data-role="garage-${role}-bar" style="display: block; width: 0%; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #7fe0ff, #ffd23f, #ff5a3f);"></span>
            </span>
        `;
        return row;
    }

    createVehicleDetailPanel() {
        const detail = document.createElement('aside');
        detail.className = 'hr-garage-detail';
        detail.style.cssText = `
            display: grid;
            align-content: start;
            gap: 14px;
            min-height: 100%;
            padding: 14px;
            border-radius: 8px;
            border: 1px solid rgba(127, 224, 255, 0.22);
            background: rgba(7, 17, 29, 0.52);
        `;

        const header = document.createElement('div');
        header.style.cssText = `
            display: grid;
            gap: 5px;
        `;
        header.innerHTML = `
            <span style="font-size: 0.66rem; font-weight: 950; letter-spacing: 0.16em; color: #7fe0ff;">FICHE VÉHICULE</span>
            <strong data-role="garage-vehicle-name" style="font-size: 1.55rem; line-height: 1; letter-spacing: 0;">-</strong>
            <span data-role="garage-vehicle-profile" style="width: fit-content; padding: 4px 9px; border-radius: 999px; background: rgba(255, 210, 63, 0.15); color: #ffd23f; font-size: 0.66rem; font-weight: 950; letter-spacing: 0.1em;">-</span>
            <span data-role="garage-vehicle-unlock" style="font-size: 0.72rem; font-weight: 850; line-height: 1.35; color: rgba(255, 255, 255, 0.62);">-</span>
        `;

        const highlight = document.createElement('div');
        highlight.style.cssText = `
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            padding: 10px 0 4px;
            border-top: 1px solid rgba(255, 255, 255, 0.12);
            border-bottom: 1px solid rgba(255, 255, 255, 0.12);
        `;
        highlight.innerHTML = `
            <span style="display: grid; gap: 4px;">
                <span style="font-size: 0.62rem; font-weight: 950; letter-spacing: 0.12em; color: rgba(255, 255, 255, 0.52);">VITESSE MAX</span>
                <strong data-role="garage-top-speed" style="font-size: 1.05rem; color: #ffffff;">- KM/H</strong>
            </span>
            <span style="display: grid; gap: 4px; text-align: right;">
                <span style="font-size: 0.62rem; font-weight: 950; letter-spacing: 0.12em; color: rgba(255, 255, 255, 0.52);">RECORD</span>
                <strong data-role="garage-vehicle-best" style="font-size: 1.05rem; color: #ffd23f;">REC 0</strong>
            </span>
        `;

        const stats = document.createElement('div');
        stats.style.cssText = `
            display: grid;
            gap: 12px;
        `;
        stats.appendChild(this.createGarageStatRow('Vitesse', 'speed'));
        stats.appendChild(this.createGarageStatRow('Accélération', 'acceleration'));
        stats.appendChild(this.createGarageStatRow('Freinage', 'brake'));
        stats.appendChild(this.createGarageStatRow('Maniabilité', 'handling'));

        detail.appendChild(header);
        detail.appendChild(highlight);
        detail.appendChild(stats);
        return detail;
    }

    createCareerStatItem(label, role, accent = '#ffffff') {
        const item = document.createElement('span');
        item.style.cssText = `
            display: grid;
            gap: 3px;
            min-width: 0;
            padding: 10px 11px;
            border-radius: 8px;
            border: 1px solid rgba(255, 255, 255, 0.12);
            background: rgba(0, 0, 0, 0.24);
        `;
        item.innerHTML = `
            <span style="font-size: 0.62rem; font-weight: 950; letter-spacing: 0.11em; color: rgba(255, 255, 255, 0.5);">${label}</span>
            <strong data-role="${role}" style="font-size: 0.98rem; color: ${accent}; white-space: nowrap;">0</strong>
        `;
        return item;
    }

    createCareerSummary(width = 'min(100%, 560px)') {
        const summary = document.createElement('section');
        summary.style.cssText = `
            display: grid;
            gap: 10px;
            width: ${width};
            margin-top: 2px;
        `;

        const title = document.createElement('div');
        title.style.cssText = `
            display: flex;
            align-items: end;
            justify-content: space-between;
            gap: 12px;
        `;
        title.innerHTML = `
            <span style="font-size: 0.72rem; font-weight: 950; letter-spacing: 0.14em; color: rgba(255, 255, 255, 0.58);">CARRIÈRE</span>
            <span style="font-size: 0.68rem; font-weight: 850; color: rgba(255, 255, 255, 0.46);">meilleurs exploits</span>
        `;

        const grid = document.createElement('div');
        grid.style.cssText = `
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
            gap: 8px;
        `;
        grid.appendChild(this.createCareerStatItem('COURSES', 'career-runs', '#ffffff'));
        grid.appendChild(this.createCareerStatItem('SCORE TOTAL', 'career-total-score', '#ffd23f'));
        grid.appendChild(this.createCareerStatItem('TEMPS MAX', 'career-best-time', '#7fe0ff'));
        grid.appendChild(this.createCareerStatItem('VITESSE MAX', 'career-best-speed', '#ff8b57'));
        grid.appendChild(this.createCareerStatItem('DÉPASSEMENTS', 'career-total-overtakes', '#ffffff'));
        grid.appendChild(this.createCareerStatItem('NEAR MISS', 'career-total-near-misses', '#ffffff'));
        grid.appendChild(this.createCareerStatItem('COMBO MAX', 'career-best-combo', '#ffd23f'));
        grid.appendChild(this.createCareerStatItem('OBJECTIFS', 'career-total-objectives', '#7fe0ff'));

        summary.appendChild(title);
        summary.appendChild(grid);
        return summary;
    }

    createCareerMilestoneItem(milestone) {
        const item = document.createElement('div');
        const progress = Math.max(0, Math.min(1, milestone.progressRatio ?? 0));
        const progressPercent = Math.round(progress * 100);
        const valueLabel = this.formatMilestoneValue(
            Math.min(milestone.value ?? 0, milestone.target ?? 0),
            milestone.format
        );
        const targetLabel = this.formatMilestoneValue(milestone.target ?? 0, milestone.format);
        const statusLabel = milestone.completed ? 'TERMINÉ' : `${progressPercent}%`;

        item.style.cssText = `
            display: grid;
            gap: 7px;
            padding: 11px 12px;
            border-radius: 8px;
            border: 1px solid ${milestone.completed ? 'rgba(255, 210, 63, 0.34)' : 'rgba(255, 255, 255, 0.12)'};
            background: ${milestone.completed ? 'rgba(255, 210, 63, 0.12)' : 'rgba(0, 0, 0, 0.24)'};
        `;
        item.innerHTML = `
            <span style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">
                <strong style="font-size: 0.82rem; color: #ffffff;">${milestone.label}</strong>
                <span style="font-size: 0.62rem; font-weight: 950; letter-spacing: 0.1em; color: ${milestone.completed ? '#ffd23f' : 'rgba(255, 255, 255, 0.52)'};">${statusLabel}</span>
            </span>
            <span style="font-size: 0.72rem; font-weight: 760; line-height: 1.3; color: rgba(255, 255, 255, 0.62);">${milestone.description}</span>
            <span style="display: grid; gap: 5px;">
                <span style="display: flex; justify-content: space-between; gap: 10px; font-size: 0.66rem; font-weight: 900; color: rgba(255, 255, 255, 0.58);">
                    <span>${valueLabel}</span>
                    <span>${targetLabel}</span>
                </span>
                <span style="display: block; height: 6px; border-radius: 999px; overflow: hidden; background: rgba(255, 255, 255, 0.14);">
                    <span style="display: block; width: ${progressPercent}%; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #7fe0ff, #ffd23f);"></span>
                </span>
            </span>
        `;
        return item;
    }

    createCareerMilestonesPanel({ listLimit = 3, width = 'min(100%, 560px)' } = {}) {
        const panel = document.createElement('section');
        panel.style.cssText = `
            display: grid;
            gap: 10px;
            width: ${width};
        `;

        const title = document.createElement('div');
        title.style.cssText = `
            display: flex;
            align-items: end;
            justify-content: space-between;
            gap: 12px;
        `;
        title.innerHTML = `
            <span style="font-size: 0.72rem; font-weight: 950; letter-spacing: 0.14em; color: rgba(255, 255, 255, 0.58);">DÉFIS</span>
            <span data-role="career-milestone-count" style="font-size: 0.68rem; font-weight: 900; color: #ffd23f;">0/0</span>
        `;

        const list = document.createElement('div');
        list.dataset.role = 'career-milestone-list';
        list.dataset.milestoneLimit = String(listLimit);
        list.style.cssText = `
            display: grid;
            gap: 8px;
        `;

        panel.appendChild(title);
        panel.appendChild(list);
        return panel;
    }

    createPanel(panelId) {
        const panel = document.createElement('section');
        panel.dataset.panel = panelId;
        panel.style.cssText = `
            display: none;
            width: 100%;
            min-height: 100%;
        `;
        return panel;
    }

    createModeItem(mode) {
        const item = document.createElement('button');
        item.type = 'button';
        item.dataset.modeId = mode.id;
        const bonusLabel = this.getModeBonusLabel(mode);
        item.style.cssText = `
            display: grid;
            grid-template-columns: 1fr auto;
            align-items: center;
            gap: 8px 18px;
            min-height: 74px;
            padding: 13px 14px;
            border-radius: 8px;
            border: 1px solid rgba(255, 255, 255, 0.14);
            background: rgba(255, 255, 255, 0.06);
            color: #ffffff;
            cursor: pointer;
            text-align: left;
            font: inherit;
        `;
        item.innerHTML = `
            <span style="display: grid; gap: 4px;">
                <span style="font-size: 0.95rem; font-weight: 950;">${mode.name}</span>
                <span style="font-size: 0.76rem; font-weight: 760; line-height: 1.35; color: rgba(255, 255, 255, 0.62);">${mode.description}</span>
            </span>
            <span style="display: grid; gap: 4px; text-align: right;">
                <span style="font-size: 0.68rem; font-weight: 950; letter-spacing: 0.12em; color: #ffd23f;">${mode.status}</span>
                <span style="font-size: 0.68rem; font-weight: 850; color: rgba(255, 255, 255, 0.58);">${bonusLabel}</span>
                <span data-role="mode-best" style="font-size: 0.68rem; font-weight: 900; color: #7fe0ff;">REC ${this.formatModeBestScore(mode.id)}</span>
            </span>
        `;
        return item;
    }

    createSettingItem(title, value) {
        const item = document.createElement('div');
        item.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 16px;
            min-height: 54px;
            padding: 12px 14px;
            border-radius: 8px;
            border: 1px solid rgba(255, 255, 255, 0.14);
            background: rgba(255, 255, 255, 0.06);
        `;
        item.innerHTML = `
            <span style="font-size: 0.9rem; font-weight: 900;">${title}</span>
            <span style="font-size: 0.7rem; font-weight: 900; letter-spacing: 0.1em; color: rgba(255, 255, 255, 0.58);">${value}</span>
        `;
        return item;
    }

    createSettingToggle(key, title, description) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.settingKey = key;
        button.style.cssText = `
            display: grid;
            grid-template-columns: 1fr auto;
            align-items: center;
            gap: 14px;
            min-height: 64px;
            padding: 12px 14px;
            border-radius: 8px;
            border: 1px solid rgba(255, 255, 255, 0.14);
            background: rgba(255, 255, 255, 0.06);
            color: #ffffff;
            cursor: pointer;
            text-align: left;
            font: inherit;
        `;
        button.innerHTML = `
            <span style="display: grid; gap: 4px;">
                <span style="font-size: 0.9rem; font-weight: 900;">${title}</span>
                <span style="font-size: 0.72rem; font-weight: 760; line-height: 1.35; color: rgba(255, 255, 255, 0.58);">${description}</span>
            </span>
            <span data-role="setting-state" style="min-width: 74px; padding: 6px 9px; border-radius: 999px; font-size: 0.66rem; font-weight: 950; letter-spacing: 0.08em; text-align: center;">-</span>
        `;
        return button;
    }

    buildHomePanel() {
        const panel = this.createPanel('home');
        panel.style.alignContent = 'center';
        panel.style.gap = '22px';

        const intro = document.createElement('div');
        intro.style.cssText = `
            display: grid;
            gap: 14px;
            max-width: 620px;
        `;
        intro.innerHTML = `
            <p style="margin: 0; font-size: 0.8rem; font-weight: 900; letter-spacing: 0.16em; color: #ffd23f;">COURSE ARCADE</p>
            <h1 style="margin: 0; font-size: clamp(2.4rem, 8vw, 5.4rem); line-height: 0.95; font-weight: 950; letter-spacing: 0;">HIGHWAY RUSH</h1>
            <p style="margin: 0; max-width: 520px; font-size: clamp(0.95rem, 2vw, 1.16rem); line-height: 1.45; font-weight: 720; color: rgba(255, 255, 255, 0.78);">
                Autoroute rapide, trafic dense, dépassements et combos.
            </p>
        `;

        const selected = document.createElement('div');
        selected.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            width: min(100%, 520px);
            padding: 13px 14px;
            border-radius: 8px;
            border: 1px solid rgba(255, 210, 63, 0.34);
            background: rgba(255, 210, 63, 0.12);
        `;
        selected.innerHTML = `
            <span style="display: grid; gap: 2px;">
                <span style="font-size: 0.68rem; font-weight: 900; letter-spacing: 0.12em; color: rgba(255, 255, 255, 0.62);">VÉHICULE</span>
                <span data-role="selected-vehicle" style="font-size: 1rem; font-weight: 950;">-</span>
            </span>
            <span data-role="selected-speed" style="font-size: 0.8rem; font-weight: 900; color: #ffd23f;">- KM/H</span>
        `;

        const selectedMode = document.createElement('div');
        selectedMode.style.cssText = `
            display: grid;
            gap: 4px;
            width: min(100%, 520px);
            padding: 13px 14px;
            border-radius: 8px;
            border: 1px solid rgba(127, 224, 255, 0.3);
            background: rgba(22, 92, 118, 0.16);
        `;
        selectedMode.innerHTML = `
            <span style="font-size: 0.68rem; font-weight: 900; letter-spacing: 0.12em; color: rgba(255, 255, 255, 0.62);">MODE</span>
            <span data-role="selected-mode" style="font-size: 1rem; font-weight: 950;">-</span>
            <span data-role="selected-mode-detail" style="font-size: 0.78rem; font-weight: 760; color: rgba(255, 255, 255, 0.68);">-</span>
        `;

        const actions = document.createElement('div');
        actions.style.cssText = `
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
        `;
        actions.appendChild(this.createStartButton('JOUER'));
        actions.appendChild(this.createMenuButton('GARAGE', 'garage'));
        actions.appendChild(this.createMenuButton('MODES', 'modes'));

        panel.appendChild(intro);
        panel.appendChild(selected);
        panel.appendChild(selectedMode);
        panel.appendChild(this.createCareerSummary());
        panel.appendChild(this.createCareerMilestonesPanel());
        panel.appendChild(actions);
        return panel;
    }

    buildModesPanel() {
        const panel = this.createPanel('modes');
        panel.style.alignContent = 'start';

        const content = document.createElement('div');
        content.style.cssText = `
            display: grid;
            gap: 12px;
            width: min(100%, 560px);
        `;
        content.innerHTML = `
            <h2 style="margin: 0 0 4px; font-size: clamp(1.65rem, 4vw, 2.4rem); font-weight: 950; letter-spacing: 0;">Modes de jeu</h2>
        `;
        for (const mode of this.modes) {
            content.appendChild(this.createModeItem(mode));
        }

        const start = this.createStartButton('JOUER');
        start.dataset.modeStart = 'true';
        start.style.marginTop = '8px';
        content.appendChild(start);
        panel.appendChild(content);
        return panel;
    }

    buildGaragePanel() {
        const panel = this.createPanel('garage');
        panel.style.alignContent = 'start';

        const content = document.createElement('div');
        content.style.cssText = `
            display: grid;
            gap: 14px;
            width: min(100%, 960px);
        `;
        content.innerHTML = `
            <span style="font-size: 0.8rem; font-weight: 900; letter-spacing: 0.16em; color: #ffd23f;">GARAGE</span>
            <h2 style="margin: -4px 0 0; font-size: clamp(1.65rem, 4vw, 2.4rem); font-weight: 950; letter-spacing: 0;">Choix du véhicule</h2>
        `;

        const garageLayout = document.createElement('div');
        garageLayout.className = 'hr-garage-layout';
        garageLayout.style.cssText = `
            display: grid;
            grid-template-columns: minmax(0, 1.35fr) minmax(240px, 0.65fr);
            gap: 14px;
            align-items: stretch;
        `;
        garageLayout.appendChild(this.createVehicleList());
        garageLayout.appendChild(this.createVehicleDetailPanel());
        content.appendChild(garageLayout);

        const footer = document.createElement('div');
        footer.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            flex-wrap: wrap;
        `;
        footer.innerHTML = `
            <span style="font-size: 0.76rem; font-weight: 850; color: rgba(255, 255, 255, 0.62);">
                Sélection : <strong data-role="selected-vehicle" style="color: #ffffff;">-</strong>
            </span>
        `;
        footer.appendChild(this.createStartButton('JOUER'));
        content.appendChild(footer);

        panel.appendChild(content);
        return panel;
    }

    buildCareerPanel() {
        const panel = this.createPanel('career');
        panel.style.alignContent = 'start';

        const content = document.createElement('div');
        content.style.cssText = `
            display: grid;
            gap: 16px;
            width: min(100%, 860px);
        `;
        content.innerHTML = `
            <span style="font-size: 0.8rem; font-weight: 900; letter-spacing: 0.16em; color: #ffd23f;">CARRIÈRE</span>
            <h2 style="margin: -4px 0 0; font-size: 2rem; line-height: 1.05; font-weight: 950; letter-spacing: 0;">Progression</h2>
        `;
        content.appendChild(this.createCareerSummary('100%'));
        content.appendChild(this.createCareerMilestonesPanel({
            listLimit: 0,
            width: '100%'
        }));

        panel.appendChild(content);
        return panel;
    }

    buildSettingsPanel() {
        const panel = this.createPanel('settings');
        panel.style.alignContent = 'start';

        const content = document.createElement('div');
        content.style.cssText = `
            display: grid;
            gap: 12px;
            width: min(100%, 560px);
        `;
        content.innerHTML = `
            <h2 style="margin: 0 0 4px; font-size: clamp(1.65rem, 4vw, 2.4rem); font-weight: 950; letter-spacing: 0;">Paramètres</h2>
        `;
        content.appendChild(this.createSettingToggle(
            'performanceMode',
            'Mode performance',
            'Réduit les effets visuels lourds pendant la course.'
        ));
        content.appendChild(this.createSettingToggle(
            'cameraShake',
            'Secousses caméra',
            'Active les vibrations lors des chocs, combos et near miss.'
        ));
        content.appendChild(this.createSettingToggle(
            'speedEffects',
            'Effet de vitesse',
            'Affiche la vignette et les lignes de vitesse à haute allure.'
        ));
        content.appendChild(this.createSettingItem('Son', 'Bouton en bas à droite'));
        content.appendChild(this.createSettingItem('Commandes', 'Z/W, S, Q/A, D, P'));
        content.appendChild(this.createSettingItem('Aide visuelle', 'Danger, objectifs, combo'));
        panel.appendChild(content);
        return panel;
    }

    createMenuBackdrop() {
        const backdrop = document.createElement('div');
        backdrop.className = 'highway-rush-menu-backdrop';
        backdrop.setAttribute('aria-hidden', 'true');
        backdrop.innerHTML = `
            <div class="hr-menu-sky">
                <span class="hr-menu-evening-band"></span>
                <span class="hr-menu-soft-cloud hr-menu-soft-cloud-a"></span>
                <span class="hr-menu-soft-cloud hr-menu-soft-cloud-b"></span>
            </div>
            <div class="hr-menu-horizon">
                <span class="hr-menu-hill hr-menu-hill-back"></span>
                <span class="hr-menu-hill hr-menu-hill-front"></span>
            </div>
            <div class="hr-menu-light-lines">
                <span class="hr-menu-light-line hr-menu-light-line-a"></span>
                <span class="hr-menu-light-line hr-menu-light-line-b"></span>
                <span class="hr-menu-light-line hr-menu-light-line-c"></span>
            </div>
            <div class="hr-menu-vignette"></div>
        `;
        return backdrop;
    }

    buildElement() {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: clamp(14px, 3vw, 28px);
            overflow: hidden;
            background: #07111d;
            z-index: 12;
            font-family: system-ui, -apple-system, sans-serif;
            color: #ffffff;
        `;
        overlay.appendChild(this.createMenuBackdrop());

        const shell = document.createElement('div');
        shell.style.cssText = `
            position: relative;
            z-index: 1;
            display: grid;
            grid-template-columns: minmax(188px, 230px) minmax(0, 1fr);
            grid-template-rows: minmax(0, 1fr);
            gap: clamp(16px, 3vw, 30px);
            width: min(1120px, 100%);
            height: min(720px, 94vh);
            max-height: min(720px, 94vh);
            min-height: 0;
            overflow: hidden;
        `;

        const side = document.createElement('aside');
        side.className = 'highway-rush-menu-side';
        side.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 16px;
            min-height: 0;
        `;

        const brand = document.createElement('div');
        brand.style.cssText = `
            display: grid;
            gap: 5px;
        `;
        brand.innerHTML = `
            <span style="font-size: 0.68rem; font-weight: 950; letter-spacing: 0.2em; color: #ffd23f;">HIGHWAY</span>
            <span style="font-size: clamp(1.8rem, 4vw, 2.8rem); line-height: 0.9; font-weight: 950; letter-spacing: 0;">RUSH</span>
        `;

        const nav = document.createElement('nav');
        nav.className = 'highway-rush-menu-nav';
        nav.style.cssText = `
            display: grid;
            gap: 8px;
        `;
        nav.appendChild(this.createMenuButton('ACCUEIL', 'home', { primary: true }));
        nav.appendChild(this.createMenuButton('MODES', 'modes'));
        nav.appendChild(this.createMenuButton('GARAGE', 'garage'));
        nav.appendChild(this.createMenuButton('CARRIÈRE', 'career'));
        nav.appendChild(this.createMenuButton('PARAMÈTRES', 'settings'));

        const record = document.createElement('div');
        record.className = 'highway-rush-menu-record';
        record.style.cssText = `
            margin-top: auto;
            padding: 12px;
            border-radius: 8px;
            border: 1px solid rgba(255, 255, 255, 0.14);
            background: rgba(0, 0, 0, 0.24);
            font-size: 0.72rem;
            font-weight: 900;
            letter-spacing: 0.08em;
            color: rgba(255, 255, 255, 0.68);
        `;
        record.innerHTML = `
            VOITURE<br>
            <span data-role="selected-vehicle" style="display: inline-block; margin-top: 4px; font-size: 0.92rem; color: #ffffff;">-</span>
        `;

        side.appendChild(brand);
        side.appendChild(nav);
        side.appendChild(record);

        const content = document.createElement('main');
        content.style.cssText = `
            min-width: 0;
            min-height: 0;
            height: 100%;
            max-height: 100%;
            overflow-y: auto;
            overscroll-behavior: contain;
            box-sizing: border-box;
            padding: clamp(18px, 3vw, 30px);
            border-radius: 8px;
            border: 1px solid rgba(255, 255, 255, 0.14);
            background: rgba(0, 0, 0, 0.28);
            box-shadow: 0 18px 50px rgba(0, 0, 0, 0.36);
        `;
        content.appendChild(this.buildHomePanel());
        content.appendChild(this.buildModesPanel());
        content.appendChild(this.buildGaragePanel());
        content.appendChild(this.buildCareerPanel());
        content.appendChild(this.buildSettingsPanel());

        shell.appendChild(side);
        shell.appendChild(content);
        overlay.appendChild(shell);
        content.className = 'highway-rush-menu-content';

        if (!document.getElementById('highway-rush-start-menu-styles')) {
            const style = document.createElement('style');
            style.id = 'highway-rush-start-menu-styles';
            style.textContent = `
                .highway-rush-menu-backdrop {
                    position: absolute;
                    inset: 0;
                    overflow: hidden;
                    background:
                        linear-gradient(180deg, #172949 0%, #405979 32%, #c87960 56%, #141923 100%);
                    pointer-events: none;
                }
                .hr-menu-sky,
                .hr-menu-horizon,
                .hr-menu-light-lines,
                .hr-menu-vignette {
                    position: absolute;
                    inset: 0;
                }
                .hr-menu-sky {
                    background:
                        linear-gradient(120deg, rgba(255, 220, 160, 0.16), rgba(75, 120, 170, 0.06) 46%, rgba(6, 10, 18, 0.08)),
                        linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0) 44%);
                }
                .hr-menu-evening-band {
                    position: absolute;
                    left: 0;
                    right: 0;
                    top: 38%;
                    height: 24%;
                    background:
                        linear-gradient(180deg, rgba(255, 202, 132, 0), rgba(255, 184, 112, 0.26) 44%, rgba(255, 184, 112, 0));
                }
                .hr-menu-soft-cloud {
                    position: absolute;
                    height: 10px;
                    border-radius: 999px;
                    background: rgba(255, 230, 198, 0.2);
                    box-shadow: 44px 7px 0 rgba(255, 230, 198, 0.12), 92px -3px 0 rgba(255, 230, 198, 0.08);
                }
                .hr-menu-soft-cloud-a {
                    left: 12%;
                    top: 24%;
                    width: 120px;
                }
                .hr-menu-soft-cloud-b {
                    right: 18%;
                    top: 18%;
                    width: 92px;
                    opacity: 0.75;
                }
                .hr-menu-horizon {
                    top: auto;
                    bottom: 0;
                    height: 48%;
                    background: linear-gradient(180deg, rgba(8, 15, 24, 0), rgba(5, 8, 13, 0.66) 70%, rgba(5, 8, 13, 0.92));
                }
                .hr-menu-hill {
                    position: absolute;
                    left: -5%;
                    right: -5%;
                    bottom: 0;
                    height: 72%;
                    clip-path: polygon(0 48%, 10% 42%, 19% 51%, 29% 32%, 42% 47%, 54% 28%, 67% 46%, 78% 35%, 90% 52%, 100% 43%, 100% 100%, 0 100%);
                }
                .hr-menu-hill-back {
                    bottom: 12%;
                    background: rgba(24, 44, 57, 0.66);
                    opacity: 0.9;
                }
                .hr-menu-hill-front {
                    height: 58%;
                    background: rgba(7, 15, 22, 0.8);
                    clip-path: polygon(0 54%, 12% 45%, 24% 56%, 38% 42%, 52% 58%, 64% 37%, 77% 54%, 88% 44%, 100% 57%, 100% 100%, 0 100%);
                }
                .hr-menu-light-lines {
                    mix-blend-mode: screen;
                    opacity: 0.52;
                }
                .hr-menu-light-line {
                    position: absolute;
                    left: 5%;
                    right: 5%;
                    height: 1px;
                    background:
                        linear-gradient(90deg, rgba(255, 209, 142, 0), rgba(255, 209, 142, 0.26), rgba(126, 190, 222, 0.2), rgba(255, 209, 142, 0));
                }
                .hr-menu-light-line-a {
                    top: 46%;
                }
                .hr-menu-light-line-b {
                    top: 52%;
                    left: 18%;
                    opacity: 0.7;
                }
                .hr-menu-light-line-c {
                    top: 61%;
                    right: 14%;
                    opacity: 0.38;
                }
                .hr-menu-vignette {
                    background:
                        linear-gradient(90deg, rgba(4, 8, 13, 0.78), rgba(4, 8, 13, 0.28) 42%, rgba(4, 8, 13, 0.5) 100%),
                        linear-gradient(180deg, rgba(0, 0, 0, 0.04), rgba(0, 0, 0, 0.45) 100%);
                }
                @media (max-width: 760px) {
                    body .highway-rush-menu-shell {
                        grid-template-columns: 1fr;
                        height: auto !important;
                        overflow: auto !important;
                    }
                    body .highway-rush-menu-backdrop {
                        background:
                            linear-gradient(180deg, #172949 0%, #3c587a 34%, #b36e5c 58%, #101620 100%);
                    }
                    body .highway-rush-menu-side {
                        gap: 12px;
                    }
                    body .highway-rush-menu-nav {
                        grid-template-columns: repeat(2, minmax(0, 1fr));
                    }
                    body .highway-rush-menu-record {
                        display: none;
                    }
                    body .highway-rush-menu-content {
                        min-height: auto !important;
                        height: auto !important;
                        overflow: visible !important;
                    }
                    body .hr-garage-layout {
                        grid-template-columns: 1fr !important;
                    }
                }
            `;
            document.head.appendChild(style);
        }
        shell.className = 'highway-rush-menu-shell';

        return overlay;
    }

    setPanel(panelId) {
        this.currentPanel = panelId;

        for (const panel of this.panelElements) {
            const isActive = panel.dataset.panel === panelId;
            panel.style.display = isActive ? 'grid' : 'none';
        }

        for (const button of this.navButtons) {
            const isActive = button.dataset.menuPanel === panelId;
            button.style.borderColor = isActive ? 'rgba(255, 210, 63, 0.58)' : 'rgba(255, 255, 255, 0.18)';
            button.style.background = isActive ? 'rgba(255, 210, 63, 0.2)' : 'rgba(255, 255, 255, 0.07)';
            button.style.color = isActive ? '#ffd23f' : '#ffffff';
        }
    }

    updateVehicleSelection() {
        for (const button of this.vehicleButtons) {
            const isSelected = button.dataset.vehicleId === this.selectedVehicleId;
            button.style.borderColor = isSelected ? '#ffd23f' : 'rgba(255, 255, 255, 0.22)';
            button.style.background = isSelected ? 'rgba(255, 210, 63, 0.24)' : 'rgba(0, 0, 0, 0.32)';
            button.style.transform = isSelected ? 'translateY(-2px)' : 'translateY(0)';
        }

        const vehicle = this.getSelectedVehicle();
        const vehicleName = vehicle?.name ?? '-';
        const vehicleSpeed = vehicle
            ? `${this.getVehicleSpeedKmh(vehicle)} KM/H`
            : '- KM/H';

        for (const element of this.selectedVehicleElements) {
            element.textContent = vehicleName;
        }
        for (const element of this.selectedSpeedElements) {
            element.textContent = vehicleSpeed;
        }

        if (!vehicle) {
            this.setGarageText('garage-vehicle-name', '-');
            this.setGarageText('garage-vehicle-profile', '-');
            this.setGarageText('garage-vehicle-unlock', '-');
            this.setGarageText('garage-top-speed', '- KM/H');
            this.setGarageText('garage-vehicle-best', 'REC 0');
            this.setGarageStat('speed', '-', '0%');
            this.setGarageStat('acceleration', '-', '0%');
            this.setGarageStat('brake', '-', '0%');
            this.setGarageStat('handling', '-', '0%');
            return;
        }

        this.setGarageText('garage-vehicle-name', vehicle.name);
        this.setGarageText('garage-vehicle-profile', this.getVehicleProfile(vehicle).toUpperCase());
        const unlockInfo = this.getVehicleUnlockInfo(vehicle);
        this.setGarageText(
            'garage-vehicle-unlock',
            unlockInfo.unlocked
                ? 'Disponible dans le garage.'
                : `${unlockInfo.label} · ${this.formatVehicleUnlockProgress(unlockInfo)}`
        );
        this.setGarageText('garage-top-speed', vehicleSpeed);
        this.setGarageText('garage-vehicle-best', `REC ${this.formatVehicleBestScore(vehicle.id)}`);
        this.setGarageStat(
            'speed',
            vehicleSpeed,
            this.getGarageStatBarWidth(vehicle, 'maxSpeed')
        );
        this.setGarageStat(
            'acceleration',
            Math.round(vehicle.acceleration ?? 0).toString(),
            this.getGarageStatBarWidth(vehicle, 'acceleration')
        );
        this.setGarageStat(
            'brake',
            Math.round(vehicle.brakePower ?? 0).toString(),
            this.getGarageStatBarWidth(vehicle, 'brakePower')
        );
        this.setGarageStat(
            'handling',
            (vehicle.laneChangeRate ?? 0).toFixed(1),
            this.getGarageStatBarWidth(vehicle, 'laneChangeRate')
        );
    }

    updateModeSelection() {
        for (const button of this.modeButtons ?? []) {
            const isSelected = button.dataset.modeId === this.selectedModeId;
            button.style.borderColor = isSelected ? 'rgba(127, 224, 255, 0.7)' : 'rgba(255, 255, 255, 0.14)';
            button.style.background = isSelected ? 'rgba(22, 120, 150, 0.24)' : 'rgba(255, 255, 255, 0.06)';
            button.style.transform = isSelected ? 'translateY(-2px)' : 'translateY(0)';
        }

        const mode = this.getSelectedMode();
        const modeName = mode?.name ?? '-';
        const modeDetail = mode?.description ?? '-';

        for (const element of this.selectedModeElements) {
            element.textContent = modeName;
        }
        for (const element of this.selectedModeDetailElements) {
            element.textContent = modeDetail;
        }

        const modeStartButton = this.element.querySelector('[data-mode-start="true"]');
        if (modeStartButton) {
            modeStartButton.textContent = `JOUER - ${modeName.toUpperCase()}`;
        }
    }

    refreshVehicleUnlocks() {
        this.ensureUnlockedVehicleSelection();

        for (const button of this.vehicleButtons) {
            const vehicle = this.getVehicleById(button.dataset.vehicleId);
            if (!vehicle) continue;

            const unlockInfo = this.getVehicleUnlockInfo(vehicle);
            const statusElement = button.querySelector('[data-role="vehicle-unlock-status"]');
            const detailElement = button.querySelector('[data-role="vehicle-unlock-detail"]');

            button.disabled = !unlockInfo.unlocked;
            button.style.cursor = unlockInfo.unlocked ? 'pointer' : 'not-allowed';
            button.style.opacity = unlockInfo.unlocked ? '1' : '0.48';

            if (statusElement) {
                statusElement.textContent = unlockInfo.unlocked ? 'DISPONIBLE' : 'À DÉBLOQUER';
                statusElement.style.color = unlockInfo.unlocked ? '#89ffbf' : '#ffd23f';
            }

            if (detailElement) {
                detailElement.textContent = unlockInfo.unlocked
                    ? 'Prête à rouler'
                    : `${unlockInfo.label} · ${this.formatVehicleUnlockProgress(unlockInfo)}`;
            }
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

    refreshModeBestScores() {
        for (const button of this.modeButtons) {
            const bestElement = button.querySelector('[data-role="mode-best"]');
            if (bestElement) {
                bestElement.textContent = `REC ${this.formatModeBestScore(button.dataset.modeId)}`;
            }
        }
    }

    refreshCareerStats() {
        const stats = this.getCareerStats() ?? {};
        this.setRoleText('career-runs', this.formatCareerNumber(stats.runs));
        this.setRoleText('career-total-score', this.formatCareerNumber(stats.totalScore));
        this.setRoleText('career-best-time', this.formatCareerDuration(stats.bestSurvivalTime));
        this.setRoleText('career-best-speed', `${this.formatCareerNumber(stats.bestSpeedKmh)} KM/H`);
        this.setRoleText('career-total-overtakes', this.formatCareerNumber(stats.totalOvertakes));
        this.setRoleText('career-total-near-misses', this.formatCareerNumber(stats.totalNearMisses));
        this.setRoleText('career-best-combo', `x${this.formatCareerNumber(stats.bestCombo)}`);
        this.setRoleText('career-total-objectives', this.formatCareerNumber(stats.totalObjectives));
    }

    refreshCareerMilestones() {
        const milestones = this.getCareerMilestones() ?? [];
        const completedCount = milestones.filter((milestone) => milestone.completed).length;
        const lists = [...this.element.querySelectorAll('[data-role="career-milestone-list"]')];
        this.setRoleText('career-milestone-count', `${completedCount}/${milestones.length}`);
        if (lists.length === 0) return;

        const sortedMilestones = [...milestones].sort((a, b) => {
            if (a.completed !== b.completed) return a.completed ? 1 : -1;
            return (b.progressRatio ?? 0) - (a.progressRatio ?? 0);
        });

        for (const list of lists) {
            const listLimit = parseInt(list.dataset.milestoneLimit ?? '0', 10);
            const visibleMilestones = listLimit > 0
                ? sortedMilestones.slice(0, listLimit)
                : sortedMilestones;

            list.textContent = '';
            for (const milestone of visibleMilestones) {
                list.appendChild(this.createCareerMilestoneItem(milestone));
            }
        }
    }

    setSetting(key, value) {
        if (!(key in this.settings)) return;

        this.settings = {
            ...this.settings,
            [key]: Boolean(value)
        };
        this.updateSettingsDisplay();
        this.onSettingsChange({ ...this.settings });
    }

    updateSettingsDisplay() {
        for (const button of this.settingButtons ?? []) {
            const key = button.dataset.settingKey;
            const enabled = Boolean(this.settings[key]);
            const stateElement = button.querySelector('[data-role="setting-state"]');

            button.style.borderColor = enabled ? 'rgba(127, 224, 255, 0.44)' : 'rgba(255, 255, 255, 0.14)';
            button.style.background = enabled ? 'rgba(22, 120, 150, 0.18)' : 'rgba(255, 255, 255, 0.06)';

            if (stateElement) {
                stateElement.textContent = enabled ? 'ACTIF' : 'COUPÉ';
                stateElement.style.background = enabled ? 'rgba(127, 224, 255, 0.16)' : 'rgba(255, 255, 255, 0.1)';
                stateElement.style.color = enabled ? '#7fe0ff' : 'rgba(255, 255, 255, 0.54)';
            }
        }
    }

    show(panel = 'home') {
        this.refreshVehicleUnlocks();
        this.refreshVehicleBestScores();
        this.refreshModeBestScores();
        this.refreshCareerStats();
        this.refreshCareerMilestones();
        this.updateSettingsDisplay();
        this.updateVehicleSelection();
        this.updateModeSelection();
        this.setPanel(panel);
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

        this.titleElement = this.element.querySelector('[data-role="game-over-title"]');
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
        title.dataset.role = 'game-over-title';
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
        this.showWithTitle('GAME OVER', finalScore, bestScore, summaryItems);
    }

    showWithTitle(title, finalScore = 0, bestScore = 0, summaryItems = [], primaryDisplay = {}) {
        this.titleElement.textContent = title;
        this.scoreElement.textContent = `${primaryDisplay.scoreLabel ?? 'SCORE'} : ${primaryDisplay.scoreText ?? finalScore}`;
        this.bestElement.textContent = `${primaryDisplay.bestLabel ?? 'MEILLEUR'} : ${primaryDisplay.bestText ?? bestScore}`;
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
                background: ${item.highlight ? 'rgba(255, 210, 63, 0.17)' : 'rgba(255, 255, 255, 0.1)'};
                box-shadow: inset 0 0 0 1px ${item.highlight ? 'rgba(255, 210, 63, 0.42)' : 'rgba(255, 255, 255, 0.12)'};
            `;

            const label = document.createElement('span');
            label.textContent = item.label;
            label.style.cssText = `
                font-size: 0.72rem;
                font-weight: 750;
                letter-spacing: 0.08em;
                color: ${item.highlight ? '#ffd23f' : 'rgba(255, 255, 255, 0.68)'};
            `;

            const value = document.createElement('span');
            value.textContent = String(item.value);
            value.style.cssText = `
                margin-top: 4px;
                font-size: 1.08rem;
                font-weight: 900;
                color: ${item.highlight ? '#ffffff' : '#ffffff'};
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
     * @param {() => void} onQuit - appelé quand le joueur clique sur "QUITTER LA PARTIE".
     */
    constructor(onResume, onQuit = () => {}) {
        this.element = this.buildElement();
        document.body.appendChild(this.element);

        this.resumeButton = this.element.querySelector('[data-role="resume"]');
        this.quitButton = this.element.querySelector('[data-role="quit"]');
        this.resumeButton.addEventListener('click', onResume);
        this.quitButton.addEventListener('click', onQuit);
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

        const actions = document.createElement('div');
        actions.style.cssText = `
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            gap: 10px;
        `;

        const resumeButton = document.createElement('button');
        resumeButton.dataset.role = 'resume';
        resumeButton.textContent = 'REPRENDRE';
        resumeButton.style.cssText = `
            min-width: 178px;
            padding: 14px 26px;
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

        const quitButton = document.createElement('button');
        quitButton.dataset.role = 'quit';
        quitButton.textContent = 'QUITTER LA PARTIE';
        quitButton.style.cssText = `
            min-width: 178px;
            padding: 14px 26px;
            font-size: 1.05rem;
            font-weight: 800;
            letter-spacing: 0.06em;
            border: 1px solid rgba(255, 255, 255, 0.26);
            border-radius: 8px;
            background: rgba(0, 0, 0, 0.34);
            color: #ffffff;
            cursor: pointer;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24);
        `;

        actions.appendChild(resumeButton);
        actions.appendChild(quitButton);

        overlay.appendChild(title);
        overlay.appendChild(actions);
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

        /* --- Zone 3 : mode courant (droite, sous le niveau) --- */
        .hr-mode-hud {
            top: 56px;
            right: 16px;
            text-align: right;
            min-width: 132px;
        }
        .hr-mode-box {
            display: inline-flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 4px;
            padding: 7px 9px;
            border-radius: 8px;
            background: rgba(0, 0, 0, 0.24);
            box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1);
        }
        .hr-mode-label {
            font-size: clamp(0.62rem, 1.5vw, 0.72rem);
            font-weight: 900;
            letter-spacing: 0.12em;
            color: #7fe0ff;
        }
        .hr-mode-value {
            font-size: clamp(0.78rem, 2vw, 0.95rem);
            font-weight: 900;
            color: #ffffff;
        }
        .hr-mode-meter {
            width: 98px;
            height: 4px;
            border-radius: 999px;
            overflow: hidden;
            background: rgba(255, 255, 255, 0.16);
        }
        .hr-mode-fill {
            height: 100%;
            width: 100%;
            border-radius: inherit;
            background: linear-gradient(90deg, #7fe0ff, #ffd23f);
            transition: width 0.12s linear;
        }

        /* --- Zone 4 : combo (droite, sous le mode) --- */
        .hr-combo-hud {
            top: 118px;
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

        /* --- Zone 5 : objectif courant (haut-centre) --- */
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

        /* --- Zone 6 : file de notifications d'événements (droite, sous le combo) --- */
        .hr-notifications-hud {
            top: 170px;
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

        /* --- Zone 7 : compteur de vitesse (bas-gauche) --- */
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

        /* --- Zone 8 : alerte danger (bas-centre) --- */
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
            .hr-mode-hud { top: 48px; }
            .hr-combo-hud { top: 110px; }
            .hr-notifications-hud { top: 164px; max-width: 60vw; }
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
    'time-bonus': { title: 'TEMPS BONUS', className: 'hr-notification-objective', visibleDurationMs: 1250, suffix: 's' },
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
        this.scoreLabelElement = this.scoreZone.querySelector('.hr-score-label');
        this.bestLabelElement = this.scoreZone.querySelector('.hr-best-label');
        this.scoreValueElement = this.scoreZone.querySelector('[data-role="score"]');
        this.bestValueElement = this.scoreZone.querySelector('[data-role="best"]');
        document.body.appendChild(this.scoreZone);

        // --- Zone 2 : niveau ---
        this.levelZone = document.createElement('div');
        this.levelZone.className = 'hr-hud-zone hr-level-hud';
        this.levelZone.innerHTML = '<span class="hr-level-value" data-role="level"></span>';
        this.levelValueElement = this.levelZone.querySelector('[data-role="level"]');
        document.body.appendChild(this.levelZone);

        // --- Zone 3 : mode courant ---
        this.modeZone = document.createElement('div');
        this.modeZone.className = 'hr-hud-zone hr-mode-hud';
        this.modeZone.innerHTML = `
            <span class="hr-mode-box">
                <span class="hr-mode-label" data-role="mode-label"></span>
                <span class="hr-mode-value" data-role="mode-value"></span>
                <span class="hr-mode-meter">
                    <span class="hr-mode-fill" data-role="mode-fill"></span>
                </span>
            </span>
        `;
        this.modeLabelElement = this.modeZone.querySelector('[data-role="mode-label"]');
        this.modeValueElement = this.modeZone.querySelector('[data-role="mode-value"]');
        this.modeFillElement = this.modeZone.querySelector('[data-role="mode-fill"]');
        document.body.appendChild(this.modeZone);

        // --- Zone 4 : combo ---
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
        this.updateModeStatus(null);
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

    updateModeStatus(status) {
        if (!status) {
            this.modeZone.style.display = 'none';
            return;
        }

        this.modeZone.style.display = 'block';
        this.modeLabelElement.textContent = status.label ?? 'MODE';
        this.modeValueElement.textContent = status.value ?? '';
        this.modeFillElement.style.width = `${Math.round(Math.max(0, Math.min(1, status.progress ?? 1)) * 100)}%`;
    }

    /**
     * @param {number} comboMultiplier - multiplicateur de combo courant (0 = aucun combo actif).
     */
    update(score, bestScore, comboMultiplier = 0, comboProgress = 0, comboTimeRemaining = 0, primaryDisplay = {}) {
        const formatValue = primaryDisplay.formatValue
            ?? ((value) => Math.floor(value).toLocaleString('fr-FR'));

        this.scoreLabelElement.textContent = primaryDisplay.scoreLabel ?? 'SCORE';
        this.bestLabelElement.textContent = primaryDisplay.bestLabel ?? 'MEILLEUR';
        this.scoreValueElement.textContent = formatValue(score);
        this.bestValueElement.textContent = formatValue(bestScore);

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

    updateSpeed(speed, scoreFactor = 0, scoreLabel = 'SCORE') {
        const displaySpeed = Math.max(0, Math.round(speed * SPEED_DISPLAY_KMH_PER_GAME_UNIT));
        const clampedScoreFactor = Math.max(0, Math.min(1, scoreFactor));
        this.speedValueElement.textContent = displaySpeed.toLocaleString('fr-FR');
        this.speedScoreLabelElement.textContent = scoreLabel === 'DISTANCE'
            ? 'DISTANCE'
            : clampedScoreFactor <= 0
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
            const suffix = config.suffix ?? '';
            notificationElement.innerHTML = `
                <span class="hr-notification-title">${config.title}</span>
                <span class="hr-notification-amount">+${Math.floor(amount)}${suffix}</span>
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

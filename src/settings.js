const GAME_SETTINGS_STORAGE_KEY = 'highwayRush.settings';

export const DEFAULT_GAME_SETTINGS = {
    performanceMode: false,
    cameraShake: true,
    speedEffects: true,
    masterVolume: 0.82,
    effectsVolume: 0.78,
    engineVolume: 0.72
};

function sanitizeBoolean(value, fallback) {
    return typeof value === 'boolean' ? value : fallback;
}

function sanitizeVolume(value, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(0, Math.min(1, parsed));
}

export function loadGameSettings() {
    try {
        const stored = window.localStorage.getItem(GAME_SETTINGS_STORAGE_KEY);
        if (!stored) return { ...DEFAULT_GAME_SETTINGS };

        const parsed = JSON.parse(stored);
        if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_GAME_SETTINGS };

        return {
            performanceMode: sanitizeBoolean(parsed.performanceMode, DEFAULT_GAME_SETTINGS.performanceMode),
            cameraShake: sanitizeBoolean(parsed.cameraShake, DEFAULT_GAME_SETTINGS.cameraShake),
            speedEffects: sanitizeBoolean(parsed.speedEffects, DEFAULT_GAME_SETTINGS.speedEffects),
            masterVolume: sanitizeVolume(parsed.masterVolume, DEFAULT_GAME_SETTINGS.masterVolume),
            effectsVolume: sanitizeVolume(parsed.effectsVolume, DEFAULT_GAME_SETTINGS.effectsVolume),
            engineVolume: sanitizeVolume(parsed.engineVolume, DEFAULT_GAME_SETTINGS.engineVolume)
        };
    } catch (error) {
        return { ...DEFAULT_GAME_SETTINGS };
    }
}

export function saveGameSettings(settings) {
    try {
        window.localStorage.setItem(
            GAME_SETTINGS_STORAGE_KEY,
            JSON.stringify({
                ...DEFAULT_GAME_SETTINGS,
                ...settings
            })
        );
    } catch (error) {
        // Les réglages sont confortables mais non essentiels : le jeu reste jouable sans sauvegarde.
    }
}

// Architecture audio, prête à l'emploi mais SANS aucun fichier son
// téléchargé automatiquement (conformément à la demande). Pour activer un
// son, il suffit de déposer le fichier correspondant à l'un des chemins
// listés ci-dessous (par exemple dans un dossier `public/audio/` servi par
// Vite) — aucun changement de code n'est nécessaire ailleurs dans le projet.
//
// Tant qu'un fichier est absent (ou ne peut pas être lu), `audio.play(...)`
// échoue silencieusement : pas d'erreur dans la console, aucun impact sur
// le jeu. Ce module est donc sûr à appeler dès maintenant, même sans aucun
// son en place.

const SOUND_SOURCES = {
    collision: '/audio/collision.mp3',
    nearMiss: '/audio/near-miss.mp3',
    overtake: '/audio/overtake.mp3',
    combo: '/audio/combo.mp3',
    button: '/audio/button.mp3'
};

const AUDIO_MUTED_STORAGE_KEY = 'highwayRush.audioMuted';

// Nombre d'instances <audio> par son : permet à un même son de se
// redéclencher plusieurs fois de suite sans se couper (par exemple deux
// Near Miss très rapprochés), sans jamais créer de nouvel élément audio
// pendant la partie — toutes les instances sont créées une seule fois, ici.
const VOICES_PER_SOUND = 3;

// Son moteur procédural : aucun fichier externe. Deux oscillateurs très
// discrets passent dans un filtre passe-bas ; game.js ne fait ensuite que
// piloter fréquence/volume selon la vitesse et l'accélération.
const ENGINE_BASE_FREQUENCY = 58;
const ENGINE_MAX_FREQUENCY = 178;
const ENGINE_IDLE_GAIN = 0.012;
const ENGINE_MAX_GAIN = 0.045;
const ENGINE_ACCEL_GAIN_BOOST = 0.016;
const ENGINE_BRAKE_GAIN_REDUCTION = 0.012;
const ENGINE_FILTER_BASE = 420;
const ENGINE_FILTER_MAX = 1500;
const ENGINE_PARAM_SMOOTHING = 0.055;

const ROAD_NOISE_MAX_GAIN = 0.026;
const ROAD_NOISE_FILTER_BASE = 820;
const ROAD_NOISE_FILTER_MAX = 2600;
const BRAKE_NOISE_MIN_SPEED_RATIO = 0.28;
const BRAKE_NOISE_MAX_GAIN = 0.052;
const BRAKE_NOISE_FILTER_BASE = 1800;
const BRAKE_NOISE_FILTER_MAX = 3600;

/**
 * Petit pool de lecteurs <audio> pour un seul son : lecture "round-robin"
 * entre les instances, et désactivation silencieuse et définitive dès
 * qu'une erreur de chargement survient (fichier absent, format invalide...).
 */
class SoundVoicePool {
    constructor(src) {
        this.available = Boolean(src);
        this.voices = [];
        this.nextVoiceIndex = 0;

        if (!this.available) return;

        for (let i = 0; i < VOICES_PER_SOUND; i++) {
            const voice = new Audio();
            voice.preload = 'auto';
            voice.src = src;

            // Si le fichier n'existe pas (404) ou n'est pas décodable, on
            // désactive silencieusement CE son uniquement : les autres
            // continuent de fonctionner normalement, et plus aucune
            // tentative de lecture n'est faite ensuite pour celui-ci.
            voice.addEventListener('error', () => {
                this.available = false;
            }, { once: true });

            this.voices.push(voice);
        }
    }

    play(volume) {
        if (!this.available) return;

        const voice = this.voices[this.nextVoiceIndex];
        this.nextVoiceIndex = (this.nextVoiceIndex + 1) % this.voices.length;

        voice.volume = volume;
        voice.currentTime = 0;

        // play() renvoie une Promise qui peut être rejetée (lecture
        // automatique bloquée avant la première interaction utilisateur,
        // fichier manquant...) : on l'intercepte pour ne jamais faire
        // planter le jeu ni polluer la console.
        const playPromise = voice.play();
        if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(() => {});
        }
    }
}

class AudioManager {
    constructor() {
        this.muted = this.loadMutedPreference();
        this.pools = {};
        this.audioContext = null;
        this.engine = null;
        this.drivingAmbience = null;

        for (const [name, src] of Object.entries(SOUND_SOURCES)) {
            this.pools[name] = new SoundVoicePool(src);
        }
    }

    loadMutedPreference() {
        try {
            return window.localStorage?.getItem(AUDIO_MUTED_STORAGE_KEY) === 'true';
        } catch {
            return false;
        }
    }

    saveMutedPreference() {
        try {
            window.localStorage?.setItem(AUDIO_MUTED_STORAGE_KEY, this.muted ? 'true' : 'false');
        } catch {
            // Certains navigateurs peuvent bloquer localStorage ; le jeu
            // garde alors simplement le choix sonore pour la session en cours.
        }
    }

    isMuted() {
        return this.muted;
    }

    getAudioContext() {
        if (this.audioContext) return this.audioContext;

        const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
        if (!AudioContextClass) return null;

        this.audioContext = new AudioContextClass();
        return this.audioContext;
    }

    createNoiseBuffer(context, duration = 1) {
        const length = Math.max(1, Math.floor(context.sampleRate * duration));
        const buffer = context.createBuffer(1, length, context.sampleRate);
        const data = buffer.getChannelData(0);
        let smoothed = 0;

        for (let i = 0; i < length; i++) {
            const raw = Math.random() * 2 - 1;
            smoothed = smoothed * 0.92 + raw * 0.08;
            data[i] = raw * 0.36 + smoothed * 0.64;
        }

        return buffer;
    }

    ensureEngine() {
        if (this.engine) return this.engine;

        const context = this.getAudioContext();
        if (!context) return null;

        const masterGain = context.createGain();
        masterGain.gain.value = 0;
        masterGain.connect(context.destination);

        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = ENGINE_FILTER_BASE;
        filter.Q.value = 0.75;
        filter.connect(masterGain);

        const lowOscillator = context.createOscillator();
        lowOscillator.type = 'sawtooth';
        lowOscillator.frequency.value = ENGINE_BASE_FREQUENCY;

        const highOscillator = context.createOscillator();
        highOscillator.type = 'triangle';
        highOscillator.frequency.value = ENGINE_BASE_FREQUENCY * 1.5;

        const lowGain = context.createGain();
        lowGain.gain.value = 0.18;
        const highGain = context.createGain();
        highGain.gain.value = 0.08;

        lowOscillator.connect(lowGain);
        highOscillator.connect(highGain);
        lowGain.connect(filter);
        highGain.connect(filter);

        lowOscillator.start();
        highOscillator.start();

        this.engine = {
            context,
            masterGain,
            filter,
            lowOscillator,
            highOscillator
        };

        return this.engine;
    }

    ensureDrivingAmbience() {
        if (this.drivingAmbience) return this.drivingAmbience;

        const context = this.getAudioContext();
        if (!context) return null;

        const roadSource = context.createBufferSource();
        roadSource.buffer = this.createNoiseBuffer(context, 1.4);
        roadSource.loop = true;

        const roadFilter = context.createBiquadFilter();
        roadFilter.type = 'lowpass';
        roadFilter.frequency.value = ROAD_NOISE_FILTER_BASE;
        roadFilter.Q.value = 0.55;

        const roadGain = context.createGain();
        roadGain.gain.value = 0;

        roadSource.connect(roadFilter);
        roadFilter.connect(roadGain);
        roadGain.connect(context.destination);
        roadSource.start();

        const brakeSource = context.createBufferSource();
        brakeSource.buffer = this.createNoiseBuffer(context, 0.85);
        brakeSource.loop = true;

        const brakeFilter = context.createBiquadFilter();
        brakeFilter.type = 'bandpass';
        brakeFilter.frequency.value = BRAKE_NOISE_FILTER_BASE;
        brakeFilter.Q.value = 1.15;

        const brakeGain = context.createGain();
        brakeGain.gain.value = 0;

        brakeSource.connect(brakeFilter);
        brakeFilter.connect(brakeGain);
        brakeGain.connect(context.destination);
        brakeSource.start();

        this.drivingAmbience = {
            context,
            roadGain,
            roadFilter,
            brakeGain,
            brakeFilter
        };

        return this.drivingAmbience;
    }

    connectOutput(context, node, pan = 0) {
        const clampedPan = Math.max(-1, Math.min(1, pan));

        if (typeof context.createStereoPanner !== 'function') {
            node.connect(context.destination);
            return null;
        }

        const panner = context.createStereoPanner();
        panner.pan.value = clampedPan;
        node.connect(panner);
        panner.connect(context.destination);
        return panner;
    }

    playNoiseBurst({
        duration = 0.25,
        gain = 0.04,
        attack = 0.018,
        frequency = 900,
        endFrequency = frequency,
        q = 0.9,
        filterType = 'bandpass',
        pan = 0
    } = {}) {
        if (this.muted) return;

        this.resumeContext();
        const context = this.getAudioContext();
        if (!context) return;

        const now = context.currentTime;
        const source = context.createBufferSource();
        source.buffer = this.createNoiseBuffer(context, duration + 0.05);

        const filter = context.createBiquadFilter();
        filter.type = filterType;
        filter.frequency.setValueAtTime(frequency, now);
        filter.frequency.exponentialRampToValueAtTime(
            Math.max(1, endFrequency),
            now + duration
        );
        filter.Q.value = q;

        const burstGain = context.createGain();
        burstGain.gain.setValueAtTime(0.0001, now);
        burstGain.gain.linearRampToValueAtTime(gain, now + attack);
        burstGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

        source.connect(filter);
        filter.connect(burstGain);
        const panner = this.connectOutput(context, burstGain, pan);

        source.start(now);
        source.stop(now + duration + 0.05);
        source.addEventListener('ended', () => {
            source.disconnect();
            filter.disconnect();
            burstGain.disconnect();
            panner?.disconnect();
        }, { once: true });
    }

    playToneSweep({
        duration = 0.18,
        frequency = 180,
        endFrequency = frequency,
        gain = 0.035,
        type = 'sine',
        pan = 0
    } = {}) {
        if (this.muted) return;

        this.resumeContext();
        const context = this.getAudioContext();
        if (!context) return;

        const now = context.currentTime;
        const oscillator = context.createOscillator();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(Math.max(1, frequency), now);
        oscillator.frequency.exponentialRampToValueAtTime(
            Math.max(1, endFrequency),
            now + duration
        );

        const toneGain = context.createGain();
        toneGain.gain.setValueAtTime(0.0001, now);
        toneGain.gain.linearRampToValueAtTime(gain, now + 0.015);
        toneGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

        oscillator.connect(toneGain);
        const panner = this.connectOutput(context, toneGain, pan);

        oscillator.start(now);
        oscillator.stop(now + duration + 0.04);
        oscillator.addEventListener('ended', () => {
            oscillator.disconnect();
            toneGain.disconnect();
            panner?.disconnect();
        }, { once: true });
    }

    playProcedural(name, { speedRatio = 0, pan = 0, intensity = 1 } = {}) {
        if (this.muted) return;

        const speedAmount = Math.max(0, Math.min(1, speedRatio));
        const eventIntensity = Math.max(0.2, Math.min(1.4, intensity));

        if (name === 'laneChange') {
            this.playNoiseBurst({
                duration: 0.16 + speedAmount * 0.08,
                gain: (0.018 + speedAmount * 0.025) * eventIntensity,
                frequency: 720 + speedAmount * 420,
                endFrequency: 1450 + speedAmount * 1050,
                q: 0.75,
                pan
            });
            return;
        }

        if (name === 'nearMiss') {
            this.playNoiseBurst({
                duration: 0.28 + speedAmount * 0.12,
                gain: (0.035 + speedAmount * 0.045) * eventIntensity,
                frequency: 520 + speedAmount * 360,
                endFrequency: 2300 + speedAmount * 1400,
                q: 0.95,
                pan
            });
            return;
        }

        if (name === 'overtake') {
            this.playNoiseBurst({
                duration: 0.18,
                gain: (0.018 + speedAmount * 0.018) * eventIntensity,
                frequency: 680,
                endFrequency: 1200 + speedAmount * 800,
                q: 0.7,
                pan
            });
            return;
        }

        if (name === 'collision') {
            this.playToneSweep({
                duration: 0.22,
                frequency: 120,
                endFrequency: 42,
                gain: 0.105 * eventIntensity,
                type: 'sine',
                pan
            });
            this.playNoiseBurst({
                duration: 0.2,
                gain: 0.09 * eventIntensity,
                frequency: 240,
                endFrequency: 90,
                q: 0.85,
                filterType: 'lowpass',
                pan
            });
            return;
        }

        if (name === 'combo') {
            this.playToneSweep({
                duration: 0.16,
                frequency: 360,
                endFrequency: 540,
                gain: 0.024 * eventIntensity,
                type: 'triangle',
                pan
            });
        }
    }

    resumeContext() {
        const context = this.getAudioContext();
        if (!context) return;

        const resumePromise = context.resume?.();
        if (resumePromise && typeof resumePromise.catch === 'function') {
            resumePromise.catch(() => {});
        }
    }

    /**
     * @param {string} name - une des clés de SOUND_SOURCES ('collision', 'nearMiss', 'overtake', 'combo', 'button').
     * @param {number} volume - 0 à 1.
     */
    play(name, volume = 0.6) {
        if (this.muted) return;
        const pool = this.pools[name];
        if (!pool) return;
        pool.play(volume);
    }

    startEngine() {
        if (this.muted) return;

        this.resumeContext();
        const engine = this.ensureEngine();
        this.ensureDrivingAmbience();
        if (!engine) return;

        engine.masterGain.gain.setTargetAtTime(
            ENGINE_IDLE_GAIN,
            engine.context.currentTime,
            ENGINE_PARAM_SMOOTHING
        );
    }

    stopEngine() {
        const engine = this.engine;
        if (!engine) return;

        engine.masterGain.gain.setTargetAtTime(
            0,
            engine.context.currentTime,
            ENGINE_PARAM_SMOOTHING
        );

        const ambience = this.drivingAmbience;
        if (!ambience) return;

        ambience.roadGain.gain.setTargetAtTime(
            0,
            ambience.context.currentTime,
            ENGINE_PARAM_SMOOTHING
        );
        ambience.brakeGain.gain.setTargetAtTime(
            0,
            ambience.context.currentTime,
            ENGINE_PARAM_SMOOTHING
        );
    }

    updateEngine(speedRatio, { accelerating = false, braking = false, active = true } = {}) {
        const engine = this.engine;
        if (!engine) return;

        const clampedSpeedRatio = Math.max(0, Math.min(1, speedRatio));
        const now = engine.context.currentTime;

        const frequency = ENGINE_BASE_FREQUENCY
            + clampedSpeedRatio * (ENGINE_MAX_FREQUENCY - ENGINE_BASE_FREQUENCY);
        const filterFrequency = ENGINE_FILTER_BASE
            + clampedSpeedRatio * (ENGINE_FILTER_MAX - ENGINE_FILTER_BASE);

        let targetGain = active && !this.muted
            ? ENGINE_IDLE_GAIN + clampedSpeedRatio * (ENGINE_MAX_GAIN - ENGINE_IDLE_GAIN)
            : 0;

        if (active && accelerating) targetGain += ENGINE_ACCEL_GAIN_BOOST;
        if (active && braking) targetGain = Math.max(0, targetGain - ENGINE_BRAKE_GAIN_REDUCTION);

        engine.lowOscillator.frequency.setTargetAtTime(frequency, now, ENGINE_PARAM_SMOOTHING);
        engine.highOscillator.frequency.setTargetAtTime(frequency * 1.52, now, ENGINE_PARAM_SMOOTHING);
        engine.filter.frequency.setTargetAtTime(filterFrequency, now, ENGINE_PARAM_SMOOTHING);
        engine.masterGain.gain.setTargetAtTime(targetGain, now, ENGINE_PARAM_SMOOTHING);

        const ambience = this.drivingAmbience;
        if (!ambience) return;

        const roadAmount = Math.max(0, (clampedSpeedRatio - 0.1) / 0.9);
        const brakeAmount = braking
            ? Math.max(0, (clampedSpeedRatio - BRAKE_NOISE_MIN_SPEED_RATIO) / (1 - BRAKE_NOISE_MIN_SPEED_RATIO))
            : 0;

        ambience.roadFilter.frequency.setTargetAtTime(
            ROAD_NOISE_FILTER_BASE + roadAmount * (ROAD_NOISE_FILTER_MAX - ROAD_NOISE_FILTER_BASE),
            now,
            ENGINE_PARAM_SMOOTHING
        );
        ambience.roadGain.gain.setTargetAtTime(
            active && !this.muted ? Math.pow(roadAmount, 1.35) * ROAD_NOISE_MAX_GAIN : 0,
            now,
            ENGINE_PARAM_SMOOTHING
        );
        ambience.brakeFilter.frequency.setTargetAtTime(
            BRAKE_NOISE_FILTER_BASE + brakeAmount * (BRAKE_NOISE_FILTER_MAX - BRAKE_NOISE_FILTER_BASE),
            now,
            ENGINE_PARAM_SMOOTHING
        );
        ambience.brakeGain.gain.setTargetAtTime(
            active && !this.muted ? brakeAmount * BRAKE_NOISE_MAX_GAIN : 0,
            now,
            ENGINE_PARAM_SMOOTHING
        );
    }

    setMuted(muted) {
        this.muted = Boolean(muted);
        this.saveMutedPreference();

        if (this.muted) {
            this.stopEngine();
        }

        return this.muted;
    }
}

// Une seule instance partagée par tout le jeu : cohérent avec le style déjà
// utilisé pour les autres managers (scoreManager, difficulty, traffic...),
// pas besoin d'un contexte global séparé.
export const audio = new AudioManager();

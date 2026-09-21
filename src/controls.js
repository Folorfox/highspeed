// Ce module s'occupe uniquement du clavier : il ne connaît rien du jeu,
// il répond juste à la question "quelles touches sont actuellement enfoncées ?"
//
// On utilise event.code (position physique de la touche) plutôt que event.key,
// et on liste les deux lettres possibles (clavier AZERTY et QWERTY) pour chaque
// action, comme demandé : Z/W pour accélérer, Q/A pour aller à gauche, etc.

const KEYS_ACCELERATE = ['KeyZ', 'KeyW'];
const KEYS_BRAKE = ['KeyS'];
const KEYS_LEFT = ['KeyQ', 'KeyA'];
const KEYS_RIGHT = ['KeyD'];

export class Controls {
    constructor() {
        this.pressedKeys = new Set();

        // Le changement de voie doit se déclencher UNE SEULE FOIS par appui,
        // pas en continu tant que la touche est maintenue. On mémorise donc
        // juste "un changement de voie est en attente", que game.js viendra
        // lire puis effacer à chaque frame.
        this.pendingLaneShift = 0;

        window.addEventListener('keydown', (event) => this.handleKeyDown(event));
        window.addEventListener('keyup', (event) => this.handleKeyUp(event));
    }

    handleKeyDown(event) {
        const alreadyPressed = this.pressedKeys.has(event.code);
        this.pressedKeys.add(event.code);

        // Si la touche était déjà enfoncée, c'est une répétition automatique
        // du clavier : on l'ignore pour ne pas déclencher plusieurs changements
        // de voie d'affilée.
        if (alreadyPressed) return;

        if (KEYS_LEFT.includes(event.code)) {
            this.pendingLaneShift = -1;
        } else if (KEYS_RIGHT.includes(event.code)) {
            this.pendingLaneShift = 1;
        }
    }

    handleKeyUp(event) {
        this.pressedKeys.delete(event.code);
    }

    isAccelerating() {
        return KEYS_ACCELERATE.some((code) => this.pressedKeys.has(code));
    }

    isBraking() {
        return KEYS_BRAKE.some((code) => this.pressedKeys.has(code));
    }

    /**
     * Renvoie -1 (gauche), 1 (droite) ou 0 (rien en attente), puis remet
     * immédiatement la valeur à 0. Ainsi, un appui ne compte qu'une seule fois.
     */
    consumeLaneShift() {
        const shift = this.pendingLaneShift;
        this.pendingLaneShift = 0;
        return shift;
    }

    clear() {
        this.pressedKeys.clear();
        this.pendingLaneShift = 0;
    }
}

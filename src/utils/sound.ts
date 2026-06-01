let audioCtx: AudioContext | null = null;

const getAudioContextConstructor = (): typeof AudioContext | null => {
    if (typeof window === 'undefined') return null; // Handle SSR/Test environment
    try {
        const audioWindow = window as unknown as {
            AudioContext?: typeof AudioContext;
            webkitAudioContext?: typeof AudioContext;
        };
        return audioWindow.AudioContext || audioWindow.webkitAudioContext || null;
    } catch {
        return null;
    }
};

const getAudioContext = () => {
    if (audioCtx) return audioCtx;

    const AudioContextCtor = getAudioContextConstructor();
    if (!AudioContextCtor) return null;

    try {
        audioCtx = new AudioContextCtor();
        return audioCtx;
    } catch {
        audioCtx = null;
        return null;
    }
};

// Ensure context is running (needed for some browsers that suspend it)
const resumeContext = () => {
    const ctx = getAudioContext();
    let state: AudioContextState | null = null;
    try {
        state = ctx?.state ?? null;
    } catch {
        return null;
    }
    if (ctx && state === 'suspended') {
        try {
            void ctx.resume().catch(() => {});
        } catch {
            return null;
        }
    }
    return ctx;
};

const runSound = (play: (ctx: AudioContext) => void) => {
    const ctx = resumeContext();
    if (!ctx) return;
    try {
        play(ctx);
    } catch {
        // Audio is optional; never let a browser audio failure interrupt play.
    }
};

export const playStoneSound = () => {
    runSound((ctx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        // Stone placement: sharp attack, quick decay, woody.
        // Triangle wave pitched down quickly.
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(800, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.1);

        gain.gain.setValueAtTime(0.5, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

        osc.start();
        osc.stop(ctx.currentTime + 0.1);
    });
};

export const playCaptureSound = (count: number) => {
    runSound((ctx) => {
        // Capture: rattling stones. Multiple short clicks.
        // We play 'count' clicks with slight random delay.
        const clicks = Math.min(count, 5); // Limit to 5 clicks to avoid chaos

        const now = ctx.currentTime;

        for (let i = 0; i < clicks; i++) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);

            const startTime = now + (Math.random() * 0.1) + (i * 0.05);

            osc.type = 'square'; // harsher sound for stone collision
            osc.frequency.setValueAtTime(1200 + Math.random() * 500, startTime);
            osc.frequency.exponentialRampToValueAtTime(100, startTime + 0.05);

            gain.gain.setValueAtTime(0.3, startTime);
            gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.05);

            osc.start(startTime);
            osc.stop(startTime + 0.05);
        }
    });
};

export const playPassSound = () => {
    runSound((ctx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        // Pass: Soft bell or ding
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, ctx.currentTime); // A4
        osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.5);

        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

        osc.start();
        osc.stop(ctx.currentTime + 0.5);
    });
};

export const playNewGameSound = () => {
    runSound((ctx) => {
        // Upward chime
        const now = ctx.currentTime;
        [440, 554, 659].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);

            const startTime = now + i * 0.1;
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, startTime);

            gain.gain.setValueAtTime(0.2, startTime);
            gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.3);

            osc.start(startTime);
            osc.stop(startTime + 0.3);
        });
    });
};

export const resetAudioContextForTests = (): void => {
    audioCtx = null;
};

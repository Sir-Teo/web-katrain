let audioCtx: AudioContext | null = null;
type SoundEffectKey = 'stone' | 'capture' | 'pass' | 'new-game';

const MIN_SOUND_INTERVAL_MS = 50;
const lastSoundTimeByKey = new Map<SoundEffectKey, number>();

export interface SoundInitError {
    message: string;
    backend: 'web-audio';
    platform: string;
}

let onSoundInitError: ((error: SoundInitError) => void) | null = null;
let soundFailureReported = false;

export const setSoundInitErrorHandler = (handler: ((error: SoundInitError) => void) | null): void => {
    onSoundInitError = handler;
};

export const resetSoundFailureReport = (): void => {
    soundFailureReported = false;
    lastSoundTimeByKey.clear();
};

const formatSoundError = (error: unknown): string => (
    error instanceof Error && error.message ? error.message : 'Unknown audio error'
);

const getPlatformLabel = (): string => {
    try {
        return typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown';
    } catch {
        return 'unknown';
    }
};

const reportSoundError = (message: string): void => {
    if (soundFailureReported) return;
    if (!onSoundInitError) return;
    soundFailureReported = true;
    onSoundInitError({
        message,
        backend: 'web-audio',
        platform: getPlatformLabel(),
    });
};

const getSoundNow = (): number => {
    try {
        return typeof performance !== 'undefined' ? performance.now() : Date.now();
    } catch {
        return Date.now();
    }
};

const shouldSkipRepeatedSound = (key: SoundEffectKey): boolean => {
    const now = getSoundNow();
    const last = lastSoundTimeByKey.get(key);
    if (last !== undefined && now - last < MIN_SOUND_INTERVAL_MS) return true;
    lastSoundTimeByKey.set(key, now);
    return false;
};

const getAudioContextConstructor = (): typeof AudioContext | null => {
    if (typeof window === 'undefined') return null; // Handle SSR/Test environment
    try {
        const audioWindow = window as unknown as {
            AudioContext?: typeof AudioContext;
            webkitAudioContext?: typeof AudioContext;
        };
        return audioWindow.AudioContext || audioWindow.webkitAudioContext || null;
    } catch (error) {
        reportSoundError(`Browser audio API is blocked: ${formatSoundError(error)}`);
        return null;
    }
};

const getAudioContext = () => {
    if (audioCtx) return audioCtx;

    const AudioContextCtor = getAudioContextConstructor();
    if (!AudioContextCtor) {
        if (typeof window !== 'undefined') {
            reportSoundError('Browser audio API is not available.');
        }
        return null;
    }

    try {
        audioCtx = new AudioContextCtor();
        return audioCtx;
    } catch (error) {
        audioCtx = null;
        reportSoundError(`Could not initialize browser audio: ${formatSoundError(error)}`);
        return null;
    }
};

const playWithSoundErrorHandling = (play: (ctx: AudioContext) => void, ctx: AudioContext): void => {
    try {
        play(ctx);
    } catch (error) {
        reportSoundError(`Could not play browser audio: ${formatSoundError(error)}`);
        // Audio is optional; never let a browser audio failure interrupt play.
    }
};

// Ensure context is running (needed for some browsers that suspend it)
const resumeContext = (): { ctx: AudioContext; resumePromise?: Promise<void> } | null => {
    const ctx = getAudioContext();
    let state: AudioContextState | null = null;
    try {
        state = ctx?.state ?? null;
    } catch (error) {
        reportSoundError(`Could not read browser audio state: ${formatSoundError(error)}`);
        return null;
    }
    if (ctx && state === 'suspended') {
        try {
            const resumePromise = ctx.resume();
            void resumePromise.catch((error: unknown) => {
                reportSoundError(`Could not resume browser audio: ${formatSoundError(error)}`);
            });
            return { ctx, resumePromise };
        } catch (error) {
            reportSoundError(`Could not resume browser audio: ${formatSoundError(error)}`);
            return null;
        }
    }
    return ctx ? { ctx } : null;
};

const runSound = (key: SoundEffectKey, play: (ctx: AudioContext) => void) => {
    if (shouldSkipRepeatedSound(key)) return;
    const audio = resumeContext();
    if (!audio) return;
    if (audio.resumePromise) {
        void audio.resumePromise
            .then(() => playWithSoundErrorHandling(play, audio.ctx))
            .catch(() => undefined);
        return;
    }
    playWithSoundErrorHandling(play, audio.ctx);
};

export const playStoneSound = () => {
    runSound('stone', (ctx) => {
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
    runSound('capture', (ctx) => {
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
    runSound('pass', (ctx) => {
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
    runSound('new-game', (ctx) => {
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
    onSoundInitError = null;
    resetSoundFailureReport();
};

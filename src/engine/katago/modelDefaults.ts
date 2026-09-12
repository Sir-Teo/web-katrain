export const KATAGO_RECOMMENDED_MODEL_NAME = 'kata1-b18c384nbt-s9996604416-d4316597426';
export const KATAGO_RECOMMENDED_MODEL_URL =
  'https://media.katagotraining.org/uploaded/networks/models/kata1/kata1-b18c384nbt-s9996604416-d4316597426.bin.gz';
export const KATAGO_RECOMMENDED_MODEL_UPLOADED = '2024-05-26';
export const KATAGO_RECOMMENDED_MODEL_SIZE = '~96 MB';

export const KATAGO_SMALL_MODEL_PATH = 'models/katago-small.bin.gz';
export const KATAGO_SMALL_MODEL_NAME = 'g170-b6c96-s175395328-d26788732';

/** Recognize the shipped test network by filename or its loaded model name. */
export function isSmallKataGoModel(modelUrl?: string | null, modelName?: string | null): boolean {
  return [modelUrl, modelName].some((value) => {
    if (!value) return false;
    let name = value.trim().split(/[?#]/)[0]?.split('/').pop() ?? '';
    try { name = decodeURIComponent(name); } catch { /* Keep malformed names literal. */ }
    name = name.replace(/\.(?:bin|txt)(?:\.gz)?$/, '');
    return name === 'katago-small' || name === KATAGO_SMALL_MODEL_NAME;
  });
}

// KataGo's human SL net (v1.15+): a second model that predicts how a human of a
// given rank would play, rather than the strongest move.
export const KATAGO_HUMAN_MODEL_NAME = 'b18c384nbt-humanv0';
export const KATAGO_HUMAN_MODEL_URL =
  'https://github.com/lightvector/KataGo/releases/download/v1.15.0/b18c384nbt-humanv0.bin.gz';
export const KATAGO_HUMAN_MODEL_SIZE = '~99 MB';

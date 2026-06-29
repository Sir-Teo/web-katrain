import type { GameNode } from '../types';
import { captureBoardSnapshot } from './boardSnapshot';
import { writeClipboardImage } from './clipboard';
import { downloadBlob } from './objectUrl';
import { getSgfDownloadFilename } from './sgf';

export const dataUrlToBlob = (dataUrl: string): Blob | null => {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) return null;
  const mime = match[1] || 'image/png';
  const isBase64 = !!match[2];
  const data = match[3] ?? '';
  try {
    if (isBase64) {
      const binary = atob(data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      return new Blob([bytes], { type: mime });
    }
    return new Blob([decodeURIComponent(data)], { type: mime });
  } catch {
    return null;
  }
};

/** Builds a `.png` filename from the game metadata and current move number. */
export const getBoardImageFilename = (rootNode: GameNode, moveNumber: number, timestamp = Date.now()): string => {
  const sgfName = getSgfDownloadFilename(rootNode, timestamp);
  const stem = sgfName.replace(/\.sgf$/i, '');
  const moveSuffix = moveNumber > 0 ? `_move-${moveNumber}` : '';
  return `${stem}${moveSuffix}.png`;
};

/** Captures the on-screen board as a PNG blob, or null if capture is unavailable. */
export const captureBoardImageBlob = async (): Promise<Blob | null> => {
  const dataUrl = await captureBoardSnapshot();
  if (!dataUrl) return null;
  return dataUrlToBlob(dataUrl);
};

/** Captures the board and triggers a PNG download. Returns true on success. */
export const downloadBoardImage = async (rootNode: GameNode, moveNumber: number): Promise<boolean> => {
  const blob = await captureBoardImageBlob();
  if (!blob) return false;
  return downloadBlob(blob, getBoardImageFilename(rootNode, moveNumber));
};

/** Captures the board and copies the PNG to the clipboard. Returns true on success. */
export const copyBoardImage = async (): Promise<boolean> => {
  const blob = await captureBoardImageBlob();
  if (!blob) return false;
  return writeClipboardImage(blob);
};

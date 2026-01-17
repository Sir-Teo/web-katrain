import type { BoardThemeId } from '../types';
import { publicUrl } from './publicUrl';

export type ThemeStoneConfig = {
  image?: string;
  imageVariations?: string[];
  backgroundColor: string;
  foregroundColor: string;
  shadowColor?: string;
  shadowOffsetX?: string;
  shadowOffsetY?: string;
  shadowBlur?: string;
  size?: string;
  imageOffsetX?: string;
  imageOffsetY?: string;
  borderColor?: string;
  borderWidth?: string;
};

export type ThemeBoardConfig = {
  backgroundColor: string;
  borderColor?: string;
  foregroundColor?: string;
  borderWidth?: number;
  texture?: string;
};

export type BoardThemeConfig = {
  id: BoardThemeId;
  name: string;
  description?: string;
  board: ThemeBoardConfig;
  stones: { black: ThemeStoneConfig; white: ThemeStoneConfig };
  coordColor?: string;
};

const KATRAN_STONES = {
  black: {
    image: 'katrain/B_stone.png',
    backgroundColor: '#111111',
    foregroundColor: '#ffffff',
    shadowColor: 'rgba(0,0,0,0.35)',
    shadowOffsetX: '0.06em',
    shadowOffsetY: '0.08em',
    shadowBlur: '0.12em',
  },
  white: {
    image: 'katrain/W_stone.png',
    backgroundColor: '#f5f5f5',
    foregroundColor: '#111111',
    shadowColor: 'rgba(0,0,0,0.25)',
    shadowOffsetX: '0.06em',
    shadowOffsetY: '0.08em',
    shadowBlur: '0.12em',
  },
} satisfies { black: ThemeStoneConfig; white: ThemeStoneConfig };

const THEMES: Record<BoardThemeId, BoardThemeConfig> = {
  bamboo: {
    id: 'bamboo',
    name: 'Bamboo (Classic)',
    description: 'KaTrain-style bamboo texture with classic stones',
    board: {
      backgroundColor: '#DCB35C',
      borderColor: '#c9a85c',
      foregroundColor: '#000000',
      borderWidth: 0,
      texture: 'katrain/board.png',
    },
    stones: KATRAN_STONES,
    coordColor: '#404040',
  },
  flat: {
    id: 'flat',
    name: 'Flat Color',
    description: 'Flat board color for a minimalist look',
    board: {
      backgroundColor: '#eebb77',
      borderColor: '#c9a85c',
      foregroundColor: '#000000',
      borderWidth: 0,
    },
    stones: KATRAN_STONES,
    coordColor: '#404040',
  },
  dark: {
    id: 'dark',
    name: 'Dark Mode',
    description: 'High-contrast dark board with classic stones',
    board: {
      backgroundColor: '#333333',
      borderColor: '#2a2a2a',
      foregroundColor: '#888888',
      borderWidth: 0,
    },
    stones: KATRAN_STONES,
    coordColor: '#cccccc',
  },
  hikaru: {
    id: 'hikaru',
    name: 'Hikaru',
    description: 'Anime-inspired SVG stones with clean lines',
    board: {
      backgroundColor: '#dfc080',
      borderColor: '#c9a85c',
      foregroundColor: '#4a3520',
      borderWidth: 0,
      texture: 'board.svg',
    },
    stones: {
      black: {
        image: 'stone-black.svg',
        backgroundColor: '#1a1a1a',
        foregroundColor: '#ffffff',
        shadowColor: 'rgba(0, 0, 0, 0.5)',
        shadowOffsetX: '0.08em',
        shadowOffsetY: '0.08em',
        shadowBlur: '0.15em',
        size: '100%',
        imageOffsetX: '0.01em',
        imageOffsetY: '0.14em',
      },
      white: {
        image: 'stone-white.svg',
        backgroundColor: '#f5f5f5',
        foregroundColor: '#333333',
        shadowColor: 'rgba(0, 0, 0, 0.35)',
        shadowOffsetX: '0.08em',
        shadowOffsetY: '0.08em',
        shadowBlur: '0.15em',
        size: '100%',
        imageOffsetX: '0.01em',
        imageOffsetY: '0.14em',
      },
    },
    coordColor: 'rgba(74, 53, 32, 0.75)',
  },
  'shell-slate': {
    id: 'shell-slate',
    name: 'Shell & Slate',
    description: 'Traditional clamshell and slate stones',
    board: {
      backgroundColor: '#e8c873',
      borderColor: '#d4b45c',
      foregroundColor: '#222222',
      borderWidth: 0,
      texture: 'board.png',
    },
    stones: {
      black: {
        image: 'stone-black.png',
        backgroundColor: '#0e0e0e',
        foregroundColor: '#eeeeee',
        shadowColor: 'rgba(0, 0, 0, 0.17)',
        shadowOffsetX: '0.07em',
        shadowOffsetY: '0.07em',
        shadowBlur: '0.02em',
      },
      white: {
        image: 'stone-white.png',
        backgroundColor: '#ebebeb',
        foregroundColor: '#eeeeee',
        shadowColor: 'rgba(0, 0, 0, 0.17)',
        shadowOffsetX: '0.07em',
        shadowOffsetY: '0.07em',
        shadowBlur: '0.02em',
      },
    },
    coordColor: 'rgba(34, 34, 34, 0.7)',
  },
  yunzi: {
    id: 'yunzi',
    name: 'Yunzi',
    description: 'Chinese Yunzi stones on warm kaya wood',
    board: {
      backgroundColor: '#deb060',
      borderColor: '#c89848',
      foregroundColor: '#222222',
      borderWidth: 0,
      texture: 'board.png',
    },
    stones: {
      black: {
        image: 'stone-black.png',
        backgroundColor: '#0e0e0e',
        foregroundColor: '#eeeeee',
        shadowColor: 'rgba(0, 0, 0, 0.6)',
        shadowOffsetX: '0.106em',
        shadowOffsetY: '0.106em',
        shadowBlur: '0.06em',
      },
      white: {
        image: 'stone-white.png',
        backgroundColor: '#ebebeb',
        foregroundColor: '#eeeeee',
        shadowColor: 'rgba(0, 0, 0, 0.6)',
        shadowOffsetX: '0.106em',
        shadowOffsetY: '0.106em',
        shadowBlur: '0.06em',
      },
    },
    coordColor: 'rgba(34, 34, 34, 0.7)',
  },
  'happy-stones': {
    id: 'happy-stones',
    name: 'Happy Stones',
    description: 'Vibrant orange board with glass-like stones',
    board: {
      backgroundColor: '#d9a55b',
      borderColor: '#8b6914',
      foregroundColor: '#3c392f',
      borderWidth: 0,
      texture: 'board.png',
    },
    stones: {
      black: {
        image: 'stone-black.png',
        backgroundColor: '#1a1a1a',
        foregroundColor: '#d87700',
        shadowColor: 'rgba(80, 65, 0, 0.35)',
        shadowOffsetX: '0.08em',
        shadowOffsetY: '0.1em',
        shadowBlur: '0.12em',
        size: '108%',
      },
      white: {
        image: 'stone-white.png',
        backgroundColor: '#ffffff',
        foregroundColor: '#fb8a00',
        shadowColor: 'rgba(80, 65, 0, 0.35)',
        shadowOffsetX: '0.08em',
        shadowOffsetY: '0.1em',
        shadowBlur: '0.12em',
        size: '108%',
      },
    },
    coordColor: 'rgba(107, 66, 1, 0.59)',
  },
  kifu: {
    id: 'kifu',
    name: 'Kifu',
    description: 'Clean black-and-white print style',
    board: {
      backgroundColor: '#ffffff',
      borderColor: '#000000',
      foregroundColor: '#000000',
      borderWidth: 0,
    },
    stones: {
      black: {
        backgroundColor: '#000000',
        foregroundColor: '#ffffff',
        shadowColor: 'transparent',
        shadowOffsetX: '0',
        shadowOffsetY: '0',
        shadowBlur: '0',
        borderColor: '#000000',
        borderWidth: '0.04em',
      },
      white: {
        backgroundColor: '#ffffff',
        foregroundColor: '#000000',
        shadowColor: 'transparent',
        shadowOffsetX: '0',
        shadowOffsetY: '0',
        shadowBlur: '0',
        borderColor: '#000000',
        borderWidth: '0.04em',
      },
    },
    coordColor: '#000000',
  },
  baduktv: {
    id: 'baduktv',
    name: 'BadukTV',
    description: 'Broadcast-style board with glass stones',
    board: {
      backgroundColor: '#d4a55a',
      borderColor: '#8b6914',
      foregroundColor: '#3c392f',
      borderWidth: 0,
      texture: 'board.png',
    },
    stones: {
      black: {
        image: 'stone-black.png',
        imageVariations: ['stone-black-1.png', 'stone-black-2.png'],
        backgroundColor: '#1a1a1a',
        foregroundColor: 'rgba(255, 255, 255, 0.75)',
        shadowColor: 'rgba(80, 65, 0, 0.35)',
        shadowOffsetX: '0.08em',
        shadowOffsetY: '0.1em',
        shadowBlur: '0.12em',
        size: '108%',
      },
      white: {
        image: 'stone-white.png',
        imageVariations: ['stone-white-1.png', 'stone-white-2.png'],
        backgroundColor: '#ffffff',
        foregroundColor: 'rgba(0, 0, 0, 0.75)',
        shadowColor: 'rgba(80, 65, 0, 0.35)',
        shadowOffsetX: '0.08em',
        shadowOffsetY: '0.1em',
        shadowBlur: '0.12em',
        size: '108%',
      },
    },
    coordColor: 'rgba(107, 66, 1, 0.59)',
  },
};

const resolveThemeAsset = (themeId: BoardThemeId, assetPath: string | undefined): string | undefined => {
  if (!assetPath) return undefined;
  if (/^(data:|blob:|https?:)/i.test(assetPath)) return assetPath;
  if (assetPath.startsWith('/')) return publicUrl(assetPath.slice(1));
  if (assetPath.startsWith('katrain/')) return publicUrl(assetPath);
  if (assetPath.startsWith('themes/')) return publicUrl(assetPath);
  return publicUrl(`themes/${themeId}/${assetPath}`);
};

const resolveStoneConfig = (themeId: BoardThemeId, stone: ThemeStoneConfig): ThemeStoneConfig => ({
  ...stone,
  image: resolveThemeAsset(themeId, stone.image),
  imageVariations: stone.imageVariations?.map((v) => resolveThemeAsset(themeId, v)!).filter(Boolean),
});

const resolveTheme = (theme: BoardThemeConfig): BoardThemeConfig => ({
  ...theme,
  board: {
    ...theme.board,
    texture: resolveThemeAsset(theme.id, theme.board.texture),
  },
  stones: {
    black: resolveStoneConfig(theme.id, theme.stones.black),
    white: resolveStoneConfig(theme.id, theme.stones.white),
  },
});

const resolvedCache = new Map<BoardThemeId, BoardThemeConfig>();

export const getBoardTheme = (id: BoardThemeId): BoardThemeConfig => {
  const cached = resolvedCache.get(id);
  if (cached) return cached;
  const resolved = resolveTheme(THEMES[id]);
  resolvedCache.set(id, resolved);
  return resolved;
};

export const BOARD_THEME_OPTIONS = (Object.values(THEMES) as BoardThemeConfig[]).map((theme) => ({
  value: theme.id,
  label: theme.name,
}));

export const isBoardThemeId = (value: unknown): value is BoardThemeId => {
  if (typeof value !== 'string') return false;
  return value in THEMES;
};

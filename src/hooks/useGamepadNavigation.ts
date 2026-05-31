import { useEffect, useRef, useState } from 'react';
import { getConnectedGamepad } from '../utils/gamepadAccess';
import { getGamepadNavigationInput, type GamepadNavigationCommand } from '../utils/gamepadNavigation';

export type GamepadNavigationStatus = {
  connected: boolean;
  name: string | null;
};

export type GamepadNavigationHandlers = Record<GamepadNavigationCommand, () => void>;

interface UseGamepadNavigationOptions {
  enabled: boolean;
  handlers: GamepadNavigationHandlers;
  repeatMs?: number;
}

export function useGamepadNavigation({
  enabled,
  handlers,
  repeatMs = 180,
}: UseGamepadNavigationOptions): GamepadNavigationStatus {
  const handlersRef = useRef(handlers);
  const [status, setStatus] = useState<GamepadNavigationStatus>({ connected: false, name: null });

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || typeof navigator === 'undefined') {
      return;
    }

    let raf = 0;
    let lastKey: string | null = null;
    let lastAt = 0;
    let lastName: string | null = null;

    const updateStatus = (name: string | null) => {
      if (name === lastName) return;
      lastName = name;
      setStatus({ connected: !!name, name });
    };

    const tick = () => {
      const gamepad = getConnectedGamepad(navigator);
      updateStatus(gamepad?.id ?? null);

      if (gamepad) {
        const input = getGamepadNavigationInput(gamepad);
        const now = performance.now();
        if (!input) {
          lastKey = null;
        } else if (input.key !== lastKey || now - lastAt >= repeatMs) {
          handlersRef.current[input.command]();
          lastKey = input.key;
          lastAt = now;
        }
      }

      raf = window.requestAnimationFrame(tick);
    };

    const handleConnectChange = () => {
      const gamepad = getConnectedGamepad(navigator);
      updateStatus(gamepad?.id ?? null);
    };

    window.addEventListener('gamepadconnected', handleConnectChange);
    window.addEventListener('gamepaddisconnected', handleConnectChange);
    tick();

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('gamepadconnected', handleConnectChange);
      window.removeEventListener('gamepaddisconnected', handleConnectChange);
    };
  }, [enabled, repeatMs]);

  return enabled ? status : { connected: false, name: null };
}

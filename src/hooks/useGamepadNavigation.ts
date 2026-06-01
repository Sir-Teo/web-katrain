import { useEffect, useRef, useState } from 'react';
import { cancelAnimationFrameSafe, getAnimationNow, requestAnimationFrameSafe, type AnimationFrameHandle } from '../utils/animationFrame';
import { getGamepadConnectionSnapshot } from '../utils/gamepadAccess';
import { getGamepadNavigationInput, type GamepadNavigationCommand } from '../utils/gamepadNavigation';

export type GamepadNavigationStatus = {
  connected: boolean;
  name: string | null;
  count: number;
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
  const [status, setStatus] = useState<GamepadNavigationStatus>({ connected: false, name: null, count: 0 });

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || typeof navigator === 'undefined') {
      return;
    }

    let frame: AnimationFrameHandle | null = null;
    let lastKey: string | null = null;
    let lastAt = 0;
    let lastName: string | null = null;
    let lastCount = 0;

    const updateStatus = (name: string | null, count: number) => {
      if (name === lastName && count === lastCount) return;
      lastName = name;
      lastCount = count;
      setStatus({ connected: !!name, name, count });
    };

    const tick = () => {
      const { active: gamepad, count } = getGamepadConnectionSnapshot(navigator);
      updateStatus(gamepad?.id ?? null, count);

      if (gamepad) {
        const input = getGamepadNavigationInput(gamepad);
        const now = getAnimationNow();
        if (!input) {
          lastKey = null;
        } else if (input.key !== lastKey || now - lastAt >= repeatMs) {
          handlersRef.current[input.command]();
          lastKey = input.key;
          lastAt = now;
        }
      }

      frame = requestAnimationFrameSafe(tick);
    };

    const handleConnectChange = () => {
      const { active: gamepad, count } = getGamepadConnectionSnapshot(navigator);
      updateStatus(gamepad?.id ?? null, count);
    };

    window.addEventListener('gamepadconnected', handleConnectChange);
    window.addEventListener('gamepaddisconnected', handleConnectChange);
    tick();

    return () => {
      cancelAnimationFrameSafe(frame);
      window.removeEventListener('gamepadconnected', handleConnectChange);
      window.removeEventListener('gamepaddisconnected', handleConnectChange);
    };
  }, [enabled, repeatMs]);

  return enabled ? status : { connected: false, name: null, count: 0 };
}

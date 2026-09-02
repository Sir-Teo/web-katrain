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
    let stopped = false;

    const updateStatus = (name: string | null, count: number) => {
      if (name === lastName && count === lastCount) return;
      lastName = name;
      lastCount = count;
      setStatus({ connected: !!name, name, count });
    };

    const tick = () => {
      frame = null;
      const { active: gamepad, count } = getGamepadConnectionSnapshot(navigator);
      updateStatus(gamepad?.id ?? null, count);

      // Browsers emit gamepadconnected when a controller becomes available.
      // Stop polling completely while none is present instead of waking the
      // main thread at display refresh rate for the entire app session.
      if (!gamepad || stopped) {
        lastKey = null;
        return;
      }

      const input = getGamepadNavigationInput(gamepad);
      const now = getAnimationNow();
      if (!input) {
        lastKey = null;
      } else if (input.key !== lastKey || now - lastAt >= repeatMs) {
        handlersRef.current[input.command]();
        lastKey = input.key;
        lastAt = now;
      }

      frame = requestAnimationFrameSafe(tick);
    };

    const handleConnectChange = () => {
      const { active: gamepad, count } = getGamepadConnectionSnapshot(navigator);
      updateStatus(gamepad?.id ?? null, count);
      if (!gamepad) {
        lastKey = null;
        cancelAnimationFrameSafe(frame);
        frame = null;
        return;
      }
      if (frame === null) frame = requestAnimationFrameSafe(tick);
    };

    window.addEventListener('gamepadconnected', handleConnectChange);
    window.addEventListener('gamepaddisconnected', handleConnectChange);
    handleConnectChange();

    return () => {
      stopped = true;
      cancelAnimationFrameSafe(frame);
      window.removeEventListener('gamepadconnected', handleConnectChange);
      window.removeEventListener('gamepaddisconnected', handleConnectChange);
    };
  }, [enabled, repeatMs]);

  return enabled ? status : { connected: false, name: null, count: 0 };
}

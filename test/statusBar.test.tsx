import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StatusBar } from '../src/components/layout/StatusBar';
import { getMoveInsight } from '../src/utils/moveInsight';
import type { Move } from '../src/types';

const blackMove = (x: number, y: number): Move => ({ x, y, player: 'black' });

const baseProps = {
  moveName: 'Move 1: B D4',
  blackName: 'Black',
  whiteName: 'White',
  komi: 6.5,
  boardSize: 19,
  handicap: 0,
  moveCount: 1,
  capturedBlack: 0,
  capturedWhite: 0,
  endResult: null,
};

describe('StatusBar', () => {
  it('renders Shape Coach insight as an accessible details trigger', () => {
    const moveInsight = getMoveInsight(blackMove(3, 15), 19);

    const html = renderToStaticMarkup(
      <StatusBar
        {...baseProps}
        moveInsight={moveInsight}
        shapeCoachEnabled={true}
        onToggleShapeCoach={() => undefined}
      />,
    );

    expect(html).toContain('data-status-move-insight="corner"');
    expect(html).toContain('data-status-move-insight-toggle="true"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('Open Shape Coach details for 4-4 star point');
    expect(html).toContain('Click for beginner and pro study cues');
  });

  it('hides Shape Coach insight when the coach is disabled', () => {
    const moveInsight = getMoveInsight(blackMove(3, 15), 19);

    const html = renderToStaticMarkup(
      <StatusBar
        {...baseProps}
        moveInsight={moveInsight}
        shapeCoachEnabled={false}
        onToggleShapeCoach={() => undefined}
      />,
    );

    expect(html).not.toContain('data-status-move-insight-toggle="true"');
    expect(html).not.toContain('Open Shape Coach details');
  });

  it('renders connected gamepads as compact controls before desktop widths', () => {
    const html = renderToStaticMarkup(
      <StatusBar
        {...baseProps}
        gamepadName="Xbox Wireless Controller"
        gamepadCount={2}
        onGamepadNavigationDisable={() => undefined}
      />,
    );

    expect(html).toContain('data-gamepad-status="connected"');
    expect(html).toContain('data-gamepad-count="2"');
    expect(html).toContain('2 controllers connected; using the most recently active');
    expect(html).toContain('x2');
    expect(html).toContain('max-w-[2.25rem] sm:max-w-[10rem] lg:max-w-[280px]');
    expect(html).toContain('hidden sm:inline font-semibold');
    expect(html).toContain('hidden md:inline min-w-0 truncate');
    expect(html).not.toContain('hidden lg:flex max-w-[280px]');
  });
});

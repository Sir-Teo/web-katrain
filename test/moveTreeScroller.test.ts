import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * The move tree's scroller is a different element before and after the
 * layout worker replies: the placeholder's shell, then a child of the real
 * shell. A mount-only effect bound its scroll listener to the placeholder and
 * never saw a scroll, so trees past the worker threshold (240 nodes) rendered
 * the first columns only, wherever the user scrolled.
 */
describe('MoveTree scroller', () => {
  const source = readFileSync('src/components/MoveTree.tsx', 'utf8');

  it('attaches the scroller through a callback ref so listeners follow the element', () => {
    expect(source).not.toContain('ref={containerRef}');
    expect(source.match(/ref=\{setContainerRef\}/g)?.length).toBe(2);
    expect(source).toContain("resizeObserver?.disconnect();\n    };\n  }, [containerElement]);");
  });

  it('keeps the previous worker layout while a new one is computed', () => {
    expect(source).toContain('const workerLayout = shouldUseWorker ? reusableWorkerLayout : null;');
  });

  it('centres on the current move, not on every layout recompute', () => {
    expect(source).toContain('}, [centerCurrentNode, containerElement, currentNode.id, hasLayout]);');
    expect(source).not.toContain('useEffect(() => {\n    centerCurrentNode();\n  }, [centerCurrentNode]);');
  });
});

describe('centring while scrubbing', () => {
  const source = readFileSync('src/components/MoveTree.tsx', 'utf8');

  it('jumps instead of gliding when moves arrive faster than the animation', () => {
    /**
     * A smooth scroll is worth it for a deliberate step. Held down, each step
     * starts an animation the next interrupts, and every frame of every one of
     * them fires a scroll event that schedules a viewport update and re-renders
     * the tree. Profiled over 60 steps, that update was 3.8% of samples; with
     * this it is 2.5%.
     */
    expect(source).toContain('const RAPID_NAVIGATION_MS = 250;');
    expect(source).toContain('const rapid = now - centeredAtRef.current < RAPID_NAVIGATION_MS;');
    expect(source).toContain("centerCurrentNode(last && !rapid ? preferredScrollBehavior() : 'auto');");
  });

  it('still asks for the reader\u2019s preference when the step is deliberate', () => {
    // prefers-reduced-motion already returns 'auto' from here, so the rapid
    // case must not be the only thing that can make the scroll instant.
    expect(source).toContain('preferredScrollBehavior()');
  });
});

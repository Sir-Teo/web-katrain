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

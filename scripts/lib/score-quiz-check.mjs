import { evaluate, setViewport } from './browser.mjs';

// Mount the real dialog and defer engine responses to exercise ordering without
// depending on model speed. These checks run as part of test:viewport.
export async function assertScoreQuizRequests(cdp) {
  for (const viewport of [
    { width: 1280, height: 800, mobile: false },
    { width: 320, height: 568, mobile: true },
  ]) {
    await setViewport(cdp, viewport);
    const failures = await evaluate(cdp, `(${checkScoreQuiz.toString()})()`);
    if (failures.length) throw new Error(`Score quiz ${viewport.width}x${viewport.height}: ${failures.join('; ')}`);
  }
}

async function checkScoreQuiz() {
  const { default: React } = await import('/node_modules/.vite/deps/react.js');
  const { default: ReactDOM } = await import('/node_modules/.vite/deps/react-dom_client.js');
  const { ScoreQuizModal } = await import('/src/components/ScoreQuizModal.tsx');
  const { useGameStore } = await import('/src/store/gameStore.ts');
  const { getKataGoEngineClient } = await import('/src/engine/katago/client.ts');
  const { parseSgf } = await import('/src/utils/sgf.ts');
  const host = document.createElement('div');
  document.body.append(host);
  const root = ReactDOM.createRoot(host);
  const client = getKataGoEngineClient();
  const originalEvaluate = client.evaluate;
  const originalState = useGameStore.getState();
  const requests = [];
  const failures = [];
  const check = (condition, message) => { if (!condition) failures.push(message); };
  const settle = () => new Promise(resolve => setTimeout(resolve, 50));
  const dialog = () => host.querySelector('[role="dialog"]');
  const button = name => host.querySelector(`[aria-label="${name}"]`);
  const open = async () => {
    root.render(React.createElement(ScoreQuizModal, { onClose: () => root.render(null) }));
    for (let i = 0; i < 100 && !dialog(); i++) await settle();
    if (!dialog()) throw new Error('Score quiz did not mount');
    await settle();
  };
  client.evaluate = () => new Promise((resolve, reject) => requests.push({ resolve, reject }));
  try {
    originalState.loadGame(parseSgf('(;GM[1]FF[4]SZ[19];B[dd];W[pp])'));
    const game = useGameStore.getState().rootNode;
    useGameStore.setState({ currentNode: game.children[0].children[0] });
    await open();
    button('Reveal score').click();
    await settle();
    const input = host.querySelector('input');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();
    check(requests.length === 1, 'Enter submitted a duplicate evaluation');
    check(input.disabled, 'The submitted margin remains editable');
    check([...host.querySelectorAll('[aria-label="Predicted leader"] button')].every(b => b.disabled),
      'The submitted leader remains editable');

    button('Random position').click();
    await settle();
    requests[0].resolve({ rootScoreLead: 12, rootWinRate: 0.7 });
    await settle();
    check(!!button('Reveal score') && !dialog().textContent.includes('Rounds:'),
      'A score from the previous position was counted');

    button('Reveal score').click();
    await settle();
    const rejected = requests.at(-1);
    button('Random position').click();
    await settle();
    rejected.reject(new Error('obsolete evaluation error'));
    await settle();
    check(!dialog().textContent.includes('obsolete evaluation error'), 'An obsolete error reached the new round');

    button('Reveal score').click();
    await settle();
    requests.at(-1).resolve({ rootScoreLead: 5, rootWinRate: 0.6 });
    await settle();
    check(dialog().textContent.includes('Rounds: 1'), 'A completed round was not counted exactly once');
    check(dialog().textContent.includes('Perfect read'), 'The completed round was graded incorrectly');

    [...host.querySelectorAll('button')].find(b => b.textContent === 'Guess again').click();
    await settle();
    button('Reveal score').click();
    await settle();
    const abandoned = requests.at(-1);
    button('Close quiz').click();
    await settle();
    await open();
    abandoned.resolve({ rootScoreLead: -20, rootWinRate: 0.1 });
    await settle();
    check(!dialog().textContent.includes('Rounds:'), 'Closing the dialog did not discard its pending round');
  } catch (error) {
    throw new Error(`${error.message}; requests=${requests.length}; dialog=${dialog()?.textContent}; stack=${error.stack}`);
  } finally {
    root.unmount();
    host.remove();
    client.evaluate = originalEvaluate;
    useGameStore.setState(originalState);
  }
  return failures;
}

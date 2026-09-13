/** Run asynchronous tasks in request order; a rejection does not strand later tasks. */
export const createSerialTaskQueue = () => {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => T | Promise<T>): Promise<T> => {
    const result = tail.then(task);
    tail = result.catch(() => undefined);
    return result;
  };
};

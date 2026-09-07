type PendingSnapshot<T> = {
  key: string;
  value: T;
};

export type LatestDraftSaveQueue<T> = {
  enqueue: (snapshot: T) => Promise<void>;
  flush: (snapshot?: T) => Promise<void>;
  hasWork: () => boolean;
};

export function createLatestDraftSaveQueue<T>(
  save: (snapshot: T) => Promise<boolean>,
  keyFor: (snapshot: T) => string = JSON.stringify,
): LatestDraftSaveQueue<T> {
  let inFlight: PendingSnapshot<T> | null = null;
  let pending: PendingSnapshot<T> | null = null;
  let lastSuccessfulKey: string | null = null;
  let idlePromise = Promise.resolve();
  let resolveIdle: (() => void) | null = null;

  function beginDrain() {
    idlePromise = new Promise<void>((resolve) => {
      resolveIdle = resolve;
    });
  }

  function finishDrain() {
    const resolve = resolveIdle;
    resolveIdle = null;
    resolve?.();
  }

  function start(item: PendingSnapshot<T>) {
    inFlight = item;
    void save(item.value)
      .then((saved) => {
        if (saved) lastSuccessfulKey = item.key;
      })
      .catch(() => undefined)
      .finally(() => {
        inFlight = null;
        const next = pending;
        pending = null;
        if (next) {
          start(next);
        } else {
          finishDrain();
        }
      });
  }

  function enqueue(snapshot: T) {
    const item = { key: keyFor(snapshot), value: snapshot };

    if (inFlight) {
      pending = item.key === inFlight.key ? null : item;
      return idlePromise;
    }

    if (item.key === lastSuccessfulKey) {
      return Promise.resolve();
    }

    beginDrain();
    start(item);
    return idlePromise;
  }

  return {
    enqueue,
    flush(snapshot) {
      return snapshot === undefined ? idlePromise : enqueue(snapshot);
    },
    hasWork() {
      return inFlight !== null || pending !== null;
    },
  };
}

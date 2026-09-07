import { describe, expect, test, vi } from "vitest";
import { createLatestDraftSaveQueue } from "./draft-save-queue";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("latest draft save queue", () => {
  test("runs one save at a time and replaces an intermediate pending snapshot", async () => {
    const first = deferred<boolean>();
    const saved: number[] = [];
    const save = vi.fn(async (snapshot: number) => {
      saved.push(snapshot);
      return snapshot === 1 ? first.promise : true;
    });
    const queue = createLatestDraftSaveQueue(save);

    const idle = queue.enqueue(1);
    queue.enqueue(2);
    queue.enqueue(3);

    expect(save).toHaveBeenCalledTimes(1);
    first.resolve(true);
    await idle;

    expect(saved).toEqual([1, 3]);
  });

  test("drops pending work when the newest snapshot matches the in-flight save", async () => {
    const first = deferred<boolean>();
    const saved: string[] = [];
    const queue = createLatestDraftSaveQueue(async (snapshot: string) => {
      saved.push(snapshot);
      return snapshot === "original" ? first.promise : true;
    });

    const idle = queue.enqueue("original");
    queue.enqueue("intermediate");
    queue.enqueue("original");
    first.resolve(true);
    await idle;

    expect(saved).toEqual(["original"]);
  });

  test("allows the same newest snapshot to be retried after a failed save", async () => {
    const save = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const queue = createLatestDraftSaveQueue(save);

    await queue.enqueue("latest");
    await queue.enqueue("latest");

    expect(save).toHaveBeenCalledTimes(2);
  });
});

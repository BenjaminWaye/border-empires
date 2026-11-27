// Runs tasks one at a time per key, in arrival order; different keys run in
// parallel. The AI responder answers a requester's alliance offers through it:
// each answer reads the requester's allies and then awaits snapshots and the
// acceptance, so two offers sent in the same second (to both sides of a war)
// would otherwise both be judged before either alliance existed.
// Bounded: a key's entry is dropped as soon as its last queued task settles.
export type KeyedSerialQueue = (key: string, task: () => Promise<void>) => Promise<void>;

export const createKeyedSerialQueue = (): KeyedSerialQueue => {
  const tails = new Map<string, Promise<void>>();
  return (key, task) => {
    const run = (tails.get(key) ?? Promise.resolve()).then(task);
    // A failed task must not wedge the ones behind it.
    const tail = run.catch(() => undefined);
    tails.set(key, tail);
    void tail.then(() => {
      if (tails.get(key) === tail) tails.delete(key);
    });
    return run;
  };
};

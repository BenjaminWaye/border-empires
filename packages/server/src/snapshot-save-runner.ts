export type SnapshotSaveRunner = {
  request: () => void;
};

export const createSnapshotSaveRunner = (options: {
  save: () => Promise<void>;
  onError: (err: unknown) => void;
}): SnapshotSaveRunner => {
  let running = false;
  let pending = false;

  const run = (): void => {
    if (running) {
      pending = true;
      return;
    }
    running = true;
    void options
      .save()
      .catch((err) => {
        options.onError(err);
      })
      .finally(() => {
        running = false;
        if (!pending) return;
        pending = false;
        run();
      });
  };

  return {
    request: (): void => {
      run();
    }
  };
};

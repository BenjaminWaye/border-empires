export type SnapshotStringifier = (payload: unknown) => Promise<string>;

const inlineStringifier: SnapshotStringifier = async (payload) => JSON.stringify(payload);

export const createInlineSnapshotStringifier = (): SnapshotStringifier => inlineStringifier;

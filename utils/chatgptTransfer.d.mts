declare const worker: {
  fetch(
    request: Request,
    env: {
      LEDGER_ORIGIN: string;
      LEDGER_ANON_KEY: string;
      LEDGER_WORKER_KEY: string;
      HANDOFF_KEY: string;
      PHOTO_FETCH?: (
        url: string,
        options: { signal: AbortSignal },
      ) => Promise<Response>;
    },
  ): Promise<Response>;
};
export default worker;

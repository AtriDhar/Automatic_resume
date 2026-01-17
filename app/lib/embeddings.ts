export type EmbeddingVector = Float32Array;

export type EmbeddingsClient = {
  embed(text: string): Promise<EmbeddingVector>;
  dispose(): void;
};

type WorkerRequest =
  | { type: "init"; model?: string }
  | { type: "embed"; text: string };

type WorkerResponse =
  | { type: "ready" }
  | { type: "embedding"; vector: number[] }
  | { type: "error"; message: string };

export function createEmbeddingsWorkerClient(workerUrl: URL, model?: string): EmbeddingsClient {
  const worker = new Worker(workerUrl, { type: "module" });
  let readyResolve: (() => void) | null = null;
  let readyReject: ((e: unknown) => void) | null = null;

  const readyPromise = new Promise<void>((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });

  const pending = new Map<number, { resolve: (v: EmbeddingVector) => void; reject: (e: unknown) => void }>();
  let nextId = 1;

  worker.onmessage = (ev: MessageEvent<any>) => {
    const data = ev.data as ({ id?: number } & WorkerResponse);
    if (data.type === "ready") {
      readyResolve?.();
      readyResolve = null;
      readyReject = null;
      return;
    }

    if (data.type === "error") {
      const err = new Error(data.message);
      if (readyReject) {
        readyReject(err);
        readyResolve = null;
        readyReject = null;
      }
      if (typeof data.id === "number" && pending.has(data.id)) {
        pending.get(data.id)!.reject(err);
        pending.delete(data.id);
      }
      return;
    }

    if (data.type === "embedding" && typeof data.id === "number") {
      const entry = pending.get(data.id);
      if (!entry) return;
      pending.delete(data.id);
      entry.resolve(new Float32Array(data.vector));
    }
  };

  const post = (msg: any) => worker.postMessage(msg);

  post({ id: 0, type: "init", model } satisfies { id: number } & WorkerRequest);

  return {
    async embed(text: string) {
      await readyPromise;
      const id = nextId++;
      const p = new Promise<EmbeddingVector>((resolve, reject) => pending.set(id, { resolve, reject }));
      post({ id, type: "embed", text } satisfies { id: number } & WorkerRequest);
      return p;
    },
    dispose() {
      pending.clear();
      worker.terminate();
    },
  };
}

export function cosineSim(a: EmbeddingVector, b: EmbeddingVector): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let an = 0;
  let bn = 0;
  for (let i = 0; i < len; i++) {
    const av = a[i];
    const bv = b[i];
    dot += av * bv;
    an += av * av;
    bn += bv * bv;
  }
  const denom = Math.sqrt(an) * Math.sqrt(bn);
  return denom ? dot / denom : 0;
}

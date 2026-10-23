import type { WorldGenRequest, WorldGenResult } from "@iwakura/contracts";

interface Pending {
  resolve: (result: WorldGenResult) => void;
  reject: (error: Error) => void;
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./worldgen.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event: MessageEvent<{ id: number; result?: WorldGenResult; error?: string }>) => {
    const entry = pending.get(event.data.id);
    if (!entry) return;
    pending.delete(event.data.id);
    if (event.data.error) entry.reject(new Error(event.data.error));
    else if (event.data.result) entry.resolve(event.data.result);
    else entry.reject(new Error("World generator returned no result"));
  };
  worker.onerror = (event) => {
    const error = new Error(event.message || "World generator crashed");
    for (const entry of pending.values()) entry.reject(error);
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

export function generateWorldAsync(request: WorldGenRequest): Promise<WorldGenResult> {
  const active = ensureWorker();
  const id = nextId++;
  return new Promise<WorldGenResult>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    active.postMessage({ id, request });
  });
}

import type { WorldGenRequest, WorldGenResult } from "@iwakura/contracts";
import { generateWorld } from "@iwakura/engine";

interface WorkerRequest {
  id: number;
  request: WorldGenRequest;
}

interface WorkerResponse {
  id: number;
  result?: WorldGenResult;
  error?: string;
}

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: WorkerResponse) => void;
};

scope.onmessage = (event) => {
  const { id, request } = event.data;
  try {
    scope.postMessage({ id, result: generateWorld(request) });
  } catch (error) {
    scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};

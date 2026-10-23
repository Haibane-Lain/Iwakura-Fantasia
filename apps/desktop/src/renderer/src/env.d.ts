/// <reference types="vite/client" />

import type { Bootstrap } from "@iwakura/contracts";

declare global {
  interface Window {
    iwakura?: {
      getBootstrap(): Promise<Bootstrap>;
      openExternal(url: string): Promise<void>;
      quit(): Promise<void>;
    };
  }
}

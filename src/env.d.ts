/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPENTOPOGRAPHY_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

import type { TrailPrintApi } from '../electron/preload/index'

declare global {
  interface Window {
    trailPrint: TrailPrintApi
  }
}

export {}

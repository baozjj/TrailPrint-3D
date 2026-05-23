import type { TrailPrintApi } from '../electron/preload/index'

declare global {
  interface Window {
    trailPrint: TrailPrintApi
  }
}

export {}

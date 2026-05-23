import 'leaflet'

declare module 'leaflet' {
  interface MapOptions {
    rotate?: boolean
    bearing?: number
    touchRotate?: boolean
    shiftKeyRotate?: boolean
    rotateControl?: boolean | ControlOptions
  }

  interface Map {
    setBearing(bearing: number): this
    getBearing(): number
  }
}

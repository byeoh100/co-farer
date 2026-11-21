/**
 * Math for the profile-picture cropper: a square viewport of side `view`
 * over an image scaled to cover it, then zoomed. Pure, so it's unit-tested.
 */

export interface CropState {
  /** Image top-left relative to the viewport, in screen px (always ≤ 0). */
  x: number
  y: number
  /** 1 = the image just covers the viewport. */
  zoom: number
}

export const MIN_ZOOM = 1
export const MAX_ZOOM = 3

/** Screen px per image px at this zoom (image covers the viewport at zoom 1). */
export function scaleFor(imgW: number, imgH: number, view: number, zoom: number): number {
  return (view / Math.min(imgW, imgH)) * zoom
}

/** Keeps the image covering the whole viewport (no empty edges). */
export function clampCrop(s: CropState, imgW: number, imgH: number, view: number): CropState {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, s.zoom))
  const k = scaleFor(imgW, imgH, view, zoom)
  const clamp = (v: number, size: number) => Math.min(0, Math.max(view - size, v))
  return { zoom, x: clamp(s.x, imgW * k), y: clamp(s.y, imgH * k) }
}

/** Centered, just covering the viewport. */
export function initialCrop(imgW: number, imgH: number, view: number): CropState {
  const k = scaleFor(imgW, imgH, view, 1)
  return { zoom: 1, x: (view - imgW * k) / 2, y: (view - imgH * k) / 2 }
}

/** Changes zoom while keeping the viewport's center on the same image point. */
export function zoomTo(s: CropState, zoom: number, imgW: number, imgH: number, view: number): CropState {
  const k0 = scaleFor(imgW, imgH, view, s.zoom)
  const cx = (view / 2 - s.x) / k0
  const cy = (view / 2 - s.y) / k0
  const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
  const k1 = scaleFor(imgW, imgH, view, z)
  return clampCrop({ zoom: z, x: view / 2 - cx * k1, y: view / 2 - cy * k1 }, imgW, imgH, view)
}

/** The square of the source image (in image px) that the viewport shows. */
export function sourceRect(s: CropState, imgW: number, imgH: number, view: number) {
  const k = scaleFor(imgW, imgH, view, s.zoom)
  // `+ 0` turns -0 into 0 (x/y are ≤ 0, so -x can be -0).
  return { sx: -s.x / k + 0, sy: -s.y / k + 0, size: view / k }
}

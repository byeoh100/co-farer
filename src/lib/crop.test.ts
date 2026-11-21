import { describe, expect, it } from 'vitest'
import { clampCrop, initialCrop, sourceRect, zoomTo } from './crop'

const V = 240

describe('profile picture crop', () => {
  it('starts centered and covering, on the short side', () => {
    const s = initialCrop(800, 400, V) // landscape: height fits, width overflows
    expect(s).toEqual({ zoom: 1, x: -120, y: 0 })
    expect(sourceRect(s, 800, 400, V)).toEqual({ sx: 200, sy: 0, size: 400 })
  })
  it('never leaves empty edges when dragged too far', () => {
    expect(clampCrop({ x: 50, y: 50, zoom: 1 }, 800, 400, V)).toEqual({ zoom: 1, x: 0, y: 0 })
    expect(clampCrop({ x: -9999, y: -9999, zoom: 1 }, 800, 400, V)).toEqual({ zoom: 1, x: -240, y: 0 })
  })
  it('limits zoom to 1×–3×', () => {
    expect(clampCrop({ x: 0, y: 0, zoom: 10 }, 400, 400, V).zoom).toBe(3)
    expect(clampCrop({ x: 0, y: 0, zoom: 0.2 }, 400, 400, V).zoom).toBe(1)
  })
  it('zooms around the viewport center', () => {
    const s = zoomTo(initialCrop(400, 400, V), 2, 400, 400, V)
    expect(sourceRect(s, 400, 400, V)).toEqual({ sx: 100, sy: 100, size: 200 })
  })
})

/**
 * Basic "center your picture" pop-up: drag to move, slider (or arrow keys
 * and +/-) to zoom, preview in the same circle the app shows. Crops in the
 * browser to a 256 × 256 JPEG, so uploads are small and already centered.
 */

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { Button, Modal } from '@/components/ui'
import { MAX_ZOOM, MIN_ZOOM, clampCrop, initialCrop, scaleFor, sourceRect, zoomTo, type CropState } from '../lib/crop'

const VIEW = 240
const OUTPUT = 256

export function PictureCropper({
  file,
  onCancel,
  onDone,
}: {
  file: File | null
  onCancel: () => void
  onDone: (cropped: Blob) => void
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [crop, setCrop] = useState<CropState | null>(null)
  const [failed, setFailed] = useState(false)
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null)

  useEffect(() => {
    setImg(null)
    setCrop(null)
    setFailed(false)
    if (!file) return
    const url = URL.createObjectURL(file)
    const el = new Image()
    el.onload = () => {
      setImg(el)
      setCrop(initialCrop(el.naturalWidth, el.naturalHeight, VIEW))
    }
    el.onerror = () => setFailed(true)
    el.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  const w = img?.naturalWidth ?? 1
  const h = img?.naturalHeight ?? 1
  const move = (dx: number, dy: number) => crop && setCrop(clampCrop({ ...crop, x: crop.x + dx, y: crop.y + dy }, w, h, VIEW))
  const zoom = (z: number) => crop && setCrop(zoomTo(crop, z, w, h, VIEW))

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!crop) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { px: e.clientX, py: e.clientY, x: crop.x, y: crop.y }
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || !crop) return
    setCrop(clampCrop({ ...crop, x: d.x + e.clientX - d.px, y: d.y + e.clientY - d.py }, w, h, VIEW))
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 30 : 10
    const keys: Record<string, () => void> = {
      ArrowLeft: () => move(step, 0),
      ArrowRight: () => move(-step, 0),
      ArrowUp: () => move(0, step),
      ArrowDown: () => move(0, -step),
      '+': () => zoom((crop?.zoom ?? 1) + 0.1),
      '=': () => zoom((crop?.zoom ?? 1) + 0.1),
      '-': () => zoom((crop?.zoom ?? 1) - 0.1),
    }
    const fn = keys[e.key]
    if (fn) {
      e.preventDefault()
      fn()
    }
  }

  const done = () => {
    if (!img || !crop) return
    const { sx, sy, size } = sourceRect(crop, w, h, VIEW)
    const canvas = document.createElement('canvas')
    canvas.width = OUTPUT
    canvas.height = OUTPUT
    const ctx = canvas.getContext('2d')
    if (!ctx) return setFailed(true)
    ctx.fillStyle = '#ffffff' // transparent PNGs get a white background in JPEG
    ctx.fillRect(0, 0, OUTPUT, OUTPUT)
    ctx.drawImage(img, sx, sy, size, size, 0, 0, OUTPUT, OUTPUT)
    canvas.toBlob((blob) => (blob ? onDone(blob) : setFailed(true)), 'image/jpeg', 0.9)
  }

  const k = crop ? scaleFor(w, h, VIEW, crop.zoom) : 1

  return (
    <Modal open={!!file} onClose={onCancel} size="sm">
      <Modal.Header>
        <Modal.Title>Center your picture</Modal.Title>
      </Modal.Header>
      <Modal.Body className="flex flex-col items-center gap-4">
        {failed ? (
          <p className="text-sm text-destructive">That picture couldn’t be opened. Try a JPG or PNG.</p>
        ) : (
          <>
            <div
              role="application"
              aria-label="Picture position. Drag, or use arrow keys to move and plus or minus to zoom."
              tabIndex={0}
              data-testid="cropper"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={() => (drag.current = null)}
              onPointerCancel={() => (drag.current = null)}
              onKeyDown={onKeyDown}
              className="relative cursor-grab touch-none overflow-hidden rounded-full bg-muted outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
              style={{ width: VIEW, height: VIEW }}
            >
              {img && crop && (
                <img
                  src={img.src}
                  alt=""
                  draggable={false}
                  className="pointer-events-none absolute left-0 top-0 max-w-none select-none"
                  style={{ width: w * k, height: h * k, transform: `translate(${crop.x}px, ${crop.y}px)` }}
                />
              )}
            </div>
            <label className="flex w-full items-center gap-3 text-xs text-muted-foreground">
              Zoom
              <input
                type="range"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step={0.01}
                value={crop?.zoom ?? 1}
                onChange={(e) => zoom(Number(e.target.value))}
                className="flex-1 accent-[var(--color-primary)]"
                data-testid="cropper-zoom"
              />
            </label>
            <p className="text-xs text-muted-foreground">Drag the picture to move it.</p>
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={done} disabled={!crop || failed} data-testid="cropper-done">
          Use picture
        </Button>
      </Modal.Footer>
    </Modal>
  )
}

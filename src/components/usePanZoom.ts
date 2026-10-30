// 2D 地图的拖动、滚轮 / 双指缩放、点按。大地图和地铁线路图共用
export interface PanZoomView {
  x: number
  z: number
  /** CSS 像素 / 格 */
  scale: number
}

export function usePanZoom(view: PanZoomView, opts: { min: number; max: number; onChange: () => void; onTap?: (px: number, py: number) => void }) {
  const pointers = new Map<number, { x: number; y: number }>()
  let down: { x: number; y: number; moved: boolean } | null = null
  let rect = { left: 0, top: 0, width: innerWidth, height: innerHeight }

  /** 以画布上 (cx, cy) 为中心缩放 */
  function zoom(k: number, cx = rect.width / 2, cy = rect.height / 2) {
    const wx = view.x + (cx - rect.width / 2) / view.scale
    const wz = view.z + (cy - rect.height / 2) / view.scale
    view.scale = Math.min(opts.max, Math.max(opts.min, view.scale * k))
    view.x = wx - (cx - rect.width / 2) / view.scale
    view.z = wz - (cy - rect.height / 2) / view.scale
    opts.onChange()
  }

  const local = (e: { clientX: number; clientY: number }) => ({ x: e.clientX - rect.left, y: e.clientY - rect.top })

  function onWheel(e: WheelEvent) {
    e.preventDefault()
    rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const p = local(e)
    zoom(Math.exp(-e.deltaY * 0.002), p.x, p.y)
  }

  function onDown(e: PointerEvent) {
    const el = e.currentTarget as HTMLElement
    rect = el.getBoundingClientRect()
    el.setPointerCapture(e.pointerId)
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    down = pointers.size === 1 ? { x: e.clientX, y: e.clientY, moved: false } : null
  }

  function onMove(e: PointerEvent) {
    const prev = pointers.get(e.pointerId)
    if (!prev) return
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) down.moved = true
    if (pointers.size === 2) {
      // 双指缩放
      const [a, b] = [...pointers.values()]
      const before = Math.hypot(a!.x - b!.x, a!.y - b!.y)
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      const [c, d] = [...pointers.values()]
      const mid = local({ clientX: (c!.x + d!.x) / 2, clientY: (c!.y + d!.y) / 2 })
      zoom(Math.hypot(c!.x - d!.x, c!.y - d!.y) / before, mid.x, mid.y)
      return
    }
    view.x -= (e.clientX - prev.x) / view.scale
    view.z -= (e.clientY - prev.y) / view.scale
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    opts.onChange()
  }

  function onUp(e: PointerEvent) {
    pointers.delete(e.pointerId)
    if (down && !down.moved && pointers.size === 0 && opts.onTap) {
      const p = local(e)
      opts.onTap(p.x, p.y)
    }
    if (!pointers.size) down = null
  }

  return { zoom, onWheel, onDown, onMove, onUp }
}

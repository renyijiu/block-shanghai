// 输入：键盘、鼠标、触屏统一成一份状态，玩家和相机只读这份状态。
// 触屏的摇杆和按钮在 Vue 组件里，通过 setStick / press / look 写进来
export class Input {
  /** 摇杆（-1..1），y 为前进 */
  private stick = { x: 0, y: 0 }
  private readonly keys = new Set<string>()
  private lookX = 0
  private lookY = 0
  private zoomDelta = 0
  private jumpQueued = false
  private viewQueued = false
  /** 触屏的奔跑开关 */
  runToggle = false
  /** 打开大地图等面板时暂停移动输入 */
  enabled = true
  private readonly dom: HTMLElement
  private drag: { id: number; x: number; y: number } | null = null

  constructor(dom: HTMLElement) {
    this.dom = dom
    addEventListener('keydown', this.onKey)
    addEventListener('keyup', this.onKey)
    addEventListener('blur', this.onBlur)
    dom.addEventListener('pointerdown', this.onDown)
    dom.addEventListener('pointermove', this.onMove)
    dom.addEventListener('pointerup', this.onUp)
    dom.addEventListener('pointercancel', this.onUp)
    dom.addEventListener('wheel', this.onWheel, { passive: false })
  }

  private readonly onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
    if (e.type === 'keydown') {
      if (e.code === 'Space' && !e.repeat) this.jumpQueued = true
      if (e.code === 'KeyV' && !e.repeat) this.viewQueued = true
      this.keys.add(e.code)
    } else this.keys.delete(e.code)
  }

  private readonly onBlur = () => this.keys.clear()

  // 鼠标拖动转视角；触屏的拖动由 TouchControls 处理（右半屏）
  private readonly onDown = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY }
    this.dom.setPointerCapture(e.pointerId)
  }

  private readonly onMove = (e: PointerEvent) => {
    if (!this.drag || e.pointerId !== this.drag.id) return
    this.look(e.clientX - this.drag.x, e.clientY - this.drag.y)
    this.drag.x = e.clientX
    this.drag.y = e.clientY
  }

  private readonly onUp = (e: PointerEvent) => {
    if (this.drag?.id === e.pointerId) this.drag = null
  }

  private readonly onWheel = (e: WheelEvent) => {
    e.preventDefault()
    this.zoomDelta += e.deltaY
  }

  // ---------------------------------------------------------------- 触屏控件写入

  setStick(x: number, y: number) {
    this.stick = { x, y }
  }

  look(dx: number, dy: number) {
    this.lookX += dx
    this.lookY += dy
  }

  press(action: 'jump' | 'view') {
    if (action === 'jump') this.jumpQueued = true
    else this.viewQueued = true
  }

  // ---------------------------------------------------------------- 读取

  /** 移动方向：x 向右、y 向前，长度不超过 1 */
  axes() {
    if (!this.enabled) return { x: 0, y: 0 }
    const k = this.keys
    let x = this.stick.x + (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0)
    let y = this.stick.y + (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0)
    const len = Math.hypot(x, y)
    if (len > 1) {
      x /= len
      y /= len
    }
    return { x, y }
  }

  get running() {
    return this.runToggle || this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')
  }

  /** 读取并清空本帧的视角拖动（像素） */
  consumeLook() {
    const r = { x: this.lookX, y: this.lookY }
    this.lookX = this.lookY = 0
    return r
  }

  consumeZoom() {
    const z = this.zoomDelta
    this.zoomDelta = 0
    return z
  }

  consumeJump() {
    const j = this.jumpQueued && this.enabled
    this.jumpQueued = false
    return j
  }

  consumeView() {
    const v = this.viewQueued
    this.viewQueued = false
    return v
  }

  dispose() {
    removeEventListener('keydown', this.onKey)
    removeEventListener('keyup', this.onKey)
    removeEventListener('blur', this.onBlur)
    this.dom.removeEventListener('pointerdown', this.onDown)
    this.dom.removeEventListener('pointermove', this.onMove)
    this.dom.removeEventListener('pointerup', this.onUp)
    this.dom.removeEventListener('pointercancel', this.onUp)
    this.dom.removeEventListener('wheel', this.onWheel)
  }
}

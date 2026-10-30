// 站内的标识和屏幕：文字画在 canvas 上做贴图（中英文站名、出口牌、到站倒计时、门上的线路图）
import * as THREE from 'three/webgpu'

export interface TextLine {
  text: string
  /** 字号（相对牌子高度的比例，0–1） */
  size: number
  color?: string
  bold?: boolean
  align?: CanvasTextAlign
}

const FONT = "system-ui, 'PingFang SC', 'Microsoft YaHei', sans-serif"
/** 每格多少像素 */
const PPU = 96

/** 可以重画的屏幕 / 牌子：宽 w、高 h（格），在 draw 里拿 2D context 画 */
export class Screen {
  readonly mesh: THREE.Mesh
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly texture: THREE.CanvasTexture
  private last = ''

  constructor(w: number, h: number, ppu = PPU) {
    this.canvas = document.createElement('canvas')
    this.canvas.width = Math.max(16, Math.round(w * ppu))
    this.canvas.height = Math.max(16, Math.round(h * ppu))
    this.ctx = this.canvas.getContext('2d')!
    this.texture = new THREE.CanvasTexture(this.canvas)
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.texture.anisotropy = 4
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: this.texture }))
  }

  get width() {
    return this.canvas.width
  }

  get height() {
    return this.canvas.height
  }

  /** 内容 key 没变就不重画（倒计时屏每帧调用，只有数字变了才上传贴图） */
  draw(key: string, fn: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
    if (key === this.last) return
    this.last = key
    fn(this.ctx, this.canvas.width, this.canvas.height)
    this.texture.needsUpdate = true
  }

  dispose() {
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
    this.texture.dispose()
  }
}

/** 一块写着几行字的牌子 */
export function textSign(lines: TextLine[], w: number, h: number, bg = '#1f2a36', stripe?: string): Screen {
  const s = new Screen(w, h)
  s.draw('static', (ctx, W, H) => {
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, W, H)
    if (stripe) {
      ctx.fillStyle = stripe
      ctx.fillRect(0, 0, Math.max(8, H * 0.12), H)
    }
    const total = lines.reduce((t, l) => t + l.size, 0)
    let y = (H * (1 - total)) / 2
    for (const l of lines) {
      const px = H * l.size
      ctx.font = `${l.bold ? 700 : 500} ${Math.round(px * 0.82)}px ${FONT}`
      ctx.fillStyle = l.color ?? '#ffffff'
      ctx.textAlign = l.align ?? 'center'
      ctx.textBaseline = 'middle'
      const x = l.align === 'left' ? (stripe ? H * 0.2 : H * 0.08) : l.align === 'right' ? W - H * 0.08 : W / 2
      ctx.fillText(fit(ctx, l.text, W * 0.94), x, y + px / 2)
      y += px
    }
  })
  return s
}

/** 太长就缩成省略号 */
export function fit(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text
  let t = text
  while (t.length > 1 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1)
  return t + '…'
}

export { FONT }

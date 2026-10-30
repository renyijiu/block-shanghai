// 摄影：按快门那一帧渲染完立刻从画布取图，套滤镜、加边框和落款，识别画面里的景点（docs/02 第 5 节）
import type * as THREE from 'three/webgpu'
import type { Box, CollisionWorld } from '../geo/CollisionWorld.ts'
import type { LandmarkManager } from '../landmarks/LandmarkManager.ts'
import { applyFilter, type PhotoFilter } from './filters.ts'
import { recognize, type PhotoTarget, type ShotCamera } from './recognize.ts'

/** 照片最长边（像素） */
const MAX_SIZE = 1600
const THUMB_SIZE = 320

export interface Shot {
  image: Blob
  thumb: Blob
  width: number
  height: number
  /** 拍到的景点和子景点 id */
  recognized: string[]
}

/** 所有景点和子景点的瞄准点：景点取三个高度（半高、瞄准高度、再高一点），任意一个拍到就算 */
export function photoTargets(landmarks: LandmarkManager): PhotoTarget[] {
  const out: PhotoTarget[] = []
  for (const p of landmarks.placed) {
    const d = p.def
    for (const k of [0.5, 1, 1.2]) out.push({ id: d.id, x: p.x, y: d.focusY * k, z: p.z, maxDist: d.photoR })
  }
  for (const p of landmarks.placed) {
    for (const s of p.def.subs ?? []) {
      const [x, z] = p.toWorld(s.x, s.z)
      out.push({ id: s.id, parent: p.def.id, x, y: s.y, z, maxDist: p.def.photoR })
    }
  }
  return out
}

export class PhotoSystem {
  private pending: ((c: { canvas: HTMLCanvasElement; cam: ShotCamera }) => void) | null = null
  private readonly renderer: THREE.WebGPURenderer
  private readonly camera: THREE.PerspectiveCamera
  private readonly collision: CollisionWorld
  private readonly landmarks: LandmarkManager
  private readonly targets: PhotoTarget[]

  constructor(renderer: THREE.WebGPURenderer, camera: THREE.PerspectiveCamera, collision: CollisionWorld, landmarks: LandmarkManager) {
    this.renderer = renderer
    this.camera = camera
    this.collision = collision
    this.landmarks = landmarks
    this.targets = photoTargets(landmarks)
  }

  /** Game 每帧渲染完调用：有待拍的照片就在这一刻把画布拷出来（同一个任务里画布内容还在） */
  afterRender() {
    const done = this.pending
    if (!done) return
    this.pending = null
    const src = this.renderer.domElement
    const k = Math.min(1, MAX_SIZE / Math.max(src.width, src.height))
    // 像素风取景时画布很小，放大到正常尺寸
    const scale = src.width < 640 ? Math.ceil(1280 / src.width) : k
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(src.width * scale)
    canvas.height = Math.round(src.height * scale)
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingEnabled = scale <= 1
    ctx.drawImage(src, 0, 0, canvas.width, canvas.height)
    const c = this.camera
    c.updateMatrixWorld()
    const vp = c.projectionMatrix.clone().multiply(c.matrixWorldInverse)
    done({ canvas, cam: { x: c.position.x, y: c.position.y, z: c.position.z, viewProj: vp.elements } })
  }

  /** 按快门：等下一帧渲染完取图，识别景点，再套滤镜和落款 */
  async shoot(filter: PhotoFilter, caption: (names: string[]) => string, nameOf: (id: string) => string, identify = true): Promise<Shot> {
    const { canvas, cam } = await new Promise<{ canvas: HTMLCanvasElement; cam: ShotCamera }>((r) => (this.pending = r))
    // 站内（独立场景）不识别城市里的景点
    const recognized = identify ? recognize(this.targets, cam, (t) => this.visible(t, cam)) : []
    const out = this.develop(canvas, filter, caption(recognized.map(nameOf)))
    const thumb = document.createElement('canvas')
    const tk = THUMB_SIZE / Math.max(out.width, out.height)
    thumb.width = Math.round(out.width * tk)
    thumb.height = Math.round(out.height * tk)
    thumb.getContext('2d')!.drawImage(out, 0, 0, thumb.width, thumb.height)
    const [image, small] = await Promise.all([toBlob(out, 0.88), toBlob(thumb, 0.8)])
    return { image, thumb: small, width: out.width, height: out.height, recognized }
  }

  // 景点没加载（太远）不算；视线上被别的楼挡住不算（树冠、景点自己的构件不挡）
  private visible(t: PhotoTarget, cam: ShotCamera) {
    const id = t.parent ?? t.id
    if (!this.landmarks.isLoaded(id)) return false
    const own = `landmark:${id}`
    return !this.collision.segmentBlocked(cam.x, cam.y, cam.z, t.x, t.y, t.z, (b: Box) => !!b.soft || b.owner === own)
  }

  // 冲洗：滤镜 → 边框（月份牌那种相纸）→ 落款
  private develop(src: HTMLCanvasElement, filter: PhotoFilter, caption: string) {
    const ctx = src.getContext('2d')!
    const img = ctx.getImageData(0, 0, src.width, src.height)
    applyFilter(img.data, src.width, src.height, filter.params, (Date.now() & 0xffff) + 1)
    ctx.putImageData(img, 0, 0)
    if (filter.border === undefined) {
      stamp(ctx, caption, src.width, src.height, 'rgba(255,255,255,0.92)', src.width * 0.025, src.height - src.width * 0.025)
      return src
    }
    // 相纸边框：四周窄、底边宽，落款写在底边
    const m = Math.round(src.width * 0.035)
    const out = document.createElement('canvas')
    out.width = src.width + m * 2
    out.height = src.height + m * 3
    const o = out.getContext('2d')!
    o.fillStyle = `#${filter.border.toString(16).padStart(6, '0')}`
    o.fillRect(0, 0, out.width, out.height)
    o.drawImage(src, m, m)
    stamp(o, caption, out.width, out.height, '#5a3a22', m, out.height - m * 0.75, false)
    return out
  }
}

function stamp(ctx: CanvasRenderingContext2D, text: string, w: number, _h: number, color: string, x: number, y: number, shadow = true) {
  const size = Math.max(14, Math.round(w / 52))
  ctx.font = `600 ${size}px system-ui, 'PingFang SC', 'Microsoft YaHei', sans-serif`
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  if (shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.6)'
    ctx.shadowBlur = size * 0.4
  }
  ctx.fillStyle = color
  ctx.fillText(text, x, y)
  ctx.shadowBlur = 0
}

function toBlob(c: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('照片编码失败'))), 'image/jpeg', quality))
}

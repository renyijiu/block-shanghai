// 摄影滤镜：城市包给参数（名称、色调），引擎按参数逐像素处理照片；取景时用 CSS filter 近似预览（docs/02 第 5 节 PhotoSystem）。
// 纯函数，不依赖浏览器 API，Node 里也能测

/** 一款滤镜的参数，都是可选的；处理顺序就是下面的书写顺序 */
export interface FilterParams {
  /** 去色 0–1 */
  grayscale?: number
  /** 复古棕褐 0–1 */
  sepia?: number
  /** 饱和度倍数，1 不变 */
  saturate?: number
  /** 对比度倍数，1 不变 */
  contrast?: number
  /** 亮度倍数，1 不变 */
  brightness?: number
  /** 冷暖：正数偏暖（红黄），负数偏冷 */
  warmth?: number
  /** 分离色调：暗部、亮部各叠一种颜色（0xRRGGBB），amount 0–1 */
  split?: { shadow: number; highlight: number; amount: number }
  /** 褪色：抬起黑位 0–1 */
  fade?: number
  /** 暗角 0–1 */
  vignette?: number
  /** 胶片颗粒 0–1 */
  grain?: number
  /** 色阶数（像素风），如 6 */
  posterize?: number
  /** 像素风：取景画面横向多少个像素（低分辨率渲染后放大） */
  pixel?: number
}

export interface PhotoFilter {
  id: string
  name: string
  params: FilterParams
  /** 相纸边框颜色（月份牌那种），没有就不加框 */
  border?: number
}

const luma = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b
const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/** 取景时的 CSS filter 近似（分离色调、暗角、颗粒、像素化不在这里） */
export function previewCss(p: FilterParams): string {
  const parts: string[] = []
  if (p.grayscale) parts.push(`grayscale(${p.grayscale})`)
  if (p.sepia) parts.push(`sepia(${p.sepia})`)
  if (p.warmth && p.warmth > 0) parts.push(`sepia(${(p.warmth * 0.25).toFixed(2)})`)
  if (p.saturate !== undefined && p.saturate !== 1) parts.push(`saturate(${p.saturate})`)
  if (p.contrast !== undefined && p.contrast !== 1) parts.push(`contrast(${p.contrast})`)
  if (p.brightness !== undefined && p.brightness !== 1) parts.push(`brightness(${p.brightness})`)
  return parts.join(' ') || 'none'
}

/** 可重复的伪随机数（颗粒用），同一张照片每次处理结果一样 */
function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
}

/** 就地处理 RGBA 像素（宽 w、高 h） */
export function applyFilter(data: Uint8ClampedArray, w: number, h: number, p: FilterParams, seed = 1) {
  const rand = rng(seed)
  const sh = p.split && [((p.split.shadow >> 16) & 255) / 255, ((p.split.shadow >> 8) & 255) / 255, (p.split.shadow & 255) / 255]
  const hi = p.split && [((p.split.highlight >> 16) & 255) / 255, ((p.split.highlight >> 8) & 255) / 255, (p.split.highlight & 255) / 255]
  const cx = w / 2
  const cy = h / 2
  const maxR2 = cx * cx + cy * cy
  const levels = p.posterize && p.posterize > 1 ? p.posterize - 1 : 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      let r = data[i]! / 255
      let g = data[i + 1]! / 255
      let b = data[i + 2]! / 255
      if (p.grayscale) {
        const l = luma(r, g, b)
        r += (l - r) * p.grayscale
        g += (l - g) * p.grayscale
        b += (l - b) * p.grayscale
      }
      if (p.sepia) {
        const sr = 0.393 * r + 0.769 * g + 0.189 * b
        const sg = 0.349 * r + 0.686 * g + 0.168 * b
        const sb = 0.272 * r + 0.534 * g + 0.131 * b
        r += (sr - r) * p.sepia
        g += (sg - g) * p.sepia
        b += (sb - b) * p.sepia
      }
      if (p.saturate !== undefined && p.saturate !== 1) {
        const l = luma(r, g, b)
        r = l + (r - l) * p.saturate
        g = l + (g - l) * p.saturate
        b = l + (b - l) * p.saturate
      }
      if (p.contrast !== undefined && p.contrast !== 1) {
        r = (r - 0.5) * p.contrast + 0.5
        g = (g - 0.5) * p.contrast + 0.5
        b = (b - 0.5) * p.contrast + 0.5
      }
      if (p.brightness !== undefined && p.brightness !== 1) {
        r *= p.brightness
        g *= p.brightness
        b *= p.brightness
      }
      if (p.warmth) {
        r += p.warmth * 0.08
        g += p.warmth * 0.02
        b -= p.warmth * 0.08
      }
      if (sh && hi && p.split) {
        // 越暗越偏暗部色，越亮越偏亮部色（叠加混合的简化版）
        const l = clamp(luma(r, g, b))
        const a = p.split.amount
        const ws = (1 - l) * a
        const wh = l * a
        r += (sh[0]! - 0.5) * ws + (hi[0]! - 0.5) * wh
        g += (sh[1]! - 0.5) * ws + (hi[1]! - 0.5) * wh
        b += (sh[2]! - 0.5) * ws + (hi[2]! - 0.5) * wh
      }
      if (p.fade) {
        const f = p.fade * 0.25
        r = f + r * (1 - f)
        g = f + g * (1 - f)
        b = f + b * (1 - f)
      }
      if (p.vignette) {
        const dx = x - cx
        const dy = y - cy
        const k = 1 - p.vignette * ((dx * dx + dy * dy) / maxR2) ** 1.5
        r *= k
        g *= k
        b *= k
      }
      if (p.grain) {
        const n = (rand() - 0.5) * p.grain * 0.18
        r += n
        g += n
        b += n
      }
      if (levels) {
        r = Math.round(clamp(r) * levels) / levels
        g = Math.round(clamp(g) * levels) / levels
        b = Math.round(clamp(b) * levels) / levels
      }
      data[i] = clamp(r) * 255
      data[i + 1] = clamp(g) * 255
      data[i + 2] = clamp(b) * 255
    }
  }
}

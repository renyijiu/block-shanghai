// 景点共用的构件：瓦色、灯光选项、中式屋顶和殿堂
import type { LandmarkContext, PartOptions } from '../../engine/city.ts'

export const TILE = 0x3a3b40
export const WARM = 0xffd79a
export const LIGHT = { light: true } satisfies PartOptions

// 中式屋顶：几层逐渐收小的瓦顶，最下一层四角起翘（飞檐）
export function chineseRoof(c: LandmarkContext, cx: number, cz: number, w: number, d: number, y: number, tiers: number, color = TILE) {
  for (let i = 0; i < tiers; i++) {
    const k = 1 - i * 0.28
    c.box(cx - (w / 2) * k, y + i * 0.7, cz - (d / 2) * k, cx + (w / 2) * k, y + i * 0.7 + 0.45, cz + (d / 2) * k, color, { windows: 0, collide: false })
  }
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x = cx + sx * (w / 2)
      const z = cz + sz * (d / 2)
      c.box(Math.min(x, x + sx * 0.7), y + 0.3, Math.min(z, z + sz * 0.7), Math.max(x, x + sx * 0.7), y + 0.9, Math.max(z, z + sz * 0.7), color, { windows: 0, collide: false })
    }
  // 屋脊
  c.box(cx - (w / 2) * (1 - (tiers - 1) * 0.28), y + tiers * 0.7 - 0.25, cz - 0.2, cx + (w / 2) * (1 - (tiers - 1) * 0.28), y + tiers * 0.7 + 0.2, cz + 0.2, color, { windows: 0, collide: false })
}

/** 中式殿堂：台基、红柱墙身、重檐（eaves 层屋顶） */
export function hall(c: LandmarkContext, cx: number, cz: number, w: number, d: number, h: number, wall: number, eaves = 1, roof = TILE) {
  c.box(cx - w / 2 - 0.6, 0, cz - d / 2 - 0.6, cx + w / 2 + 0.6, 0.4, cz + d / 2 + 0.6, 0xb5ad9e, { windows: 0 })
  c.box(cx - w / 2, 0.4, cz - d / 2, cx + w / 2, h, cz + d / 2, wall, { windows: 0.35 })
  for (let e = 0; e < eaves; e++) chineseRoof(c, cx, cz, w + 3 - e * 3, d + 3 - e * 3, h + e * 2.2, 3, roof)
}

export const GOLD = 0xe0a82e
export const TEMPLE_RED = 0x9e2f22
export const YELLOW_WALL = 0xe4c46e
export const PAVE = 0x8d8a83
export const NEON = [0xff3d6e, 0x37c8ff, 0xffd23a, 0x7cff6b, 0xff7a2f, 0xc77dff]
export const BRICK_GREY = [0x9c978d, 0xa8a297, 0x938e85, 0xaea89c]
export const FLAT = { windows: 0, collide: false } as const

/** 阶梯式双坡顶：屋脊沿 x 或 z */
export function stepRoof(c: LandmarkContext, x0: number, z0: number, x1: number, z1: number, y: number, h: number, color: number, along: 'x' | 'z', n = 3) {
  for (let i = 0; i < n; i++) {
    const k = (0.5 * i) / n
    const y0 = y + (h * i) / n
    const y1 = y + (h * (i + 1)) / n
    if (along === 'x') {
      const d = (z1 - z0) * k
      c.box(x0 - 0.15, y0, z0 + d - 0.15, x1 + 0.15, y1, z1 - d + 0.15, color, FLAT)
    } else {
      const d = (x1 - x0) * k
      c.box(x0 + d - 0.15, y0, z0 - 0.15, x1 - d + 0.15, y1, z1 + 0.15, color, FLAT)
    }
  }
}

export type Face = 'x+' | 'x-' | 'z+' | 'z-'

/**
 * 一排石库门：矩形沿门面方向切成约 3 格宽的单元，每个单元一扇石库门（石门框、乌漆门、门楣），
 * 青砖墙夹红砖腰线，黑瓦双坡顶。face 是门朝哪边；signs 时门边挂竖招牌（夜里亮）
 */
export function shikumenRow(c: LandmarkContext, x0: number, z0: number, x1: number, z1: number, face: Face, seed: number, o: { signs?: boolean } = {}) {
  const alongX = face[0] === 'z'
  const sgn = face[1] === '+' ? 1 : -1
  const a0 = alongX ? x0 : z0
  const a1 = alongX ? x1 : z1
  const n = Math.max(1, Math.round((a1 - a0) / 3))
  const step = (a1 - a0) / n
  const front = alongX ? (sgn > 0 ? z1 : z0) : sgn > 0 ? x1 : x0
  for (let i = 0; i < n; i++) {
    const r = (seed * 7 + i * 13) % 17
    const h = 3.6 + (r % 4) * 0.45
    const b0 = a0 + i * step
    const b1 = b0 + step
    const mid = (b0 + b1) / 2
    const [ux0, uz0, ux1, uz1] = alongX ? [b0 + 0.05, z0, b1 - 0.05, z1] : [x0, b0 + 0.05, x1, b1 - 0.05]
    c.box(ux0, 0, uz0, ux1, h, uz1, BRICK_GREY[r % BRICK_GREY.length]!, { windows: 0.5 })
    // 门面上的构件：u 沿这一排（相对单元中点），d 是伸出门面的厚度
    const facePart = (u0: number, u1: number, y0: number, y1: number, d: number, color: number, opt: PartOptions = {}) => {
      const [p0, p1] = sgn > 0 ? [front, front + d] : [front - d, front]
      if (alongX) c.box(mid + u0, y0, p0, mid + u1, y1, p1, color, { ...FLAT, ...opt })
      else c.box(p0, y0, mid + u0, p1, y1, mid + u1, color, { ...FLAT, ...opt })
    }
    facePart(-step / 2 + 0.05, step / 2 - 0.05, 1.25, 1.45, 0.06, 0xa5523a)
    facePart(-step / 2 + 0.05, step / 2 - 0.05, h - 0.55, h - 0.35, 0.06, 0xa5523a)
    facePart(-0.7, 0.7, 0, 2.3, 0.12, 0xd8cfbe)
    facePart(-0.45, 0.45, 0, 2.0, 0.18, 0x1d1b19)
    facePart(-0.85, 0.85, 2.3, 2.75, 0.2, 0xcfc4ae)
    if (o.signs && r % 3 !== 0) facePart(-1.15, -0.8, 1.6, 3.0, 0.35, NEON[r % NEON.length]!, LIGHT)
    stepRoof(c, ux0, uz0, ux1, uz1, h, 1.1, 0x4a4c52, alongX ? 'x' : 'z')
  }
}

/** 敞开的门殿：台基、两排红柱、檐枋和中式屋顶；柱子排在 x = cx ± w/2 两条线上，中间能走过去 */
export function gatePavilion(c: LandmarkContext, cx: number, cz: number, w: number, d: number, h: number, roof: number) {
  c.box(cx - w / 2 - 0.4, 0, cz - d / 2 - 0.4, cx + w / 2 + 0.4, 0.3, cz + d / 2 + 0.4, 0xb5ad9e, { windows: 0 })
  for (const sx of [-1, 1])
    for (const k of [-1, -1 / 3, 1 / 3, 1]) c.box(cx + (sx * w) / 2 - 0.25, 0.3, cz + (k * d) / 2 - 0.25, cx + (sx * w) / 2 + 0.25, h, cz + (k * d) / 2 + 0.25, TEMPLE_RED, { windows: 0, collide: true })
  c.box(cx - w / 2 - 0.1, h - 0.6, cz - d / 2 - 0.1, cx + w / 2 + 0.1, h, cz + d / 2 + 0.1, TEMPLE_RED, { ...FLAT, bottom: true })
  chineseRoof(c, cx, cz, w + 2.4, d + 2.4, h, 3, roof)
}

/** 一棵方块树：树干 + 两层树冠；tall 时是水杉那样的细高树 */
export function tree(c: LandmarkContext, x: number, z: number, h = 4, crown = 0x3f7d3a, tall = false) {
  c.box(x - 0.2, 0, z - 0.2, x + 0.2, h * 0.45, z + 0.2, 0x6b4a32, { windows: 0 })
  if (tall) {
    for (let i = 0; i < 3; i++) {
      const r = 1.1 - i * 0.3
      c.box(x - r, h * (0.35 + i * 0.22), z - r, x + r, h * (0.6 + i * 0.22), z + r, crown, { windows: 0, collide: 'camera' })
    }
    return
  }
  c.box(x - 1.3, h * 0.45, z - 1.3, x + 1.3, h * 0.8, z + 1.3, crown, { windows: 0, collide: 'camera' })
  c.box(x - 0.8, h * 0.8, z - 0.8, x + 0.8, h, z + 0.8, crown, { windows: 0, collide: 'camera' })
}

/** 草坪、水池：贴地的一层颜色（水池不能走进去，用矮池沿挡住） */
export function lawn(c: LandmarkContext, x0: number, z0: number, x1: number, z1: number, color = 0x7fb069) {
  c.box(x0, 0, z0, x1, 0.04, z1, color, FLAT)
}

export function pond(c: LandmarkContext, x0: number, z0: number, x1: number, z1: number) {
  c.box(x0, 0, z0, x1, 0.06, z1, 0x4f8f8a, FLAT)
  for (const [a0, b0, a1, b1] of [
    [x0 - 0.3, z0 - 0.3, x1 + 0.3, z0],
    [x0 - 0.3, z1, x1 + 0.3, z1 + 0.3],
    [x0 - 0.3, z0, x0, z1],
    [x1, z0, x1 + 0.3, z1]
  ] as const)
    c.box(a0, 0, b0, a1, 0.6, b1, 0xb5ad9e, { windows: 0 })
}

/** 一尊人像（铜像、石像）：底座 + 身体 + 头，sitting 是坐像 */
export function statue(c: LandmarkContext, x: number, z: number, color = 0x6b5a3a, base = 1, sitting = false) {
  c.box(x - 0.7, 0, z - 0.7, x + 0.7, base, z + 0.7, 0xb5ad9e, { windows: 0 })
  const y = base
  if (sitting) {
    c.box(x - 0.4, y, z - 0.35, x + 0.4, y + 0.6, z + 0.45, color, { windows: 0, collide: false })
    c.box(x - 0.35, y + 0.6, z - 0.35, x + 0.35, y + 1.3, z + 0.05, color, { windows: 0, collide: false })
    c.box(x - 0.22, y + 1.3, z - 0.3, x + 0.22, y + 1.75, z + 0.1, color, { windows: 0, collide: false })
    return
  }
  c.box(x - 0.3, y, z - 0.18, x + 0.3, y + 1, z + 0.18, color, { windows: 0, collide: false })
  c.box(x - 0.35, y + 1, z - 0.2, x + 0.35, y + 1.7, z + 0.2, color, { windows: 0, collide: false })
  c.box(x - 0.22, y + 1.7, z - 0.2, x + 0.22, y + 2.15, z + 0.2, color, { windows: 0, collide: false })
}

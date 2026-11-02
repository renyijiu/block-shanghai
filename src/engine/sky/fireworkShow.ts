// 烟火秀（纯函数）：按游戏时间算出这一刻天上有哪些烟花、每颗火花在哪儿。
// 发射时刻和每颗烟花的样子都由固定种子决定，同一时刻看到的烟火永远一样（跳过时间、拍照、截图都一致）。
// 时间都是游戏秒：时钟 1 秒现实 = 20 秒游戏，升空 30 游戏秒 ≈ 现实 1.5 秒
import { mulberry32 } from '../build/random.ts'

/** 一场烟火：在 (x, z) 一带（游戏坐标），每天 start 开始放 duration 秒（都是游戏秒） */
export interface Show {
  x: number
  z: number
  start: number
  duration: number
  /** 发射点在中心周围多大范围里（格） */
  spread: number
}

export type BurstKind = 'peony' | 'ring' | 'willow'

export interface Burst {
  k: number
  /** 发射时刻（从开场算，游戏秒） */
  t0: number
  x: number
  z: number
  /** 炸开的高度（格） */
  h: number
  kind: BurstKind
  /** 两种颜色（0xRRGGBB），火花一半一种 */
  colors: [number, number]
  /** 火花数 */
  n: number
  /** 炸开的半径（格） */
  radius: number
}

/** 升空用时、炸开后火花持续多久（游戏秒） */
export const RISE = 30
export const LIFE = 64

const PALETTE = [0xff4040, 0xffd040, 0x40c0ff, 0x60ff80, 0xff60e0, 0xffffff, 0xff9030, 0xb080ff]

/** 这一场的发射时刻表：平时 8–16 秒一发，最后 15% 是高潮，2–4 秒一发；最后一发炸完正好收场 */
export function schedule(show: Show): number[] {
  const rng = mulberry32(Math.round(show.x * 7 + show.z * 13))
  const out: number[] = []
  for (let t = 4; t <= show.duration - RISE - LIFE; ) {
    out.push(t)
    t += t > show.duration * 0.85 ? 2 + rng() * 2 : 8 + rng() * 8
  }
  return out
}

/** 第 k 发烟花的样子 */
export function burst(show: Show, k: number, t0: number): Burst {
  const rng = mulberry32(k * 7919 + 17)
  const a = rng() * Math.PI * 2
  const r = Math.sqrt(rng()) * show.spread
  const roll = rng()
  const kind: BurstKind = roll < 0.2 ? 'willow' : roll < 0.45 ? 'ring' : 'peony'
  const c0 = PALETTE[Math.floor(rng() * PALETTE.length)]!
  const c1 = rng() < 0.5 ? c0 : PALETTE[Math.floor(rng() * PALETTE.length)]!
  return {
    k,
    t0,
    x: show.x + Math.cos(a) * r,
    z: show.z + Math.sin(a) * r,
    h: 60 + rng() * 45,
    kind,
    colors: kind === 'willow' ? [0xffc860, 0xffe0a0] : [c0, c1],
    n: kind === 'ring' ? 48 : 72,
    radius: kind === 'willow' ? 26 : 18 + rng() * 14
  }
}

/** 开场后 t 秒（游戏秒）天上的烟花：还在升空或者火花还没灭的 */
export function burstsAt(show: Show, times: number[], t: number): Burst[] {
  if (t < 0 || t > show.duration) return []
  const out: Burst[] = []
  times.forEach((t0, k) => {
    if (t0 <= t && t < t0 + RISE + LIFE) out.push(burst(show, k, t0))
  })
  return out
}

/** 一颗火花或者升空的火箭：位置、大小（格）、颜色 */
export interface Spark {
  x: number
  y: number
  z: number
  size: number
  color: number
}

/** 一发烟花在开场后 t 秒的所有火花（升空时是火箭和拖尾），追加到 out */
export function sparksOf(b: Burst, t: number, out: Spark[] = []): Spark[] {
  const age = t - b.t0
  if (age < 0) return out
  if (age < RISE) {
    // 升空：先快后慢，拖三节尾巴
    const f = age / RISE
    const y = b.h * (1 - (1 - f) ** 2)
    for (let i = 0; i < 4; i++) out.push({ x: b.x, y: Math.max(0, y - i * 2.2), z: b.z, size: 0.9 - i * 0.18, color: 0xffd8a0 })
    return out
  }
  const a = (age - RISE) / LIFE
  if (a >= 1) return out
  const rng = mulberry32(b.k * 104729 + 3)
  // 倾斜、转一下，环形和球形不都是正着的
  const tilt = rng() * 0.8
  const turn = rng() * Math.PI * 2
  const spread = 1 - Math.exp(-4 * a)
  const fall = (b.kind === 'willow' ? 34 : 14) * a * a
  const size = (b.kind === 'willow' ? 1.1 : 1.3) * (1 - a) ** 0.6
  for (let i = 0; i < b.n; i++) {
    let dx: number, dy: number, dz: number
    if (b.kind === 'ring') {
      const th = (i / b.n) * Math.PI * 2 + turn
      ;[dx, dy, dz] = [Math.cos(th), Math.sin(th) * Math.sin(tilt), Math.sin(th) * Math.cos(tilt)]
    } else {
      // 球面上均匀分布（斐波那契点），柳条只往上半球
      const yy = b.kind === 'willow' ? 1 - (i / (b.n - 1)) * 0.9 : 1 - (2 * (i + 0.5)) / b.n
      const rr = Math.sqrt(Math.max(0, 1 - yy * yy))
      const th = i * 2.399963 + turn
      ;[dx, dy, dz] = [Math.cos(th) * rr, yy, Math.sin(th) * rr]
    }
    out.push({ x: b.x + dx * b.radius * spread, y: b.h + dy * b.radius * spread - fall, z: b.z + dz * b.radius * spread, size, color: b.colors[i % 2]! })
  }
  return out
}

// 可复现的随机数：同一个分块每次生成的建筑都一样
export type Rng = () => number

export function mulberry32(seed: number): Rng {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 分块坐标 → 种子 */
export const chunkSeed = (cx: number, cz: number) => Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663) ^ 0x5bd1e995

/** 按权重挑一个键 */
export function pick(weights: Record<string, number>, rng: Rng): string | null {
  let total = 0
  for (const w of Object.values(weights)) total += w
  let r = rng() * total
  for (const [k, w] of Object.entries(weights)) {
    r -= w
    if (r < 0) return k
  }
  return null
}

/** [a, b) 区间的随机数 */
export const range = (rng: Rng, a: number, b: number) => a + rng() * (b - a)

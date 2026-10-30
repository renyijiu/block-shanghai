// 站内和车厢里的乘客：方块小人，站着或坐着，所有人合并成一个网格（一次绘制）
import { type GeoBuilder, rgb } from '../build/geometry.ts'
import type { Rng } from '../build/random.ts'

const SHIRTS = [0x3a7bd5, 0xd5573a, 0x2f8f5b, 0xe8e2d6, 0x2a2a2a, 0x8e5bd5, 0xf2c14e, 0x5b8fa8, 0xc94f7c, 0x6b6b6b]
const PANTS = [0x2f3440, 0x1d2a44, 0x4a4036, 0x6b6b6b, 0x23262b, 0x8a7a5e]
const SKIN = [0xf0c8a0, 0xe0b48c, 0xc99a74, 0xf5d5b5]
const HAIR = [0x2a2220, 0x1a1614, 0x5a3a28, 0x9a9a9a]

const pick = <T>(a: T[], rng: Rng) => a[Math.floor(rng() * a.length)]!

/**
 * 在 (x, z) 放一个人，面朝 angle（atan2(dz, dx)）。sit 时坐在 0.45 高的座位上，y 是脚底高度
 */
export function addPerson(g: GeoBuilder, x: number, z: number, angle: number, sit: boolean, rng: Rng, y = 0) {
  const shirt = rgb(pick(SHIRTS, rng))
  const pants = rgb(pick(PANTS, rng))
  const skin = rgb(pick(SKIN, rng))
  const hair = rgb(pick(HAIR, rng))
  const fx = Math.cos(angle)
  const fz = Math.sin(angle)
  // 局部坐标：f 向前、s 向侧面
  const at = (f: number, s: number): [number, number] => [x + fx * f - fz * s, z + fz * f + fx * s]
  const part = (f: number, s: number, len: number, wid: number, y0: number, y1: number, c: [number, number, number]) => {
    const [px, pz] = at(f, s)
    g.orientedBox(px, pz, angle, len, wid, y + y0, y + y1, c)
  }
  const h = 0.9 + rng() * 0.12
  if (sit) {
    for (const s of [-0.12, 0.12]) {
      part(0.22, s, 0.46, 0.22, 0.42, 0.6, pants)
      part(0.42, s, 0.2, 0.22, 0, 0.45, pants)
    }
    part(0, 0, 0.28, 0.5, 0.58, 0.58 + 0.62 * h, shirt)
    for (const s of [-0.34, 0.34]) part(0.08, s, 0.2, 0.17, 0.6, 1.18 * h, shirt)
    const top = 0.58 + 0.62 * h
    part(0, 0, 0.42, 0.42, top, top + 0.42, skin)
    part(-0.02, 0, 0.44, 0.44, top + 0.42, top + 0.54, hair)
    return
  }
  for (const s of [-0.12, 0.12]) part(0, s, 0.24, 0.22, 0, 0.82 * h, pants)
  const body = 0.82 * h
  part(0, 0, 0.28, 0.5, body, body + 0.62, shirt)
  // 站着的人一只手抬起来扶拉环
  part(0, -0.34, 0.17, 0.17, body, body + 0.6, shirt)
  part(0, 0.34, 0.17, 0.17, body + 0.3, body + 1.05, shirt)
  part(0, 0, 0.42, 0.42, body + 0.61, body + 1.03, skin)
  part(-0.02, 0, 0.44, 0.44, body + 1.03, body + 1.15, hair)
}

// 地铁在地面上的建筑：出入口（红色 M 标志）、地下站的风亭。和建筑一样用 Builder 拼方块、登记碰撞盒（docs/04 第 6 节）
import type { Builder } from '../build/Builder.ts'
import type { Lot } from '../world/lots.ts'
import type { MetroData } from './data.ts'

const GLASS = 0x8e9aa4
const ROOF = 0xd3d6d9
const RED = 0xe4002b
const WHITE = 0xf4f4f4

/** 出入口占地（格）：开口方向 6 宽、4 深（docs/04 第 9 节） */
export const ENTRANCE_SIZE = { w: 6, d: 4 }

/** 出入口的占地矩形（开口朝外、背对车站，取最接近的坐标轴方向） */
export function entranceFootprint(data: MetroData, i: number): Lot & { open: 'n' | 's' | 'e' | 'w' } {
  const e = data.entrances[i]!
  const st = data.stations[e.station]!
  const [x, z] = e.pos
  const dx = x - st.pos[0]
  const dz = z - st.pos[1]
  const open = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'e' : 'w') : dz > 0 ? 's' : 'n'
  const along = open === 'n' || open === 's'
  const hw = (along ? ENTRANCE_SIZE.w : ENTRANCE_SIZE.d) / 2
  const hd = (along ? ENTRANCE_SIZE.d : ENTRANCE_SIZE.w) / 2
  return { x0: x - hw, z0: z - hd, x1: x + hw, z1: z + hd, open }
}

/** 地铁口：三面玻璃墙 + 顶棚，开口一侧立红色 M 标志柱 */
export function buildEntrance(b: Builder, f: ReturnType<typeof entranceFootprint>) {
  const { x0, z0, x1, z1, open } = f
  const t = 0.3
  const h = 2.6
  const wall = { windows: 0 }
  // 三面墙（开口那面不建），墙登记碰撞，人可以走进开口
  if (open !== 'n') b.box(x0, 0, z0, x1, h, z0 + t, GLASS, wall)
  if (open !== 's') b.box(x0, 0, z1 - t, x1, h, z1, GLASS, wall)
  if (open !== 'w') b.box(x0, 0, z0, x0 + t, h, z1, GLASS, wall)
  if (open !== 'e') b.box(x1 - t, 0, z0, x1, h, z1, GLASS, wall)
  b.box(x0 - 0.2, h, z0 - 0.2, x1 + 0.2, h + 0.3, z1 + 0.2, ROOF, { windows: 0, collide: false })
  // M 标志柱：在开口一侧的角上
  const px = open === 'w' ? x0 - 0.6 : open === 'e' ? x1 + 0.6 : x1 - 0.3
  const pz = open === 'n' ? z0 - 0.6 : open === 's' ? z1 + 0.6 : z1 - 0.3
  b.box(px - 0.25, 0, pz - 0.25, px + 0.25, 3.6, pz + 0.25, 0x5a5d62, { windows: 0 })
  b.box(px - 0.75, 3.6, pz - 0.75, px + 0.75, 5.1, pz + 0.75, RED, { windows: 0, collide: false })
  // 白色方块拼的“M”：两竖、一横、中间一短竖，四面都看得到
  letterM(b, px, pz, 0.76, 3.85, 4.85)
}

// 在标志牌四个侧面贴一个方块拼的 M
function letterM(b: Builder, px: number, pz: number, s: number, y0: number, y1: number) {
  const o = { windows: 0, collide: false }
  const d = 0.04
  const bars = (u0: number, u1: number, v0: number, v1: number) => {
    // 东西两面（法线 ±x）：u 沿 z；南北两面（法线 ±z）：u 沿 x
    b.box(px + s, v0, pz + u0, px + s + d, v1, pz + u1, WHITE, o)
    b.box(px - s - d, v0, pz + u0, px - s, v1, pz + u1, WHITE, o)
    b.box(px + u0, v0, pz + s, px + u1, v1, pz + s + d, WHITE, o)
    b.box(px + u0, v0, pz - s - d, px + u1, v1, pz - s, WHITE, o)
  }
  const h = y1 - y0
  bars(-0.5, -0.32, y0, y1) // 左竖
  bars(0.32, 0.5, y0, y1) // 右竖
  bars(-0.5, 0.5, y1 - 0.18, y1) // 顶横
  bars(-0.09, 0.09, y0 + h * 0.35, y1) // 中竖
}

/** 地下站的风亭：车站附近一两个带百叶的小方楼 */
export function buildVent(b: Builder, r: Lot) {
  const h = 2.6
  b.box(r.x0, 0, r.z0, r.x1, h, r.z1, 0xb8b2a6, { windows: 0, top: 0x8d8a84 })
  // 百叶：深色横条
  for (let y = 0.8; y < h - 0.3; y += 0.5) b.box(r.x0 - 0.05, y, r.z0 - 0.05, r.x1 + 0.05, y + 0.18, r.z1 + 0.05, 0x6d6a64, { windows: 0, collide: false })
}

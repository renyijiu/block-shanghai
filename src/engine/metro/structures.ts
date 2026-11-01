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
  // M 标志柱：在开口一侧的角上（柱子中段挂站名灯箱，见 EntranceSigns）
  const { px, pz } = entrancePole(f)
  b.box(px - 0.25, 0, pz - 0.25, px + 0.25, 3.6, pz + 0.25, 0x5a5d62, { windows: 0 })
  b.box(px - 0.75, 3.6, pz - 0.75, px + 0.75, 5.1, pz + 0.75, RED, { windows: 0, collide: false })
  letterM(b, px, pz, 0.76, 3.85, 4.85)
}

/** M 标志柱的位置：开口一侧的角上、离出入口 0.6 格 */
export function entrancePole(f: ReturnType<typeof entranceFootprint>) {
  const { x0, z0, x1, z1, open } = f
  const px = open === 'w' ? x0 - 0.6 : open === 'e' ? x1 + 0.6 : x1 - 0.3
  const pz = open === 'n' ? z0 - 0.6 : open === 's' ? z1 + 0.6 : z1 - 0.3
  return { px, pz }
}

/** 粗体 M 的像素图（7 列 × 6 行，# 是白块）：通用字母，不用上海地铁的官方标志 */
const BOLD_M = ['##...##', '###.###', '#######', '##.#.##', '##...##', '##...##']

// 在标志牌四个侧面贴一个方块拼的粗体 M
function letterM(b: Builder, px: number, pz: number, s: number, y0: number, y1: number) {
  const o = { windows: 0, collide: false }
  const d = 0.04
  const cols = BOLD_M[0]!.length
  const rows = BOLD_M.length
  const w = 1.1 / cols
  const h = (y1 - y0) / rows
  BOLD_M.forEach((line, r) => {
    // 同一行连着的白块合成一条，少几个面
    for (let c = 0; c < cols; ) {
      if (line[c] !== '#') {
        c++
        continue
      }
      let e = c
      while (e < cols && line[e] === '#') e++
      const [u0, u1] = [-0.55 + c * w, -0.55 + e * w]
      const [v0, v1] = [y1 - (r + 1) * h, y1 - r * h]
      // 东西两面（法线 ±x）：u 沿 z，从外面看左右要反过来，M 左右对称所以不用管；南北两面：u 沿 x
      b.box(px + s, v0, pz + u0, px + s + d, v1, pz + u1, WHITE, o)
      b.box(px - s - d, v0, pz + u0, px - s, v1, pz + u1, WHITE, o)
      b.box(px + u0, v0, pz + s, px + u1, v1, pz + s + d, WHITE, o)
      b.box(px + u0, v0, pz - s - d, px + u1, v1, pz - s, WHITE, o)
      c = e
    }
  })
}

/** 地下站的风亭：车站附近一两个带百叶的小方楼 */
export function buildVent(b: Builder, r: Lot) {
  const h = 2.6
  b.box(r.x0, 0, r.z0, r.x1, h, r.z1, 0xb8b2a6, { windows: 0, top: 0x8d8a84 })
  // 百叶：深色横条
  for (let y = 0.8; y < h - 0.3; y += 0.5) b.box(r.x0 - 0.05, y, r.z0 - 0.05, r.x1 + 0.05, y + 0.18, r.z1 + 0.05, 0x6d6a64, { windows: 0, collide: false })
}

/** 高架车站沿轨道的长度、总宽（格） */
export const STATION_SIZE = { len: 52, wid: 18 }

/**
 * 高架车站：轨道两侧的站台、雨棚（边缘是线路色）、雨棚立柱，轨道下方的站厅和落地立柱。
 * 列车从中间穿过；colors 是在这里停靠的线路颜色（共线站两侧各用一种）
 */
export function buildElevatedStation(b: Builder, x: number, z: number, angle: number, h: number, colors: number[]) {
  const vx = Math.sin(angle)
  const vz = -Math.cos(angle)
  const ux = Math.cos(angle)
  const uz = Math.sin(angle)
  const at = (along: number, across: number): [number, number] => [x + ux * along + vx * across, z + uz * along + vz * across]
  const { len, wid } = STATION_SIZE
  const no = { windows: 0, collide: false }
  // 站台：轨道两侧
  for (const k of [1, -1]) {
    const [px, pz] = at(0, k * 4.8)
    b.orientedBox(px, pz, angle, len - 2, 3.2, h - 1.2, h + 0.6, 0xbdb8ae, { ...no, top: 0xd8d3c8 })
    // 站台边缘的黄色安全线
    const [ex, ez] = at(0, k * 3.3)
    b.orientedBox(ex, ez, angle, len - 2, 0.3, h + 0.6, h + 0.62, 0xe8c330, no)
  }
  // 雨棚和立柱
  b.orientedBox(x, z, angle, len, wid, h + 5.4, h + 6, 0xe6e4df, no)
  colors.slice(0, 2).forEach((c, i) => {
    const [sx, sz] = at(0, (i === 0 ? 1 : -1) * (wid / 2 - 0.2))
    b.orientedBox(sx, sz, angle, len, 0.4, h + 4.6, h + 6, c, no)
  })
  if (colors.length === 1) {
    const [sx, sz] = at(0, -(wid / 2 - 0.2))
    b.orientedBox(sx, sz, angle, len, 0.4, h + 4.6, h + 6, colors[0]!, no)
  }
  for (let a = -len / 2 + 4; a <= len / 2 - 4; a += 11) {
    for (const k of [1, -1]) {
      const [cx, cz] = at(a, k * 6.2)
      b.orientedBox(cx, cz, angle, 0.6, 0.6, h + 0.6, h + 5.4, 0x9aa0a6, no)
    }
  }
  // 站厅：桥面下方的玻璃盒子，落地立柱登记碰撞
  const hallTop = h - 2
  const hallBottom = Math.max(3.2, h - 6.5)
  b.orientedBox(x, z, angle, len - 14, wid - 2, hallBottom, hallTop, 0xd4d0c8)
  for (const a of [-14, 0, 14]) {
    for (const k of [1, -1]) {
      const [cx, cz] = at(a, k * 6)
      b.orientedBox(cx, cz, angle, 1.4, 1.4, 0, hallBottom, 0xb9b5ab, { windows: 0 })
    }
  }
}

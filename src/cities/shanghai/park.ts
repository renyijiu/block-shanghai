// 星愿游乐园：度假区星愿湖北边的原创游乐园（docs/05 第 2 节）。名字、标志、园区布局和设施造型都是游戏里原创的，
// 不用任何主题乐园的名字、标志、城堡和卡通角色。设施用“会动的部件”（LandmarkContext.moving）按现实时间转动，
// 营业时间 9:00–21:30（游戏时间）。局部坐标：x 朝东、z 朝南，大门在南边（z = 56），对着星愿湖和湖边小镇
import type { LandmarkContext, LandmarkDef, Vec3 } from '../../engine/city.ts'
import { mulberry32 } from '../../engine/build/random.ts'
import { FLAT, GOLD, LIGHT, stepRoof, tree } from './parts.ts'

const PASTEL = [0xf2c6c2, 0xf7e3a6, 0xbfe0d0, 0xc8d6f0, 0xf4d6a8, 0xe0c8f0]
const W = { windows: 0 }
const SOLID = { windows: 0, collide: true }
/** 头顶上、从下面看得到的构件（拱梁、观景廊、顶棚）画底面 */
const UNDER = { windows: 0, bottom: true }
const GLOW = { ...LIGHT, collide: false }
const RED = 0xc8282a
const CREAM = 0xf4f1ea
const STEEL = 0xd0d4d8
const BRICK = 0x9c978d

/** 大门：两座蓝顶塔楼、红色拱梁上一串灯 */
function gate(c: LandmarkContext) {
  for (const s of [-1, 1]) {
    const x = s * 9
    c.box(x - 2.5, 0, 52, x + 2.5, 9, 56, 0xf4e6d0, { windows: 0.3 })
    stepRoof(c, x - 2.8, 51.7, x + 2.8, 56.3, 9, 2.4, 0x3f7fbf, 'x', 3)
    c.box(x - 0.3, 11.4, 53.7, x + 0.3, 13.6, 54.3, GOLD, W)
    c.ball(x, 14.2, 54, 0.7, 0xffd23a, GLOW)
  }
  c.box(-6.5, 7, 53.2, 6.5, 8.8, 54.8, RED, UNDER)
  for (let x = -6; x <= 6; x += 1.5) c.box(x - 0.25, 6.6, 54.8, x + 0.25, 7, 55.1, 0xfff1c9, GLOW)
}

/** 围栏：大门那一段留口 */
function fence(c: LandmarkContext) {
  const col = 0x2f5f8f
  c.box(-46, 0, 55.6, -6.5, 1.2, 56, col, W)
  c.box(6.5, 0, 55.6, 46, 1.2, 56, col, W)
  c.box(-46, 0, -56, 46, 1.2, -55.6, col, W)
  c.box(-46, 0, -56, -45.6, 1.2, 56, col, W)
  c.box(45.6, 0, -56, 46, 1.2, 56, col, W)
}

/** 星愿塔：园区中心红白相间的方块灯塔（代替城堡），电梯上 30 格高的观景廊，顶上一颗星 */
function wishTower(c: LandmarkContext) {
  c.column(0, 0, 6, 0, 3, 0xe8e0d0, W)
  for (let i = 0; i < 9; i++) c.column(0, 0, 3.4 - i * 0.08, 3 + i * 3, 6 + i * 3, i % 2 ? RED : CREAM, i === 8 ? SOLID : W)
  // 观景廊：一圈平台和栏杆（栏杆挡人，不会掉下去）
  c.column(0, 0, 5.8, 29.4, 30, 0xd8d2c4, UNDER)
  c.platform(-5.4, -5.4, 5.4, 5.4, 30)
  c.box(-5.6, 30, -5.6, 5.6, 31.1, -5.3, CREAM, SOLID)
  c.box(-5.6, 30, 5.3, 5.6, 31.1, 5.6, CREAM, SOLID)
  c.box(-5.6, 30, -5.6, -5.3, 31.1, 5.6, CREAM, SOLID)
  c.box(5.3, 30, -5.6, 5.6, 31.1, 5.6, CREAM, SOLID)
  // 灯室、红顶、星星（夜里亮）
  c.column(0, 0, 2.6, 30, 35, 0xbfe8ff, { windows: 0, glass: true, collide: true })
  c.column(0, 0, 1.5, 31, 34.4, 0xfff1c9, GLOW)
  c.column(0, 0, 3.2, 35, 36, RED, UNDER)
  c.column(0, 0, 1.8, 36, 37.4, RED, W)
  c.ball(0, 38.8, 0, 1.3, 0xffd23a, GLOW)
  c.elevator(0, 7.5, 0, 30, 4.4, '星愿塔观景廊')
}

/** 云霄摩天轮：轮子绕水平轴转，12 个吊舱沿圆周平移、一直朝上 */
function ferrisWheel(c: LandmarkContext) {
  const [cx, cy, cz] = [24, 21, -34]
  const R = 17
  const RPM = 1.2
  for (const z of [cz - 2.4, cz + 2.4]) {
    c.beam(cx - 8, 0, z, cx, cy, z, 0.7, 0.7, STEEL)
    c.beam(cx + 8, 0, z, cx, cy, z, 0.7, 0.7, STEEL)
  }
  c.box(cx - 0.6, cy - 0.6, cz - 2.6, cx + 0.6, cy + 0.6, cz + 2.6, 0x8a8f96, UNDER)
  c.box(cx - 5, 0, cz - 3, cx + 5, 0.6, cz + 3, 0xd8cfb8, W)
  const N = 24
  const at = (k: number, r = R): [number, number] => [cx + r * Math.cos((k / N) * Math.PI * 2), cy + r * Math.sin((k / N) * Math.PI * 2)]
  c.moving({ kind: 'spin', at: [cx, cy, cz], axis: 'z', rpm: RPM }, (m) => {
    for (const z of [cz - 1.2, cz + 1.2]) {
      for (let k = 0; k < N; k++) {
        const [x0, y0] = at(k)
        const [x1, y1] = at(k + 1)
        m.beam(x0, y0, z, x1, y1, z, 0.45, 0.45, 0xf0f0f0)
        m.beam(x0, y0, z + (z > cz ? 0.3 : -0.3), x1, y1, z + (z > cz ? 0.3 : -0.3), 0.18, 0.18, NEON_RIM[k % NEON_RIM.length]!, GLOW)
        if (k % 2 === 0) m.beam(cx, cy, z, x0, y0, z, 0.25, 0.25, 0xe0e0e0)
      }
    }
  })
  for (let k = 0; k < 12; k++) {
    const [x, y] = at(k * 2)
    const anchor: Vec3 = [x, y, cz]
    c.moving({ kind: 'orbit', at: [cx, cy, cz], axis: 'z', rpm: RPM, anchor }, (m) => {
      m.beam(x, y, cz, x, y - 0.6, cz, 0.15, 0.15, 0x555555)
      m.box(x - 1, y - 2.6, cz - 1, x + 1, y - 0.6, cz + 1, PASTEL[k % PASTEL.length]!, { windows: 0.5 })
      m.box(x - 1.1, y - 0.7, cz - 1.1, x + 1.1, y - 0.5, cz + 1.1, 0xffffff, W)
    })
  }
}
const NEON_RIM = [0xff3d6e, 0xffd23a, 0x37c8ff, 0x7cff6b]

/** 海派旋转木马：石库门红砖中柱，红金两层顶棚，12 匹马绕着转 */
function carousel(c: LandmarkContext) {
  const [cx, cz] = [-18, -26]
  c.column(cx, cz, 8.5, 0, 0.5, 0xd8cfb8, W)
  c.column(cx, cz, 1.2, 0.5, 7, BRICK, W)
  c.moving({ kind: 'spin', at: [cx, 0, cz], axis: 'y', rpm: 4 }, (m) => {
    m.column(cx, cz, 8.8, 6.6, 7.2, RED, W)
    m.column(cx, cz, 7, 7.2, 8, GOLD, W)
    m.column(cx, cz, 4.5, 8, 8.8, RED, W)
    m.column(cx, cz, 2, 8.8, 10, GOLD, W)
    m.ball(cx, 10.6, cz, 0.7, 0xffd23a, GLOW)
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2
      m.box(cx + 8.7 * Math.cos(a) - 0.2, 6.3, cz + 8.7 * Math.sin(a) - 0.2, cx + 8.7 * Math.cos(a) + 0.2, 6.6, cz + 8.7 * Math.sin(a) + 0.2, 0xfff1c9, GLOW)
    }
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2
      const [hx, hz] = [cx + 6 * Math.cos(a), cz + 6 * Math.sin(a)]
      const tw = a + Math.PI / 2
      const y = 2.4 + (k % 2) * 0.6
      m.beam(hx, 0.5, hz, hx, 6.6, hz, 0.12, 0.12, GOLD)
      m.slab(hx, hz, 2, 0.7, y, y + 0.8, k % 3 ? CREAM : 0x8a5a3a, tw, W)
      m.slab(hx + Math.cos(tw) * 1.1, hz + Math.sin(tw) * 1.1, 0.6, 0.5, y + 0.6, y + 1.5, k % 3 ? CREAM : 0x8a5a3a, tw, W)
      m.slab(hx - Math.cos(tw) * 0.2, hz - Math.sin(tw) * 0.2, 0.8, 0.8, y + 0.8, y + 0.9, PASTEL[k % PASTEL.length]!, tw, W)
    }
  })
}

/** 沙船秋千：上海市徽上的沙船，平底、三根桅杆挂着棕红色的篾篷帆，绕东西向的横梁南北来回荡（从中轴大道看是侧面） */
function junkSwing(c: LandmarkContext) {
  const [px, py, pz] = [30, 15, 4]
  for (const x of [px - 3.5, px + 3.5]) {
    c.beam(x, 0, pz - 7, x, py, pz, 0.6, 0.6, STEEL)
    c.beam(x, 0, pz + 7, x, py, pz, 0.6, 0.6, STEEL)
  }
  c.box(px - 3.7, py - 0.4, pz - 0.4, px + 3.7, py + 0.4, pz + 0.4, 0x8a8f96, UNDER)
  c.moving({ kind: 'swing', at: [px, py, pz], axis: 'x', amp: 0.95, period: 7 }, (m) => {
    for (const x of [px - 2.6, px + 2.6]) {
      m.beam(x, py, pz, x, 5, pz - 6, 0.3, 0.3, STEEL)
      m.beam(x, py, pz, x, 5, pz + 6, 0.3, 0.3, STEEL)
      m.beam(x, py, pz, x, 5, pz, 0.3, 0.3, STEEL)
    }
    const HULL = 0x6b4a32
    m.box(px - 2.2, 3, pz - 7, px + 2.2, 5, pz + 7, HULL, W)
    m.box(px - 1.8, 4, pz - 8.5, px + 1.8, 6, pz - 7, HULL, W)
    m.box(px - 1.8, 4, pz + 7, px + 1.8, 6.6, pz + 8.6, HULL, W)
    m.box(px - 2.3, 5, pz - 7, px + 2.3, 5.3, pz + 7, 0xc8a46a, W)
    for (const [mz, top] of [
      [pz - 4.5, 11],
      [pz, 12.5],
      [pz + 4.5, 10.5]
    ] as const) {
      m.beam(px, 5, mz, px, top, mz, 0.25, 0.25, 0x3a2a1a)
      m.box(px - 0.08, 6, mz - 1.5, px + 0.08, top - 0.4, mz + 1.5, 0xa0442c, W)
      for (let y = 6.8; y < top - 0.5; y += 1.1) m.box(px - 0.12, y, mz - 1.55, px + 0.12, y + 0.14, mz + 1.55, 0x3a2a1a, W)
    }
  })
}

/** 跳楼机：高 32 格的塔，座椅环慢慢升到顶上，一下子落下来 */
function dropTower(c: LandmarkContext) {
  const [cx, cz] = [34, 34]
  for (let i = 0; i < 8; i++) c.column(cx, cz, 1.4, i * 4, i * 4 + 4, i % 2 ? 0x37c8ff : CREAM, W)
  c.column(cx, cz, 2.2, 32, 33.5, RED, UNDER)
  c.ball(cx, 34.4, cz, 0.8, 0xff3d6e, GLOW)
  c.box(cx - 3.5, 0, cz - 3.5, cx + 3.5, 0.4, cz + 3.5, 0xd8cfb8, W)
  c.moving({ kind: 'drop', height: 24, period: 14 }, (m) => {
    const y0 = 1.4
    m.box(cx - 2.8, y0, cz - 2.8, cx + 2.8, y0 + 0.5, cz - 1.6, RED, W)
    m.box(cx - 2.8, y0, cz + 1.6, cx + 2.8, y0 + 0.5, cz + 2.8, RED, W)
    m.box(cx - 2.8, y0, cz - 1.6, cx - 1.6, y0 + 0.5, cz + 1.6, RED, W)
    m.box(cx + 1.6, y0, cz - 1.6, cx + 2.8, y0 + 0.5, cz + 1.6, RED, W)
    for (const [sx, sz] of [
      [-2.2, -2.2],
      [2.2, -2.2],
      [-2.2, 2.2],
      [2.2, 2.2],
      [0, -2.2],
      [0, 2.2],
      [-2.2, 0],
      [2.2, 0]
    ] as const)
      m.box(cx + sx - 0.35, y0 + 0.5, cz + sz - 0.35, cx + sx + 0.35, y0 + 1.6, cz + sz + 0.35, PASTEL[(sx + sz + 6) % PASTEL.length]!, W)
    m.box(cx - 2.9, y0 + 1.6, cz - 2.9, cx + 2.9, y0 + 1.8, cz + 2.9, 0xfff1c9, GLOW)
  })
}

/** 云霄过山车的轨道（闭合）：沿西边一圈，北头掉头，有爬坡和几个起伏 */
const TRACK: Vec3[] = [
  [-40, 2.6, 44],
  [-40, 2.6, 32],
  [-40, 24, 8],
  [-40, 25, 0],
  [-40, 6, -18],
  [-40, 16, -32],
  [-40, 14, -44],
  [-38.5, 13.5, -49.5],
  [-35, 13, -52],
  [-31.5, 12.5, -49.5],
  [-30, 12, -44],
  [-30, 4, -30],
  [-30, 12, -16],
  [-30, 4, 0],
  [-30, 9, 14],
  [-30, 3, 28],
  [-31.5, 2.6, 40],
  [-35, 2.6, 46],
  [-38.5, 2.6, 46]
]

function coaster(c: LandmarkContext) {
  const n = TRACK.length
  for (let i = 0; i < n; i++) {
    const [ax, ay, az] = TRACK[i]!
    const [bx, by, bz] = TRACK[(i + 1) % n]!
    const len = Math.hypot(bx - ax, bz - az) || 1
    const [ox, oz] = [(-(bz - az) / len) * 0.7, ((bx - ax) / len) * 0.7]
    c.beam(ax + ox, ay, az + oz, bx + ox, by, bz + oz, 0.25, 0.25, RED)
    c.beam(ax - ox, ay, az - oz, bx - ox, by, bz - oz, 0.25, 0.25, RED)
    c.beam(ax, ay - 0.35, az, bx, by - 0.35, bz, 0.5, 0.4, 0xe8e8e8)
    // 每隔几格立一根支柱
    const steps = Math.max(1, Math.floor(Math.hypot(bx - ax, by - ay, bz - az) / 5))
    for (let k = 0; k < steps; k++) {
      const f = k / steps
      const [x, y, z] = [ax + (bx - ax) * f, ay + (by - ay) * f, az + (bz - az) * f]
      if (y > 3.4) c.box(x - 0.25, 0, z - 0.25, x + 0.25, y - 0.5, z + 0.25, STEEL, W)
    }
  }
  // 站台：轨道两边的平台和顶棚
  c.box(-43.5, 0, 34, -41.2, 2, 46, 0xd8cfb8, W)
  for (const [x, z] of [
    [-43.2, 34.3],
    [-43.2, 45.7],
    [-36.8, 34.3],
    [-36.8, 45.7]
  ] as const)
    c.box(x - 0.2, 0, z - 0.2, x + 0.2, 5.4, z + 0.2, STEEL, W)
  c.box(-43.6, 5.4, 33.8, -36.4, 5.8, 46.2, 0x3f7fbf, UNDER)
  // 列车：三节车厢沿轨道跑，前后错开
  for (let k = 0; k < 3; k++) {
    const [ax, ay, az] = TRACK[0]!
    c.moving({ kind: 'path', points: TRACK, speed: 12, offset: -k * 3.2, anchor: TRACK[0]! }, (m) => {
      m.box(ax - 1.3, ay + 0.1, az - 0.8, ax + 1.3, ay + 1, az + 0.8, k === 0 ? 0xffd23a : RED, W)
      m.box(ax - 1.1, ay + 1, az - 0.7, ax - 0.7, ay + 1.6, az + 0.7, 0x2a2a2a, W)
      m.box(ax + 0.1, ay + 1, az - 0.7, ax + 0.5, ay + 1.6, az + 0.7, 0x2a2a2a, W)
      if (k === 0) m.box(ax + 1.3, ay + 0.1, az - 0.6, ax + 1.8, ay + 0.8, az + 0.6, 0xffd23a, W)
    })
  }
}

/** 弄堂迷宫：石库门砖墙砌的 5×5 迷宫（每次一样），南边石库门进、北边出 */
function maze(c: LandmarkContext) {
  const [x0, z0] = [-26, 26]
  const S = 4
  const N = 5
  const rng = mulberry32(2026)
  // 深度优先挖通道：open 记录打通的墙（“x,z,方向”）
  const seen = new Set<string>()
  const open = new Set<string>()
  const stack: [number, number][] = [[0, 0]]
  seen.add('0,0')
  while (stack.length) {
    const [x, z] = stack[stack.length - 1]!
    const next = (
      [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ] as const
    ).filter(([dx, dz]) => x + dx >= 0 && x + dx < N && z + dz >= 0 && z + dz < N && !seen.has(`${x + dx},${z + dz}`))
    if (!next.length) {
      stack.pop()
      continue
    }
    const [dx, dz] = next[Math.floor(rng() * next.length)]!
    open.add(dx ? `v${Math.max(x, x + dx)},${z}` : `h${x},${Math.max(z, z + dz)}`)
    seen.add(`${x + dx},${z + dz}`)
    stack.push([x + dx, z + dz])
  }
  const wall = (ax: number, az: number, bx: number, bz: number) => c.box(Math.min(ax, bx) - 0.3, 0, Math.min(az, bz) - 0.3, Math.max(ax, bx) + 0.3, 2.6, Math.max(az, bz) + 0.3, BRICK, W)
  for (let i = 0; i <= N; i++)
    for (let j = 0; j < N; j++) {
      // 竖墙（x = i 那条线上第 j 格）、横墙（z = i 那条线上第 j 格）；外圈南北各留一个口
      if (i === 0 || i === N || !open.has(`v${i},${j}`)) wall(x0 + i * S, z0 + j * S, x0 + i * S, z0 + (j + 1) * S)
      const door = (i === 0 || i === N) && j === 2
      if (!door && (i === 0 || i === N || !open.has(`h${j},${i}`))) wall(x0 + j * S, z0 + i * S, x0 + (j + 1) * S, z0 + i * S)
    }
  // 入口的石库门：石门框、乌漆门扇半开
  const gx = x0 + 2.5 * S
  const gz = z0 + N * S
  c.box(gx - 2.3, 0, gz - 0.4, gx - 1.7, 3.4, gz + 0.4, 0xc9c0ae, W)
  c.box(gx + 1.7, 0, gz - 0.4, gx + 2.3, 3.4, gz + 0.4, 0xc9c0ae, W)
  c.box(gx - 2.3, 3.4, gz - 0.4, gx + 2.3, 4.2, gz + 0.4, 0xc9c0ae, UNDER)
  c.box(gx - 1.7, 0, gz + 0.4, gx - 1.5, 2.8, gz + 1.6, 0x1f1a17, W)
  c.box(gx + 1.5, 0, gz + 0.4, gx + 1.7, 2.8, gz + 1.6, 0x1f1a17, W)
}

function grounds(c: LandmarkContext) {
  // 地面（湖边一点小水面也铺上能走）、中轴大道、塔下圆形广场、草坪和花坛
  c.box(-46, 0, -56, 46, 0.05, 56, 0xd9cdb4, FLAT)
  c.platform(-46, -56, 46, 56, 0.05)
  c.box(-4, 0, 6, 4, 0.08, 56, 0xc9b99a, FLAT)
  c.column(0, 0, 12, 0, 0.07, 0xc9b99a, FLAT)
  for (const [a, b, d, e] of [
    [-28, -10, -10, 18],
    [10, -10, 20, 22],
    [-44, -54, -36, 46]
  ] as const)
    c.box(a, 0, b, d, 0.06, e, 0x7fb069, FLAT)
  for (let z = 12; z <= 48; z += 6) {
    for (const s of [-1, 1]) {
      tree(c, s * 6, z, 4.5, z % 12 ? 0x4f8f3a : 0xe0a030)
      c.box(s * 4.6 - 0.1, 0, z + 3 - 0.1, s * 4.6 + 0.1, 3.4, z + 3 + 0.1, 0x4a4d52, W)
      c.box(s * 4.6 - 0.3, 3.4, z + 3 - 0.3, s * 4.6 + 0.3, 3.8, z + 3 + 0.3, 0xfff1c9, GLOW)
    }
  }
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2
    c.box(Math.cos(a) * 10 - 0.8, 0, Math.sin(a) * 10 - 0.8, Math.cos(a) * 10 + 0.8, 0.6, Math.sin(a) * 10 + 0.8, PASTEL[k % PASTEL.length]!, W)
  }
}

export const starpark: LandmarkDef = {
  id: 'starpark',
  name: '星愿游乐园',
  district: 'pudong',
  grade: 'B',
  // 度假区环形河道里、星愿湖北边的大片空地（按烘焙的水面和道路数据选的，园里没有马路）
  lat: 31.14926,
  lon: 121.6676,
  rot: 0,
  rect: [-46, -56, 46, 56],
  focusY: 20,
  photoR: 400,
  loadR: 1100,
  build(c) {
    grounds(c)
    fence(c)
    gate(c)
    wishTower(c)
    ferrisWheel(c)
    carousel(c)
    junkSwing(c)
    dropTower(c)
    coaster(c)
    maze(c)
  },
  desc: '度假区湖边的原创游乐园：中间是红白相间的星愿塔，周围有云霄摩天轮、沙船秋千、海派旋转木马、云霄过山车、跳楼机和石库门弄堂迷宫。（游戏里原创的乐园，不对应现实中的任何主题乐园）',
  tip: '坐电梯上星愿塔观景廊能看全园；设施 9:00–21:30 运转，每晚 20:30 星愿湖上空有烟火。'
}

// 站内场景（docs/04 第 7 节）：站厅、站台（地下 / 高架 × 岛式 / 侧式）、车厢、换乘通道。
// 每个场景是独立的 THREE.Scene，有自己的碰撞世界和交互点；换场景时整个销毁重建（几百个方块，很快）
import * as THREE from 'three/webgpu'
import { Builder } from '../build/Builder.ts'
import { GeoBuilder, rgb, type GeometryData } from '../build/geometry.ts'
import { mulberry32, type Rng } from '../build/random.ts'
import { CollisionWorld } from '../geo/CollisionWorld.ts'
import type { MetroLine, PlatformType, Structure } from '../metro/data.ts'
import { carGeometry, TRAIN } from '../metro/trains.ts'
import { InteractRegistry, type InteractPoint } from '../world/interact.ts'
import type { Lot } from '../world/lots.ts'
import { addPerson } from './people.ts'
import { fit, FONT, Screen, textSign } from './signs.ts'
import { nextCall, type Crowd, type PlatformSide, type TrainCall } from './trip.ts'

export interface InteriorMaterials {
  solid: THREE.MeshLambertMaterial
  /** 不受光照的发光件：灯带、指示灯 */
  glow: THREE.MeshBasicMaterial
  glass: THREE.MeshLambertMaterial
  dispose(): void
}

export function createInteriorMaterials(): InteriorMaterials {
  const solid = new THREE.MeshLambertMaterial({ vertexColors: true })
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true })
  const glass = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.3, depthWrite: false })
  return { solid, glow, glass, dispose: () => [solid, glow, glass].forEach((m) => m.dispose()) }
}

/** 玩家出生点：位置和朝向（Player.facing 的约定：0 朝北 -z，π 朝南 +z） */
export interface Spawn {
  x: number
  z: number
  facing: number
}

export const FACE = { north: 0, south: Math.PI, west: Math.PI / 2, east: -Math.PI / 2 }

const hex = (c: string) => Number.parseInt(c.slice(1), 16)

function toMesh(d: GeometryData | null, m: THREE.Material) {
  if (!d) return null
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(d.position, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(d.normal, 3))
  g.setAttribute('color', new THREE.BufferAttribute(d.color, 3))
  g.setIndex(new THREE.BufferAttribute(d.index, 1))
  g.computeBoundingSphere()
  return new THREE.Mesh(g, m)
}

/** 发光的方块（带底面，挂在天花板上也看得见） */
function glowBox(g: GeoBuilder, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: number) {
  g.box(x0, y0, z0, x1, y1, z1, rgb(c))
  g.bottom(x0, y0, z0, x1, z1, rgb(c))
}

export class InteriorScene {
  readonly scene = new THREE.Scene()
  readonly collision = new CollisionWorld()
  readonly interact = new InteractRegistry()
  readonly spawns = new Map<string, Spawn>()
  /** 能走的范围 */
  bounds: Lot = { x0: -1, z0: -1, x1: 1, z1: 1 }
  protected readonly screens: Screen[] = []
  protected readonly mats: InteriorMaterials
  protected readonly rng: Rng

  constructor(mats: InteriorMaterials, background: number, seed: number, light = 1) {
    this.mats = mats
    this.rng = mulberry32(seed)
    this.scene.background = new THREE.Color(background)
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a8a, 1.7 * light))
    const d = new THREE.DirectionalLight(0xffffff, 0.8 * light)
    d.position.set(3, 10, 5)
    this.scene.add(d)
  }

  /** 把建好的方块加进场景，碰撞盒登记到场景自己的碰撞世界 */
  protected add(b: Builder, glow?: GeoBuilder, parent: THREE.Object3D = this.scene) {
    const built = b.build()
    for (const m of [toMesh(built.solid, this.mats.solid), toMesh(built.glass, this.mats.glass), toMesh(glow?.build() ?? null, this.mats.glow)]) if (m) parent.add(m)
    this.collision.add('static', built.colliders)
  }

  /** 摆一块牌子：中心 (x, y, z)，rotY 是牌面朝向（0 朝 +z） */
  protected place(s: Screen, x: number, y: number, z: number, rotY: number, parent: THREE.Object3D = this.scene) {
    s.mesh.position.set(x, y, z)
    s.mesh.rotation.y = rotY
    parent.add(s.mesh)
    this.screens.push(s)
    return s
  }

  protected point(p: Omit<InteractPoint, 'kind'>, owner = 'static') {
    this.interact.add(owner, [{ ...p, kind: 'interior' }])
  }

  /** 每帧：动画、屏幕 */
  update(_dt: number, _t: number) {}

  dispose() {
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh && !this.screens.some((s) => s.mesh === o)) o.geometry.dispose()
    })
    for (const s of this.screens) s.dispose()
  }
}

// ---------------------------------------------------------------- 站厅

export interface HallExit {
  /** 出入口序号（metro.entrances） */
  entrance: number
  ref: string
  /** 方向：“东南” */
  dir: string
  /** 出口相对车站的方位角（atan2(dz, dx)） */
  angle: number
}

export interface HallInfo {
  name: string
  nameEn: string
  lines: { line: MetroLine; sides: PlatformSide[] }[]
  exits: HallExit[]
  crowd: Crowd
}

const HALL = { x: 30, z: 14, h: 5 }

/** 站厅：南半边是非付费区（出口、售票机），中间一排闸机，北半边付费区（下到各线站台） */
export class HallScene extends InteriorScene {
  constructor(mats: InteriorMaterials, info: HallInfo, seed: number) {
    super(mats, 0x2a2d31, seed)
    const b = new Builder()
    const glow = new GeoBuilder()
    const { x: W, z: D, h: H } = HALL
    this.bounds = { x0: -W + 0.4, z0: -D + 0.4, x1: W - 0.4, z1: D - 0.4 }
    // 地面、墙、天花板、灯带
    b.box(-W, -0.2, -D, W, 0, 0, 0x9a968e, { collide: false, windows: 0 })
    b.box(-W, -0.2, 0, W, 0, D, 0xb9b4a9, { collide: false, windows: 0 })
    const WALL = 0xdcd8cf
    b.box(-W - 0.4, 0, -D - 0.4, W + 0.4, H, -D, WALL, { windows: 0 })
    b.box(-W - 0.4, 0, D, W + 0.4, H, D + 0.4, WALL, { windows: 0 })
    b.box(-W - 0.4, 0, -D, -W, H, D, WALL, { windows: 0 })
    b.box(W, 0, -D, W + 0.4, H, D, WALL, { windows: 0 })
    b.box(-W, H, -D, W, H + 0.3, D, 0xe8e5de, { collide: 'camera', windows: 0, bottom: true })
    for (let z = -D + 2; z < D; z += 4) glowBox(glow, -W + 1, H - 0.08, z - 0.15, W - 1, H, z + 0.15, 0xfdf6e3)
    for (const x of [-20, -10, 10, 20]) for (const z of [-7, 7]) b.box(x - 0.45, 0, z - 0.45, x + 0.45, H, z + 0.45, 0xcfcac0, { windows: 0 })

    // 闸机：两边是栏杆，中间 7 台闸机；闸机本身挡人（按 E 刷卡通过）
    b.box(-W, 0, -0.15, -9.5, 1.1, 0.15, 0x8f959c, { windows: 0 })
    b.box(9.5, 0, -0.15, W, 1.1, 0.15, 0x8f959c, { windows: 0 })
    for (let i = 0; i <= 6; i++) {
      const x = -9 + i * 3
      b.box(x - 0.2, 0, -0.9, x + 0.2, 1.05, 0.9, 0xb7bcc2, { windows: 0, collide: false })
      glowBox(glow, x - 0.12, 1.05, -0.6, x + 0.12, 1.1, -0.4, 0x3ddc84)
      glowBox(glow, x - 0.12, 1.05, 0.4, x + 0.12, 1.1, 0.6, 0x3ddc84)
      if (i < 6) b.box(x + 0.2, 0.55, -0.05, x + 2.8, 1.0, 0.05, 0xd8e8f0, { windows: 0, collide: false, glass: true })
    }
    b.colliders.push({ x0: -9.5, y0: 0, z0: -0.3, x1: 9.5, y1: 1.3, z1: 0.3 })
    this.point({ x: 0, z: -1.6, r: 5, label: '刷卡进站（交通卡）', action: '进站', go: 'gate:in' })
    this.point({ x: 0, z: 1.6, r: 5, label: '刷卡出站', action: '出站', go: 'gate:out' })
    this.spawns.set('gate:in', { x: 0, z: 2.6, facing: FACE.north })
    this.spawns.set('gate:out', { x: 0, z: -2.6, facing: FACE.south })

    // 售票机和线路图（非付费区西边）
    for (let i = 0; i < 3; i++) {
      const x = -19 + i * 2
      b.box(x - 0.7, 0, -2.6, x + 0.7, 1.9, -1.8, 0x2f6fb0, { windows: 0 })
      glowBox(glow, x - 0.45, 1.0, -2.65, x + 0.45, 1.6, -2.6, 0x9fd8ff)
    }
    this.place(textSign([{ text: '售票 · 线路图', size: 0.5, bold: true }, { text: 'Tickets · Metro Map', size: 0.3, color: '#cfe3ff' }], 6, 1, '#2f6fb0'), -17, 2.6, -1.75, 0)
    this.point({ x: -17, z: -4, r: 3.5, label: '线路图 · 快速到达', action: '查看', go: 'map' })

    // 站名
    const nameSign = () => textSign([{ text: info.name, size: 0.55, bold: true }, { text: info.nameEn, size: 0.3, color: '#cfd6de' }], 9, 1.8, '#1f2a36', '#c8282a')
    this.place(nameSign(), 0, 3.6, -D + 0.05, 0)
    this.place(nameSign(), -W + 0.05, 3.4, 7, Math.PI / 2)
    this.place(nameSign(), W - 0.05, 3.4, 7, -Math.PI / 2)

    // 出口：沿非付费区的南墙和东西墙排开，按方位分到最近的槽位
    const slots: { x: number; z: number; nx: number; nz: number }[] = [
      ...[-24, -14, -4, 6, 16, 26].map((x) => ({ x, z: -D, nx: 0, nz: 1 })),
      ...[-9.5, -4].map((z) => ({ x: -W, z, nx: 1, nz: 0 })),
      ...[-9.5, -4].map((z) => ({ x: W, z, nx: -1, nz: 0 }))
    ]
    const used = new Set<number>()
    const center = [0, -6]
    for (const e of info.exits.slice(0, slots.length)) {
      let best = -1
      let bestD = Infinity
      slots.forEach((s, i) => {
        if (used.has(i)) return
        const sa = Math.atan2(s.z - center[1]!, s.x - center[0]!)
        const d = Math.abs(Math.atan2(Math.sin(sa - e.angle), Math.cos(sa - e.angle)))
        if (d < bestD) {
          bestD = d
          best = i
        }
      })
      used.add(best)
      this.exitStairs(b, glow, slots[best]!, e)
    }

    // 付费区北墙：各线下站台的扶梯口
    const n = info.lines.length
    info.lines.forEach(({ line, sides }, k) => {
      const x = (k - (n - 1) / 2) * 13
      const color = hex(line.color)
      // 扶梯口：深色地面，三面栏杆
      b.box(x - 2.5, 0, 9.5, x + 2.5, 0.02, D, 0x30343a, { collide: false, windows: 0 })
      b.box(x - 2.7, 0, 9.3, x - 2.5, 1.1, D, 0xb9bec4, { windows: 0 })
      b.box(x + 2.5, 0, 9.3, x + 2.7, 1.1, D, 0xb9bec4, { windows: 0 })
      b.box(x - 2.7, 0, 9.3, x + 2.7, 1.1, 9.5, 0xd8e8f0, { windows: 0, glass: true })
      for (const s of [-1.2, 1.2]) b.box(x + s - 0.5, -0.6, 10, x + s + 0.5, 0.05, D, 0x6b7077, { collide: false, windows: 0 })
      const toward = sides.map((s) => s.toward).join(' · ')
      this.place(
        textSign([{ text: `${line.name} 站台 ↓`, size: 0.45, bold: true }, { text: toward ? `往 ${toward}` : line.nameEn, size: 0.3, color: '#e6ebf0' }], 6, 1.4, '#1f2a36', line.color),
        x,
        3.2,
        D - 0.05,
        Math.PI
      )
      // 闸机到扶梯口的线路色导向条
      const len = Math.hypot(x, 8)
      b.orientedBox(x / 2, 5, Math.atan2(8, x), len, 0.5, 0, 0.02, color, { collide: false, windows: 0 })
      this.point({ x, z: 8.2, r: 3.2, label: `去站台 · ${line.name}`, action: '下楼', go: `platform:${line.id}` })
      this.spawns.set(`platform:${line.id}`, { x, z: 7, facing: FACE.south })
    })

    this.addCrowd(b, glow, info.crowd)
    this.add(b, glow)
  }

  // 出口：贴着墙往上走的楼梯，上面是通向街面的洞口，挂出口牌
  private exitStairs(b: Builder, glow: GeoBuilder, s: { x: number; z: number; nx: number; nz: number }, e: HallExit) {
    // 局部：沿墙方向 t = (nz, -nx)... 只有两种朝向，分开写清楚
    const steps = 7
    const depth = 5
    if (s.nz) {
      for (let i = 0; i < steps; i++) b.box(s.x - 2, 0, s.z + depth - ((i + 1) * depth) / steps, s.x + 2, (i + 1) * 0.42, s.z + depth - (i * depth) / steps, 0xa8a49b, { windows: 0 })
      b.box(s.x - 2.3, 0, s.z, s.x - 2, 3.4, s.z + depth, 0xc9c4ba, { windows: 0 })
      b.box(s.x + 2, 0, s.z, s.x + 2.3, 3.4, s.z + depth, 0xc9c4ba, { windows: 0 })
      b.box(s.x - 2, 3, s.z + 0.05, s.x + 2, HALL.h, s.z + 0.3, 0x15181c, { windows: 0, collide: false })
      this.place(this.exitSign(e), s.x, 4.2, s.z + depth + 0.1, 0)
      this.point({ x: s.x, z: s.z + depth + 1.5, r: 3.2, label: `出站 · ${this.exitName(e)}（${e.dir}）`, action: '出站', go: `exit:${e.entrance}` })
      this.spawns.set(`exit:${e.entrance}`, { x: s.x, z: s.z + depth + 2.5, facing: FACE.south })
    } else {
      const x0 = s.nx > 0 ? s.x : s.x - depth
      for (let i = 0; i < steps; i++) {
        const a = s.nx > 0 ? s.x + depth - ((i + 1) * depth) / steps : s.x - depth + (i * depth) / steps
        b.box(a, 0, s.z - 2, a + depth / steps, (i + 1) * 0.42, s.z + 2, 0xa8a49b, { windows: 0 })
      }
      b.box(x0, 0, s.z - 2.3, x0 + depth, 3.4, s.z - 2, 0xc9c4ba, { windows: 0 })
      b.box(x0, 0, s.z + 2, x0 + depth, 3.4, s.z + 2.3, 0xc9c4ba, { windows: 0 })
      const front = s.x + s.nx * depth
      this.place(this.exitSign(e), front + s.nx * 0.1, 4.2, s.z, s.nx > 0 ? Math.PI / 2 : -Math.PI / 2)
      this.point({ x: front + s.nx * 1.5, z: s.z, r: 3.2, label: `出站 · ${this.exitName(e)}（${e.dir}）`, action: '出站', go: `exit:${e.entrance}` })
      this.spawns.set(`exit:${e.entrance}`, { x: front + s.nx * 2.5, z: s.z, facing: s.nx > 0 ? FACE.east : FACE.west })
    }
    glowBox(glow, s.x - 1.5, HALL.h - 0.1, s.z - 0.2, s.x + 1.5, HALL.h, s.z + 0.2, 0xffe08a)
  }

  private exitName(e: HallExit) {
    return e.ref ? `${e.ref} 号口` : '出口'
  }

  private exitSign(e: HallExit) {
    return textSign([{ text: `${this.exitName(e)} · ${e.dir}`, size: 0.5, bold: true, color: '#ffd23a' }, { text: e.ref ? `Exit ${e.ref}` : 'Exit', size: 0.32, color: '#ffe9a8' }], 4, 1.1, '#1b1d20')
  }

  private addCrowd(_b: Builder, _glow: GeoBuilder, crowd: Crowd) {
    const n = { full: 26, busy: 16, normal: 8, sparse: 2 }[crowd]
    const g = new GeoBuilder()
    for (let i = 0; i < n; i++) {
      const x = -26 + this.rng() * 52
      const z = -12 + this.rng() * 24
      if (Math.abs(z) < 1.5 || Math.abs(x) < 3) continue
      addPerson(g, x, z, this.rng() * Math.PI * 2, false, this.rng)
    }
    const m = toMesh(g.build(), this.mats.solid)
    if (m) this.scene.add(m)
  }
}

// ---------------------------------------------------------------- 站台

export interface PlatformInfo {
  name: string
  nameEn: string
  line: MetroLine
  structure: Structure
  type: PlatformType
  sides: PlatformSide[]
  /** 本站能换乘的其他线路 */
  transfers: MetroLine[]
  crowd: Crowd
  /** 高架站台的天空颜色 */
  sky: number
}

/** 列车停站时九个车门的位置（站台 z 方向，列车中心停在 0） */
export const DOOR_Z = [-15, 0, 15].flatMap((c) => [c - 4.5, c, c + 4.5])
const PLAT_LEN = 28
/** 列车进站、开门、关门出站的时长（现实秒） */
const ARRIVE_S = 3
const OPEN_S = 8
const LEAVE_S = 3.5

interface SideTrain {
  group: THREE.Group
  state: 'away' | 'arriving' | 'open' | 'leaving'
  timer: number
  call: TrainCall | null
  /** 下次查时刻表从这个时刻往后找 */
  after: number
  /** 列车开往的方向：+1 往 +z，-1 往 -z */
  dir: number
  doors: THREE.Mesh[]
  screen: Screen
}

/**
 * 站台。岛式：站台在中间（x ±4），两侧是轨道；侧式：两条轨道在中间，两边各一个站台，尽头有通道连起来。
 * 地下全高屏蔽门、有天花板；高架半高屏蔽门、雨棚，看得见天空和城市轮廓
 */
export class PlatformScene extends InteriorScene {
  readonly info: PlatformInfo
  /** 每一侧的轨道中心 x、站台边缘 x */
  readonly trackX: number[]
  readonly edgeX: number[]
  private readonly trains: SideTrain[] = []
  private readonly glassDoors: { mesh: THREE.Mesh; side: number; base: number; open: number }[] = []

  constructor(mats: InteriorMaterials, info: PlatformInfo, seed: number, arrived?: { side: number; call: TrainCall; t: number }) {
    const under = info.structure === 'tunnel'
    super(mats, under ? 0x1c1f24 : info.sky, seed, under ? 1 : 1.15)
    this.info = info
    const island = info.type === 'island'
    this.trackX = island ? [-6.3, 6.3] : [-2.1, 2.1]
    this.edgeX = island ? [-4, 4] : [-4.2, 4.2]
    const b = new Builder()
    const glow = new GeoBuilder()
    const color = hex(info.line.color)
    const L = PLAT_LEN
    const endZ = island ? L + 2 : L + 8
    // 站台面
    if (island) {
      b.box(-4, -0.2, -L - 2, 4, 0, endZ, 0xb7b2a8, { collide: false, windows: 0 })
      this.bounds = { x0: -3.6, z0: -L - 1.6, x1: 3.6, z1: endZ - 0.4 }
    } else {
      for (const s of [-1, 1]) b.box(s > 0 ? 4.2 : -10, -0.2, -L - 2, s > 0 ? 10 : -4.2, 0, L + 2, 0xb7b2a8, { collide: false, windows: 0 })
      // 尽头横穿轨道的通道
      b.box(-10, -0.2, L + 2, 10, 0, endZ, 0xb7b2a8, { collide: false, windows: 0 })
      b.box(-4.2, -1.2, L + 1.5, 4.2, 0, L + 2, 0x6b6f75, { windows: 0 })
      this.bounds = { x0: -9.6, z0: -L - 1.6, x1: 9.6, z1: endZ - 0.4 }
      // 两条轨道之间不能走：挡住
      b.colliders.push({ x0: -4.2, y0: 0, z0: -L - 2, x1: 4.2, y1: 3, z1: L + 2 })
    }
    // 黄色安全线
    for (const e of this.edgeX) b.box(e - 0.35 * Math.sign(e), 0, -L, e - 0.15 * Math.sign(e), 0.02, L, 0xe8c330, { collide: false, windows: 0 })
    // 轨道
    for (const x of this.trackX) {
      b.box(x - 2.1, -1.3, -L - 60, x + 2.1, -1.2, L + 60, 0x3a3c40, { collide: false, windows: 0 })
      for (const r of [-0.75, 0.75]) b.box(x + r - 0.08, -1.2, -L - 60, x + r + 0.08, -1.05, L + 60, 0x9aa0a6, { collide: false, windows: 0 })
    }
    // 屏蔽门：沿站台边缘，车门处是两扇能滑开的玻璃门；整条边缘挡人
    const doorH = under ? 2.4 : 1.6
    this.edgeX.forEach((e, side) => {
      b.colliders.push({ x0: e - 0.1, y0: 0, z0: -L, x1: e + 0.1, y1: 3, z1: L })
      for (let z = -L; z < L; z += 0.1) {
        // 门与门之间的固定玻璃和立柱
        const door = DOOR_Z.find((d) => Math.abs(z + 0.05 - d) < 0.8)
        if (door !== undefined) continue
        let z1 = z
        while (z1 < L && DOOR_Z.every((d) => Math.abs(z1 + 0.05 - d) >= 0.8)) z1 += 0.1
        b.box(e - 0.05, 0, z, e + 0.05, doorH, z1, 0xd8e8f0, { windows: 0, collide: false, glass: true })
        b.box(e - 0.08, 0, z, e + 0.08, doorH, z + 0.12, 0x9aa0a6, { windows: 0, collide: false })
        z = z1 - 0.1
      }
      if (under) {
        b.box(e - 0.12, doorH, -L, e + 0.12, 3.1, L, 0x2a2e33, { windows: 0, collide: false, bottom: true })
        b.box(e - 0.13 * Math.sign(e) - 0.01, doorH + 0.25, -L, e - 0.13 * Math.sign(e) + 0.01, doorH + 0.4, L, color, { windows: 0, collide: false })
      }
      for (const d of DOOR_Z) {
        for (const half of [-1, 1]) {
          const g = new GeoBuilder()
          g.box(-0.04, 0, -0.38, 0.04, doorH, 0.38, rgb(0xd8e8f0))
          const m = toMesh(g.build(), this.mats.glass)!
          m.position.set(e, 0, d + half * 0.4)
          this.scene.add(m)
          this.glassDoors.push({ mesh: m, side, base: d + half * 0.4, open: half * 0.75 })
        }
        glowBox(glow, e - 0.13, doorH - 0.12, d - 0.1, e + 0.13, doorH - 0.02, d + 0.1, 0x3ddc84)
      }
    })
    // 墙、天花板、雨棚
    const outer = island ? 9 : 10.4
    if (under) {
      for (const s of [-1, 1]) b.box(s > 0 ? outer : -outer - 0.4, -1.3, -L - 2, s > 0 ? outer + 0.4 : -outer, 4.6, endZ, 0xd2cdc3, { windows: 0 })
      b.box(-outer, 4.4, -L - 2, outer, 4.7, endZ, 0xe8e5de, { collide: 'camera', windows: 0, bottom: true })
      b.box(-outer, -1.3, -L - 2.4, outer, 4.6, -L - 2, 0xd2cdc3, { windows: 0 })
      b.box(-outer, 0, endZ, outer, 4.6, endZ + 0.4, 0xd2cdc3, { windows: 0 })
      for (let z = -L; z <= L; z += 3) glowBox(glow, -3, 4.3, z - 0.12, 3, 4.4, z + 0.12, 0xfdf6e3)
      if (!island) for (const s of [-1, 1]) for (let z = -L; z <= L; z += 3) glowBox(glow, s * 7 - 1.5, 4.3, z - 0.12, s * 7 + 1.5, 4.4, z + 0.12, 0xfdf6e3)
      // 轨道外侧墙上的站名和广告灯箱（岛式）
      if (island) {
        for (const s of [-1, 1]) {
          for (let z = -L + 6; z < L; z += 14) {
            this.place(this.nameBoard(), s * (outer - 0.02), 2.2, z, s > 0 ? -Math.PI / 2 : Math.PI / 2)
            glowBox(glow, s * (outer - 0.05) - 0.03, 1.2, z + 4, s * (outer - 0.05) + 0.03, 3, z + 7.5, [0xf28c28, 0x3a9ad9, 0xd94c7a, 0x5bb36b][Math.floor(this.rng() * 4)]!)
          }
        }
      }
    } else {
      // 高架：雨棚、外侧矮墙、地面远处的城市轮廓
      const canopy = island ? [[-4.6, 4.6]] : [[-10.6, -3.8], [3.8, 10.6]]
      for (const [a, c] of canopy) {
        b.box(a!, 4.2, -L - 2, c!, 4.45, endZ, 0xeef0f2, { collide: false, windows: 0, bottom: true })
        for (let z = -L; z <= L; z += 3) glowBox(glow, (a! + c!) / 2 - 1, 4.1, z - 0.1, (a! + c!) / 2 + 1, 4.2, z + 0.1, 0xfdf6e3)
        for (let z = -L; z <= L; z += 8) b.box((a! + c!) / 2 - 0.2, 0, z - 0.2, (a! + c!) / 2 + 0.2, 4.2, z + 0.2, 0xb9bec4, { windows: 0 })
      }
      if (!island) for (const s of [-1, 1]) b.box(s > 0 ? 10 : -10.3, 0, -L - 2, s > 0 ? 10.3 : -10, 1.2, endZ, 0xb9bec4, { windows: 0 })
      b.box(-400, -9.3, -400, 400, -9.1, 400, 0x8f9a7c, { collide: false, windows: 0 })
      for (let i = 0; i < 90; i++) {
        const a = this.rng() * Math.PI * 2
        const r = 60 + this.rng() * 200
        const w = 8 + this.rng() * 16
        const h = 6 + this.rng() * (r > 150 ? 70 : 30)
        const cx = Math.cos(a) * r
        const cz = Math.sin(a) * r
        b.box(cx - w / 2, -9.1, cz - w / 2, cx + w / 2, -9.1 + h, cz + w / 2, [0xbfb6a6, 0xa9b4bf, 0xc9c1b3, 0x8e9aa6][i % 4]!, { collide: false, windows: 0 })
      }
      // 桥面
      b.box(-outer - 0.5, -1.6, -L - 60, outer + 0.5, -1.3, L + 60, 0xaaa59c, { collide: false, windows: 0 })
      for (let z = -L - 60; z <= L + 60; z += 12) b.box(-2, -9.1, z - 0.8, 2, -1.6, z + 0.8, 0xaaa59c, { collide: false, windows: 0 })
      if (island) for (const s of [-1, 1]) for (let z = -L + 6; z < L; z += 14) this.place(this.nameBoard(), s * 3.9, 3.3, z, s > 0 ? -Math.PI / 2 : Math.PI / 2)
      else for (const s of [-1, 1]) for (let z = -L + 6; z < L; z += 14) this.place(this.nameBoard(), s * 10.35, 2.6, z, s > 0 ? -Math.PI / 2 : Math.PI / 2)
    }

    // 出站楼梯和换乘口
    const exitZ = island ? L - 2 : L + 6
    b.box(-2, 0, exitZ - 1, 2, 0.02, exitZ + 2, 0x30343a, { collide: false, windows: 0 })
    for (const s of [-2.2, 2]) b.box(s, 0, exitZ - 1.2, s + 0.2, 1.1, exitZ + 2, 0xb9bec4, { windows: 0 })
    b.box(-2.2, 0, exitZ - 1.2, 2.2, 1.1, exitZ - 1, 0xd8e8f0, { windows: 0, glass: true })
    this.place(textSign([{ text: '出站 · 换乘 ↑', size: 0.5, bold: true }, { text: 'Exit · Transfer', size: 0.32, color: '#e6ebf0' }], 4.4, 1.1, '#1f2a36'), 0, 3.4, exitZ - 1.3, Math.PI)
    this.point({ x: 0, z: exitZ - 2.6, r: 3, label: '出站 · 去站厅', action: '上楼', go: 'hall' })
    this.spawns.set('hall', { x: 0, z: exitZ - 3.5, facing: FACE.north })
    const tz = island ? -L + 2.5 : exitZ - 2.6
    info.transfers.forEach((t, i) => {
      const x = island ? (i - (info.transfers.length - 1) / 2) * 2.4 : (i % 2 ? 6.5 : -6.5)
      const z = island ? tz : tz - Math.floor(i / 2) * 3
      this.place(textSign([{ text: `换乘 ${t.name}`, size: 0.5, bold: true }, { text: `Transfer to ${t.nameEn}`, size: 0.32, color: '#e6ebf0' }], 2.3, 0.8, '#1f2a36', t.color), x, 3.1, z + (island ? -1.2 : 1.2), island ? 0 : Math.PI)
      b.box(x - 0.9, 0, z + (island ? -1.6 : 1.4), x + 0.9, 0.02, z + (island ? -0.4 : 1.8), hex(t.color), { collide: false, windows: 0 })
      this.point({ x, z, r: 1.6, label: `换乘 ${t.name}`, action: '换乘', go: `transfer:${t.id}` })
      this.spawns.set(`transfer:${t.id}`, { x, z: z + (island ? 1.5 : -1.5), facing: island ? FACE.south : FACE.north })
    })
    // 长椅、柱子
    if (island) {
      for (const z of [-12, 12]) b.box(-0.35, 0, z - 1.5, 0.35, 0.5, z + 1.5, 0x8a6a4a, { windows: 0 })
      if (under) for (const z of [-20, -6, 6, 20]) b.box(-0.4, 0, z - 0.4, 0.4, 4.4, z + 0.4, 0xcfcac0, { windows: 0 })
    }

    // 两侧的列车、方向牌和倒计时屏
    info.sides.forEach((side, i) => {
      const e = this.edgeX[i]!
      const inward = -Math.sign(e)
      const screen = this.place(new Screen(3.2, 0.8), e + inward * 1.2, 3.3, 0, inward > 0 ? Math.PI / 2 : -Math.PI / 2)
      for (const z of [-14, 14]) {
        this.place(
          textSign([{ text: `往 ${side.toward}`, size: 0.48, bold: true }, { text: `To ${side.towardEn}`, size: 0.32, color: '#e6ebf0' }], 3.2, 0.8, '#1f2a36', info.line.color),
          e + inward * 0.5,
          under ? 3.5 : 2.6,
          z,
          inward > 0 ? Math.PI / 2 : -Math.PI / 2
        )
      }
      const group = new THREE.Group()
      const dir = i === 0 ? 1 : -1
      ;(['head', 'middle', 'tail'] as const).forEach((kind, k) => {
        const car = new THREE.Mesh(carGeometry(kind, color), this.mats.solid)
        car.position.set(0, 0, -dir * k * (TRAIN.carLength + TRAIN.gap) + dir * 15)
        car.rotation.y = -Math.atan2(dir, 0)
        group.add(car)
      })
      // 列车车门（开门时露出的深色门洞）
      const doors: THREE.Mesh[] = []
      for (const d of DOOR_Z) {
        const g = new GeoBuilder()
        g.box(-0.05, 0.5, -0.65, 0.05, 3.2, 0.65, rgb(0x15181c))
        const m = toMesh(g.build(), this.mats.solid)!
        m.position.set(Math.sign(e - this.trackX[i]!) * (TRAIN.width / 2 + 0.03), 0, d)
        m.visible = false
        group.add(m)
        doors.push(m)
      }
      group.position.set(this.trackX[i]!, -0.75, 0)
      group.visible = false
      this.scene.add(group)
      this.trains.push({ group, state: 'away', timer: 0, call: null, after: -Infinity, dir, doors, screen })
    })
    // 刚下车：列车停在这一侧，开着门
    if (arrived) {
      const tr = this.trains[arrived.side]!
      tr.call = arrived.call
      tr.state = 'open'
      tr.timer = OPEN_S - 2.5
      tr.group.visible = true
      tr.group.position.z = 0
      this.setDoorsOpen(arrived.side, true)
      // 下车后站在车门边，面朝出站口
      this.spawns.set('train', { x: this.edgeX[arrived.side]! - Math.sign(this.edgeX[arrived.side]!) * 1.6, z: DOOR_Z[4]! + 1.6, facing: FACE.south })
    }

    // 候车的人
    const pg = new GeoBuilder()
    const n = { full: 30, busy: 18, normal: 9, sparse: 2 }[info.crowd]
    for (let k = 0; k < n; k++) {
      const side = k % this.edgeX.length
      const e = this.edgeX[side]!
      const x = e - Math.sign(e) * (0.9 + this.rng() * (island ? 2.4 : 4))
      const z = DOOR_Z[Math.floor(this.rng() * DOOR_Z.length)]! + (this.rng() - 0.5) * 2.5
      // 别站在玩家的出生点上
      if ([...this.spawns.values()].some((s) => Math.hypot(s.x - x, s.z - z) < 1.8)) continue
      addPerson(pg, x, z, e < 0 ? Math.PI : 0, false, this.rng)
    }
    const pm = toMesh(pg.build(), this.mats.solid)
    if (pm) this.scene.add(pm)
    this.add(b, glow)
  }

  private nameBoard() {
    return textSign([{ text: this.info.name, size: 0.56, bold: true }, { text: this.info.nameEn, size: 0.3, color: '#cfd6de' }], 4.2, 1.2, '#1f2a36', this.info.line.color)
  }

  /** 第 i 侧现在的状态：给界面显示 */
  sideStatus(i: number, t: number) {
    const tr = this.trains[i]
    const side = this.info.sides[i]
    if (!tr || !side) return null
    const call = tr.call ?? nextCall(side, Math.max(t, tr.after))
    return { toward: side.toward, state: tr.state, minutes: call ? Math.max(0, Math.ceil((call.arrive - t) / 60)) : null, arrive: call?.arrive ?? null }
  }

  /** 开着门的那一侧和它的车次（指定 side 时只看那一侧） */
  openSide(side?: number): { side: number; call: TrainCall } | null {
    const i = this.trains.findIndex((t, k) => (side === undefined || k === side) && t.state === 'open' && t.call)
    return i < 0 ? null : { side: i, call: this.trains[i]!.call! }
  }

  /** 离 x 最近的一侧 */
  nearestSide(x: number) {
    let best = 0
    this.edgeX.forEach((e, i) => {
      if (Math.abs(e - x) < Math.abs(this.edgeX[best]! - x)) best = i
    })
    return Math.min(best, this.trains.length - 1)
  }

  private setDoorsOpen(side: number, open: boolean) {
    const tr = this.trains[side]!
    for (const d of tr.doors) d.visible = open
    this.interact.removeOwner(`doors:${side}`)
    if (open && tr.call) {
      const e = this.edgeX[side]!
      const s = this.info.sides[side]!
      this.interact.add(
        `doors:${side}`,
        DOOR_Z.map((z) => ({ x: e - Math.sign(e) * 0.9, z, r: 1.7, label: `上车 · ${this.info.line.name} 往 ${s.toward}`, action: '上车', kind: 'interior' as const, go: `board:${side}` }))
      )
    }
  }

  update(dt: number, t: number) {
    const ease = (f: number) => 1 - (1 - f) ** 3
    this.trains.forEach((tr, i) => {
      const side = this.info.sides[i]!
      if (tr.state === 'away') {
        tr.call ??= nextCall(side, Math.max(t, tr.after))
        // 到站前 60 游戏秒（约 3 现实秒）开始进站
        if (tr.call && t >= tr.call.arrive - 60) {
          tr.state = 'arriving'
          tr.timer = 0
          tr.group.visible = true
        }
      } else if (tr.state === 'arriving') {
        tr.timer += dt
        const f = Math.min(1, tr.timer / ARRIVE_S)
        tr.group.position.z = -tr.dir * 130 * (1 - ease(f))
        if (f >= 1) {
          tr.state = 'open'
          tr.timer = 0
        }
      } else if (tr.state === 'open') {
        const was = tr.timer
        tr.timer += dt
        if (was < 0.6 && tr.timer >= 0.6) this.setDoorsOpen(i, true)
        if (tr.timer >= OPEN_S) {
          this.setDoorsOpen(i, false)
          tr.state = 'leaving'
          tr.timer = 0
        }
      } else {
        tr.timer += dt
        const f = Math.min(1, tr.timer / LEAVE_S)
        tr.group.position.z = tr.dir * 140 * f * f
        if (f >= 1) {
          tr.state = 'away'
          tr.group.visible = false
          tr.after = (tr.call?.arrive ?? t) + 1
          tr.call = null
        }
      }
      // 屏蔽门跟着车门开关
      const open = tr.state === 'open' && tr.timer >= 0.6 && tr.timer < OPEN_S
      for (const d of this.glassDoors) {
        if (d.side !== i) continue
        const target = d.base + (open ? d.open : 0)
        d.mesh.position.z += (target - d.mesh.position.z) * Math.min(1, dt * 6)
      }
      // 倒计时屏
      const st = this.sideStatus(i, t)
      const text = !st ? '' : tr.state === 'arriving' ? '列车进站' : tr.state === 'open' ? '请上车' : tr.state === 'leaving' ? '列车出站' : st.minutes === null ? '今日运营结束' : st.minutes <= 1 ? '即将进站' : `${st.minutes} 分钟`
      tr.screen.draw(`${side.toward}|${text}`, (ctx, W, H) => {
        ctx.fillStyle = '#0d1117'
        ctx.fillRect(0, 0, W, H)
        ctx.fillStyle = this.info.line.color
        ctx.fillRect(0, 0, H * 0.12, H)
        ctx.textBaseline = 'middle'
        ctx.font = `600 ${Math.round(H * 0.3)}px ${FONT}`
        ctx.fillStyle = '#e6ebf0'
        ctx.textAlign = 'left'
        ctx.fillText(fit(ctx, `往 ${side.toward}`, W * 0.5), H * 0.25, H / 2)
        ctx.font = `700 ${Math.round(H * 0.42)}px ${FONT}`
        ctx.fillStyle = '#ffb000'
        ctx.textAlign = 'right'
        ctx.fillText(text, W - H * 0.2, H / 2)
      })
    })
  }
}

// ---------------------------------------------------------------- 车厢

export interface CarInfo {
  line: MetroLine
  crowd: Crowd
}

/** 车厢：长 14、宽 3、高 2.4（docs/04 第 9 节），纵向座椅、扶杆，门上方是线路进度屏；窗外是隧道灯带或城市 */
export class CarScene extends InteriorScene {
  readonly info: CarInfo
  private readonly doorPanels: { mesh: THREE.Mesh; base: number; open: number }[] = []
  private doorsOpen = false
  private readonly tunnel = new THREE.Group()
  private readonly open = new THREE.Group()
  private readonly lights: THREE.Group
  private readonly city: THREE.Group
  private readonly stationsOut: { group: THREE.Group; sign: Screen[]; name: string }[] = []
  private readonly displays: Screen[] = []
  private readonly sky: THREE.Color

  constructor(mats: InteriorMaterials, info: CarInfo, seed: number) {
    super(mats, 0x07080a, seed)
    this.info = info
    this.sky = this.scene.background as THREE.Color
    const b = new Builder()
    const glow = new GeoBuilder()
    const color = hex(info.line.color)
    const HL = 7
    const HW = 1.5
    const H = 2.4
    this.bounds = { x0: -1.1, z0: -HL + 0.4, x1: 1.1, z1: HL - 0.4 }
    b.box(-HW, -0.2, -HL, HW, 0, HL, 0x8d8f91, { collide: false, windows: 0 })
    b.box(-HW, H, -HL, HW, H + 0.2, HL, 0xeef0f2, { collide: 'camera', windows: 0, bottom: true })
    glowBox(glow, -0.5, H - 0.06, -HL + 0.5, -0.3, H, HL - 0.5, 0xffffff)
    glowBox(glow, 0.3, H - 0.06, -HL + 0.5, 0.5, H, HL - 0.5, 0xffffff)
    // 两端墙（贯通道）
    for (const s of [-1, 1]) {
      const z = s * HL
      b.box(-HW, 0, s > 0 ? z : z - 0.2, HW, H, s > 0 ? z + 0.2 : z, 0xdfe2e5, { windows: 0 })
      b.box(-0.6, 0, s > 0 ? z - 0.02 : z, 0.6, 2, s > 0 ? z : z + 0.02, 0x2a2d31, { windows: 0, collide: false })
    }
    // 侧墙：窗下墙、窗间柱、窗上墙；车门处留洞，门扇另外做（右侧 x+ 的门到站会开）
    const doors = [-4.5, 0, 4.5]
    for (const s of [-1, 1]) {
      const x0 = s > 0 ? HW : -HW - 0.12
      const x1 = s > 0 ? HW + 0.12 : -HW
      let z = -HL
      for (const d of [...doors, HL + 0.65]) {
        const a = d - 0.65
        if (a > z) {
          b.box(x0, 0, z, x1, 0.9, a, 0xdfe2e5, { windows: 0 })
          b.box(x0, 1.9, z, x1, H, a, 0xdfe2e5, { windows: 0 })
          b.box(x0, 0.9, z, x1, 1.9, z + 0.15, 0xdfe2e5, { windows: 0 })
          b.box(x0, 0.9, a - 0.15, x1, 1.9, a, 0xdfe2e5, { windows: 0 })
          b.box(x0 + 0.04, 0.9, z + 0.15, x1 - 0.04, 1.9, a - 0.15, 0xc8d8e8, { windows: 0, collide: false, glass: true })
          b.box(s > 0 ? HW - 0.01 : -HW - 0.02, 0.86, z, s > 0 ? HW + 0.02 : -HW + 0.01, 0.92, a, color, { windows: 0, collide: false })
        }
        z = d + 0.65
      }
      for (const d of doors) {
        b.box(x0, 2.05, d - 0.65, x1, H, d + 0.65, 0xdfe2e5, { windows: 0, collide: false })
        b.colliders.push({ x0: s > 0 ? HW - 0.05 : -HW - 0.12, y0: 0, z0: d - 0.65, x1: s > 0 ? HW + 0.12 : -HW + 0.05, y1: 2.1, z1: d + 0.65 })
        for (const half of [-1, 1]) {
          const g = new GeoBuilder()
          g.box(-0.04, 0, -0.33, 0.04, 2.05, 0.33, rgb(0xcfd3d7))
          g.box(-0.05, 0.85, -0.25, 0.05, 1.85, 0.25, rgb(0x6f8597))
          const m = toMesh(g.build(), this.mats.solid)!
          m.position.set(s * (HW + 0.04), 0, d + half * 0.33)
          this.scene.add(m)
          if (s > 0) this.doorPanels.push({ mesh: m, base: d + half * 0.33, open: half * 0.66 })
        }
        // 门上方的线路进度屏
        const scr = this.place(new Screen(1.3, 0.28, 220), s * (HW - 0.02), 2.22, d, s > 0 ? -Math.PI / 2 : Math.PI / 2)
        this.displays.push(scr)
      }
      // 纵向座椅（门与门之间）
      for (const [a, c] of [
        [-HL + 0.3, -5.25],
        [-3.75, -0.75],
        [0.75, 3.75],
        [5.25, HL - 0.3]
      ] as const) {
        const sx0 = s > 0 ? HW - 0.5 : -HW
        b.box(sx0, 0, a, sx0 + 0.5, 0.45, c, 0x6f7f8f, { windows: 0, collide: false, top: color })
        b.box(s > 0 ? HW - 0.1 : -HW, 0.45, a, s > 0 ? HW : -HW + 0.1, 0.9, c, 0x6f7f8f, { windows: 0, collide: false })
        b.colliders.push({ x0: sx0, y0: 0, z0: a, x1: sx0 + 0.5, y1: 0.6, z1: c })
      }
    }
    // 扶杆、横杆和拉环
    for (const d of doors) for (const x of [-0.45, 0.45]) b.box(x - 0.03, 0, d - 0.03, x + 0.03, H, d + 0.03, 0xd0d4d8, { windows: 0, collide: false })
    for (const x of [-0.75, 0.75]) {
      b.box(x - 0.025, 2.0, -HL + 0.3, x + 0.025, 2.05, HL - 0.3, 0xd0d4d8, { windows: 0, collide: false, bottom: true })
      for (let z = -HL + 0.6; z < HL - 0.3; z += 0.5) b.box(x - 0.06, 1.72, z - 0.04, x + 0.06, 1.85, z + 0.04, 0xf2f2f2, { windows: 0, collide: false, bottom: true })
    }
    this.add(b, glow)
    this.spawns.set('board', { x: 0.3, z: 1.6, facing: FACE.north })

    // 窗外：隧道（墙、灯带）
    const tb = new GeoBuilder()
    for (const s of [-1, 1]) tb.box(s > 0 ? 3.2 : -3.5, -1.5, -80, s > 0 ? 3.5 : -3.2, 4, 80, rgb(0x2a2c2f))
    tb.box(-3.5, 3.6, -80, 3.5, 4, 80, rgb(0x232527))
    tb.bottom(-3.5, 3.6, -80, 3.5, 80, rgb(0x232527))
    const tm = toMesh(tb.build(), this.mats.solid)!
    this.tunnel.add(tm)
    const lb = new GeoBuilder()
    for (let z = -84; z <= 84; z += 6) for (const s of [-1, 1]) lb.box(s * 3.15 - 0.03, 1.5, z - 1, s * 3.15 + 0.03, 1.62, z + 1, rgb(0xfff2c4))
    this.lights = new THREE.Group()
    this.lights.add(toMesh(lb.build(), this.mats.glow)!)
    this.tunnel.add(this.lights)
    this.scene.add(this.tunnel)
    // 窗外：高架段（地面、城市方块）
    const ob = new GeoBuilder()
    ob.box(-500, -9.3, -500, 500, -9.1, 500, rgb(0x8f9a7c))
    const om = toMesh(ob.build(), this.mats.solid)!
    this.open.add(om)
    // 城市方块按 480 格周期铺两遍，滚动时接缝看不出来
    const cb = new GeoBuilder()
    for (let i = 0; i < 90; i++) {
      const s = i % 2 ? 1 : -1
      const x = s * (14 + this.rng() * 120)
      const z = -240 + this.rng() * 480
      const w = 6 + this.rng() * 12
      const h = 5 + this.rng() * 40
      for (const k of [0, -480]) cb.box(x - w / 2, -9.1, z + k - w / 2, x + w / 2, -9.1 + h, z + k + w / 2, rgb([0xbfb6a6, 0xa9b4bf, 0xc9c1b3, 0x8e9aa6][i % 4]!))
    }
    this.city = new THREE.Group()
    this.city.add(toMesh(cb.build(), this.mats.solid)!)
    this.open.add(this.city)
    this.open.visible = false
    this.scene.add(this.open)
    // 窗外的车站站台（出发站、到达站各一个，按位置滑进滑出）
    for (let k = 0; k < 2; k++) {
      const group = new THREE.Group()
      const sb = new Builder()
      sb.box(HW + 0.15, -0.3, -26, 6, 0, 26, 0xb7b2a8, { collide: false, windows: 0 })
      sb.box(5.9, 0, -26, 6.2, 3.4, 26, 0xd2cdc3, { collide: false, windows: 0 })
      const built = sb.build()
      group.add(toMesh(built.solid, this.mats.solid)!)
      const signs: Screen[] = []
      for (const z of [-14, 0, 14]) signs.push(this.place(new Screen(3.6, 1), 5.88, 1.8, z, -Math.PI / 2, group))
      group.visible = false
      this.scene.add(group)
      this.stationsOut.push({ group, sign: signs, name: '' })
    }

    // 乘客
    const pg = new GeoBuilder()
    const seats: [number, number][] = []
    for (const s of [-1, 1])
      for (const [a, c] of [
        [-HL + 0.3, -5.25],
        [-3.75, -0.75],
        [0.75, 3.75],
        [5.25, HL - 0.3]
      ] as const)
        for (let z = a + 0.3; z < c - 0.2; z += 0.55) seats.push([s * (HW - 0.32), z])
    const fill = { full: 1, busy: 1, normal: 0.6, sparse: 0.1 }[info.crowd]
    const standing = { full: 14, busy: 5, normal: 0, sparse: 0 }[info.crowd]
    for (const [x, z] of seats) if (this.rng() < fill && Math.abs(z) > 0.9) addPerson(pg, x, z, x > 0 ? Math.PI : 0, true, this.rng)
    for (let k = 0; k < standing; k++) {
      const z = -6 + this.rng() * 12
      const x = (this.rng() - 0.5) * 1.2
      if (Math.hypot(x - 0.3, z - 1.6) < 1.3) continue
      addPerson(pg, x, z, this.rng() * Math.PI * 2, false, this.rng)
    }
    const pm = toMesh(pg.build(), this.mats.solid)
    if (pm) this.scene.add(pm)
  }

  setDoors(open: boolean) {
    this.doorsOpen = open
    this.interact.removeOwner('doors')
    if (open) this.interact.add('doors', [-4.5, 0, 4.5].map((z) => ({ x: 1.0, z, r: 1.2, label: '下车', action: '下车', kind: 'interior' as const, go: 'alight' })))
  }

  /** 窗外是隧道还是高架；高架时天空颜色跟着时间 */
  setOutside(kind: 'tunnel' | 'open', sky: number) {
    this.tunnel.visible = kind === 'tunnel'
    this.open.visible = kind === 'open'
    this.sky.setHex(kind === 'tunnel' ? 0x07080a : sky)
  }

  /** 窗外景物的滚动量（格）：灯带、城市按它往车尾方向（+z）移动 */
  setScroll(s: number) {
    this.lights.position.z = s % 6
    this.city.position.z = ((s % 480) + 480) % 480
  }

  /** 窗外的站台：k = 0 出发站、1 到达站；z 是站台中心相对车厢的位置，null 是不显示 */
  setStationOutside(k: number, name: string, nameEn: string, color: string, z: number | null) {
    const st = this.stationsOut[k]!
    st.group.visible = z !== null && Math.abs(z) < 90
    if (z === null) return
    st.group.position.z = z
    if (st.name !== name) {
      st.name = name
      for (const s of st.sign)
        s.draw(name, (ctx, W, H) => {
          ctx.fillStyle = '#1f2a36'
          ctx.fillRect(0, 0, W, H)
          ctx.fillStyle = color
          ctx.fillRect(0, 0, H * 0.12, H)
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillStyle = '#fff'
          ctx.font = `700 ${Math.round(H * 0.42)}px ${FONT}`
          ctx.fillText(fit(ctx, name, W * 0.9), W / 2, H * 0.38)
          ctx.font = `500 ${Math.round(H * 0.22)}px ${FONT}`
          ctx.fillStyle = '#cfd6de'
          ctx.fillText(fit(ctx, nameEn, W * 0.9), W / 2, H * 0.76)
        })
    }
  }

  /** 门上的进度屏：前后各几站，高亮下一站（或本站） */
  setDisplay(stops: string[], cur: number, atStation: boolean) {
    const key = `${cur}|${atStation}`
    const color = this.info.line.color
    for (const d of this.displays) {
      d.draw(key, (ctx, W, H) => {
        ctx.fillStyle = '#0d1117'
        ctx.fillRect(0, 0, W, H)
        const from = Math.max(0, cur - 1)
        const show = stops.slice(from, from + 5)
        const y = H * 0.35
        ctx.fillStyle = color
        ctx.fillRect(W * 0.06, y - H * 0.05, W * 0.88, H * 0.1)
        show.forEach((name, i) => {
          const k = from + i
          const x = W * 0.1 + (show.length > 1 ? (i * W * 0.8) / (show.length - 1) : W * 0.4)
          const hot = k === cur
          ctx.beginPath()
          ctx.arc(x, y, H * (hot ? 0.13 : 0.09), 0, Math.PI * 2)
          ctx.fillStyle = k < cur || (k === cur && atStation) ? '#6b7077' : hot ? '#ffb000' : '#ffffff'
          ctx.fill()
          ctx.font = `${hot ? 700 : 500} ${Math.round(H * 0.24)}px ${FONT}`
          ctx.fillStyle = hot ? '#ffb000' : '#cfd6de'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(fit(ctx, name, W * 0.19), x, H * 0.75)
        })
        ctx.font = `600 ${Math.round(H * 0.2)}px ${FONT}`
        ctx.fillStyle = '#e6ebf0'
        ctx.textAlign = 'left'
        ctx.fillText(atStation ? '本站' : '下一站', W * 0.02, H * 0.12)
      })
    }
  }

  update(dt: number) {
    for (const p of this.doorPanels) {
      const target = p.base + (this.doorsOpen ? p.open : 0)
      p.mesh.position.z += (target - p.mesh.position.z) * Math.min(1, dt * 5)
    }
  }
}

// ---------------------------------------------------------------- 换乘通道

/** 换乘通道：一段走廊，地面有目标线路色的导向条 */
export class CorridorScene extends InteriorScene {
  constructor(mats: InteriorMaterials, from: MetroLine, to: MetroLine, seed: number) {
    super(mats, 0x22252a, seed)
    const b = new Builder()
    const glow = new GeoBuilder()
    const L = 20
    const W = 2.6
    const H = 3.2
    this.bounds = { x0: -W + 0.4, z0: -L + 0.4, x1: W - 0.4, z1: L - 0.4 }
    b.box(-W, -0.2, -L, W, 0, L, 0xa8a49b, { collide: false, windows: 0 })
    b.box(-0.4, 0, -L + 1, 0.4, 0.02, L - 1, hex(to.color), { collide: false, windows: 0 })
    for (const s of [-1, 1]) b.box(s > 0 ? W : -W - 0.3, 0, -L, s > 0 ? W + 0.3 : -W, H, L, 0xdcd8cf, { windows: 0 })
    b.box(-W, 0, -L - 0.3, W, H, -L, 0xdcd8cf, { windows: 0 })
    b.box(-W, 0, L, W, H, L + 0.3, 0xdcd8cf, { windows: 0 })
    b.box(-W, H, -L, W, H + 0.2, L, 0xe8e5de, { collide: 'camera', windows: 0, bottom: true })
    for (let z = -L + 2; z < L; z += 3) glowBox(glow, -1.2, H - 0.06, z - 0.12, 1.2, H, z + 0.12, 0xfdf6e3)
    for (const z of [-8, 8]) for (const s of [-1, 1]) this.place(textSign([{ text: `换乘 ${to.name} →`, size: 0.5, bold: true }, { text: `Transfer to ${to.nameEn}`, size: 0.32, color: '#e6ebf0' }], 3, 0.9, '#1f2a36', to.color), s * (W - 0.02), 2.2, z, s > 0 ? -Math.PI / 2 : Math.PI / 2)
    this.place(textSign([{ text: `${to.name} 站台`, size: 0.5, bold: true }, { text: to.nameEn, size: 0.32 }], 3, 0.9, '#1f2a36', to.color), 0, 2.4, L - 0.02, Math.PI)
    this.place(textSign([{ text: `返回 ${from.name}`, size: 0.5, bold: true }, { text: from.nameEn, size: 0.32 }], 3, 0.9, '#1f2a36', from.color), 0, 2.4, -L + 0.02, 0)
    this.point({ x: 0, z: L - 1.8, r: 2.4, label: `换乘 ${to.name} 站台`, action: '前往', go: `platform:${to.id}` })
    this.point({ x: 0, z: -L + 1.8, r: 2.4, label: `返回 ${from.name} 站台`, action: '返回', go: `platform:${from.id}` })
    this.spawns.set('start', { x: 0, z: -L + 3.5, facing: FACE.south })
    this.add(b, glow)
  }
}

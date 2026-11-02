// 路人（docs/02 第 5 节 NPCManager）：在玩家周围的人行道上生成、走路、离远了回收；骑手在车道上骑电动车，
// 有人遛狗，傍晚公园里跳广场舞，周末人民公园有相亲角。所有人的每个身体部件各是一个 InstancedMesh（一共十来次绘制）
import * as THREE from 'three/webgpu'
import type { NpcContent, NpcLine, NpcType } from '../city.ts'
import type { CollisionWorld } from '../geo/CollisionWorld.ts'
import type { Projection } from '../geo/projection.ts'
import type { WeatherKind, WeatherLook } from '../sky/weather.ts'
import { chunkKey, chunkOf } from '../world/chunks.ts'
import { isWater } from '../world/queries.ts'
import type { WorldData } from '../world/WorldData.ts'

const MAX = 90
const SKIN = [0xf0c8a0, 0xe0b48c, 0xc99a74, 0xf5d5b5]
/** 离玩家多远之外回收（格） */
const FAR = 95
/** 比这短的路段（多半是道路被分块边界切下的一小截）不生成路人：走两步就到头，只能来回折返（格） */
const MIN_ROUTE = 20
/** 骑手掉头后并到对面车道的横向速度（格/秒） */
const LANE_SPEED = 2

type Kind = 'walk' | 'ride' | 'dog' | 'dance' | 'stand' | 'photo'

interface Npc {
  id: number
  type: NpcType
  kind: Kind
  x: number
  z: number
  facing: number
  speed: number
  /** 沿路段走：off 是离路中线的横向偏移（前进方向右侧为正），lane 是要并过去的偏移 */
  route: { pts: number[]; seg: number; t: number; dir: 1 | -1; off: number; lane: number } | null
  phase: number
  shirt: number
  pants: number
  skin: number
  hair: number
  umbrella: boolean
  /** 正在聊天或摆姿势：停下来面朝 face */
  hold: number
  face: number
  /** 跳舞、相亲角这类成组的人：组名 */
  group: string | null
}

/** 和玩家说话的结果 */
export interface Talk {
  /** 路人类型 id */
  type: string
  name: string
  speech: NpcType['speech']
  line: NpcLine
}

const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)]!

// 一个部件的几何：中心在 (0, cy, 0)；四肢的转轴放在顶端（y = 0），往下长
function part(w: number, h: number, d: number, cy: number) {
  const g = new THREE.BoxGeometry(w, h, d)
  g.translate(0, cy, 0)
  return g
}

// 路段（每个点 x, z, y 三个数）的水平长度
function pieceLength(pts: number[]) {
  let s = 0
  for (let i = 3; i < pts.length; i += 3) s += Math.hypot(pts[i]! - pts[i - 3]!, pts[i + 1]! - pts[i - 2]!)
  return s
}

// 第 k 段的右手法线（x 东、z 南时前进方向右侧是 (-dz, dx)）
function segNormal(pts: number[], k: number): [number, number] {
  const dx = pts[k * 3 + 3]! - pts[k * 3]!
  const dz = pts[k * 3 + 4]! - pts[k * 3 + 1]!
  const len = Math.hypot(dx, dz) || 1
  return [-dz / len, dx / len]
}

// 第 i 个点处的偏移方向：两头的点用所在段的法线；拐角用两段法线的角平分线，
// 拉长到离两段的距离都是 1（斜接），急弯最多拉长到 2 倍
function vertexNormal(pts: number[], i: number): [number, number] {
  const last = pts.length / 3 - 1
  const a = segNormal(pts, Math.max(0, i - 1))
  const b = segNormal(pts, Math.min(last - 1, i))
  const x = a[0] + b[0]
  const z = a[1] + b[1]
  const len = Math.hypot(x, z)
  if (len < 1e-6) return a
  const k = 1 / Math.max(0.5, (x * a[0] + z * a[1]) / len) / len
  return [x * k, z * k]
}

export class NPCManager {
  readonly root = new THREE.Group()
  private readonly npcs: Npc[] = []
  private readonly parts: Record<string, THREE.InstancedMesh>
  private readonly m = new THREE.Matrix4()
  private readonly q = new THREE.Matrix4()
  private readonly c = new THREE.Color()
  private nextId = 1
  private readonly world: WorldData
  private readonly collision: CollisionWorld
  private readonly content: NpcContent
  private readonly matchAt: [number, number]
  /** 景点中心（游客多、会有人拍照） */
  private hotspots: [number, number][] = []
  /** 摆姿势（拍照模式）：相机位置、玩家位置（玩家 9 格内的人摆姿势） */
  private posing: { cam: THREE.Vector3; x: number; z: number } | null = null
  /** 目标人数（画质决定） */
  target = 40

  constructor(content: NpcContent, world: WorldData, collision: CollisionWorld, proj: Projection) {
    this.content = content
    this.world = world
    this.collision = collision
    const p = proj.project(content.matchmaking.lat, content.matchmaking.lon)
    this.matchAt = [p.x, p.z]
    this.root.name = 'npcs'
    const mat = new THREE.MeshLambertMaterial()
    const mk = (g: THREE.BufferGeometry, color = 0xffffff) => {
      const im = new THREE.InstancedMesh(g, color === 0xffffff ? mat : new THREE.MeshLambertMaterial({ color }), MAX)
      im.count = 0
      im.frustumCulled = false
      // 人身上的部件每个实例各有颜色；车、手机这种固定颜色的不建实例颜色（否则没设过的实例是黑的）
      if (color === 0xffffff) im.setColorAt(0, this.c.setHex(0xffffff))
      this.root.add(im)
      return im
    }
    this.parts = {
      legL: mk(part(0.22, 0.82, 0.24, -0.41)),
      legR: mk(part(0.22, 0.82, 0.24, -0.41)),
      body: mk(part(0.5, 0.62, 0.28, 0)),
      armL: mk(part(0.17, 0.62, 0.17, -0.31)),
      armR: mk(part(0.17, 0.62, 0.17, -0.31)),
      head: mk(part(0.42, 0.42, 0.42, 0)),
      hair: mk(part(0.44, 0.14, 0.44, 0)),
      umbrella: mk(part(1.4, 0.1, 1.4, 0)),
      pole: mk(part(0.05, 1.0, 0.05, 0.5), 0x3a3a3a),
      bike: mk(part(0.3, 0.55, 1.5, 0.45), 0x2a2d31),
      crate: mk(part(0.55, 0.5, 0.55, 0), 0xf2c14e),
      dog: mk(part(0.32, 0.32, 0.65, 0)),
      phone: mk(part(0.08, 0.16, 0.04, 0), 0x15181c)
    }
    // 部件按名字可查（调试、测试用）
    for (const [k, im] of Object.entries(this.parts)) im.name = k
  }

  /** 景点中心：附近多生成游客和拍照的人 */
  setHotspots(points: [number, number][]) {
    this.hotspots = points
  }

  get count() {
    return this.npcs.length
  }

  // ---------------------------------------------------------------- 生成

  private typeWeights(x: number, z: number, h: number) {
    const near = this.hotspots.some(([hx, hz]) => Math.hypot(hx - x, hz - z) < 260)
    const w = new Map<NpcType, number>()
    for (const t of this.content.types) {
      if (t.kind === 'dance' || t.kind === 'stand') continue
      let v = 1
      if (t.id === 'tourist') v = near ? 4 : 0.8
      if (t.id === 'foreigner') v = near ? 2 : 0.3
      if (t.id === 'office') v = h >= 7.5 && h < 20 ? 2 : 0.4
      if (t.id === 'student') v = h >= 7 && h < 21 ? 1 : 0.2
      if (t.id === 'rider') v = 0.8
      if (t.id === 'dogwalker') v = h < 9 || h >= 18 ? 1.2 : 0.4
      if (t.id === 'klaoke') v = 0.3
      w.set(t, v)
    }
    let total = 0
    for (const v of w.values()) total += v
    let r = Math.random() * total
    for (const [t, v] of w) {
      r -= v
      if (r < 0) return t
    }
    return this.content.types[0]!
  }

  private dress(n: Pick<Npc, 'type'>) {
    const t = n.type
    return { shirt: pick(t.shirts), pants: pick(t.pants), skin: pick(SKIN), hair: pick(t.hair) }
  }

  private clear(x: number, z: number) {
    return !isWater(this.world, x, z) && !this.collision.query(x - 0.3, z - 0.3, x + 0.3, z + 0.3).some((b) => !b.soft && b.y0 < 1.5 && b.y1 > 0.2)
  }

  // 沿附近的地面道路找个人行道上的位置（骑手在车道上），离玩家 minD–70 格
  private spawnWalker(px: number, pz: number, minD: number, h: number, rain: boolean) {
    const keys: string[] = []
    const cx = chunkOf(px)
    const cz = chunkOf(pz)
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) keys.push(chunkKey(cx + dx, cz + dz))
    const pieces = keys.flatMap((k) => this.world.roads.chunks[k] ?? [])
    if (!pieces.length) return
    for (let attempt = 0; attempt < 16; attempt++) {
      const [idx, pts] = pick(pieces)
      const info = this.world.roads.roads[idx]!
      if (info.level > 0 || info.bridge || info.class === 'motorway' || info.class.endsWith('_link') || pts.length < 6 || pieceLength(pts) < MIN_ROUTE) continue
      const seg = Math.floor(Math.random() * (pts.length / 3 - 1))
      const t = Math.random()
      const type = this.typeWeights(px, pz, h)
      const ride = type.kind === 'ride'
      const side = Math.random() < 0.5 ? 1 : -1
      const off = side * (ride ? Math.max(0.8, info.width / 2 - 1.2) : info.width / 2 + 2)
      const p = this.at(pts, seg, t, off)
      const d = Math.hypot(p[0] - px, p[1] - pz)
      if (d < minD || d > 70 || !this.clear(p[0], p[1])) continue
      // 右侧通行：偏到右边的往前走
      const dir: 1 | -1 = ride ? (side > 0 ? 1 : -1) : Math.random() < 0.5 ? 1 : -1
      const kind: Kind = type.kind === 'dog' ? 'dog' : ride ? 'ride' : 'walk'
      const speed = ride ? 6 + Math.random() * 1.5 : (type.old ? 1 : 1.3) + Math.random() * 0.35
      const n: Npc = { id: this.nextId++, type, kind, x: p[0], z: p[1], facing: 0, speed, route: { pts, seg, t, dir, off, lane: off }, phase: Math.random() * 6, ...this.dress({ type }), umbrella: rain && !ride && Math.random() < 0.85, hold: 0, face: 0, group: null }
      this.npcs.push(n)
      return
    }
  }

  // 景点附近拍照的游客：站着，举手机对着景点
  private spawnPhotographer(px: number, pz: number) {
    const near = this.hotspots.filter(([hx, hz]) => Math.hypot(hx - px, hz - pz) < 180)
    if (!near.length) return
    const [hx, hz] = pick(near)
    for (let k = 0; k < 6; k++) {
      const a = Math.random() * Math.PI * 2
      const r = 30 + Math.random() * 40
      const x = hx + Math.cos(a) * r
      const z = hz + Math.sin(a) * r
      if (Math.hypot(x - px, z - pz) < 15 || Math.hypot(x - px, z - pz) > 70 || !this.clear(x, z)) continue
      const type = this.content.types.find((t) => t.id === (Math.random() < 0.3 ? 'foreigner' : 'tourist')) ?? this.content.types[0]!
      const facing = Math.atan2(-(hx - x), -(hz - z))
      this.npcs.push({ id: this.nextId++, type, kind: 'photo', x, z, facing, speed: 0, route: null, phase: 0, ...this.dress({ type }), umbrella: false, hold: 0, face: 0, group: null })
      return
    }
  }

  // 成组的人：广场舞（傍晚公园里）、相亲角（周末人民公园）
  private spawnGroup(group: string, typeId: string, cx: number, cz: number, n: number, umbrella: boolean) {
    const type = this.content.types.find((t) => t.id === typeId)
    if (!type) return
    const cols = Math.ceil(Math.sqrt(n * 2))
    for (let i = 0; i < n; i++) {
      const x = cx + ((i % cols) - (cols - 1) / 2) * 1.6
      const z = cz + Math.floor(i / cols) * 1.8
      if (!this.clear(x, z)) continue
      this.npcs.push({ id: this.nextId++, type, kind: type.kind === 'dance' ? 'dance' : 'stand', x, z, facing: 0, speed: 0, route: null, phase: 0, ...this.dress({ type }), umbrella, hold: 0, face: 0, group })
    }
  }

  // 附近公园里离玩家 20–80 格的一个点
  private parkSpot(px: number, pz: number): [number, number] | null {
    const pieces = this.world.chunk(chunkKey(chunkOf(px), chunkOf(pz))).parks
    for (const p of pieces) {
      const ring = p.polygon[0]!
      let sx = 0
      let sz = 0
      const n = ring.length / 2
      for (let i = 0; i < ring.length; i += 2) {
        sx += ring[i]!
        sz += ring[i + 1]!
      }
      const x = sx / n
      const z = sz / n
      const d = Math.hypot(x - px, z - pz)
      if (d > 20 && d < 80 && this.clear(x, z)) return [x, z]
    }
    return null
  }

  // 路段上第 seg 段、比例 t 处往右偏 off 的点。偏移方向在段的两个端点之间插值，
  // 拐角处两段共用同一个方向，人走过拐弯不会跳一下
  private at(pts: number[], seg: number, t: number, off: number): [number, number] {
    const ax = pts[seg * 3]!
    const az = pts[seg * 3 + 1]!
    const bx = pts[seg * 3 + 3]!
    const bz = pts[seg * 3 + 4]!
    const [nax, naz] = vertexNormal(pts, seg)
    const [nbx, nbz] = vertexNormal(pts, seg + 1)
    return [ax + (bx - ax) * t + (nax + (nbx - nax) * t) * off, az + (bz - az) * t + (naz + (nbz - naz) * t) * off]
  }

  // ---------------------------------------------------------------- 每帧

  /**
   * 每帧：px, pz 是玩家位置；h 是当天小时；weather、look 当前天气；weekend 现实是不是周末。
   * 只在城市场景里调用
   */
  update(dt: number, px: number, pz: number, h: number, weather: WeatherKind, look: WeatherLook, weekend: boolean) {
    // 回收太远的
    for (let i = this.npcs.length - 1; i >= 0; i--) {
      const n = this.npcs[i]!
      if (Math.hypot(n.x - px, n.z - pz) > FAR) this.npcs.splice(i, 1)
    }
    // 人数：深夜少，下雨、台风、下雪少
    const night = h < 6 || h >= 23 ? 0.25 : h >= 21 ? 0.6 : 1
    const bad = weather === 'typhoon' ? 0.35 : look.rain > 0.2 ? 0.7 : look.snow > 0.2 ? 0.6 : 1
    const want = Math.round(this.target * night * bad)
    const rain = look.rain > 0.2 || look.snow > 0.2
    const loose = this.npcs.filter((n) => !n.group).length
    // 开局一次铺满，之后每帧最多补两个（从视野外补）
    const first = this.npcs.length === 0
    // 拍照的游客最多 6 个，其余是走路的
    const photos = this.npcs.filter((n) => n.kind === 'photo').length
    for (let k = 0; k < (first ? want : 2) && loose + k < want; k++) {
      if (photos < 6 && !rain && Math.random() < 0.12) this.spawnPhotographer(px, pz)
      else this.spawnWalker(px, pz, first ? 8 : 28, h, rain)
    }
    // 广场舞：18:30–21:00 不下雨，附近公园里一组
    const dancing = h >= 18.5 && h < 21 && !rain
    const dance = this.npcs.some((n) => n.group === 'dance')
    if (dancing && !dance) {
      const spot = this.parkSpot(px, pz)
      if (spot) this.spawnGroup('dance', 'dancer', spot[0], spot[1], 10, false)
    } else if (!dancing && dance) this.removeGroup('dance')
    // 相亲角：周末 11–17 点，人民公园东侧，撑着伞（伞上挂着子女的资料）
    const matching = weekend && h >= 11 && h < 17 && Math.hypot(this.matchAt[0] - px, this.matchAt[1] - pz) < 110
    const match = this.npcs.some((n) => n.group === 'match')
    if (matching && !match) this.spawnGroup('match', 'matchmaker', this.matchAt[0], this.matchAt[1], 12, true)
    else if (!matching && match) this.removeGroup('match')

    for (const n of this.npcs) this.step(n, dt, px, pz)
    this.render()
  }

  private removeGroup(g: string) {
    for (let i = this.npcs.length - 1; i >= 0; i--) if (this.npcs[i]!.group === g) this.npcs.splice(i, 1)
  }

  private step(n: Npc, dt: number, px: number, pz: number) {
    n.phase += dt * (n.kind === 'ride' ? 0 : n.kind === 'dance' ? 3.2 : n.speed * 2.6)
    const pose = this.posing && n.kind !== 'ride' && Math.hypot(n.x - px, n.z - pz) < 9
    if (pose && this.posing) {
      n.face = Math.atan2(-(this.posing.cam.x - n.x), -(this.posing.cam.z - n.z))
      n.facing = n.face
      return
    }
    if (n.hold > 0) {
      n.hold -= dt
      n.facing = n.face
      return
    }
    const r = n.route
    if (!r) return
    let left = n.speed * dt
    while (left > 0) {
      const pts = r.pts
      const ax = pts[r.seg * 3]!
      const az = pts[r.seg * 3 + 1]!
      const bx = pts[r.seg * 3 + 3]!
      const bz = pts[r.seg * 3 + 4]!
      const len = Math.hypot(bx - ax, bz - az) || 0.01
      const dtT = left / len
      if (r.dir > 0 ? r.t + dtT <= 1 : r.t - dtT >= 0) {
        r.t += r.dir * dtT
        left = 0
      } else {
        left -= (r.dir > 0 ? 1 - r.t : r.t) * len
        const next = r.seg + r.dir
        if (next < 0 || next >= pts.length / 3 - 1) {
          // 走到路的尽头掉头：行人顺着原来的人行道往回走；骑手要靠右，掉头后慢慢并到对面车道。
          // 不能直接把人挪到马路另一边，短路段上会每隔一两秒在两边来回闪
          r.dir = r.dir > 0 ? -1 : 1
          r.t = r.dir > 0 ? 0 : 1
          if (n.kind === 'ride') r.lane = -r.lane
          left = 0
        } else {
          r.seg = next
          r.t = r.dir > 0 ? 0 : 1
        }
      }
    }
    // 并道：横向每秒最多挪 LANE_SPEED 格
    const shift = Math.max(-LANE_SPEED * dt, Math.min(LANE_SPEED * dt, r.lane - r.off))
    r.off += shift
    const [x, z] = this.at(r.pts, r.seg, r.t, r.off)
    const dx = r.pts[r.seg * 3 + 3]! - r.pts[r.seg * 3]!
    const dz = r.pts[r.seg * 3 + 4]! - r.pts[r.seg * 3 + 1]!
    n.x = x
    n.z = z
    // 朝向：前进方向加上并道的横向分量（右手法线 (-dz, dx)）。Player.facing 约定：朝向 f 对应方向 (-sin f, -cos f)
    const side = dt > 0 ? shift / (dt * n.speed) : 0
    n.facing = Math.atan2(-(dx * r.dir - dz * side), -(dz * r.dir + dx * side))
  }

  // ---------------------------------------------------------------- 渲染

  private render() {
    const P = this.parts
    let k = 0
    const extra = { umbrella: 0, pole: 0, bike: 0, crate: 0, dog: 0, phone: 0 }
    const put = (im: THREE.InstancedMesh, i: number, base: THREE.Matrix4, x: number, y: number, z: number, rx: number, color?: number) => {
      this.q.makeRotationX(rx).setPosition(x, y, z)
      this.m.multiplyMatrices(base, this.q)
      im.setMatrixAt(i, this.m)
      if (color !== undefined) im.setColorAt(i, this.c.setHex(color))
    }
    const base = new THREE.Matrix4()
    for (const n of this.npcs) {
      if (k >= MAX) break
      const ride = n.kind === 'ride'
      const lift = ride ? 0.55 : 0
      base.makeRotationY(n.facing).setPosition(n.x, lift, n.z)
      // 动作：走路摆臂摆腿；骑车腿往前弯；跳舞双臂上下；拍照、摆姿势举起右手。
      // 绕 x 轴转正角度是往前（人面朝 -z）抬
      const walk = n.kind === 'walk' || n.kind === 'dog'
      const posed = !!this.posing && n.kind !== 'ride' && Math.hypot(n.x - this.posing.x, n.z - this.posing.z) < 9
      const moving = walk && n.hold <= 0 && !posed
      const s = moving ? Math.sin(n.phase) * 0.6 : 0
      let armL = -s
      let armR = s
      if (n.kind === 'dance') {
        armL = 1.4 + Math.sin(n.phase) * 1.2
        armR = 1.4 + Math.sin(n.phase + Math.PI) * 1.2
      }
      if (n.kind === 'photo') armR = 2.6
      if (posed) armR = 2.9
      if (n.umbrella) armL = 1.2
      put(P.legL!, k, base, -0.12, 0.82, 0, ride ? 1.3 : s, n.pants)
      put(P.legR!, k, base, 0.12, 0.82, 0, ride ? 1.3 : -s, n.pants)
      put(P.body!, k, base, 0, 1.13, 0, 0, n.shirt)
      put(P.armL!, k, base, -0.34, 1.4, 0, armL, n.shirt)
      put(P.armR!, k, base, 0.34, 1.4, 0, armR, n.shirt)
      put(P.head!, k, base, 0, 1.65, 0, 0, n.skin)
      put(P.hair!, k, base, 0, 1.9, 0.02, 0, n.hair)
      if (n.umbrella) {
        put(P.umbrella!, extra.umbrella++, base, -0.3, 2.35, -0.2, 0, n.group === 'match' ? 0xf2f2f2 : [0x2a5a9a, 0xd5573a, 0x2f8f5b, 0x8e5bd5][n.id % 4]!)
        put(P.pole!, extra.pole++, base, -0.3, 1.35, -0.2, 0)
      }
      if (ride) {
        base.makeRotationY(n.facing).setPosition(n.x, 0, n.z)
        put(P.bike!, extra.bike++, base, 0, 0, 0, 0)
        put(P.crate!, extra.crate++, base, 0, 1.1, 0.55, 0)
      }
      if (n.kind === 'dog') {
        const bob = Math.abs(Math.sin(n.phase * 1.5)) * 0.05
        put(P.dog!, extra.dog++, base, 0.7, 0.32 + bob, -0.9, 0, [0xd9b38c, 0x2a2220, 0xf2f2f2][n.id % 3]!)
      }
      if (n.kind === 'photo' || posed) put(P.phone!, extra.phone++, base, 0.34, 2.0, -0.36, 0)
      k++
    }
    for (const key of ['legL', 'legR', 'body', 'armL', 'armR', 'head', 'hair'] as const) this.flush(P[key]!, k)
    for (const [key, c] of Object.entries(extra)) this.flush(P[key]!, c)
  }

  private flush(im: THREE.InstancedMesh, count: number) {
    im.count = count
    im.instanceMatrix.needsUpdate = true
    if (im.instanceColor) im.instanceColor.needsUpdate = true
  }

  // ---------------------------------------------------------------- 交互

  /** 离 (x, z) 最近、能聊天的人 */
  nearest(x: number, z: number, r = 2.4): { id: number; name: string } | null {
    let best: Npc | null = null
    let bestD = r
    for (const n of this.npcs) {
      if (n.kind === 'ride') continue
      const d = Math.hypot(n.x - x, n.z - z)
      if (d < bestD) {
        bestD = d
        best = n
      }
    }
    return best ? { id: best.id, name: best.type.name } : null
  }

  /** 和某个人说话：他停下来转向玩家，按天气、时间、地点挑一句 */
  talk(id: number, x: number, z: number, weather: WeatherKind, h: number, nearBund: boolean): Talk | null {
    const n = this.npcs.find((q) => q.id === id)
    if (!n) return null
    n.hold = 5
    n.face = Math.atan2(-(x - n.x), -(z - n.z))
    const local = n.type.speech === 'wu'
    let line = pick(n.type.lines)
    const w = this.content.weatherLines[weather]
    if (local && w?.length && Math.random() < 0.6) line = pick(w)
    else if (local && nearBund && (h >= 18 || h < 1) && Math.random() < 0.5) line = pick(this.content.nightLines)
    return { type: n.type.id, name: n.type.name, speech: n.type.speech, line }
  }

  /** 拍照模式：玩家 (x, z) 附近的人转向镜头摆姿势；cam 为 null 时恢复 */
  pose(cam: THREE.Vector3 | null, x = 0, z = 0) {
    if (!cam) this.posing = null
    else if (this.posing) {
      this.posing.cam.copy(cam)
      this.posing.x = x
      this.posing.z = z
    } else this.posing = { cam: cam.clone(), x, z }
  }

  /** 玩家身边 9 格内摆姿势的人数（合影） */
  posingNear(x: number, z: number) {
    return this.posing ? this.npcs.filter((n) => n.kind !== 'ride' && Math.hypot(n.x - x, n.z - z) < 9).length : 0
  }

  clearAll() {
    this.npcs.length = 0
    this.render()
  }

  dispose() {
    for (const im of Object.values(this.parts)) {
      im.geometry.dispose()
      ;(im.material as THREE.Material).dispose()
    }
    this.root.removeFromParent()
  }
}

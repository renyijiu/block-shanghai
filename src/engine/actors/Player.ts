// 玩家：方块小人，移动、奔跑、跳跃、碰撞。人物尺度 1 格 ≈ 1 米（docs/03 第 3 节）
import * as THREE from 'three/webgpu'
import type { Box } from '../geo/CollisionWorld.ts'

export const PLAYER = {
  /** 半宽（格） */
  radius: 0.35,
  height: 1.8,
  eye: 1.62,
  walk: 7,
  run: 14,
  /** 骑共享单车 */
  bike: 22,
  gravity: 30,
  jump: 9,
  /** 能直接迈上去的高度 */
  step: 0.5
}

/** 玩家和世界交互需要的查询 */
export interface PlayerWorld {
  /** 与水平矩形相交的碰撞盒（含只挡相机的 soft 盒，玩家自己跳过） */
  boxes(x0: number, z0: number, x1: number, z1: number): Box[]
  /** 能不能站在 (x, z)（水面、世界外不能） */
  walkable(x: number, z: number): boolean
}

export interface MoveIntent {
  /** 世界坐标系里的移动方向（已按相机朝向换算），长度 0–1 */
  dx: number
  dz: number
  run: boolean
  jump: boolean
}

export class Player {
  readonly pos = new THREE.Vector3()
  /** 朝向（弧度，0 朝 -z 即北） */
  facing = 0
  vy = 0
  onGround = true
  /** 当前水平速度（格/秒），用于动画 */
  speed = 0
  /** 骑着共享单车：更快、不能跳，人坐高一点，脚踩踏板 */
  riding = false
  readonly model: THREE.Group
  private readonly body: THREE.Group
  private readonly bike: THREE.Group
  private readonly limbs: { armL: THREE.Object3D; armR: THREE.Object3D; legL: THREE.Object3D; legR: THREE.Object3D }
  private phase = 0

  constructor() {
    const { group, body, bike, limbs } = buildCharacter()
    this.model = group
    this.body = body
    this.bike = bike
    this.limbs = limbs
  }

  /** 上车 / 下车（共享单车） */
  setRiding(on: boolean) {
    this.riding = on
    this.bike.visible = on
    this.body.position.y = on ? 0.32 : 0
  }

  /** 放到 (x, z)；如果被碰撞盒占着，就沿螺旋找最近的空位 */
  spawn(x: number, z: number, world: PlayerWorld) {
    for (let r = 0; r < 60; r += 1) {
      for (let k = 0; k < Math.max(1, r * 6); k++) {
        const a = (k / Math.max(1, r * 6)) * Math.PI * 2
        const px = x + Math.cos(a) * r
        const pz = z + Math.sin(a) * r
        if (world.walkable(px, pz) && !this.blocked(px, pz, 0, world)) {
          this.pos.set(px, 0, pz)
          this.vy = 0
          return
        }
      }
    }
    this.pos.set(x, 0, z)
  }

  update(dt: number, m: MoveIntent, world: PlayerWorld) {
    const speed = this.riding ? PLAYER.bike : m.run ? PLAYER.run : PLAYER.walk
    const vx = m.dx * speed
    const vz = m.dz * speed
    // 轴分离移动：先 x 后 z，碰到墙时沿墙滑动
    this.tryMove(this.pos.x + vx * dt, this.pos.z, world)
    this.tryMove(this.pos.x, this.pos.z + vz * dt, world)
    this.speed = Math.hypot(vx, vz)
    if (this.speed > 0.1) this.facing = Math.atan2(-m.dx, -m.dz)

    // 竖直方向：重力、跳跃、落在方块顶上
    if (m.jump && this.onGround && !this.riding) {
      this.vy = PLAYER.jump
      this.onGround = false
    }
    this.vy -= PLAYER.gravity * dt
    this.pos.y += this.vy * dt
    const ground = this.groundHeight(world)
    if (this.pos.y <= ground) {
      this.pos.y = ground
      this.vy = 0
      this.onGround = true
    } else if (this.pos.y > ground + 0.05) this.onGround = false

    this.animate(dt)
  }

  private tryMove(x: number, z: number, world: PlayerWorld) {
    if (x === this.pos.x && z === this.pos.z) return
    if (!world.walkable(x, z)) return
    const climb = this.blocked(x, z, this.pos.y, world)
    if (climb === false) {
      this.pos.x = x
      this.pos.z = z
    } else if (climb !== true) {
      // 矮台阶：直接迈上去
      this.pos.set(x, climb, z)
    }
  }

  /**
   * 在 (x, z)、脚底高度 y 处是否被挡住：false 不挡；true 挡住；数字表示可以迈上去的高度
   */
  private blocked(x: number, z: number, y: number, world: PlayerWorld): boolean | number {
    const r = PLAYER.radius
    let stepTo: number | null = null
    for (const b of world.boxes(x - r, z - r, x + r, z + r)) {
      if (b.soft || b.y1 <= y + 0.01 || b.y0 >= y + PLAYER.height) continue
      if (b.y1 - y <= PLAYER.step && this.headroom(x, z, b.y1, world)) stepTo = Math.max(stepTo ?? 0, b.y1)
      else return true
    }
    return stepTo ?? false
  }

  // 迈上去以后头顶有没有空间
  private headroom(x: number, z: number, y: number, world: PlayerWorld) {
    const r = PLAYER.radius
    return !world.boxes(x - r, z - r, x + r, z + r).some((b) => !b.soft && b.y0 < y + PLAYER.height && b.y1 > y + 0.01)
  }

  /** 脚下最高的支撑面（地面或方块顶） */
  private groundHeight(world: PlayerWorld) {
    const r = PLAYER.radius
    const { x, z, y } = this.pos
    let g = 0
    for (const b of world.boxes(x - r, z - r, x + r, z + r)) if (!b.soft && b.y1 <= y + PLAYER.step && b.y1 > g) g = b.y1
    return g
  }

  private animate(dt: number) {
    this.model.position.copy(this.pos)
    // 朝向平滑转过去
    let d = this.facing - this.model.rotation.y
    d = Math.atan2(Math.sin(d), Math.cos(d))
    this.model.rotation.y += d * Math.min(1, dt * 12)
    const moving = this.speed > 0.1 && this.onGround
    this.phase += dt * (moving ? this.speed * 1.1 : 0)
    const swing = moving ? Math.sin(this.phase) * Math.min(0.9, this.speed / 9) : 0
    const { armL, armR, legL, legR } = this.limbs
    const ease = (o: THREE.Object3D, v: number) => (o.rotation.x += (v - o.rotation.x) * Math.min(1, dt * 15))
    if (this.riding) {
      // 骑车：手扶车把，脚踩踏板一前一后
      const pedal = Math.sin(this.phase * 0.6) * 0.45
      armL.rotation.x = armR.rotation.x = -0.95
      legL.rotation.x = -1.1 + pedal
      legR.rotation.x = -1.1 - pedal
      return
    }
    ease(armL, swing)
    ease(armR, -swing)
    ease(legL, -swing)
    ease(legR, swing)
    if (!this.onGround) {
      armL.rotation.x = armR.rotation.x = -0.9
    }
  }

  dispose() {
    this.model.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose()
    })
  }
}

// 方块小人：头、身体、双臂、双腿；四肢以关节为原点，摆动时绕关节转
function buildCharacter() {
  const group = new THREE.Group()
  group.name = 'player'
  const body = new THREE.Group()
  group.add(body)
  const mat = (c: number) => new THREE.MeshLambertMaterial({ color: c })
  const skin = mat(0xf0c8a0)
  const shirt = mat(0x3a7bd5)
  const pants = mat(0x2f3440)
  const hair = mat(0x2a2220)
  const part = (w: number, h: number, d: number, m: THREE.Material, y: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
    mesh.position.y = y
    return mesh
  }
  const joint = (x: number, y: number, child: THREE.Mesh) => {
    const j = new THREE.Group()
    j.position.set(x, y, 0)
    child.position.y = -(child.geometry as THREE.BoxGeometry).parameters.height / 2
    j.add(child)
    body.add(j)
    return j
  }
  body.add(part(0.5, 0.62, 0.28, shirt, 1.12))
  body.add(part(0.42, 0.42, 0.42, skin, 1.64))
  body.add(part(0.44, 0.12, 0.44, hair, 1.88))
  const armL = joint(-0.34, 1.4, new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.62, 0.17), shirt))
  const armR = joint(0.34, 1.4, new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.62, 0.17), shirt))
  const legL = joint(-0.12, 0.82, new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.82, 0.24), pants))
  const legR = joint(0.12, 0.82, new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.82, 0.24), pants))
  // 共享单车：黄色车架、两个轮子、车座、车把和前筐（人朝 -z，车头在 -z）
  const bike = new THREE.Group()
  bike.visible = false
  const frame = mat(0xf2c12e)
  const black = mat(0x222222)
  const bpart = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
    mesh.position.set(x, y, z)
    bike.add(mesh)
  }
  for (const z of [-0.62, 0.62]) bpart(0.1, 0.66, 0.66, black, 0, 0.33, z)
  bpart(0.08, 0.1, 1.2, frame, 0, 0.62, 0)
  bpart(0.08, 0.5, 0.1, frame, 0, 0.5, 0.1)
  bpart(0.08, 0.55, 0.1, frame, 0, 0.62, -0.55)
  bpart(0.22, 0.08, 0.3, black, 0, 0.9, 0.15)
  bpart(0.56, 0.06, 0.06, black, 0, 1.0, -0.62)
  bpart(0.34, 0.22, 0.26, frame, 0, 0.82, -0.86)
  group.add(bike)
  return { group, body, bike, limbs: { armL, armR, legL, legR } }
}

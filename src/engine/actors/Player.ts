// 玩家：方块小人，移动、奔跑、跳跃、碰撞。人物尺度 1 格 ≈ 1 米（docs/03 第 3 节）
import * as THREE from 'three/webgpu'
import type { Box } from '../geo/CollisionWorld.ts'
import { buildCharacter, type Character } from './character.ts'
import { DEFAULT_LOOK, type Look } from './look.ts'

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
  private readonly limbs: Character['limbs']
  private readonly character: Character
  private phase = 0
  /** 当前外观 */
  look: Look = { ...DEFAULT_LOOK }

  constructor() {
    this.character = buildCharacter()
    this.model = this.character.group
    this.body = this.character.body
    this.bike = this.character.bike
    this.limbs = this.character.limbs
    this.character.apply(this.look)
  }

  /** 换外观（肤色、衣服、发型、帽子、眼镜、上传的皮肤） */
  setLook(look: Look) {
    this.look = { ...look }
    this.character.apply(this.look)
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
    this.character.dispose()
  }
}

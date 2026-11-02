// 烟火秀的渲染：火花是发光的小方块（不受光照，夜里很亮），所有火花放在一个实例化网格里，只多一次绘制。
// 位置每帧按 fireworkShow.ts 的纯函数现算；玩家离得远、没到时间或者天气不好就不画
import * as THREE from 'three/webgpu'
import type { FireworksDef } from '../city.ts'
import type { Projection } from '../geo/projection.ts'
import { burstsAt, schedule, sparksOf, type Show, type Spark } from './fireworkShow.ts'

/** 离烟火多远还看得见（格） */
const SEE_R = 2200
const MAX = 2600

const parseClock = (s: string) => {
  const [h, m] = s.split(':').map(Number)
  return (h! * 60 + m!) * 60
}

export class FireworksSystem {
  readonly root = new THREE.Group()
  private readonly shows: { name: string; show: Show; times: number[] }[]
  private readonly mesh: THREE.InstancedMesh
  private readonly sparks: Spark[] = []
  private readonly m = new THREE.Matrix4()
  private readonly c = new THREE.Color()

  constructor(defs: FireworksDef[], proj: Projection) {
    this.root.name = 'fireworks'
    this.shows = defs.map((d) => {
      const p = proj.project(d.lat, d.lon)
      const show: Show = { x: p.x, z: p.z, start: parseClock(d.start), duration: d.minutes * 60, spread: d.spread }
      return { name: d.name, show, times: schedule(show) }
    })
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX)
    this.mesh.count = 0
    // 火花满天飞，包围盒算不准，干脆不裁剪
    this.mesh.frustumCulled = false
    this.mesh.setColorAt(0, this.c.set(0xffffff))
    this.root.add(this.mesh)
  }

  /** 每帧：daySec 是当天的游戏秒；allowed 为假（下雨、台风……）就不放。返回玩家看得见的、正在放的那场的名字 */
  update(daySec: number, allowed: boolean, px: number, pz: number): string | null {
    this.sparks.length = 0
    let showing: string | null = null
    if (allowed) {
      for (const s of this.shows) {
        const t = daySec - s.show.start
        if (t < 0 || t > s.show.duration || Math.hypot(s.show.x - px, s.show.z - pz) > SEE_R) continue
        showing = s.name
        for (const b of burstsAt(s.show, s.times, t)) sparksOf(b, t, this.sparks)
      }
    }
    const n = Math.min(MAX, this.sparks.length)
    for (let i = 0; i < n; i++) {
      const s = this.sparks[i]!
      this.m.makeScale(s.size, s.size, s.size).setPosition(s.x, s.y, s.z)
      this.mesh.setMatrixAt(i, this.m)
      this.mesh.setColorAt(i, this.c.setHex(s.color))
    }
    this.mesh.count = n
    if (n) {
      this.mesh.instanceMatrix.needsUpdate = true
      this.mesh.instanceColor!.needsUpdate = true
    }
    return showing
  }

  dispose() {
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
    this.mesh.dispose()
  }
}

// 雨和雪：相机周围一个盒子里的粒子，每帧往下落、超出盒子就绕回去。雨是线段（一次绘制），雪是小方块（实例化，一次绘制）
import * as THREE from 'three/webgpu'
import type { WeatherLook } from './weather.ts'

const RAIN = 4000
const SNOW = 2000
/** 粒子盒子：水平半径、相机下方、相机上方（格） */
const R = 28
const BELOW = 10
const ABOVE = 26

export class Precipitation {
  readonly root = new THREE.Group()
  private readonly rainPos: Float32Array
  private readonly rain: THREE.LineSegments
  private readonly snow: THREE.InstancedMesh
  private readonly snowPos: Float32Array
  private readonly m = new THREE.Matrix4()
  private t = 0

  constructor() {
    this.root.name = 'precipitation'
    this.rainPos = new Float32Array(RAIN * 6)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3))
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xb8c6d6, transparent: true, opacity: 0.6, depthWrite: false }))
    this.rain.frustumCulled = false
    for (let i = 0; i < RAIN; i++) this.respawn(this.rainPos, i * 6, 0, 0, 0, true)
    this.snowPos = new Float32Array(SNOW * 3)
    this.snow = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), new THREE.MeshBasicMaterial({ color: 0xf4f7fb }), SNOW)
    this.snow.frustumCulled = false
    for (let i = 0; i < SNOW; i++) this.respawn(this.snowPos, i * 3, 0, 0, 0, true)
    this.root.add(this.rain, this.snow)
    this.rain.visible = this.snow.visible = false
  }

  // 在相机周围随机放一个粒子；fresh 时高度也随机（开局铺满盒子），否则从顶上落下
  private respawn(a: Float32Array, i: number, cx: number, cy: number, cz: number, fresh: boolean) {
    a[i] = cx + (Math.random() * 2 - 1) * R
    a[i + 1] = cy + (fresh ? Math.random() * (ABOVE + BELOW) - BELOW : ABOVE)
    a[i + 2] = cz + (Math.random() * 2 - 1) * R
  }

  /** 每帧：dt 现实秒，cam 相机位置，look 当前天气 */
  update(dt: number, cam: THREE.Vector3, look: WeatherLook) {
    this.t += dt
    const wind = look.wind
    // 雨：数量随强度，台风时斜着下
    const nRain = Math.round(RAIN * look.rain)
    this.rain.visible = nRain > 0
    if (nRain) {
      const v = 34 + wind * 12
      const dx = wind * 14
      const a = this.rainPos
      for (let k = 0; k < nRain; k++) {
        const i = k * 6
        a[i]! += dx * dt
        a[i + 1]! -= v * dt
        a[i + 2]! += dx * 0.3 * dt
        if (a[i + 1]! < cam.y - BELOW || Math.abs(a[i]! - cam.x) > R || Math.abs(a[i + 2]! - cam.z) > R) this.respawn(a, i, cam.x, cam.y, cam.z, a[i + 1]! >= cam.y - BELOW)
        // 线段另一端：沿下落方向往上 1.3 格
        a[i + 3] = a[i]! - dx * 0.035
        a[i + 4] = a[i + 1]! + 1.3
        a[i + 5] = a[i + 2]! - dx * 0.01
      }
      this.rain.geometry.setDrawRange(0, nRain * 2)
      this.rain.geometry.attributes.position!.needsUpdate = true
    }
    // 雪：慢慢飘，左右摆
    const nSnow = Math.round(SNOW * look.snow)
    this.snow.visible = nSnow > 0
    if (nSnow) {
      const a = this.snowPos
      for (let k = 0; k < nSnow; k++) {
        const i = k * 3
        a[i]! += (Math.sin(this.t * 0.9 + k) * 0.6 + wind * 3) * dt
        a[i + 1]! -= 2.4 * dt
        a[i + 2]! += Math.cos(this.t * 0.7 + k * 1.3) * 0.5 * dt
        if (a[i + 1]! < cam.y - BELOW || Math.abs(a[i]! - cam.x) > R || Math.abs(a[i + 2]! - cam.z) > R) this.respawn(a, i, cam.x, cam.y, cam.z, a[i + 1]! >= cam.y - BELOW)
        this.m.makeTranslation(a[i]!, a[i + 1]!, a[i + 2]!)
        this.snow.setMatrixAt(k, this.m)
      }
      this.snow.count = nSnow
      this.snow.instanceMatrix.needsUpdate = true
    }
  }

  dispose() {
    this.rain.geometry.dispose()
    ;(this.rain.material as THREE.Material).dispose()
    this.snow.geometry.dispose()
    ;(this.snow.material as THREE.Material).dispose()
    this.root.removeFromParent()
  }
}

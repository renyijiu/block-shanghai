// 跟随玩家的相机：第三人称（拖动绕玩家转、滚轮拉远拉近，撞墙时自动拉近）和第一人称，V 键切换；
// 拍照时多一个自拍视角（相机在人前面，人转过来对着镜头）
import * as THREE from 'three/webgpu'
import type { Input } from './Input.ts'
import { PLAYER, type Player, type PlayerWorld } from './Player.ts'
import { tr } from '../../i18n/core.ts'

export type ViewMode = 'third' | 'first'

export class CameraRig {
  /** 水平朝向（弧度，0 朝北，与玩家 facing 同一约定） */
  yaw = 0
  /** 俯仰：第三人称是相机抬高的角度，第一人称是低头的角度 */
  pitch = 0.35
  distance = 7
  mode: ViewMode = 'third'
  /** 拍照模式：V 键在 第三人称 → 第一人称 → 自拍 之间循环 */
  photo = false
  /** 自拍视角（只在拍照模式里） */
  selfie = false
  selfieDistance = 2.6

  /** 相机朝向的前方和右方（水平单位向量），用来把输入换算成世界方向 */
  basis() {
    const fx = -Math.sin(this.yaw)
    const fz = -Math.cos(this.yaw)
    return { fx, fz, rx: -fz, rz: fx }
  }

  update(camera: THREE.PerspectiveCamera, player: Player, input: Input, world: PlayerWorld) {
    if (!this.photo) this.selfie = false
    if (input.consumeView()) this.cycleView()
    const look = input.consumeLook()
    this.yaw -= look.x * 0.005
    const [lo, hi] = this.mode === 'third' || this.selfie ? [-0.15, 1.3] : [-1.3, 1.3]
    this.pitch = Math.min(hi, Math.max(lo, this.pitch + look.y * 0.004))
    const zoom = Math.exp(input.consumeZoom() * 0.001)
    if (this.selfie) this.selfieDistance = Math.min(6, Math.max(1.4, this.selfieDistance * zoom))
    else this.distance = Math.min(16, Math.max(2.5, this.distance * zoom))

    const p = player.pos
    player.model.visible = this.mode === 'third' || this.selfie
    if (this.selfie) {
      // 相机在人前方，人面朝镜头
      player.facing = this.yaw
      const head = new THREE.Vector3(p.x, p.y + 1.55, p.z)
      const c = Math.cos(this.pitch)
      camera.position.set(head.x - Math.sin(this.yaw) * c * this.selfieDistance, head.y + Math.sin(this.pitch) * this.selfieDistance, head.z - Math.cos(this.yaw) * c * this.selfieDistance)
      camera.lookAt(head)
      return
    }
    if (this.mode === 'first') {
      camera.position.set(p.x, p.y + PLAYER.eye, p.z)
      const c = Math.cos(this.pitch)
      camera.lookAt(p.x - Math.sin(this.yaw) * c, p.y + PLAYER.eye - Math.sin(this.pitch), p.z - Math.cos(this.yaw) * c)
      return
    }
    const head = new THREE.Vector3(p.x, p.y + 1.5, p.z)
    const c = Math.cos(this.pitch)
    const dir = new THREE.Vector3(Math.sin(this.yaw) * c, Math.sin(this.pitch), Math.cos(this.yaw) * c)
    // 从头部往相机方向步进，碰到方块或地面就停在前一步
    let d = 0.6
    while (d < this.distance) {
      const q = head.clone().addScaledVector(dir, d + 0.4)
      if (q.y < 0.3 || world.boxes(q.x - 0.2, q.z - 0.2, q.x + 0.2, q.z + 0.2).some((b) => q.y > b.y0 && q.y < b.y1 + 0.2)) break
      d += 0.4
    }
    camera.position.copy(head).addScaledVector(dir, Math.min(d, this.distance))
    camera.lookAt(head)
  }

  /** 当前视角的名字（拍照界面显示） */
  get viewName() {
    return tr(this.selfie ? '自拍' : this.mode === 'third' ? '第三人称' : '第一人称')
  }

  private cycleView() {
    if (this.photo && this.mode === 'first' && !this.selfie) {
      this.selfie = true
      this.mode = 'third'
      this.pitch = 0.1
      return
    }
    if (this.selfie) {
      this.selfie = false
      this.mode = 'third'
    } else this.mode = this.mode === 'third' ? 'first' : 'third'
    this.pitch = this.mode === 'third' ? 0.35 : 0
  }
}

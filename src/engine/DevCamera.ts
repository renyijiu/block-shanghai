// 开发用的自由相机（阶段 4 有玩家之前用来检查世界）：轨道控制 + WASD 平移，Shift 加速，Q/E 升降
import * as THREE from 'three/webgpu'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

export class DevCamera {
  readonly controls: OrbitControls
  private readonly camera: THREE.PerspectiveCamera
  private readonly keys = new Set<string>()
  private readonly onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return
    if (e.type === 'keydown') this.keys.add(e.code)
    else this.keys.delete(e.code)
  }
  private readonly onBlur = () => this.keys.clear()

  constructor(camera: THREE.PerspectiveCamera, dom: HTMLElement) {
    this.camera = camera
    this.controls = new OrbitControls(camera, dom)
    this.controls.enableDamping = true
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02
    this.controls.minDistance = 5
    this.controls.maxDistance = 3000
    addEventListener('keydown', this.onKey)
    addEventListener('keyup', this.onKey)
    addEventListener('blur', this.onBlur)
  }

  /** 机位：相机位置和注视点 */
  set(cam: THREE.Vector3Like, at: THREE.Vector3Like) {
    this.camera.position.set(cam.x, cam.y, cam.z)
    this.controls.target.set(at.x, at.y, at.z)
    this.controls.update()
  }

  get focus() {
    return this.controls.target
  }

  update(dt: number) {
    const k = this.keys
    const fwd = new THREE.Vector3()
    this.camera.getWorldDirection(fwd)
    fwd.y = 0
    fwd.normalize()
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x)
    const move = new THREE.Vector3()
    if (k.has('KeyW')) move.add(fwd)
    if (k.has('KeyS')) move.sub(fwd)
    if (k.has('KeyD')) move.add(right)
    if (k.has('KeyA')) move.sub(right)
    if (k.has('KeyE')) move.y += 1
    if (k.has('KeyQ')) move.y -= 1
    if (move.lengthSq()) {
      // 离得越远移动越快
      const dist = this.camera.position.distanceTo(this.controls.target)
      const speed = Math.max(30, dist * 0.9) * (k.has('ShiftLeft') || k.has('ShiftRight') ? 3 : 1)
      move.normalize().multiplyScalar(speed * dt)
      this.camera.position.add(move)
      this.controls.target.add(move)
    }
    this.controls.update()
  }

  dispose() {
    removeEventListener('keydown', this.onKey)
    removeEventListener('keyup', this.onKey)
    removeEventListener('blur', this.onBlur)
    this.controls.dispose()
  }
}

// 昼夜：天空 / 雾的颜色、太阳和环境光随游戏时刻变化；夜里窗户亮灯，外滩、陆家嘴景观灯 18:30–22:00 亮起（docs/05 第 9 节）
import * as THREE from 'three/webgpu'
import { SKY_UNIFORMS } from '../world/materials.ts'
import type { WeatherLook } from './weather.ts'

const CLEAR: WeatherLook = { cloud: 0, rain: 0, snow: 0, fog: 0, wind: 0 }

// 关键时刻（小时）→ 天空颜色、阳光强度、环境光强度
const KEYS: [number, number, number, number][] = [
  [0, 0x0b1426, 0.12, 0.35],
  [5, 0x0f1a30, 0.12, 0.38],
  [6, 0xe8a27a, 0.8, 0.9],
  [7.5, 0x9cc4e4, 1.6, 1.5],
  [16.5, 0x9cc4e4, 1.6, 1.5],
  [18, 0xe39b6b, 0.9, 1.0],
  [19.2, 0x16203a, 0.15, 0.4],
  [24, 0x0b1426, 0.12, 0.35]
]

export interface SkyState {
  color: THREE.Color
  sun: number
  ambient: number
  /** 0 白天 – 1 夜晚，控制窗户亮灯 */
  night: number
  /** 景观灯亮度 0–1：18:30 起亮，22:00 熄灭，前后各渐变 15 分钟 */
  lights: number
}

/** 某个时刻（当天的小时，0–24）的天空状态，纯函数 */
export function skyAt(h: number): SkyState {
  let i = 0
  while (i < KEYS.length - 2 && KEYS[i + 1]![0] <= h) i++
  const [h0, c0, s0, a0] = KEYS[i]!
  const [h1, c1, s1, a1] = KEYS[i + 1]!
  const t = Math.min(1, Math.max(0, (h - h0) / (h1 - h0)))
  const color = new THREE.Color(c0).lerp(new THREE.Color(c1), t)
  const ramp = (a: number, b: number) => Math.min(1, Math.max(0, (h - a) / (b - a)))
  const night = Math.max(1 - ramp(5.5, 7), ramp(17.8, 19.2))
  const lights = ramp(18.25, 18.5) * (1 - ramp(22, 22.25))
  return { color, sun: s0 + (s1 - s0) * t, ambient: a0 + (a1 - a0) * t, night, lights }
}

export class Sky {
  private readonly scene: THREE.Scene
  private readonly sun: THREE.DirectionalLight
  private readonly hemi: THREE.HemisphereLight
  state: SkyState = skyAt(12)
  /** 晴天时雾的起止距离（画质决定），天气再往近处压 */
  private fogNear = 500
  private fogFar = 1000
  private readonly gray = new THREE.Color()

  constructor(scene: THREE.Scene, sun: THREE.DirectionalLight, hemi: THREE.HemisphereLight) {
    this.scene = scene
    this.sun = sun
    this.hemi = hemi
  }

  setFogRange(near: number, far: number) {
    this.fogNear = near
    this.fogFar = far
  }

  /** daySec：当天的秒；look：当前天气（阴天压暗、去饱和，雨雾把雾拉近） */
  update(daySec: number, look: WeatherLook = CLEAR) {
    const h = daySec / 3600
    const s = (this.state = skyAt(h))
    const l = s.color.r * 0.3 + s.color.g * 0.59 + s.color.b * 0.11
    this.gray.setRGB(l * 0.92, l * 0.95, l * 1.0)
    const color = s.color.clone().lerp(this.gray, look.cloud * 0.8)
    ;(this.scene.background as THREE.Color).copy(color)
    const fog = this.scene.fog as THREE.Fog
    fog.color.copy(color)
    const thick = Math.max(look.fog, look.rain * 0.5, look.snow * 0.5)
    fog.near = this.fogNear * (1 - thick * 0.85)
    fog.far = this.fogFar * (1 - thick * 0.6)
    // 太阳 6 点从东边升起、18 点从西边落下；夜里换成偏蓝的月光
    const a = ((h - 6) / 12) * Math.PI
    const day = h > 6 && h < 18
    this.sun.position.set(day ? Math.cos(a) * 700 : -300, day ? Math.sin(a) * 900 + 80 : 800, 400)
    this.sun.color.setHex(day ? 0xfff4e0 : 0x8fa3d8)
    this.sun.intensity = s.sun * (1 - look.cloud * 0.75)
    this.hemi.intensity = s.ambient * (1 - look.cloud * 0.2)
    SKY_UNIFORMS.night.value = s.night
    SKY_UNIFORMS.lights.value = s.lights
  }
}

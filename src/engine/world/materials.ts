// 世界共用的材质。贴地图层（公园、水面、道路）和地面几乎共面，用材质的深度偏移（polygonOffset）
// 决定谁在上面：偏移按深度缓冲精度计算，远处也不会闪烁，WebGPU 和 WebGL 2 回退都支持
import * as THREE from 'three/webgpu'
import { abs, attribute, color, dot, float, floor, fract, mix, mx_noise_float, normalWorld, positionWorld, reflector, sin, smoothstep, step, time, uniform, vec2, vec3 } from 'three/tsl'

/** 昼夜参数（sky/Sky.ts 每帧写入）：night 0 白天–1 夜晚；lights 景观灯亮度 0–1 */
export const SKY_UNIFORMS = { night: uniform(0), lights: uniform(0) }

export const WORLD_COLORS = {
  ground: 0xc4bca8,
  water: { deep: 0x3f7cab, light: 0x8cc0e0 },
  // 公园里常套着草坪、花园，几个面重叠又共面：颜色一致才不会在远处出现条纹闪烁
  parks: { park: 0x7fb069, garden: 0x7fb069, grass: 0x7fb069, forest: 0x6aa25a } as Record<string, number>,
  park: 0x7fb069
}

export interface WorldMaterials {
  ground: THREE.MeshLambertMaterial
  parks: THREE.MeshLambertMaterial
  water: THREE.MeshPhongNodeMaterial
  roads: THREE.MeshLambertMaterial
  elevated: THREE.MeshLambertMaterial
  /** 景点的灯光部件：白天是普通颜色，景观灯时段发光 */
  lights: THREE.MeshLambertNodeMaterial
  /** 建筑和行道树（顶点颜色，墙面画窗户） */
  buildings: THREE.MeshLambertNodeMaterial
  /** 玻璃幕墙（高光，横向分层） */
  glass: THREE.MeshPhongNodeMaterial
  /** 水面倒影开关（高画质）；开启时多渲染一遍场景 */
  setReflection(on: boolean, scene: THREE.Scene): void
  dispose(): void
}

// 自发光：NodeMaterial 基类运行时都支持 emissiveNode，类型声明只写在 MeshStandardNodeMaterial 上
const setEmissive = (m: THREE.NodeMaterial, node: THREE.Node) => Object.assign(m, { emissiveNode: node })

const overlay = (factor: number, units: number) => ({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: factor, polygonOffsetUnits: units })

export function createWorldMaterials(): WorldMaterials {
  const ground = new THREE.MeshLambertMaterial({ color: WORLD_COLORS.ground })
  const parks = new THREE.MeshLambertMaterial(overlay(-1, -2))
  const roads = new THREE.MeshLambertMaterial(overlay(-2, -6))
  const elevated = new THREE.MeshLambertMaterial({ vertexColors: true })

  // 窗户：不用贴图，按世界坐标在墙面上画窗格。层高 1.2 格（约 3 米），横向每 2 格一扇；
  // 顶点属性 win 控制强度（屋顶构件、树、围墙为 0）
  const win = attribute<'float'>('win')
  const wall = float(1).sub(step(0.5, abs(normalWorld.y)))
  const along = mix(positionWorld.x, positionWorld.z, step(0.5, abs(normalWorld.x)))
  const fy = fract(positionWorld.y.div(1.2))
  const fx = fract(along.div(2))
  const pane = step(0.32, fy).mul(step(fy, 0.8)).mul(step(0.25, fx)).mul(step(fx, 0.75))
  const buildings = new THREE.MeshLambertNodeMaterial({ vertexColors: true })
  buildings.colorNode = vec3(mix(float(1), float(0.55), pane.mul(wall).mul(win)))
  // 夜里约一半的窗户亮暖黄灯：按窗格坐标取伪随机数决定亮不亮
  const cell = vec2(floor(along.div(2)), floor(positionWorld.y.div(1.2)).add(floor(positionWorld.x.add(positionWorld.z).div(97))))
  const rnd = fract(sin(dot(cell, vec2(12.9898, 78.233))).mul(43758.5453))
  const lit = pane.mul(wall).mul(win).mul(step(0.45, rnd)).mul(SKY_UNIFORMS.night)
  setEmissive(buildings, color(0xffcf7a).mul(lit).mul(0.9))
  const lights = new THREE.MeshLambertNodeMaterial({ vertexColors: true })
  setEmissive(lights, attribute<'vec3'>('color').mul(SKY_UNIFORMS.lights.mul(1.6)))
  // 玻璃幕墙：每层一道浅色的层间带
  const glass = new THREE.MeshPhongNodeMaterial({ vertexColors: true, shininess: 70, specular: new THREE.Color(0xb8c8d8) })
  glass.colorNode = vec3(mix(float(1), float(1.35), step(0.84, fy).mul(wall).mul(win)))
  setEmissive(glass, color(0xdff0ff).mul(step(0.3, fy).mul(step(fy, 0.8)).mul(wall).mul(win).mul(step(0.4, rnd)).mul(SKY_UNIFORMS.night).mul(0.6)))

  // 水面：两层不同尺度的噪声缓慢流动，混合深浅两种蓝，配合高光形成波光
  const water = new THREE.MeshPhongNodeMaterial({ shininess: 90, specular: new THREE.Color(0x9fb4c8), polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 })
  const p = positionWorld.xz
  const n = mx_noise_float(vec3(p.mul(0.035), time.mul(0.15))).add(mx_noise_float(vec3(p.mul(0.12), time.mul(0.35))).mul(0.5))
  const base = mix(color(WORLD_COLORS.water.deep), color(WORLD_COLORS.water.light), smoothstep(-0.8, 1.6, n).mul(0.55))
  water.colorNode = base

  let mirror: ReturnType<typeof reflector> | null = null
  return {
    ground,
    parks,
    water,
    roads,
    elevated,
    lights,
    buildings,
    glass,
    setReflection(on, scene) {
      if (on && !mirror) {
        // 倒影只在高画质开启：水面都在 y = 0 的同一平面上，所有分块共用一个反射节点
        mirror = reflector({ resolutionScale: 0.5 })
        mirror.target.rotateX(-Math.PI / 2)
        scene.add(mirror.target)
        water.colorNode = mix(base, mirror.rgb, 0.35)
      } else if (!on && mirror) {
        mirror.target.removeFromParent()
        mirror.dispose()
        mirror = null
        water.colorNode = base
      }
      water.needsUpdate = true
    },
    dispose() {
      mirror?.dispose()
      for (const m of [ground, parks, water, roads, elevated, lights, buildings, glass]) m.dispose()
    }
  }
}

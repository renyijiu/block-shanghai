// 世界共用的材质。贴地图层（公园、水面、道路）和地面几乎共面，用材质的深度偏移（polygonOffset）
// 决定谁在上面：偏移按深度缓冲精度计算，远处也不会闪烁，WebGPU 和 WebGL 2 回退都支持
import * as THREE from 'three/webgpu'
import { abs, attribute, color, float, fract, mix, mx_noise_float, normalWorld, positionWorld, reflector, smoothstep, step, time, vec3 } from 'three/tsl'

export const WORLD_COLORS = {
  ground: 0xc4bca8,
  water: { deep: 0x3f7cab, light: 0x8cc0e0 },
  parks: { park: 0x7fb069, garden: 0x8cc078, forest: 0x5f9a52, grass: 0x9ccc7a } as Record<string, number>,
  park: 0x7fb069
}

export interface WorldMaterials {
  ground: THREE.MeshLambertMaterial
  parks: THREE.MeshLambertMaterial
  water: THREE.MeshPhongNodeMaterial
  roads: THREE.MeshLambertMaterial
  elevated: THREE.MeshLambertMaterial
  /** 建筑和行道树（顶点颜色，墙面画窗户） */
  buildings: THREE.MeshLambertNodeMaterial
  /** 玻璃幕墙（高光，横向分层） */
  glass: THREE.MeshPhongNodeMaterial
  /** 水面倒影开关（高画质）；开启时多渲染一遍场景 */
  setReflection(on: boolean, scene: THREE.Scene): void
  dispose(): void
}

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
  // 玻璃幕墙：每层一道浅色的层间带
  const glass = new THREE.MeshPhongNodeMaterial({ vertexColors: true, shininess: 70, specular: new THREE.Color(0xb8c8d8) })
  glass.colorNode = vec3(mix(float(1), float(1.35), step(0.84, fy).mul(wall).mul(win)))

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
      for (const m of [ground, parks, water, roads, elevated, buildings, glass]) m.dispose()
    }
  }
}

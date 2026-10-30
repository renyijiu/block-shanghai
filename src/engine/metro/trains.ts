// 列车渲染：按时刻表算出焦点附近、在地面以上的列车，从对象池里取模型摆上去（docs/04 第 6 节）。
// 3 节编组，车厢 14 × 3 × 3.6 格；按右侧行车，车体偏到前进方向右侧，同一条轨道上的上下行不重叠
import * as THREE from 'three/webgpu'
import { GeoBuilder, rgb } from '../build/geometry.ts'
import type { MetroSystem, VisibleTrain } from './MetroSystem.ts'

export const TRAIN = { cars: 3, carLength: 14, gap: 1, width: 3, height: 3.6, max: 12, lateral: 1.6 }

type CarKind = 'head' | 'middle' | 'tail'

interface Slot {
  group: THREE.Group
  cars: THREE.Mesh[]
  key: string | null
  line: string | null
}

// 一节车厢的几何（局部坐标：x 沿车长、z 横向、y 向上，车底在 y = 0）
function carGeometry(kind: CarKind, lineColor: number) {
  const g = new GeoBuilder()
  const L = TRAIN.carLength / 2
  const W = TRAIN.width / 2
  const body = rgb(0xeef0f2)
  const glass = rgb(0x26313b)
  const stripe = rgb(lineColor)
  g.box(-L + 0.6, 0, -W + 0.3, L - 0.6, 0.45, W - 0.3, rgb(0x3a3d42)) // 转向架
  g.box(-L, 0.45, -W, L, 3.35, W, body, rgb(0xd8dce0))
  g.box(-L + 0.4, 3.35, -W + 0.4, L - 0.4, 3.6, W - 0.4, rgb(0xb9bec4)) // 车顶设备
  // 侧面：车窗带、线路色带（稍微外凸，避免和车身面重合）
  const e = 0.03
  for (const s of [1, -1]) {
    const z0 = s > 0 ? W : -W - e
    const z1 = s > 0 ? W + e : -W
    g.box(-L + 0.8, 1.7, z0, L - 0.8, 2.75, z1, glass)
    g.box(-L, 1.1, z0, L, 1.4, z1, stripe)
  }
  // 车头 / 车尾的挡风玻璃和 LED 屏
  const ends = kind === 'head' ? [1] : kind === 'tail' ? [-1] : []
  for (const s of ends) {
    const x0 = s > 0 ? L : -L - e
    const x1 = s > 0 ? L + e : -L
    g.box(x0, 1.6, -W + 0.3, x1, 2.9, W - 0.3, glass)
    g.box(x0, 3.0, -0.8, x1, 3.25, 0.8, rgb(0xffa531))
    g.box(x0, 0.9, -W + 0.2, x1, 1.3, W - 0.2, stripe)
  }
  const d = g.build()!
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(d.position, 3))
  geo.setAttribute('normal', new THREE.BufferAttribute(d.normal, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(d.color, 3))
  geo.setIndex(new THREE.BufferAttribute(d.index, 1))
  geo.computeBoundingSphere()
  return geo
}

export class TrainRenderer {
  readonly root = new THREE.Group()
  private readonly slots: Slot[] = []
  private readonly geometries = new Map<string, THREE.BufferGeometry>()
  private readonly metro: MetroSystem
  /** 当前显示的列车（调试和测试用） */
  visible: VisibleTrain[] = []

  constructor(metro: MetroSystem, material: THREE.Material) {
    this.metro = metro
    this.root.name = 'trains'
    for (let i = 0; i < TRAIN.max; i++) {
      const group = new THREE.Group()
      const cars = Array.from({ length: TRAIN.cars }, () => {
        const m = new THREE.Mesh(undefined, material)
        m.rotation.order = 'YZX'
        group.add(m)
        return m
      })
      group.visible = false
      this.root.add(group)
      this.slots.push({ group, cars, key: null, line: null })
    }
  }

  private geometry(kind: CarKind, line: string) {
    const k = `${line}|${kind}`
    let g = this.geometries.get(k)
    if (!g) {
      const color = Number.parseInt((this.metro.lineById.get(line)?.color ?? '#888888').slice(1), 16)
      g = carGeometry(kind, color)
      this.geometries.set(k, g)
    }
    return g
  }

  /** 游戏时刻 t（秒）、焦点 (x, z)、可见半径 radius */
  update(t: number, x: number, z: number, radius: number) {
    // 车头在地面以上（高架、地面段、坡道）才画；隧道里的看不见
    const trains = this.metro.trainsNear(t, x, z, radius, TRAIN.max, (h) => h > -0.5)
    this.visible = trains
    const byKey = new Map(trains.map((tr) => [tr.key, tr]))
    // 已经在显示的列车留在原槽位，其余槽位腾出来
    const free: Slot[] = []
    for (const s of this.slots) {
      if (s.key && byKey.has(s.key)) continue
      s.key = null
      s.group.visible = false
      free.push(s)
    }
    for (const tr of trains) {
      let slot = this.slots.find((s) => s.key === tr.key)
      if (!slot) {
        slot = free.pop()
        if (!slot) break
        slot.key = tr.key
      }
      if (slot.line !== tr.rt.line.id) {
        slot.line = tr.rt.line.id
        slot.cars.forEach((m, i) => (m.geometry = this.geometry(i === 0 ? 'head' : i === TRAIN.cars - 1 ? 'tail' : 'middle', tr.rt.line.id)))
      }
      this.place(slot, tr)
      slot.group.visible = true
    }
  }

  // 每节车厢按前后两端在轨迹上的位置摆放：朝向、坡度跟着轨道
  private place(slot: Slot, tr: VisibleTrain) {
    const path = tr.rt.path
    const L = TRAIN.carLength / 2
    slot.cars.forEach((car, i) => {
      const center = tr.arc - L - i * (TRAIN.carLength + TRAIN.gap)
      const f = path.at(center + L)
      const b = path.at(center - L)
      const dx = f.x - b.x
      const dz = f.z - b.z
      const len = Math.hypot(dx, dz) || 1
      // 右侧行车：偏到前进方向右侧（x 东、z 南时右侧是 (-dz, dx)）
      const rx = -dz / len
      const rz = dx / len
      car.position.set((f.x + b.x) / 2 + rx * TRAIN.lateral, (f.h + b.h) / 2 + 0.1, (f.z + b.z) / 2 + rz * TRAIN.lateral)
      car.rotation.set(0, -Math.atan2(dz, dx), Math.atan2(f.h - b.h, len))
    })
  }

  dispose() {
    for (const g of this.geometries.values()) g.dispose()
    this.root.removeFromParent()
  }
}

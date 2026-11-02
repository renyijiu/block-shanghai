import { describe, expect, test } from 'vitest'
import * as THREE from 'three/webgpu'
import { NPCManager } from '../src/engine/actors/NPCManager.ts'
import type { NpcContent, NpcType } from '../src/engine/city.ts'
import type { CollisionWorld } from '../src/engine/geo/CollisionWorld.ts'
import type { Projection } from '../src/engine/geo/projection.ts'
import { lookOf } from '../src/engine/sky/weather.ts'
import { chunkKey } from '../src/engine/world/chunks.ts'
import type { RoadPiece } from '../src/engine/world/data.ts'
import type { WorldData } from '../src/engine/world/WorldData.ts'

const type = (id: string, kind?: NpcType['kind']): NpcType => ({ id, name: id, speech: 'mandarin', shirts: [0x3a7bd5], pants: [0x2f3440], hair: [0x2a2220], kind, lines: [] })
const content: NpcContent = { types: [type('office'), type('rider', 'ride')], weatherLines: {}, nightLines: [], matchmaking: { lat: 0, lon: 0 } }

// 玩家站在 (50, 50)；马路在 z = 60 东西向，弯的那条到 x = 50 往东南拐 31°；
// 旁边一截 2 格长的路段（道路被分块边界切下的那种）
const PLAYER = [50, 50] as const
const STRAIGHT: RoadPiece = [0, [0, 60, 0, 100, 60, 0]]
const BENT: RoadPiece = [0, [0, 60, 0, 50, 60, 0, 100, 90, 0]]
const STUB: RoadPiece = [1, [40, 75, 0, 42, 75, 0]]

function manager(pieces: RoadPiece[]) {
  const road = { name: '', class: 'secondary' as const, width: 6, level: 0, bridge: false }
  const world = { roads: { version: 0, roads: [road, road], chunks: { [chunkKey(0, 0)]: pieces } }, water: { chunks: {} } } as unknown as WorldData
  const collision = { query: () => [] } as unknown as CollisionWorld
  const proj = { project: () => ({ x: 5000, z: 5000 }) } as unknown as Projection
  return new NPCManager(content, world, collision, proj)
}

/** 某个部件各实例在地面上的位置（身体、车的实例顺序就是人的顺序） */
function positions(m: NPCManager, part: string): [number, number][] {
  const im = m.root.getObjectByName(part) as THREE.InstancedMesh
  const mat = new THREE.Matrix4()
  const v = new THREE.Vector3()
  return Array.from({ length: im.count }, (_, i) => {
    im.getMatrixAt(i, mat)
    v.setFromMatrixPosition(mat)
    return [v.x, v.z]
  })
}

// 上午 10 点、晴天、工作日，以 30 fps 走 seconds 秒，每帧回调一次
function run(m: NPCManager, seconds: number, frame: () => void) {
  for (let t = 0; t < seconds; t += 1 / 30) {
    m.update(1 / 30, PLAYER[0], PLAYER[1], 10, 'sunny', lookOf('sunny'), false)
    frame()
  }
}

describe('路人', () => {
  test('不在很短的路段上生成', () => {
    const m = manager([STUB])
    run(m, 1, () => {})
    expect(m.count).toBe(0)
  })

  test('拐弯、走到路的尽头掉头，都不会一下子跳到别处', () => {
    const m = manager([BENT, STUB])
    let prev = positions(m, 'body')
    let worst = 0
    // 两分钟：骑手来回好几趟，走路的人也走到头掉过头
    run(m, 120, () => {
      const now = positions(m, 'body')
      prev.forEach(([x, z], i) => (worst = Math.max(worst, Math.hypot(now[i]![0] - x, now[i]![1] - z))))
      prev = now
    })
    expect(m.count).toBeGreaterThan(0)
    // 骑手一帧最多 7.5 / 30 ≈ 0.25 格，加上并道的横向一点
    expect(worst).toBeLessThan(0.5)
  })

  test('骑手掉头后并到对面车道，靠右行驶', () => {
    const m = manager([STRAIGHT])
    let prev = positions(m, 'bike')
    let checked = 0
    run(m, 60, () => {
      const now = positions(m, 'bike')
      prev.forEach(([x], i) => {
        const [nx, nz] = now[i]!
        // 并道已经完成的：往东（+x）走在路中线南侧（+z），往西走在北侧
        if (Math.abs(nx - x) < 1e-6 || Math.abs(Math.abs(nz - 60) - 1.8) > 1e-6) return
        expect(Math.sign(nz - 60)).toBe(Math.sign(nx - x))
        checked++
      })
      prev = now
    })
    expect(checked).toBeGreaterThan(0)
  })
})

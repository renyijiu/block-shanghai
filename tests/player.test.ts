import { describe, expect, test } from 'vitest'
import { PLAYER, Player, type PlayerWorld } from '../src/engine/actors/Player.ts'
import type { Box } from '../src/engine/geo/CollisionWorld.ts'

function world(boxes: Box[], water?: (x: number, z: number) => boolean): PlayerWorld {
  return {
    boxes: (x0, z0, x1, z1) => boxes.filter((b) => b.x1 > x0 && b.x0 < x1 && b.z1 > z0 && b.z0 < z1),
    walkable: (x, z) => !water?.(x, z)
  }
}

// 以 60 fps 推进若干秒
function run(p: Player, w: PlayerWorld, seconds: number, dx: number, dz: number, jump = false) {
  for (let t = 0; t < seconds; t += 1 / 60) p.update(1 / 60, { dx, dz, run: false, jump: jump && t === 0 }, w)
}

describe('Player', () => {
  test('步行速度 7 格/秒', () => {
    const p = new Player()
    run(p, world([]), 1, 1, 0)
    expect(p.pos.x).toBeCloseTo(PLAYER.walk, 0)
  })

  test('撞墙停下，沿墙滑动', () => {
    const p = new Player()
    const wall: Box = { x0: 5, y0: 0, z0: -10, x1: 6, y1: 10, z1: 10 }
    run(p, world([wall]), 2, 1, 0.5)
    expect(p.pos.x).toBeLessThanOrEqual(5 - PLAYER.radius + 1e-6)
    expect(p.pos.z).toBeGreaterThan(5)
  })

  test('矮台阶直接迈上去，高的过不去', () => {
    const p = new Player()
    run(p, world([{ x0: 2, y0: 0, z0: -5, x1: 20, y1: 0.4, z1: 5 }]), 1, 1, 0)
    expect(p.pos.y).toBeCloseTo(0.4)
    const q = new Player()
    run(q, world([{ x0: 2, y0: 0, z0: -5, x1: 20, y1: 1.2, z1: 5 }]), 1, 1, 0)
    expect(q.pos.x).toBeLessThan(2)
  })

  test('跳起来能落到 1.2 格高的方块上', () => {
    const p = new Player()
    const w = world([{ x0: 1, y0: 0, z0: -5, x1: 20, y1: 1.2, z1: 5 }])
    p.pos.x = 0.4
    run(p, w, 1, 1, 0, true)
    expect(p.pos.y).toBeCloseTo(1.2)
    expect(p.onGround).toBe(true)
  })

  test('只挡相机的树冠不挡人', () => {
    const p = new Player()
    run(p, world([{ x0: 2, y0: 0, z0: -5, x1: 4, y1: 5, z1: 5, soft: true }]), 1, 1, 0)
    expect(p.pos.x).toBeGreaterThan(4)
  })

  test('不能走进水里', () => {
    const p = new Player()
    run(p, world([], (x) => x > 3), 2, 1, 0)
    expect(p.pos.x).toBeLessThanOrEqual(3)
  })

  test('出生点被占时找最近的空位', () => {
    const p = new Player()
    const w = world([{ x0: -2, y0: 0, z0: -2, x1: 2, y1: 5, z1: 2 }])
    p.spawn(0, 0, w)
    expect(Math.max(Math.abs(p.pos.x), Math.abs(p.pos.z))).toBeGreaterThanOrEqual(2 + PLAYER.radius)
  })
})

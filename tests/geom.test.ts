import { describe, expect, test } from 'vitest'
import { clipPolyline, clipRing, densify, labelPoint, mergeLines, pointInRing, ringArea, simplify, simplifyRing, type Pt } from '../tools/lib/geom.ts'

const rect = { minX: 0, minY: 0, maxX: 10, maxY: 10 }
const square = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]

describe('ringArea / pointInRing', () => {
  test('逆时针为正', () => {
    expect(ringArea(square(0, 0, 2, 3))).toBe(6)
    expect(ringArea(square(0, 0, 2, 3).reverse())).toBe(-6)
  })
  test('点在环内', () => {
    expect(pointInRing(1, 1, square(0, 0, 2, 2))).toBe(true)
    expect(pointInRing(3, 1, square(0, 0, 2, 2))).toBe(false)
  })
})

describe('simplify', () => {
  test('共线点被去掉，拐点保留', () => {
    const pts: Pt[] = [[0, 0], [1, 0.01], [2, 0], [2, 5]]
    expect(simplify(pts, 0.1)).toEqual([[0, 0], [2, 0], [2, 5]])
  })
  test('首尾点总是保留', () => {
    expect(simplify([[0, 0], [1, 0]], 10)).toEqual([[0, 0], [1, 0]])
  })
  test('闭合环抽稀后仍是原来的方形', () => {
    const ring: Pt[] = [[0, 0], [5, 0.01], [10, 0], [10, 10], [5, 10], [0, 10], [0, 0]]
    const s = simplifyRing(ring, 0.1)
    expect(s).toHaveLength(4)
    expect(Math.abs(ringArea(s))).toBeCloseTo(100, 1)
  })
})

describe('clipPolyline', () => {
  test('穿过矩形的线段被裁到边界上', () => {
    expect(clipPolyline([[-5, 5], [15, 5]], rect)).toEqual([[[0, 5], [10, 5]]])
  })
  test('出去再进来的折线拆成两段，附加分量按比例插值', () => {
    const pieces = clipPolyline([[2, 2, 0], [2, 12, 10], [8, 12, 10], [8, 2, 0]], rect)
    expect(pieces).toHaveLength(2)
    expect(pieces[0]).toEqual([[2, 2, 0], [2, 10, 8]])
    expect(pieces[1]![0]).toEqual([8, 10, 8])
  })
  test('完全在外面的折线没有输出', () => {
    expect(clipPolyline([[20, 20], [30, 30]], rect)).toEqual([])
  })
})

describe('clipRing', () => {
  test('与矩形部分重叠的方形', () => {
    const r = clipRing(square(5, 5, 15, 15), rect)
    expect(Math.abs(ringArea(r))).toBeCloseTo(25)
  })
  test('包住矩形的环裁出整个矩形', () => {
    expect(Math.abs(ringArea(clipRing(square(-5, -5, 15, 15), rect)))).toBeCloseTo(100)
  })
  test('不相交返回空', () => {
    expect(clipRing(square(20, 20, 30, 30), rect)).toEqual([])
  })
})

describe('mergeLines', () => {
  test('同 key 首尾相接的线拼成一条', () => {
    const merged = mergeLines(
      [
        { key: 'a', pts: [[0, 0], [1, 0]] },
        { key: 'a', pts: [[1, 0], [2, 0]] },
        { key: 'b', pts: [[2, 0], [3, 0]] }
      ],
      false
    )
    expect(merged.map((m) => m.pts)).toEqual([[[0, 0], [1, 0], [2, 0]], [[2, 0], [3, 0]]])
  })
  test('允许反向时可以接上方向相反的线', () => {
    const lines = [
      { key: '', pts: [[0, 0], [1, 0]] },
      { key: '', pts: [[2, 0], [1, 0]] }
    ]
    expect(mergeLines(lines, false)).toHaveLength(2)
    expect(mergeLines(lines, true).map((m) => m.pts)).toEqual([[[0, 0], [1, 0], [2, 0]]])
  })
  test('拼成闭合环后停止', () => {
    const merged = mergeLines(
      [
        { key: '', pts: [[0, 0], [1, 0], [1, 1]] },
        { key: '', pts: [[1, 1], [0, 1], [0, 0]] }
      ],
      false
    )
    expect(merged).toHaveLength(1)
    expect(merged[0]!.pts).toHaveLength(5)
  })
})

test('densify 按最大间距插点', () => {
  expect(densify([[0, 0], [10, 0]], 3)).toEqual([[0, 0], [2.5, 0], [5, 0], [7.5, 0], [10, 0]])
})

test('labelPoint 避开被排除的区域', () => {
  const poly = [[square(0, 0, 10, 10)]]
  const p = labelPoint(poly, () => false)!
  expect(p[0]).toBeCloseTo(5, 0)
  expect(p[1]).toBeCloseTo(5, 0)
  // 右半边是海
  const q = labelPoint(poly, (x) => x > 5)!
  expect(q[0]).toBeLessThan(5)
})

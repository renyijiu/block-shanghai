// 方块几何的顶点缓冲：位置、法线、颜色（线性空间）、窗户系数，输出 TypedArray。纯数据，不依赖渲染器
import { Color } from 'three/webgpu'

export interface GeometryData {
  position: Float32Array
  normal: Float32Array
  color: Float32Array
  /** 墙面画窗户的强度（0 不画，1 正常）；只有建筑网格有 */
  win?: Float32Array
  index: Uint32Array
}

export type RGB = [number, number, number]

// 顶点颜色要用线性空间的值：Color.setHex 会把 sRGB 十六进制换算过去，直接除 255 会整体发白
const cache = new Map<number, RGB>()
export const rgb = (h: number): RGB => {
  let c = cache.get(h)
  if (!c) {
    const col = new Color(h)
    c = [col.r, col.g, col.b]
    cache.set(h, c)
  }
  return c
}

export class GeoBuilder {
  pos: number[] = []
  nor: number[] = []
  col: number[] = []
  win: number[] = []
  idx: number[] = []
  /** 之后加的顶点的窗户系数 */
  window = 0

  get vertexCount() {
    return this.pos.length / 3
  }

  vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, c: RGB) {
    this.pos.push(x, y, z)
    this.nor.push(nx, ny, nz)
    this.col.push(c[0], c[1], c[2])
    this.win.push(this.window)
    return this.pos.length / 3 - 1
  }

  /** 四边形 a-b-c-d，从法线一侧看是逆时针 */
  quad(a: number[], b: number[], c: number[], d: number[], n: number[], col: RGB) {
    const i = this.vertex(a[0]!, a[1]!, a[2]!, n[0]!, n[1]!, n[2]!, col)
    this.vertex(b[0]!, b[1]!, b[2]!, n[0]!, n[1]!, n[2]!, col)
    this.vertex(c[0]!, c[1]!, c[2]!, n[0]!, n[1]!, n[2]!, col)
    this.vertex(d[0]!, d[1]!, d[2]!, n[0]!, n[1]!, n[2]!, col)
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3)
  }

  /** 轴对齐方块（不含底面）；top 给出时顶面用另一种颜色 */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: RGB, top: RGB = c) {
    this.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0], top)
    this.quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0], c)
    this.quad([x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], [-1, 0, 0], c)
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], c)
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], c)
  }

  /**
   * 任意朝向的方块（不含底面）：中心 (cx, cz)，沿 angle 方向（atan2(dz, dx)）长 len、横向宽 wid，高度 y0..y1。
   * 用于地铁桥墩盖梁、隧道口、车站等沿轨道方向的构件
   */
  orientedBox(cx: number, cz: number, angle: number, len: number, wid: number, y0: number, y1: number, c: RGB, top: RGB = c) {
    const ux = Math.cos(angle)
    const uz = Math.sin(angle)
    // 横向（沿前进方向的左侧）
    const vx = uz
    const vz = -ux
    const hl = len / 2
    const hw = wid / 2
    const P = (a: number, b: number, y: number) => [cx + ux * a + vx * b, y, cz + uz * a + vz * b]
    // 四个角：后左、前左、前右、后右（俯视）
    const bl = [-hl, hw]
    const fl = [hl, hw]
    const fr = [hl, -hw]
    const br = [-hl, -hw]
    const face = (p: number[], q: number[], n: number[], col: RGB) =>
      this.quad(P(p[0]!, p[1]!, y0), P(p[0]!, p[1]!, y1), P(q[0]!, q[1]!, y1), P(q[0]!, q[1]!, y0), n, col)
    // 侧面法线：前 +u、后 -u、左 +v、右 -v
    face(fl, fr, [ux, 0, uz], c)
    face(br, bl, [-ux, 0, -uz], c)
    face(bl, fl, [vx, 0, vz], c)
    face(fr, br, [-vx, 0, -vz], c)
    // 顶面：从上往下看要顺时针（x 东 z 南）
    const t = [P(bl[0]!, bl[1]!, y1), P(fl[0]!, fl[1]!, y1), P(fr[0]!, fr[1]!, y1), P(br[0]!, br[1]!, y1)]
    const cross = (t[1]![0]! - t[0]![0]!) * (t[2]![2]! - t[0]![2]!) - (t[1]![2]! - t[0]![2]!) * (t[2]![0]! - t[0]![0]!)
    if (cross < 0) this.quad(t[0]!, t[1]!, t[2]!, t[3]!, [0, 1, 0], top)
    else this.quad(t[0]!, t[3]!, t[2]!, t[1]!, [0, 1, 0], top)
  }

  tri(a: number[], b: number[], c: number[], n: number[], col: RGB) {
    const i = this.vertex(a[0]!, a[1]!, a[2]!, n[0]!, n[1]!, n[2]!, col)
    this.vertex(b[0]!, b[1]!, b[2]!, n[0]!, n[1]!, n[2]!, col)
    this.vertex(c[0]!, c[1]!, c[2]!, n[0]!, n[1]!, n[2]!, col)
    this.idx.push(i, i + 1, i + 2)
  }

  build(withWindows = false): GeometryData | null {
    if (!this.idx.length) return null
    const d: GeometryData = {
      position: new Float32Array(this.pos),
      normal: new Float32Array(this.nor),
      color: new Float32Array(this.col),
      index: new Uint32Array(this.idx)
    }
    if (withWindows) d.win = new Float32Array(this.win)
    return d
  }
}

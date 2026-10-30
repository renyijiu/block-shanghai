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

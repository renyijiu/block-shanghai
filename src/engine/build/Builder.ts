// 建模工具：城市包的建筑和树用它拼方块。普通方块和玻璃幕墙各合并成一个网格，同时登记碰撞盒（docs/02 第 5 节）
import { orientedBox, type Box } from '../geo/CollisionWorld.ts'
import { GeoBuilder, rgb, type GeometryData } from './geometry.ts'

export interface BoxOptions {
  /** 顶面颜色（屋顶），默认同墙面 */
  top?: number
  /** 玻璃幕墙：进玻璃网格（有高光） */
  glass?: boolean
  /** 墙面窗户强度 0–1，默认 1；屋顶构件、树、围墙传 0 */
  windows?: number
  /** 是否登记碰撞盒；默认贴地（y0 < 1）的方块登记。'camera' 只挡相机不挡人（树冠） */
  collide?: boolean | 'camera'
  /** 加上底面（站内的天花板、悬挂的牌子从下面看得见） */
  bottom?: boolean
}

export class Builder {
  readonly solid = new GeoBuilder()
  readonly glass = new GeoBuilder()
  readonly colliders: Box[] = []

  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number, o: BoxOptions = {}) {
    if (x1 <= x0 || y1 <= y0 || z1 <= z0) return
    const g = o.glass ? this.glass : this.solid
    g.window = o.windows ?? 1
    g.box(x0, y0, z0, x1, y1, z1, rgb(color), rgb(o.top ?? color))
    if (o.bottom) g.bottom(x0, y0, z0, x1, z1, rgb(color))
    const c = o.collide ?? y0 < 1
    if (c === 'camera') this.colliders.push({ x0, y0, z0, x1, y1, z1, soft: true })
    else if (c) this.colliders.push({ x0, y0, z0, x1, y1, z1 })
  }

  /** 任意朝向的方块；斜放的碰撞盒带 obb，按实际朝向判断 */
  orientedBox(cx: number, cz: number, angle: number, len: number, wid: number, y0: number, y1: number, color: number, o: BoxOptions = {}) {
    const g = o.glass ? this.glass : this.solid
    g.window = o.windows ?? 1
    g.orientedBox(cx, cz, angle, len, wid, y0, y1, rgb(color), rgb(o.top ?? color))
    const c = o.collide ?? y0 < 1
    if (c) {
      const box = orientedBox(cx, cz, angle, len, wid, y0, y1)
      if (c === 'camera') box.soft = true
      this.colliders.push(box)
    }
  }

  /**
   * 双坡屋顶：底面矩形、檐口高度 y0、屋脊高 h；屋脊沿 axis 方向（'x' 东西向、'z' 南北向）。
   * 两端是三角形山墙
   */
  gable(x0: number, z0: number, x1: number, z1: number, y0: number, h: number, axis: 'x' | 'z', roof: number, wall: number) {
    const g = this.solid
    g.window = 0
    const r = rgb(roof)
    const w = rgb(wall)
    const y1 = y0 + h
    if (axis === 'x') {
      const zm = (z0 + z1) / 2
      const s = Math.hypot(h, zm - z0)
      // 北坡（-z）、南坡（+z）
      g.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, zm], [x1, y1, zm], [0, (zm - z0) / s, -h / s], r)
      g.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, zm], [x0, y1, zm], [0, (zm - z0) / s, h / s], r)
      g.tri([x1, y0, z0], [x1, y1, zm], [x1, y0, z1], [1, 0, 0], w)
      g.tri([x0, y0, z1], [x0, y1, zm], [x0, y0, z0], [-1, 0, 0], w)
    } else {
      const xm = (x0 + x1) / 2
      const s = Math.hypot(h, xm - x0)
      g.quad([x0, y0, z0], [x0, y0, z1], [xm, y1, z1], [xm, y1, z0], [-h / s, (xm - x0) / s, 0], r)
      g.quad([x1, y0, z1], [x1, y0, z0], [xm, y1, z0], [xm, y1, z1], [h / s, (xm - x0) / s, 0], r)
      g.tri([x0, y0, z1], [x1, y0, z1], [xm, y1, z1], [0, 0, 1], w)
      g.tri([x1, y0, z0], [x0, y0, z0], [xm, y1, z0], [0, 0, -1], w)
    }
  }

  build(): { solid: GeometryData | null; glass: GeometryData | null; colliders: Box[] } {
    return { solid: this.solid.build(true), glass: this.glass.build(true), colliders: this.colliders }
  }
}

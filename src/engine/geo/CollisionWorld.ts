// 碰撞世界：碰撞盒按网格做空间索引，按 owner（分块、景点）登记，卸载时一次清理。
// 世界全是方块，自写 AABB 最简单（docs/07 第 7 节）；斜着摆的方块（外滩沿线、斜桥）带一个水平朝向的 obb，查询时精确判断
export interface Box {
  x0: number
  y0: number
  z0: number
  x1: number
  y1: number
  z1: number
  /** 只挡相机、不挡人（树冠） */
  soft?: boolean
  /** 可站立的平台：水面上有它也能走（九曲桥、观光层） */
  deck?: boolean
  /** 水平方向斜放的方块：中心、长度方向单位向量、半长、半宽。x0..z1 是它的外接矩形 */
  obb?: Obb
  /** 登记时填上（分块 key、`landmark:<id>`），拍照判断遮挡时跳过景点自己 */
  owner?: string
}

export interface Obb {
  cx: number
  cz: number
  ux: number
  uz: number
  hl: number
  hw: number
}

/** 斜放方块：外接矩形 + obb；接近轴对齐时不带 obb */
export function orientedBox(cx: number, cz: number, angle: number, len: number, wid: number, y0: number, y1: number): Box {
  const ux = Math.cos(angle)
  const uz = Math.sin(angle)
  const ex = (Math.abs(ux) * len + Math.abs(uz) * wid) / 2
  const ez = (Math.abs(uz) * len + Math.abs(ux) * wid) / 2
  const box: Box = { x0: cx - ex, y0, z0: cz - ez, x1: cx + ex, y1, z1: cz + ez }
  if (Math.abs(Math.sin(2 * angle)) > 1e-3) box.obb = { cx, cz, ux, uz, hl: len / 2, hw: wid / 2 }
  return box
}

/** 轴对齐矩形和 obb 是否相交（分离轴：外接矩形已经测过世界轴，这里只测 obb 自己的两个轴） */
export function rectHitsObb(x0: number, z0: number, x1: number, z1: number, o: Obb) {
  const rx = (x1 - x0) / 2
  const rz = (z1 - z0) / 2
  const dx = (x0 + x1) / 2 - o.cx
  const dz = (z0 + z1) / 2 - o.cz
  const ax = Math.abs(o.ux)
  const az = Math.abs(o.uz)
  // u 轴（长度方向）、v 轴（宽度方向，(-uz, ux)）
  if (Math.abs(dx * o.ux + dz * o.uz) > o.hl + rx * ax + rz * az) return false
  return Math.abs(-dx * o.uz + dz * o.ux) <= o.hw + rx * az + rz * ax
}

const CELL = 16

export class CollisionWorld {
  private readonly cells = new Map<string, Box[]>()
  private readonly owners = new Map<string, { box: Box; cells: string[] }[]>()

  get ownerCount() {
    return this.owners.size
  }

  add(owner: string, boxes: Box[]) {
    const list = this.owners.get(owner) ?? this.owners.set(owner, []).get(owner)!
    for (const box of boxes) {
      box.owner = owner
      const keys: string[] = []
      for (let cx = Math.floor(box.x0 / CELL); cx <= Math.floor(box.x1 / CELL); cx++)
        for (let cz = Math.floor(box.z0 / CELL); cz <= Math.floor(box.z1 / CELL); cz++) {
          const k = `${cx},${cz}`
          ;(this.cells.get(k) ?? this.cells.set(k, []).get(k)!).push(box)
          keys.push(k)
        }
      list.push({ box, cells: keys })
    }
  }

  removeOwner(owner: string) {
    const list = this.owners.get(owner)
    if (!list) return
    for (const { box, cells } of list) {
      for (const k of cells) {
        const arr = this.cells.get(k)
        if (!arr) continue
        const i = arr.indexOf(box)
        if (i >= 0) arr.splice(i, 1)
        if (!arr.length) this.cells.delete(k)
      }
    }
    this.owners.delete(owner)
  }

  /** 与水平矩形相交的碰撞盒（去重） */
  query(x0: number, z0: number, x1: number, z1: number): Box[] {
    const out = new Set<Box>()
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++)
      for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++)
        for (const b of this.cells.get(`${cx},${cz}`) ?? []) if (b.x1 > x0 && b.x0 < x1 && b.z1 > z0 && b.z0 < z1 && (!b.obb || rectHitsObb(x0, z0, x1, z1, b.obb))) out.add(b)
    return [...out]
  }

  /**
   * 线段 a → b 有没有被碰撞盒挡住（拍照的遮挡判断）。每隔 step 格取一个点，点落在盒子里算挡住；
   * skip 返回 true 的盒子不算（只挡相机的树冠、被拍的景点自己）
   */
  segmentBlocked(ax: number, ay: number, az: number, bx: number, by: number, bz: number, skip: (b: Box) => boolean = () => false, step = 1.5): boolean {
    const len = Math.hypot(bx - ax, by - ay, bz - az)
    const n = Math.max(1, Math.ceil(len / step))
    // 两头各留一点，不算相机所在和目标点本身
    for (let i = 1; i < n; i++) {
      const t = i / n
      const x = ax + (bx - ax) * t
      const y = ay + (by - ay) * t
      const z = az + (bz - az) * t
      for (const b of this.cells.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) ?? []) {
        if (y < b.y0 || y > b.y1 || x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1 || skip(b)) continue
        if (b.obb && !rectHitsObb(x, z, x, z, b.obb)) continue
        return true
      }
    }
    return false
  }

  clear() {
    this.cells.clear()
    this.owners.clear()
  }
}

// 碰撞世界：轴对齐碰撞盒按网格做空间索引，按 owner（分块、景点）登记，卸载时一次清理。
// 世界全是方块，自写 AABB 最简单（docs/07 第 7 节）
export interface Box {
  x0: number
  y0: number
  z0: number
  x1: number
  y1: number
  z1: number
  /** 只挡相机、不挡人（树冠） */
  soft?: boolean
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
        for (const b of this.cells.get(`${cx},${cz}`) ?? []) if (b.x1 > x0 && b.x0 < x1 && b.z1 > z0 && b.z0 < z1) out.add(b)
    return [...out]
  }

  clear() {
    this.cells.clear()
    this.owners.clear()
  }
}

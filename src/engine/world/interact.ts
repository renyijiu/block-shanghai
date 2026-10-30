// 交互点：按 owner（分块、景点）登记，卸载时一并清理（docs/02 第 5 节）。玩家走近时提示，按 E 或点按钮触发
export interface InteractPoint {
  x: number
  z: number
  /** 触发半径（格） */
  r: number
  /** 提示文字，如“进站 · 人民广场 · 2 号口” */
  label: string
  /** 按钮上的短文字，如“进站” */
  action: string
  kind: 'metro'
  /** 地铁口：车站序号、出入口序号 */
  station: number
  entrance: number
}

export class InteractRegistry {
  private readonly owners = new Map<string, InteractPoint[]>()

  add(owner: string, points: InteractPoint[]) {
    if (points.length) this.owners.set(owner, [...(this.owners.get(owner) ?? []), ...points])
  }

  removeOwner(owner: string) {
    this.owners.delete(owner)
  }

  /** 离 (x, z) 最近、且在触发半径内的交互点 */
  nearest(x: number, z: number): InteractPoint | null {
    let best: InteractPoint | null = null
    let bestD = Infinity
    for (const list of this.owners.values()) {
      for (const p of list) {
        const d = Math.hypot(p.x - x, p.z - z)
        if (d <= p.r && d < bestD) {
          bestD = d
          best = p
        }
      }
    }
    return best
  }
}

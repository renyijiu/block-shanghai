// 交互点：按 owner（分块、景点）登记，卸载时一并清理（docs/02 第 5 节）。玩家走近时提示，按 E 或点按钮触发
export interface InteractPoint {
  x: number
  z: number
  /** 触发半径（格） */
  r: number
  /** 高处的交互点（观光层的电梯口）：玩家脚底高度相差 3 格以内才触发 */
  y?: number
  /** 提示文字，如“进站 · 人民广场 · 2 号口” */
  label: string
  /** 按钮上的短文字，如“进站” */
  action: string
  kind: 'metro' | 'elevator' | 'boat' | 'interior' | 'npc'
  /** 地铁口：车站序号、出入口序号 */
  station?: number
  entrance?: number
  /** 电梯：目标位置（世界坐标，y 是脚底高度）和到达后的提示 */
  target?: { x: number; y: number; z: number }
  arrive?: string
  /** 船：码头名 */
  pier?: string
  /** 路人：NPCManager 里的编号 */
  npc?: number
  /** 站内：要做的事（“gate:in”“platform:L2”“exit:12”“board:0”“alight”…），由 InteriorManager 处理 */
  go?: string
}

export class InteractRegistry {
  private readonly owners = new Map<string, InteractPoint[]>()

  add(owner: string, points: InteractPoint[]) {
    if (points.length) this.owners.set(owner, [...(this.owners.get(owner) ?? []), ...points])
  }

  removeOwner(owner: string) {
    this.owners.delete(owner)
  }

  /** 离 (x, z) 最近、且在触发半径内的交互点；y 是玩家脚底高度 */
  nearest(x: number, z: number, y = 0): InteractPoint | null {
    let best: InteractPoint | null = null
    let bestD = Infinity
    for (const list of this.owners.values()) {
      for (const p of list) {
        const d = Math.hypot(p.x - x, p.z - z)
        if (Math.abs((p.y ?? 0) - y) > 3) continue
        if (d <= p.r && d < bestD) {
          bestD = d
          best = p
        }
      }
    }
    return best
  }
}

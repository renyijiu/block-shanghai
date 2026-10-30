// 运行时的地铁系统：加载 metro.json，建线网图、行车轨迹和时刻表，提供路线规划和列车位置查询
import { METRO_DATA_VERSION, type MetroData, type MetroLine, type MetroService } from './data.ts'
import { buildGraph, planRoute, type MetroGraph, type Route, type RouteMode } from './network.ts'
import { ServicePath } from './path.ts'
import { departures, serviceTimes, trainsAt, type ServiceTimes, type TrainState } from './timetable.ts'

export interface ServiceRuntime {
  line: MetroLine
  service: MetroService
  path: ServicePath
  times: ServiceTimes
  deps: number[]
}

export interface VisibleTrain {
  key: string
  rt: ServiceRuntime
  state: TrainState
  /** 车头所在的游戏弧长 */
  arc: number
  /** 车头离焦点的距离（格） */
  dist: number
}

export class MetroSystem {
  readonly data: MetroData
  readonly graph: MetroGraph
  readonly services: ServiceRuntime[]
  readonly lineById: Map<string, MetroLine>

  private constructor(data: MetroData) {
    this.data = data
    this.graph = buildGraph(data)
    this.lineById = new Map(data.lines.map((l) => [l.id, l]))
    this.services = data.lines.flatMap((line) =>
      line.services.map((service) => ({ line, service, path: new ServicePath(service), times: serviceTimes(service, line.kind, data.rules), deps: departures(service, data.rules) }))
    )
  }

  static async load(url: string): Promise<MetroSystem> {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`加载地铁数据失败：${res.status} ${url}`)
    const data = (await res.json()) as MetroData
    if (data.version !== METRO_DATA_VERSION) throw new Error(`地铁数据版本 ${data.version} 与引擎 ${METRO_DATA_VERSION} 不一致，请重新烘焙`)
    return new MetroSystem(data)
  }

  /** 离 (x, z) 最近的车站 */
  nearestStation(x: number, z: number) {
    let best = 0
    let bestD = Infinity
    this.data.stations.forEach((s, i) => {
      const d = Math.hypot(s.pos[0] - x, s.pos[1] - z)
      if (d < bestD) {
        bestD = d
        best = i
      }
    })
    return best
  }

  plan(from: number, to: number, mode: RouteMode = 'fastest'): Route | null {
    return planRoute(this.graph, from, to, mode)
  }

  /**
   * 游戏时刻 t 在 (x, z) 附近 radius 格内的列车，按距离排序，最多 max 列。
   * onSurface 过滤掉在隧道里的车（看不见）
   */
  trainsNear(t: number, x: number, z: number, radius: number, max: number, onSurface: (h: number) => boolean): VisibleTrain[] {
    const out: VisibleTrain[] = []
    for (const rt of this.services) {
      for (const state of trainsAt(rt.service, rt.times, rt.deps, t)) {
        const arc = rt.path.kmToArc(state.km)
        const p = rt.path.at(arc)
        const dist = Math.hypot(p.x - x, p.z - z)
        if (dist > radius || !onSurface(p.h)) continue
        out.push({ key: `${rt.service.id}#${state.run}`, rt, state, arc, dist })
      }
    }
    out.sort((a, b) => a.dist - b.dist)
    return out.slice(0, max)
  }
}

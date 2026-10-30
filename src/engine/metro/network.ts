// 线网图、路线规划、票价（docs/04 第 5 节）。纯函数，不依赖渲染和浏览器
import type { LineKind, MetroData, MetroRules } from './data.ts'

interface Edge {
  to: number
  /** 真实分钟 */
  minutes: number
  km: number
  /** 乘车边的线路；换乘边为 null */
  line: string | null
  service: string | null
}

/** 线网图：节点是“车站 × 线路”的站台 */
export interface MetroGraph {
  data: MetroData
  /** 节点 → [车站序号, 线路 id] */
  nodes: [number, string][]
  /** 车站 → 它的站台节点 */
  platformsOf: number[][]
  edges: Edge[][]
  lineKind: Map<string, LineKind>
}

export type RouteMode = 'fastest' | 'fewest'

export interface RouteLeg {
  line: string
  /** 上车站、下车站（车站序号） */
  from: number
  to: number
  /** 经过的车站，含首尾 */
  stations: number[]
  minutes: number
  km: number
}

export interface Route {
  from: number
  to: number
  legs: RouteLeg[]
  /** 总时间（真实分钟，含换乘步行） */
  minutes: number
  transfers: number
  /** 实际乘坐的里程（km） */
  km: number
  /** 票价（元） */
  fare: number
}

/** 少换乘模式下每次换乘额外计的分钟数 */
const TRANSFER_PENALTY = 10

/** 区间运行时间（分钟）：里程 ÷ 平均速度，加上一次停站 */
export function rideMinutes(km: number, kind: LineKind, rules: MetroRules) {
  return (km / rules.avgSpeedKmh[kind]) * 60 + rules.dwellSec / 60
}

export function buildGraph(data: MetroData): MetroGraph {
  const nodes: [number, string][] = []
  const index = new Map<string, number>()
  const platformsOf: number[][] = data.stations.map(() => [])
  const lineKind = new Map(data.lines.map((l) => [l.id, l.kind]))
  const node = (station: number, line: string) => {
    const k = `${station}|${line}`
    let i = index.get(k)
    if (i === undefined) {
      i = nodes.length
      nodes.push([station, line])
      index.set(k, i)
      platformsOf[station]!.push(i)
    }
    return i
  }
  const edges: Edge[][] = []
  const addEdge = (a: number, e: Edge) => {
    const list = (edges[a] ??= [])
    // 多个交路经过同一区间时只留最快的一条
    const same = list.find((x) => x.to === e.to && x.line === e.line)
    if (!same) list.push(e)
    else if (e.minutes < same.minutes) Object.assign(same, e)
  }
  for (const line of data.lines) {
    for (const s of line.services) {
      for (let i = 1; i < s.stops.length; i++) {
        const a = node(s.stops[i - 1]!, line.id)
        const b = node(s.stops[i]!, line.id)
        const km = s.chainage[i]! - s.chainage[i - 1]!
        if (a === b || km <= 0) continue
        addEdge(a, { to: b, minutes: rideMinutes(km, line.kind, data.rules), km, line: line.id, service: s.id })
      }
    }
  }
  // 同站不同线路之间换乘
  data.stations.forEach((st, i) => {
    for (const a of platformsOf[i]!) for (const b of platformsOf[i]!) if (a !== b) addEdge(a, { to: b, minutes: st.transferMin, km: 0, line: null, service: null })
  })
  for (let i = 0; i < nodes.length; i++) edges[i] ??= []
  return { data, nodes, platformsOf, edges, lineKind }
}

// 二叉堆
class Heap {
  private readonly a: [number, number][] = []
  get size() {
    return this.a.length
  }
  push(cost: number, v: number) {
    const a = this.a
    a.push([cost, v])
    let i = a.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (a[p]![0] <= a[i]![0]) break
      ;[a[p], a[i]] = [a[i]!, a[p]!]
      i = p
    }
  }
  pop(): [number, number] {
    const a = this.a
    const top = a[0]!
    const last = a.pop()!
    if (a.length) {
      a[0] = last
      let i = 0
      for (;;) {
        const l = i * 2 + 1
        const r = l + 1
        let m = i
        if (l < a.length && a[l]![0] < a[m]![0]) m = l
        if (r < a.length && a[r]![0] < a[m]![0]) m = r
        if (m === i) break
        ;[a[m], a[i]] = [a[i]!, a[m]!]
        i = m
      }
    }
    return top
  }
}

/** 多源 Dijkstra：从 from 站的所有站台出发，到 to 站任一站台为止；返回到达节点和前驱边 */
function dijkstra(g: MetroGraph, from: number, to: number, weight: (e: Edge) => number, allow: (e: Edge) => boolean = () => true) {
  const dist = new Float64Array(g.nodes.length).fill(Infinity)
  const prev: ({ from: number; edge: Edge } | null)[] = new Array(g.nodes.length).fill(null)
  const heap = new Heap()
  for (const p of g.platformsOf[from] ?? []) {
    dist[p] = 0
    heap.push(0, p)
  }
  const targets = new Set(g.platformsOf[to] ?? [])
  while (heap.size) {
    const [d, v] = heap.pop()
    if (d > dist[v]!) continue
    if (targets.has(v)) return { end: v, dist, prev }
    for (const e of g.edges[v]!) {
      if (!allow(e)) continue
      const nd = d + weight(e)
      if (nd < dist[e.to]!) {
        dist[e.to] = nd
        prev[e.to] = { from: v, edge: e }
        heap.push(nd, e.to)
      }
    }
  }
  return null
}

/** 按里程计价：baseKm 内起步价，之后每 stepKm 加价（不足一档按一档） */
export function fareForKm(km: number, rules: MetroRules) {
  const f = rules.fare
  if (km <= f.baseKm) return f.baseYuan
  return f.baseYuan + Math.ceil((km - f.baseKm) / f.stepKm - 1e-9) * f.stepYuan
}

/** 两站之间地铁网络上的最短真实里程（不含磁浮），票价按它算 */
export function shortestKm(g: MetroGraph, from: number, to: number) {
  if (from === to) return 0
  const r = dijkstra(
    g,
    from,
    to,
    (e) => e.km,
    (e) => !e.line || g.lineKind.get(e.line) !== 'maglev'
  )
  return r ? r.dist[r.end]! : Infinity
}

/** 路线规划：最快，或少换乘（每次换乘多计 10 分钟） */
export function planRoute(g: MetroGraph, from: number, to: number, mode: RouteMode = 'fastest'): Route | null {
  if (from === to) return null
  const r = dijkstra(g, from, to, (e) => e.minutes + (mode === 'fewest' && !e.line ? TRANSFER_PENALTY : 0))
  if (!r) return null
  // 回溯成边序列
  const path: Edge[] = []
  for (let v = r.end; r.prev[v]; v = r.prev[v]!.from) path.unshift(r.prev[v]!.edge)
  // 首尾的换乘边没有意义（在起点站或终点站内换线），去掉
  while (path.length && !path[0]!.line) path.shift()
  while (path.length && !path[path.length - 1]!.line) path.pop()

  // 边序列拆成乘车段：同一条线连续坐就延长当前段，换线开新段
  const legs: RouteLeg[] = []
  let walk = 0
  let cur = from
  for (const e of path) {
    const station = g.nodes[e.to]![0]
    if (!e.line) {
      walk += e.minutes
      cur = station
      continue
    }
    const last = legs[legs.length - 1]
    if (last && last.line === e.line && last.to === cur) {
      last.to = station
      last.stations.push(station)
      last.minutes += e.minutes
      last.km += e.km
    } else legs.push({ line: e.line, from: cur, to: station, stations: [cur, station], minutes: e.minutes, km: e.km })
    cur = station
  }
  const minutes = legs.reduce((s, l) => s + l.minutes, 0) + walk
  return { from, to, legs, minutes, transfers: Math.max(0, legs.length - 1), km: legs.reduce((s, l) => s + l.km, 0), fare: routeFare(g, legs) }
}

/** 票价：连续的地铁段按最短里程计价，磁浮单独计价 */
export function routeFare(g: MetroGraph, legs: RouteLeg[]) {
  const rules = g.data.rules
  let fare = 0
  let metroFrom: number | null = null
  let metroTo = 0
  const flush = () => {
    if (metroFrom !== null) fare += fareForKm(shortestKm(g, metroFrom, metroTo), rules)
    metroFrom = null
  }
  for (const l of legs) {
    if (g.lineKind.get(l.line) === 'maglev') {
      flush()
      fare += rules.maglevFare
    } else {
      metroFrom ??= l.from
      metroTo = l.to
    }
  }
  flush()
  return fare
}

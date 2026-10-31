// 船：航线折线、时刻表和船的位置都是游戏时间的纯函数（和地铁时刻表一个思路，docs/02 第 5 节 Transport）。
// 渡轮在两个码头之间来回，游船从码头出发沿江开到折返点再开回来

/** 城市包里的一条船线（坐标是游戏格，由 BoatSystem 从经纬度换算并补上靠岸点） */
export interface BoatLine {
  id: string
  name: string
  kind: 'ferry' | 'cruise' | 'rowboat'
  /** 游船、手摇船的线路说明 */
  route?: string
  fare: number
  /** 航线：从码头 0 的靠岸点到码头 1 的靠岸点（游船是到折返点） */
  path: Polyline
  /** 码头名：渡轮两头各一个；游船只有出发码头 */
  piers: string[]
  /** 航速（格 / 游戏秒） */
  speed: number
  /** 首班、末班（游戏时刻，秒） */
  first: number
  last: number
  /** 渡轮：两头靠岸停留（秒）；游船：发船前停在码头上客的时间 */
  dwell: number
  /** 游船发船间隔（秒） */
  headway: number
}

export interface BoatPose {
  x: number
  z: number
  /** 船头朝向（弧度，atan2(dz, dx)） */
  angle: number
  /** 这一班的发船时刻（秒），区分同一条线上的不同船 */
  run: number
}

const DAY = 86400

/** 按弧长取点的折线 */
export class Polyline {
  readonly pts: [number, number][]
  private readonly arc: number[]
  readonly length: number

  constructor(pts: [number, number][]) {
    this.pts = pts
    this.arc = [0]
    for (let i = 1; i < pts.length; i++) this.arc.push(this.arc[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]))
    this.length = this.arc[this.arc.length - 1]!
  }

  at(s: number): [number, number] {
    const a = Math.max(0, Math.min(this.length, s))
    let i = 0
    while (i < this.arc.length - 2 && this.arc[i + 1]! < a) i++
    const span = this.arc[i + 1]! - this.arc[i]!
    const f = span > 0 ? (a - this.arc[i]!) / span : 0
    const p = this.pts[i]!
    const q = this.pts[i + 1]!
    return [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f]
  }

  /** 弧长 s 处的前进方向：取前后各 d 格的两点，转弯时船头平滑地转过去 */
  heading(s: number, d = 8): number {
    const [x0, z0] = this.at(s - d)
    const [x1, z1] = this.at(s + d)
    return Math.atan2(z1 - z0, x1 - x0)
  }
}

/** 单程航行时间（秒） */
export const crossing = (l: BoatLine) => l.path.length / l.speed

/** 渡轮一个来回（秒） */
const cycle = (l: BoatLine) => 2 * (crossing(l) + l.dwell)

/** 游船一班的航行时间（去程 + 回程，秒） */
export const cruiseDuration = (l: BoatLine) => (2 * l.path.length) / l.speed

/**
 * 从码头 pier 出发的下一班（游戏时间，秒，可以跨天）。
 * 渡轮从码头 0 在 first + k·周期 开出，码头 1 晚半个周期；游船从 first 起每 headway 一班，到 last 为止
 */
export function nextDeparture(l: BoatLine, pier: number, t: number): number {
  const day = Math.floor(t / DAY) * DAY
  const tod = t - day
  const offset = l.kind === 'ferry' && pier === 1 ? crossing(l) + l.dwell : 0
  const step = l.kind === 'ferry' ? cycle(l) : l.headway
  const k = Math.max(0, Math.ceil((tod - l.first - offset) / step))
  const dep = l.first + offset + k * step
  if (dep - offset <= l.last) return day + dep
  return day + DAY + l.first + offset
}

/** 某一班（从码头 pier 在 dep 开出）到达的时刻：渡轮到对岸，游船回到出发码头 */
export function arrivalOf(l: BoatLine, dep: number): number {
  return dep + (l.kind === 'ferry' ? crossing(l) : cruiseDuration(l))
}

/** 游船在江面上靠右行驶：离开码头后偏到前进方向右侧这么多格，回程不会和去程的船撞在一起 */
const CRUISE_OFFSET = 10

/** 某一班在时刻 t 的位置（还没开就停在码头上客，到了就停在码头） */
export function runPose(l: BoatLine, pier: number, dep: number, t: number): BoatPose {
  const dt = Math.max(0, t - dep)
  if (l.kind === 'ferry') {
    const s = Math.min(l.path.length, dt * l.speed)
    // 码头 1 出发是反着走
    const along = pier === 0 ? s : l.path.length - s
    const [x, z] = l.path.at(along)
    const h = l.path.heading(along)
    return { x, z, angle: pier === 0 ? h : h + Math.PI, run: dep }
  }
  const total = 2 * l.path.length
  const s = Math.min(total, dt * l.speed)
  const back = s > l.path.length
  const along = back ? total - s : s
  const [x, z] = l.path.at(along)
  const h = l.path.heading(along, l.kind === 'rowboat' ? 2 : 8) + (back ? Math.PI : 0)
  // 右侧偏移在离码头 60 格内逐渐加上，靠岸时回到航线上；手摇船在小河里不偏
  const off = l.kind === 'cruise' ? CRUISE_OFFSET * Math.min(1, along / 60) : 0
  return { x: x - Math.sin(h) * off, z: z + Math.cos(h) * off, angle: h, run: dep }
}

/** 时刻 t 江面上这条线的所有船 */
export function boatsAt(l: BoatLine, t: number): BoatPose[] {
  const day = Math.floor(t / DAY) * DAY
  const tod = t - day
  if (l.kind === 'ferry') {
    // 一条船来回跑；不在运营时间就停在码头 0
    const c = cycle(l)
    const C = crossing(l)
    const k = Math.floor((tod - l.first) / c)
    if (tod < l.first || l.first + k * c > l.last) return [runPose(l, 0, day + l.first, day + l.first)]
    const ph = tod - l.first - k * c
    const dep0 = day + l.first + k * c
    // 0–C：码头 0 → 1；C–C+D：停在码头 1；C+D–2C+D：码头 1 → 0；之后停在码头 0
    if (ph < C + l.dwell) return [runPose(l, 0, dep0, t)]
    return [runPose(l, 1, dep0 + C + l.dwell, t)]
  }
  const out: BoatPose[] = []
  const R = cruiseDuration(l)
  for (let dep = l.first; dep <= l.last; dep += l.headway) {
    if (tod >= dep - l.dwell && tod <= dep + R + 60) out.push(runPose(l, 0, day + dep, t))
  }
  return out
}

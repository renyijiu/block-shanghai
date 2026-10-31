// 站内流程（docs/04 第 7 节）：街道 → 站厅 → 过闸 → 站台 → 车厢（逐站行驶、报站、可跳过）→ 站台 / 换乘通道 → 站厅 → 出口。
// 场景按需建、换场景时销毁；乘车时游戏时钟按真实运行分钟推进，跟展示时长无关
import type { PlayerWorld } from '../actors/Player.ts'
import type { MetroEvent, Trip } from '../metro/collection.ts'
import type { MetroStation } from '../metro/data.ts'
import type { MetroSystem } from '../metro/MetroSystem.ts'
import { routeFare } from '../metro/network.ts'
import { skyAt } from '../sky/Sky.ts'
import type { GameClock } from '../state/clock.ts'
import { CarScene, CorridorScene, createInteriorMaterials, HallScene, PlatformScene, type InteriorMaterials, type InteriorScene, type Spawn } from './scenes.ts'
import { isEn, nameOf, tr } from '../../i18n/core.ts'
import { announce, callAt, crowdLevel, exitDirection, loopContinue, platformSides, segmentSeconds, transferLines, type Announcement, type TrainCall } from './trip.ts'

/** 站内的位置 */
export type Place =
  | { kind: 'hall'; station: number }
  | { kind: 'platform'; station: number; line: string }
  | { kind: 'car'; line: string }
  | { kind: 'corridor'; station: number; from: string; to: string }

export type { MetroEvent, Trip } from '../metro/collection.ts'

/** 乘车中的列车：哪一班、在第几站、正在停站还是行驶 */
interface Ride {
  call: TrainCall
  /** 当前停靠（或刚开出）的站序 */
  stop: number
  phase: 'dwell' | 'moving' | 'terminal'
  /** 本阶段已经过的现实秒、总时长 */
  elapsed: number
  duration: number
  /** 本阶段开始、结束时的游戏时间 */
  g0: number
  g1: number
  /** 上车的车站（车站序号）、上车时的游戏时间、从上车起经过的车站 */
  boarded: number
  t0: number
  passed: number[]
  /** 窗外景物累计滚动（格） */
  scroll: number
  scroll0: number
  /** 本区间的滚动距离（格） */
  span: number
}

/** 站内操作的结果：Game 按它摆放玩家、离开车站、打开线路图 */
export interface InteriorResult {
  spawn?: Spawn
  /** 从这个出入口出站回到街上 */
  leave?: number
  map?: boolean
  notice?: string
}

/** 给界面显示的站内状态 */
export interface StationStatus {
  where: string
  color: string | null
  /** 站台两侧：开往哪里、下一班 */
  sides: { toward: string; text: string }[]
  canSkipWait: boolean
  /** 车厢里：下一站（或本站）、后面还能直达的站 */
  ride: { next: string; atStation: boolean; terminal: boolean; stops: { index: number; name: string }[] } | null
}

/** 到站开门的展示时长（现实秒） */
const DWELL_S = 5
/** 车厢窗外景物的最高速度（格 / 秒） */
const SPEED = { subway: 18, apm: 12, maglev: 45 }

export class InteriorManager {
  scene: InteriorScene | null = null
  place: Place | null = null
  trip: Trip | null = null
  /** 最新的报站，id 递增，界面据此弹出 */
  announcement: (Announcement & { id: number }) | null = null
  /** 乘车时由站内流程控制游戏时钟（Game 不再按倍率走表） */
  timeControlled = false
  onEvent: ((e: MetroEvent) => void) | null = null
  readonly world: PlayerWorld
  private ride: Ride | null = null
  private readonly mats: InteriorMaterials
  private readonly metro: MetroSystem
  private readonly clock: GameClock
  private seed = 1

  constructor(metro: MetroSystem, clock: GameClock) {
    this.metro = metro
    this.clock = clock
    this.mats = createInteriorMaterials()
    this.world = {
      boxes: (x0, z0, x1, z1) => this.scene?.collision.query(x0, z0, x1, z1) ?? [],
      walkable: (x, z) => {
        const b = this.scene?.bounds
        return !!b && x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1
      }
    }
  }

  get active() {
    return !!this.scene
  }

  /** 现在所在车站（车厢里是 null） */
  get station(): number | null {
    return this.place && this.place.kind !== 'car' ? this.place.station : this.ride ? this.ride.call.rt.service.stops[this.ride.stop]! : null
  }

  private st(i: number): MetroStation {
    return this.metro.data.stations[i]!
  }

  private line(id: string) {
    return this.metro.lineById.get(id)!
  }

  private crowd(line: string) {
    return crowdLevel(line, this.clock.daySeconds, this.metro.data.rules.peakHours)
  }

  private setScene(s: InteriorScene, place: Place) {
    this.scene?.dispose()
    this.scene = s
    this.place = place
  }

  // ---------------------------------------------------------------- 场景

  private hall(station: number) {
    const st = this.st(station)
    const exits = st.exits.map((e) => {
      const ent = this.metro.data.entrances[e]!
      return { entrance: e, ref: ent.ref, dir: exitDirection(st.pos, ent.pos), angle: Math.atan2(ent.pos[1] - st.pos[1], ent.pos[0] - st.pos[0]) }
    })
    // 同一个出口编号只留一个；按编号排序，最多 10 个
    const seen = new Set<string>()
    const unique = exits.filter((e) => (e.ref ? !seen.has(e.ref) && seen.add(e.ref) : true)).sort((a, b) => a.ref.localeCompare(b.ref, 'zh', { numeric: true })).slice(0, 10)
    const lines = st.lines.map((id) => ({ line: this.line(id), sides: platformSides(this.metro, station, id) }))
    const crowd = this.crowd(st.lines[0] ?? '')
    this.setScene(new HallScene(this.mats, { name: st.name, nameEn: st.nameEn, lines, exits: unique, crowd }, this.seed++), { kind: 'hall', station })
  }

  private platform(station: number, line: string, arrived?: { side: number; call: TrainCall; t: number }) {
    const st = this.st(station)
    const p = st.platforms.find((q) => q.line === line)
    const structure = p?.structure ?? 'tunnel'
    const info = {
      name: st.name,
      nameEn: st.nameEn,
      line: this.line(line),
      structure,
      type: p?.type ?? (structure === 'tunnel' ? 'island' : 'side'),
      sides: platformSides(this.metro, station, line),
      transfers: transferLines(this.metro.data, station, line),
      crowd: this.crowd(line),
      sky: skyAt(this.clock.daySeconds / 3600).color.getHex()
    } as const
    this.setScene(new PlatformScene(this.mats, info, this.seed++, arrived), { kind: 'platform', station, line })
  }

  /** 从街上的出入口进站：出现在站厅非付费区，对应出口的楼梯下 */
  enter(station: number, entrance: number): Spawn {
    this.trip = null
    this.ride = null
    this.timeControlled = false
    this.hall(station)
    return this.scene!.spawns.get(`exit:${entrance}`) ?? this.scene!.spawns.get('gate:out')!
  }

  /** 离开车站（出站或快速到达）：销毁场景 */
  leave() {
    this.scene?.dispose()
    this.scene = null
    this.place = null
    this.ride = null
    this.trip = null
    this.timeControlled = false
    this.announcement = null
  }

  // ---------------------------------------------------------------- 操作

  /** 处理站内的交互（InteractPoint.go）。money 是钱包余额（进站要够起步价） */
  handle(go: string, money: number): InteriorResult {
    const place = this.place
    if (!place) return {}
    const [verb, arg] = go.split(':') as [string, string | undefined]
    const rules = this.metro.data.rules
    if (place.kind === 'hall') {
      const station = place.station
      if (verb === 'gate' && arg === 'in') {
        if (money < rules.fare.baseYuan) return { notice: tr('交通卡余额不足 {fare} 元，不能进站', { fare: rules.fare.baseYuan }) }
        this.trip = { entry: station, legs: [] }
        this.onEvent?.({ type: 'metroEnter', station })
        return { spawn: this.scene!.spawns.get('gate:in') }
      }
      if (verb === 'gate' && arg === 'out') {
        const trip = this.trip ?? { entry: station, legs: [] }
        const fare = trip.legs.length ? routeFare(this.metro.graph, trip.legs) : 0
        this.trip = null
        const spawn = this.scene!.spawns.get('gate:out')
        this.onEvent?.({ type: 'metroExit', station, exit: '', fare, trip })
        return { spawn, notice: trip.legs.length ? tr('出站扣费 {fare} 元', { fare }) + (money - fare < 0 ? tr('（交通卡透支，下次进站前要有起步价）') : '') : tr('出站（没有乘车，不扣费）') }
      }
      if (verb === 'platform' && arg) {
        if (!this.trip) return { notice: tr('先刷卡进站') }
        this.platform(station, arg)
        return { spawn: this.scene!.spawns.get('hall') }
      }
      if (verb === 'exit' && arg) {
        if (this.trip) return { notice: tr('先刷卡出站') }
        return { leave: Number(arg) }
      }
      if (verb === 'map') return { map: true }
      return {}
    }
    if (place.kind === 'platform') {
      const { station, line } = place
      if (verb === 'hall') {
        this.hall(station)
        return { spawn: this.scene!.spawns.get(`platform:${line}`) }
      }
      if (verb === 'transfer' && arg) {
        this.setScene(new CorridorScene(this.mats, this.line(line), this.line(arg), this.seed++), { kind: 'corridor', station, from: line, to: arg })
        return { spawn: this.scene!.spawns.get('start') }
      }
      if (verb === 'board') {
        const open = (this.scene as PlatformScene).openSide(arg === undefined ? undefined : Number(arg))
        if (!open) return {}
        this.board(open.call, station, line)
        return { spawn: this.scene!.spawns.get('board') }
      }
      return {}
    }
    if (place.kind === 'corridor') {
      if (verb === 'platform' && arg) {
        const { station, from, to } = place
        this.platform(station, arg)
        if (arg === to) this.onEvent?.({ type: 'metroTransfer', station, from, to })
        return { spawn: this.scene!.spawns.get(`transfer:${arg === to ? from : to}`) ?? this.scene!.spawns.get('hall') }
      }
      return {}
    }
    if (place.kind === 'car' && verb === 'alight') return this.alight()
    return {}
  }

  // ---------------------------------------------------------------- 乘车

  private board(call: TrainCall, station: number, line: string) {
    const car = new CarScene(this.mats, { line: this.line(line), crowd: this.crowd(line) }, this.seed++)
    this.setScene(car, { kind: 'car', line })
    const t = this.clock.seconds
    this.ride = { call, stop: call.stop, phase: 'dwell', elapsed: 0, duration: 2, g0: t, g1: Math.max(t, call.depart), boarded: station, t0: t, passed: [station], scroll: 0, scroll0: 0, span: 0 }
    this.timeControlled = true
    car.setDoors(true)
    this.refreshCar()
  }

  private alight(): InteriorResult {
    const r = this.ride
    if (!r || r.phase === 'moving') return {}
    const stops = r.call.rt.service.stops
    const station = stops[r.stop]!
    const line = r.call.rt.line.id
    if (station !== r.boarded) {
      this.trip?.legs.push({ line, from: r.boarded, to: station })
      this.onEvent?.({ type: 'metroRide', line, from: r.boarded, to: station, stations: r.passed, t0: r.t0 })
    }
    // 下车：目的站的站台，列车停在这一侧开着门，过一会儿开走
    const sides = platformSides(this.metro, station, line)
    const side = Math.max(0, sides.findIndex((s) => s.runs.some((x) => x.rt === r.call.rt)))
    this.ride = null
    this.timeControlled = false
    this.platform(station, line, { side, call: callAt(r.call.rt, r.stop, r.call.dep), t: this.clock.seconds })
    return { spawn: this.scene!.spawns.get('train') ?? this.scene!.spawns.get('hall') }
  }

  /** 在车厢里：跳到下一站 */
  skipNext() {
    const r = this.ride
    if (!r || r.phase === 'terminal') return
    if (r.phase === 'dwell') this.depart(r)
    this.arrive(r)
  }

  /** 在车厢里：直达本交路后面的第 index 站（开门停在那一站） */
  skipTo(index: number) {
    const r = this.ride
    if (!r || r.phase === 'terminal') return
    const stops = r.call.rt.service.stops
    if (index <= r.stop || index >= stops.length) return
    // 中间经过的站记下来，最后一段照常“开车 → 到站”
    for (let i = r.stop + 1; i < index; i++) r.passed.push(stops[i]!)
    r.stop = index - 1
    this.startMoving(r)
    this.arrive(r)
  }

  /** 停站结束开车；环线到了交路终点就接着下一圈 */
  private depart(r: Ride) {
    const rt = r.call.rt
    if (r.stop >= rt.service.stops.length - 1) {
      const next = loopContinue(rt, this.clock.seconds)
      if (!next) return
      r.call = next
      r.stop = 0
    }
    this.startMoving(r)
  }

  /** 在站台：跳过等车（离玩家最近那一侧的下一班马上进站） */
  skipWait(x: number) {
    if (this.place?.kind !== 'platform') return
    const ps = this.scene as PlatformScene
    const st = ps.sideStatus(ps.nearestSide(x), this.clock.seconds)
    if (st?.arrive && st.state === 'away' && st.arrive - this.clock.seconds > 65) this.clock.seconds = st.arrive - 62
  }

  private startMoving(r: Ride) {
    const { rt, dep } = r.call
    const stops = rt.service.stops
    const car = this.scene as CarScene
    r.phase = 'moving'
    r.elapsed = 0
    r.g0 = dep + rt.times.depart[r.stop]!
    r.g1 = dep + rt.times.arrive[r.stop + 1]!
    r.duration = segmentSeconds(r.g1 - r.g0)
    r.scroll0 = r.scroll
    r.span = (SPEED[rt.line.kind] * r.duration * 2) / Math.PI
    car.setDoors(false)
    const next = r.stop + 1
    const terminal = next === stops.length - 1 && !rt.line.loop
    this.say(announce(this.metro.data, stops[next]!, rt.line.id, true, terminal))
    this.refreshCar()
  }

  private arrive(r: Ride) {
    const { rt, dep } = r.call
    const stops = rt.service.stops
    r.stop++
    r.passed.push(stops[r.stop]!)
    r.scroll = r.scroll0 + r.span
    const last = r.stop === stops.length - 1
    const terminal = last && !rt.line.loop
    r.phase = terminal ? 'terminal' : 'dwell'
    r.elapsed = 0
    r.duration = DWELL_S
    r.g0 = dep + rt.times.arrive[r.stop]!
    r.g1 = dep + rt.times.depart[r.stop]!
    this.clock.seconds = Math.max(this.clock.seconds, r.g0)
    ;(this.scene as CarScene).setDoors(true)
    this.say(announce(this.metro.data, stops[r.stop]!, rt.line.id, false, terminal))
    this.refreshCar()
  }

  private say(a: Announcement) {
    this.announcement = { ...a, id: (this.announcement?.id ?? 0) + 1 }
  }

  // 窗外：站台位置、隧道 / 高架、进度屏
  private refreshCar() {
    const r = this.ride
    const car = this.scene as CarScene
    if (!r) return
    const { rt } = r.call
    const stops = rt.service.stops
    const data = this.metro.data
    const color = rt.line.color
    const structureAt = (i: number) => data.stations[stops[Math.max(0, Math.min(stops.length - 1, i))]!]!.platforms.find((p) => p.line === rt.line.id)?.structure ?? 'tunnel'
    const moving = r.phase === 'moving'
    const outside = structureAt(r.stop) !== 'tunnel' && (!moving || structureAt(r.stop + 1) !== 'tunnel') ? 'open' : 'tunnel'
    car.setOutside(outside, skyAt(this.clock.daySeconds / 3600).color.getHex())
    const travelled = r.scroll - r.scroll0
    const here = data.stations[stops[r.stop]!]!
    if (moving) {
      const next = data.stations[stops[r.stop + 1]!]!
      car.setStationOutside(0, here.name, here.nameEn, color, travelled)
      car.setStationOutside(1, next.name, next.nameEn, color, -(r.span - travelled))
    } else {
      car.setStationOutside(0, here.name, here.nameEn, color, 0)
      car.setStationOutside(1, '', '', color, null)
    }
    car.setScroll(r.scroll)
    // 磁浮的速度屏：加速到 300 km/h 巡航，进站前减速
    if (rt.line.kind === 'maglev') car.setSpeed(moving ? 300 * Math.min(1, Math.sin(Math.PI * Math.min(1, r.elapsed / r.duration)) * 1.6) : 0)
    car.setDisplay(
      stops.map((s) => nameOf(data.stations[s]!)),
      moving ? r.stop + 1 : r.stop,
      !moving
    )
  }

  /** 每帧：场景动画；乘车时推进列车和游戏时钟 */
  update(dt: number) {
    const s = this.scene
    if (!s) return
    const r = this.ride
    if (r) {
      r.elapsed += dt
      const f = Math.min(1, r.elapsed / r.duration)
      if (r.phase !== 'terminal') this.clock.seconds = r.g0 + (r.g1 - r.g0) * f
      if (r.phase === 'moving') r.scroll = r.scroll0 + (r.span * (1 - Math.cos(Math.PI * f))) / 2
      if (f >= 1 && r.phase === 'moving') this.arrive(r)
      else if (f >= 1 && r.phase === 'dwell') this.depart(r)
      if (this.ride) this.refreshCar()
    }
    s.update(dt, this.clock.seconds)
  }

  /** 界面显示的状态 */
  status(): StationStatus | null {
    const place = this.place
    if (!place) return null
    const t = this.clock.seconds
    const data = this.metro.data
    if (place.kind === 'hall') {
      const st = this.st(place.station)
      return { where: tr('{station}站 · 站厅', { station: nameOf(st) }) + (this.trip ? tr('（付费区）') : ''), color: null, sides: [], canSkipWait: false, ride: null }
    }
    if (place.kind === 'platform') {
      const st = this.st(place.station)
      const line = this.line(place.line)
      const ps = this.scene as PlatformScene
      const sides = ps.info.sides.map((side, i) => {
        const s = ps.sideStatus(i, t)
        const text = tr(!s ? '' : s.state === 'open' ? '车门已开，请上车' : s.state === 'arriving' ? '列车进站' : s.state === 'leaving' ? '列车出站' : s.minutes === null ? '今日运营结束' : s.minutes <= 1 ? '即将进站' : '{m} 分钟后到', { m: s?.minutes ?? 0 })
        return { toward: isEn ? side.towardEn : side.toward, text }
      })
      return { where: tr('{station}站 · {line}站台', { station: nameOf(st), line: nameOf(line) }), color: line.color, sides, canSkipWait: true, ride: null }
    }
    if (place.kind === 'corridor') {
      const st = this.st(place.station)
      return { where: tr('{station}站 · 换乘{line}', { station: nameOf(st), line: nameOf(this.line(place.to)) }), color: this.line(place.to).color, sides: [], canSkipWait: false, ride: null }
    }
    const r = this.ride
    const line = this.line(place.line)
    if (!r) return { where: nameOf(line), color: line.color, sides: [], canSkipWait: false, ride: null }
    const stops = r.call.rt.service.stops
    const moving = r.phase === 'moving'
    const cur = moving ? r.stop + 1 : r.stop
    const terminalName = nameOf(data.stations[stops[stops.length - 1]!]!)
    return {
      where: tr('{line} · 往 {to}', { line: nameOf(line), to: line.loop ? tr(/内圈|外圈/.exec(r.call.rt.service.name)?.[0] ?? terminalName) : terminalName }),
      color: line.color,
      sides: [],
      canSkipWait: false,
      ride: {
        next: nameOf(data.stations[stops[cur]!]!),
        atStation: !moving,
        terminal: r.phase === 'terminal',
        stops: stops.slice(r.stop + 1).map((s, k) => ({ index: r.stop + 1 + k, name: nameOf(data.stations[s]!) }))
      }
    }
  }

  dispose() {
    this.leave()
    this.mats.dispose()
  }
}

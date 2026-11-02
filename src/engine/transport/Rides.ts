// 乘坐：渡轮和浦江游览、观光巴士、共享单车、出租车、游乐设施。管“正在坐什么”、上下车、票价，
// 每帧把玩家放到船、车、设施的座位上（docs/02 第 5 节 Transport）。从 Game 里拆出来，世界、时钟、钱包、存档都还在 Game
import * as THREE from 'three/webgpu'
import type { Game, TravelResult } from '../Game.ts'
import type { InteractPoint } from '../world/interact.ts'
import type { Seat } from '../landmarks/LandmarkManager.ts'
import type { Pier, Ride } from './BoatSystem.ts'
import type { BusRide } from './BusSystem.ts'
import { nearestGroundRoad, nearGroundRoad } from '../world/queries.ts'
import { tr } from '../../i18n/core.ts'

export class Rides {
  /** 正在坐的船 */
  ride: Ride | null = null
  /** 正在坐的观光巴士 */
  busRide: BusRide | null = null
  /** 坐在游乐设施上：哪个设施、座位、什么时候（现实毫秒）下来、上去前的视角 */
  attraction: { seat: Seat; until: number; name: string; view: 'first' | 'third' } | null = null
  /** 骑着的共享单车：开锁的游戏时间 */
  bike: { since: number } | null = null
  private readonly seatAt = new THREE.Vector3()
  private readonly seatPrev = new THREE.Vector3()
  private readonly g: Game

  constructor(game: Game) {
    this.g = game
  }

  /** 正在坐船、坐车或者坐游乐设施（单车不算） */
  get riding() {
    return !!(this.ride || this.busRide || this.attraction)
  }

  /** 每帧：坐着的时候把玩家放到座位上；没在坐返回 false */
  update(now: number): boolean {
    if (this.attraction) this.updateAttraction(now)
    else if (this.ride) this.updateBoat(this.ride)
    else if (this.busRide) this.updateBusRide(this.busRide)
    else return false
    return true
  }

  /** 存档用的位置：坐着的时候存下车的地方，不存半空中、船上的位置；没在坐返回 null */
  savePosition(): { x: number; y: number; z: number } | null {
    const gate = this.attraction?.seat.gate
    if (gate) return { x: gate[0], y: 0, z: gate[1] }
    if (this.ride) return { x: this.ride.to.land[0], y: 0, z: this.ride.to.land[1] }
    if (this.busRide) {
      const s = this.g.buses!.stop(this.busRide.line, this.busRide.to)
      return { x: s.x, y: 0, z: s.z }
    }
    return null
  }

  /** 界面显示的乘坐状态 */
  stats(now: number) {
    const t = this.g.clock.seconds
    return {
      bike: this.bike ? { minutes: Math.round((t - this.bike.since) / 60), fare: this.bikeFare((t - this.bike.since) / 60) } : null,
      attraction: this.attraction ? { name: this.attraction.name, seconds: Math.max(0, Math.ceil((this.attraction.until - now) / 1000)) } : null,
      ride: this.ride
        ? {
            name: this.ride.line.name,
            to: this.ride.line.kind === 'ferry' ? tr('开往{to}', { to: this.ride.to.name }) : tr('回到{to}', { to: this.ride.to.name }),
            minutes: Math.max(0, Math.ceil((this.ride.arrive - t) / 60)),
            sailing: t >= this.ride.dep
          }
        : this.busRide
          ? {
              name: this.busRide.line.name,
              to: tr('开往{to}', { to: this.busRide.line.stops[this.busRide.to]!.name }),
              minutes: Math.max(0, Math.ceil((this.busRide.arrive - t) / 60)),
              sailing: t >= this.busRide.board
            }
          : null
    }
  }

  /**
   * 坐船：在码头泊位 berth 坐下一班。下一班还要等一会儿就快进时钟（界面淡出“等船”），
   * 然后站到船的顶层甲板上，船按时刻表开；到站自动下船
   */
  boardBoat(berth: Pier): TravelResult {
    const boats = this.g.boats
    if (!boats || this.ride) return { ok: false, message: tr('现在不能上船') }
    const line = berth.line
    if (this.g.money < line.fare) return { ok: false, message: tr('余额不足：船票 {fare} 元，钱包里只有 {money} 元', { fare: line.fare, money: this.g.money }) }
    this.returnBike()
    const ride = boats.board(berth, this.g.clock.seconds)
    // 等船：快进到开船前半分钟
    const wait = ride.dep - this.g.clock.seconds
    if (wait > 60) this.g.clock.seconds = ride.dep - 30
    this.g.money -= line.fare
    this.ride = ride
    this.g.prompt = null
    this.g.saveNow()
    const to = line.kind === 'ferry' ? tr('开往{to}', { to: ride.to.name }) : (line.route ?? tr('往返'))
    return { ok: true, message: tr('{line} · {to} · {fare} 元', { line: line.name, to, fare: line.fare }) + (wait > 60 ? tr(' · 等了 {m} 分钟', { m: Math.round(wait / 60) }) : '') }
  }

  /** 坐船、坐巴士时跳过：时钟直接到靠岸 / 到站（巴士先把下车的地方建好） */
  async skipRide(onProgress?: (text: string) => void) {
    if (this.ride) this.g.clock.seconds = Math.max(this.g.clock.seconds, this.ride.arrive)
    const bus = this.busRide
    if (bus && this.g.chunks) {
      const s = this.g.buses!.stop(bus.line, bus.to)
      this.g.traveling = true
      this.g.player.pos.set(s.x, 0, s.z)
      try {
        await this.g.chunks.prebuild(s.x, s.z, (d, t) => onProgress?.(tr('前往 {station}站 {d}/{t}', { station: s.name, d, t })))
      } finally {
        this.g.traveling = false
      }
      this.g.clock.seconds = Math.max(this.g.clock.seconds, bus.arrive)
    }
  }

  /** 坐观光巴士：从站 from 去站 to；车还要等一会儿就快进到车来之前 */
  boardBus(lineId: string, from: number, to: number): TravelResult {
    const buses = this.g.buses
    const line = buses?.line(lineId)
    if (!buses || !line || this.ride || this.busRide || this.attraction) return { ok: false, message: tr('现在不能上车') }
    if (this.g.money < line.fare) return { ok: false, message: tr('余额不足：车票 {fare} 元，钱包里只有 {money} 元', { fare: line.fare, money: this.g.money }) }
    this.returnBike()
    const ride = buses.board(line, from, to, this.g.clock.seconds)
    const wait = ride.board - this.g.clock.seconds
    if (wait > 60) this.g.clock.seconds = ride.board - 20
    this.g.money -= line.fare
    this.busRide = ride
    this.g.prompt = null
    this.g.saveNow()
    return { ok: true, message: tr('{line} · 开往{to} · {fare} 元', { line: line.name, to: line.stops[to]!.name, fare: line.fare }) + (wait > 60 ? tr(' · 等了 {m} 分钟', { m: Math.round(wait / 60) }) : '') }
  }

  // 坐巴士：车到之前站在站牌下，上车后站在二层敞篷上跟着走，到站下车
  private updateBusRide(ride: BusRide) {
    const t = this.g.clock.seconds
    const buses = this.g.buses!
    if (t >= ride.arrive + 3) {
      this.busRide = null
      const s = buses.stop(ride.line, ride.to)
      this.g.player.spawn(s.x, s.z, this.g.playerWorld!)
      this.g.player.model.position.copy(this.g.player.pos)
      this.g.lifeEvent({ type: 'stat', key: 'bus' })
      this.g.saveNow()
      this.g.onRideEnd?.(tr('{line} · 到达 {stop}', { line: ride.line.name, stop: s.name }))
      return
    }
    const seat = t >= ride.board ? buses.seat(ride, t) : null
    if (!seat) {
      const s = buses.stop(ride.line, ride.from)
      this.g.player.pos.set(s.x, 0, s.z)
    } else {
      this.g.player.pos.set(seat.x, seat.y, seat.z)
      this.g.player.facing = this.g.rig.selfie ? this.g.rig.yaw : -seat.angle - Math.PI / 2
      this.g.player.model.rotation.y = this.g.player.facing
    }
    this.g.player.vy = 0
    this.g.player.model.position.copy(this.g.player.pos)
  }

  /** 扫一辆共享单车 / 还车。只能在马路边开锁；还车按骑行时间收钱（每 15 分钟 1.5 元） */
  toggleBike(): TravelResult {
    if (this.bike) return { ok: true, message: this.returnBike() }
    const p = this.g.player.pos
    if (this.g.interior?.active || this.ride || this.busRide || this.attraction || this.g.traveling || p.y > 1) return { ok: false, message: tr('这里扫不了共享单车') }
    if (!this.g.world || !nearGroundRoad(this.g.world, p.x, p.z, 2.5)) return { ok: false, message: tr('共享单车要在马路边扫码，只能在马路上骑') }
    if (this.g.money < 1.5) return { ok: false, message: tr('余额不足：钱包里只有 {money} 元', { money: this.g.money }) }
    this.bike = { since: this.g.clock.seconds }
    this.g.player.setRiding(true)
    return { ok: true, message: tr('扫码开锁 · 每 15 分钟 1.5 元，只能在马路上骑（B 还车）') }
  }

  /** 还车，返回提示；没骑车返回空串 */
  returnBike(): string {
    if (!this.bike) return ''
    const minutes = Math.max(0, (this.g.clock.seconds - this.bike.since) / 60)
    const fare = this.bikeFare(minutes)
    this.g.money = Math.round((this.g.money - fare) * 10) / 10
    this.bike = null
    this.g.player.setRiding(false)
    this.g.lifeEvent({ type: 'stat', key: 'bike' })
    this.g.saveNow()
    return tr('还车 · 骑了 {m} 分钟 · {fare} 元', { m: Math.max(1, Math.round(minutes)), fare })
  }

  bikeFare(minutes: number) {
    return 1.5 * Math.max(1, Math.ceil(minutes / 15))
  }

  /** 打车的报价：真实距离按两点经纬度算（绕路系数 1.3），起步价 14 元含 3 公里，之后每公里 2.5 元、15 公里以上 3.6 元，夜里（23–5 点）加三成 */
  taxiQuote(x: number, z: number) {
    const a = this.g.proj.unproject(this.g.mapPos.x, this.g.mapPos.z)
    const b = this.g.proj.unproject(x, z)
    const R = 6371
    const dLat = ((b.lat - a.lat) * Math.PI) / 180
    const dLon = ((b.lon - a.lon) * Math.PI) / 180
    const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
    const km = 2 * R * Math.asin(Math.sqrt(h)) * 1.3
    let fare = 14 + Math.max(0, Math.min(km, 15) - 3) * 2.5 + Math.max(0, km - 15) * 3.6
    const hour = this.g.clock.daySeconds / 3600
    if (hour >= 23 || hour < 5) fare *= 1.3
    return { km: Math.round(km * 10) / 10, fare: Math.round(fare), minutes: Math.round((km / 25) * 60 + 3) }
  }

  /** 能不能在这里打车：城市里、离马路不远 */
/** 游乐设施开放时间（游戏时间，和设施转动的营业时间一致） */
  get ridesOpen() {
    const h = this.g.clock.daySeconds / 3600
    return h >= 9 && h < 21.5
  }

  /** 坐上游乐设施：付票钱，人挂到座位上，跟着设施动 seconds 秒（现实时间） */
  startAttraction(p: InteractPoint): TravelResult {
    if (!p.landmark || !p.ride || this.attraction || this.ride || this.busRide || this.bike) return { ok: false, message: tr('现在不能坐') }
    if (!this.ridesOpen) return { ok: false, message: tr('设施 9:00–21:30 开放，现在不能坐') }
    const seat = this.g.landmarks?.seat(p.landmark, p.ride)
    if (!seat) return { ok: false, message: tr('现在不能坐') }
    const { fare } = seat.ride
    if (this.g.money < fare) return { ok: false, message: tr('余额不足：{price} 元，钱包里只有 {money} 元', { price: fare, money: this.g.money }) }
    this.g.money -= fare
    const name = tr(seat.ride.name)
    this.attraction = { seat, until: performance.now() + seat.ride.seconds * 1000, name, view: this.g.rig.mode }
    if (seat.ride.firstPerson) this.g.rig.mode = 'first'
    seat.where(this.seatPrev)
    this.g.prompt = null
    this.g.lifeEvent({ type: 'stat', key: 'ride' })
    this.g.lifeEvent({ type: 'stat', key: `ride:${seat.ride.id}` })
    this.g.saveNow()
    return { ok: true, message: tr('坐上{name} · {fare} 元', { name, fare }) }
  }

  /** 从设施上下来，回到入口 */
  endAttraction() {
    const a = this.attraction
    if (!a) return
    this.attraction = null
    this.g.rig.mode = a.view
    const [x, z] = a.seat.gate
    this.g.player.spawn(x, z, this.g.playerWorld!)
    this.g.player.model.position.copy(this.g.player.pos)
    this.g.saveNow()
    this.g.onRideEnd?.(tr('{name}坐完了', { name: a.name }))
  }

  private updateAttraction(now: number) {
    const a = this.attraction!
    if (now >= a.until || !this.ridesOpen) return this.endAttraction()
    const p = a.seat.where(this.seatAt)
    // 没设定朝向就朝运动方向（过山车看前方，木马顺着转）
    const dx = p.x - this.seatPrev.x
    const dz = p.z - this.seatPrev.z
    if (a.seat.facing !== null) this.g.player.facing = a.seat.facing
    else if (Math.hypot(dx, dz) > 0.01) this.g.player.facing = Math.atan2(-dx, -dz)
    if (this.g.rig.selfie) this.g.player.facing = this.g.rig.yaw
    this.seatPrev.copy(p)
    this.g.player.pos.copy(p)
    this.g.player.vy = 0
    this.g.player.model.position.copy(p)
    this.g.player.model.rotation.y = this.g.player.facing
  }

  get canHailTaxi() {
    const p = this.g.player.pos
    return !!this.g.world && !this.g.interior?.active && !this.ride && !this.busRide && !this.attraction && p.y < 1 && nearGroundRoad(this.g.world, p.x, p.z, 12)
  }

  /** 打车去某个景点：扣车费、按车程推进时钟，在景点旁边的马路上下车 */
  async taxi(landmarkId: string, onProgress?: (text: string) => void): Promise<TravelResult> {
    const dest = this.g.landmarks?.byId(landmarkId)
    if (!dest || !this.g.chunks || !this.g.playerWorld || !this.g.world) return { ok: false, message: tr('找不到这个地方') }
    if (!this.canHailTaxi) return { ok: false, message: tr('要走到马路边才能打到车') }
    const q = this.taxiQuote(dest.x, dest.z)
    if (this.g.money < q.fare) return { ok: false, message: tr('余额不足：车费约 {fare} 元，钱包里只有 {money} 元', { fare: q.fare, money: this.g.money }) }
    this.returnBike()
    // 在离景点最近的马路边下车
    const road = nearestGroundRoad(this.g.world, dest.x, dest.z, 120)
    let [x, z] = [dest.x, dest.z]
    if (road) {
      const d = Math.hypot(dest.x - road.x, dest.z - road.z) || 1
      const off = road.width / 2 + 1.5
      x = road.x + ((dest.x - road.x) / d) * off
      z = road.z + ((dest.z - road.z) / d) * off
    }
    this.g.money -= q.fare
    this.g.clock.addMinutes(q.minutes)
    this.g.traveling = true
    this.g.player.pos.set(x, 0, z)
    this.g.landmarks?.update(x, z)
    try {
      await this.g.chunks.prebuild(x, z, (d, t) => onProgress?.(tr('打车去{place} {d}/{t}', { place: dest.def.name, d, t })))
      this.g.player.spawn(x, z, this.g.playerWorld)
      this.g.player.model.position.copy(this.g.player.pos)
      // 面朝景点
      this.g.player.facing = this.g.player.model.rotation.y = this.g.rig.yaw = Math.atan2(-(dest.x - x), -(dest.z - z))
    } finally {
      this.g.traveling = false
    }
    this.g.lifeEvent({ type: 'stat', key: 'taxi' })
    this.g.saveNow()
    return { ok: true, message: tr('到达{place} · {km} 公里 · {m} 分钟 · {fare} 元', { place: dest.def.name, km: q.km, m: q.minutes, fare: q.fare }) }
  }

  // 坐船：玩家跟着船走，到站下船
  private updateBoat(ride: Ride) {
    const t = this.g.clock.seconds
    if (t >= ride.arrive + 5) {
      this.ride = null
      const [x, z] = ride.to.land
      this.g.player.spawn(x, z, this.g.playerWorld!)
      this.g.player.model.position.copy(this.g.player.pos)
      if (ride.line.kind === 'cruise') this.g.lifeEvent({ type: 'auto', key: 'cruise' })
      this.g.lifeEvent({ type: 'stat', key: `boat:${ride.line.id}` })
      this.g.lifeEvent({ type: 'stat', key: `boat:${ride.line.kind}` })
      this.g.saveNow()
      this.g.onRideEnd?.(ride.line.kind === 'ferry' ? tr('到达 {to}', { to: ride.to.name }) : tr('{line}结束，回到{to}', { line: ride.line.name, to: ride.to.name }))
      return
    }
    const s = this.g.boats!.seat(ride, t)
    this.g.player.pos.set(s.x, s.y, s.z)
    this.g.player.vy = 0
    this.g.player.model.position.copy(this.g.player.pos)
    // 面朝船头；自拍时转向镜头
    this.g.player.facing = this.g.rig.selfie ? this.g.rig.yaw : -s.angle - Math.PI / 2
    this.g.player.model.rotation.y = this.g.player.facing
  }
}

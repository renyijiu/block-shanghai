// 地铁烘焙：OSM 线路关系 → 线路、交路、站点、轨道（含高架 / 隧道坡道高度）、出入口 → src/cities/shanghai/data/metro.json
// 用法：npm run fetch-osm 之后 npm run bake（会先跑 bake-world）。设计见 docs/04-metro-system.md 第 3、4 节
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import shanghai from '../src/cities/shanghai/config.ts'
import { createProjection } from '../src/engine/geo/projection.ts'
import {
  METRO_DATA_VERSION,
  type LineKind,
  type MetroData,
  type MetroEntrance,
  type MetroLine,
  type MetroRules,
  type MetroService,
  type MetroStation,
  type MetroTrack,
  type PlatformType,
  type Structure
} from '../src/engine/metro/data.ts'
import { CHUNK_SIZE, chunkKey, chunkOf } from '../src/engine/world/chunks.ts'
import type { WorldMeta } from '../src/engine/world/data.ts'
import { clipPolyline, densify, simplify, type Pt } from './lib/geom.ts'
import { rampHeights } from './lib/heights.ts'
import { CACHE, parseOpl, type OplRelation } from './lib/osm.ts'

const DATA = join(import.meta.dirname, '..', 'src', 'cities', 'shanghai', 'data')
const proj = createProjection(shanghai.projection)

interface Overrides {
  rules: MetroRules
  lines: Record<string, { color?: string; name?: string; nameEn?: string }>
  /** OSM 站名修正（个别多写了“站”字）；上海火车站、上海南站等枢纽的“站”是名字的一部分，不能统一去掉 */
  stationName: Record<string, string>
  stationNameEn: Record<string, string>
  transferMin: Record<string, number>
  /** 按 OSM way id 指定轨道结构（规则覆盖不到的漏标） */
  wayStructure: Record<string, Structure>
  /** 站台形式：“站名|线路 id”或“站名” → island / side */
  platformType?: Record<string, PlatformType>
}
const OVR = JSON.parse(readFileSync(join(import.meta.dirname, 'metro.overrides.json'), 'utf8')) as Overrides

// 轨面高度（格）：高架桥面 9（docs/04 第 9 节）；隧道取 -3，只用来和地面、高架之间做坡道，地下部分不渲染
const HEIGHT: Record<Structure, number> = { viaduct: 9, ground: 0, tunnel: -3 }
const RAMP_LEN = 40
const SIMPLIFY = 0.5
const DENSIFY_DEG = 0.002
/** 同名站点在这个距离（km）内合并成一个换乘站 */
const MERGE_KM = 0.6
/** 出入口挂到这个距离（km）内最近的车站 */
const ENTRANCE_KM = 0.5
/** 两端都接高架、短于这个长度（km）的“地面”段按高架处理：多是车站区间漏标了 bridge（如上海火车站 3/4 号线跨铁路站场的 1.7 km） */
const GAP_FILL_KM = 2

const round1 = (v: number) => Math.round(v * 10) / 10
const round3 = (v: number) => Math.round(v * 1000) / 1000
const KX = 111.32 * Math.cos((shanghai.projection.origin.lat * Math.PI) / 180)
const km = (a: Pt, b: Pt) => Math.hypot((a[0]! - b[0]!) * KX, (a[1]! - b[1]!) * 110.574)
const project = (lon: number, lat: number): [number, number] => {
  const p = proj.project(lat, lon)
  return [p.x, p.z]
}

// ---------------------------------------------------------------- 线路

const isMetro = (t: Record<string, string>) =>
  (t.network === '上海地铁' && (t.route === 'subway' || t.route === 'light_rail')) || (t.route === 'monorail' && /磁浮/.test(t.name ?? ''))
const isStop = (role: string) => role.startsWith('stop')
const isTrack = (m: OplRelation['members'][number]) => m.type === 'w' && !m.role.startsWith('platform')

function lineMeta(ref: string, route: string): Omit<MetroLine, 'services' | 'color' | 'loop'> {
  if (/^\d+$/.test(ref)) return { id: `L${ref}`, ref, name: `${ref}号线`, nameEn: `Line ${ref}`, kind: 'subway' }
  if (ref === '磁浮') return { id: 'LMG', ref, name: '磁浮线', nameEn: 'Maglev', kind: 'maglev' }
  if (ref === '浦江') return { id: 'LPJ', ref, name: '浦江线', nameEn: 'Pujiang Line', kind: 'apm' }
  return { id: `L${ref}`, ref, name: ref, nameEn: ref, kind: (route === 'light_rail' ? 'apm' : 'subway') as LineKind }
}

function wayStructure(t: Record<string, string> = {}): Structure {
  const layer = Number.parseInt(t.layer ?? '0') || 0
  if ((t.tunnel && t.tunnel !== 'no') || layer < 0) return 'tunnel'
  if ((t.bridge && t.bridge !== 'no') || layer > 0) return 'viaduct'
  return 'ground'
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

// ---------------------------------------------------------------- 主流程

const { ways, wayTags, nodes, relations } = parseOpl(readFileSync(join(CACHE, 'metro.opl'), 'utf8'))
const warnings: string[] = []
const routes = relations.filter((r) => isMetro(r.tags) && r.members.filter((m) => m.type === 'n' && isStop(m.role)).length >= 2)
const world = JSON.parse(readFileSync(join(DATA, 'world.json'), 'utf8')) as WorldMeta
const meta = JSON.parse(readFileSync(join(CACHE, 'meta.json'), 'utf8')) as { osmTimestamp: string }

// 站点：同名且相距 600 米以内的停靠点合并成一个车站
const stations: (MetroStation & { lonlat: Pt; nodes: number[] })[] = []
const stationOfNode = new Map<number, number>()
for (const r of routes) {
  for (const m of r.members) {
    if (m.type !== 'n' || !isStop(m.role) || stationOfNode.has(m.ref)) continue
    const n = nodes.get(m.ref)
    if (!n) continue
    const name = OVR.stationName[n.tags.name ?? ''] ?? n.tags.name ?? ''
    const at: Pt = [n.lon, n.lat]
    let idx = stations.findIndex((s) => s.name === name && km(s.lonlat, at) < MERGE_KM)
    if (idx < 0) {
      const nameEn = OVR.stationNameEn[name] ?? n.tags['name:en'] ?? ''
      stations.push({ id: '', name, nameEn, pos: [0, 0], lines: [], platforms: [], exits: [], transferMin: OVR.transferMin[name] ?? 4, lonlat: at, nodes: [] })
      idx = stations.length - 1
    }
    const s = stations[idx]!
    s.nodes.push(m.ref)
    if (!s.nameEn && n.tags['name:en']) s.nameEn = n.tags['name:en']
    // 合并后的位置取各站台的平均
    s.lonlat = [(s.lonlat[0]! * (s.nodes.length - 1) + n.lon) / s.nodes.length, (s.lonlat[1]! * (s.nodes.length - 1) + n.lat) / s.nodes.length]
    stationOfNode.set(m.ref, idx)
  }
}
const usedIds = new Set<string>()
for (const s of stations) {
  let id = slug(s.nameEn) || `s${s.nodes[0]}`
  while (usedIds.has(id)) id += '-2'
  usedIds.add(id)
  s.id = id
  s.pos = project(s.lonlat[0]!, s.lonlat[1]!).map(round1) as [number, number]
}

// 轨道：所有用到的 way，换算坐标、抽稀，再按结构算高度（坡道、隧道口）
const usedWays = new Map<number, { lines: Set<string>; structure: Structure }>()
for (const r of routes) {
  const line = lineMeta(r.tags.ref ?? '', r.tags.route ?? '').id
  for (const m of r.members) {
    if (!isTrack(m) || !ways.has(m.ref)) continue
    const w = usedWays.get(m.ref) ?? usedWays.set(m.ref, { lines: new Set(), structure: wayStructure(wayTags.get(m.ref)) }).get(m.ref)!
    w.lines.add(line)
  }
}
const wayIds = [...usedWays.keys()]
// 漏标修正：人工指定的先用；再把夹在两段高架之间的短“地面”段改成高架
for (const [id, st] of Object.entries(OVR.wayStructure)) {
  const w = usedWays.get(Number(id))
  if (w) w.structure = st
}
{
  const ll = (p: Pt) => `${p[0]},${p[1]}`
  const atNode = new Map<string, number[]>()
  for (const id of wayIds) {
    const pts = ways.get(id)!
    for (const p of [pts[0]!, pts[pts.length - 1]!]) (atNode.get(ll(p)) ?? atNode.set(ll(p), []).get(ll(p))!).push(id)
  }
  // 首尾相连的“地面”段串成一组：整组短于 GAP_FILL_KM、对外的接口都接高架，就整组改成高架
  const isGround = (id: number) => usedWays.get(id)!.structure === 'ground' && !OVR.wayStructure[id]
  const seen = new Set<number>()
  let filled = 0
  for (const start of wayIds) {
    if (seen.has(start) || !isGround(start)) continue
    const group: number[] = []
    const stack = [start]
    seen.add(start)
    while (stack.length) {
      const id = stack.pop()!
      group.push(id)
      const pts = ways.get(id)!
      for (const p of [pts[0]!, pts[pts.length - 1]!])
        for (const o of atNode.get(ll(p)) ?? []) if (!seen.has(o) && isGround(o)) seen.add(o) && stack.push(o)
    }
    let len = 0
    const outside: Structure[] = []
    for (const id of group) {
      const pts = ways.get(id)!
      for (let i = 1; i < pts.length; i++) len += km(pts[i - 1]!, pts[i]!)
      for (const p of [pts[0]!, pts[pts.length - 1]!])
        for (const o of atNode.get(ll(p)) ?? []) if (!group.includes(o)) outside.push(usedWays.get(o)!.structure)
    }
    if (len < GAP_FILL_KM && outside.length >= 2 && outside.every((st) => st === 'viaduct')) {
      for (const id of group) usedWays.get(id)!.structure = 'viaduct'
      filled += group.length
      if (process.env.VERBOSE) {
        const lines = [...new Set(group.flatMap((id) => [...usedWays.get(id)!.lines]))].join('/')
        console.log(`    改为高架：${lines} ${len.toFixed(2)} km（way ${group.join(', ')}）`)
      }
    }
  }
  if (filled) warnings.push(`${filled} 段夹在高架之间的短“地面”轨道按高架处理`)
}
// 顶点：[x, z, 经度, 纬度]；抽稀只看 x、z，经纬度跟着保留，用来算真实里程
const prepared = wayIds.map((id) => {
  const pts = densify(ways.get(id)!, DENSIFY_DEG).map((p) => [...project(p[0]!, p[1]!), p[0]!, p[1]!])
  return { pts: simplify(pts, SIMPLIFY), base: HEIGHT[usedWays.get(id)!.structure] }
})
// rampHeights 把高度追加在最后：[x, z, 经度, 纬度, h]
const wayGeom = new Map(wayIds.map((id, i) => [id, rampHeights(prepared, RAMP_LEN)[i]!]))

// 交路：按成员顺序把 way 接成一条连续的行车轨迹，算真实里程，再把每个停靠站投影到轨迹上
const linesById = new Map<string, MetroLine>()
const sameLL = (a: Pt, b: Pt) => a[2] === b[2] && a[3] === b[3]

function buildPath(r: OplRelation): Pt[] {
  const parts = r.members.filter((m) => isTrack(m) && wayGeom.has(m.ref)).map((m) => wayGeom.get(m.ref)!)
  const out: Pt[] = []
  parts.forEach((g, i) => {
    let seg = g
    if (i === 0) {
      // 第一段的方向：尾端接得上第二段才是正向
      const next = parts[1]
      if (next && !sameLL(g[g.length - 1]!, next[0]!) && !sameLL(g[g.length - 1]!, next[next.length - 1]!)) seg = g.slice().reverse()
    } else {
      const end = out[out.length - 1]!
      if (sameLL(g[g.length - 1]!, end)) seg = g.slice().reverse()
      else if (!sameLL(g[0]!, end)) {
        // 不相接：取离当前终点近的一端
        const d0 = km([g[0]![2]!, g[0]![3]!], [end[2]!, end[3]!])
        const d1 = km([g[g.length - 1]![2]!, g[g.length - 1]![3]!], [end[2]!, end[3]!])
        if (d1 < d0) seg = g.slice().reverse()
        if (Math.min(d0, d1) > 0.05) warnings.push(`${r.tags.name}：轨道在第 ${i + 1} 段断开 ${(Math.min(d0, d1) * 1000).toFixed(0)} 米`)
      }
    }
    out.push(...(out.length && sameLL(seg[0]!, out[out.length - 1]!) ? seg.slice(1) : seg))
  })
  return out
}

for (const r of routes) {
  const t = r.tags
  const m = lineMeta(t.ref ?? '', t.route ?? '')
  const ovr = OVR.lines[m.id] ?? {}
  const line =
    linesById.get(m.id) ??
    linesById
      .set(m.id, { ...m, name: ovr.name ?? m.name, nameEn: ovr.nameEn ?? m.nameEn, color: (ovr.color ?? t.colour ?? '#888888').toUpperCase(), loop: false, services: [] })
      .get(m.id)!
  const loop = /内圈|外圈/.test(t.name ?? '')
  if (loop) line.loop = true

  const geo = buildPath(r)
  // 每个顶点的累计真实里程
  const cum = [0]
  for (let i = 1; i < geo.length; i++) cum.push(cum[i - 1]! + km([geo[i - 1]![2]!, geo[i - 1]![3]!], [geo[i]![2]!, geo[i]![3]!]))

  // 停靠站投影到轨迹上：按顺序往后找，避免环线、折返处投到错误的一侧
  const stops: number[] = []
  const chainage: number[] = []
  let from = 0
  for (const mem of r.members) {
    if (mem.type !== 'n' || !isStop(mem.role)) continue
    const st = stationOfNode.get(mem.ref)
    const n = nodes.get(mem.ref)
    if (st === undefined || !n) continue
    const p = project(n.lon, n.lat)
    let best = { d: Infinity, km: 0, seg: from }
    for (let i = Math.max(1, from); i < geo.length; i++) {
      const a = geo[i - 1]!
      const b = geo[i]!
      const dx = b[0]! - a[0]!
      const dz = b[1]! - a[1]!
      const len2 = dx * dx + dz * dz
      const u = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]!) * dx + (p[1] - a[1]!) * dz) / len2)) : 0
      const d = Math.hypot(p[0] - (a[0]! + u * dx), p[1] - (a[1]! + u * dz))
      if (d < best.d - 1e-9) best = { d, km: cum[i - 1]! + (cum[i]! - cum[i - 1]!) * u, seg: i }
    }
    if (stops[stops.length - 1] === st) continue
    stops.push(st)
    chainage.push(round3(best.km))
    from = best.seg
  }

  const path = geo.flatMap((p, i) => [round1(p[0]!), round1(p[1]!), round1(p[4]!), round3(cum[i]!)])
  const service: MetroService = { id: `${m.id}-${r.id}`, name: t.name ?? '', stops, chainage, express: /大站|直达/.test(t.name ?? ''), path }
  line.services.push(service)
}

// 站台形式：线路关系里的 platform 成员。同一条线在一个车站只用一个站台 way（上下行共用）是岛式，两个以上是侧式；
// OSM 上标了站台的不多，大部分车站按结构取默认值
const platformWays = new Map<string, Set<number>>()
for (const r of routes) {
  const line = lineMeta(r.tags.ref ?? '', r.tags.route ?? '').id
  for (const m of r.members) {
    if (m.type !== 'w' || !m.role.startsWith('platform')) continue
    const g = ways.get(m.ref)
    if (!g?.length) continue
    const c: Pt = [g.reduce((s, p) => s + p[0]!, 0) / g.length, g.reduce((s, p) => s + p[1]!, 0) / g.length]
    const st = stations.findIndex((s) => km(s.lonlat, c) < 0.4)
    if (st < 0) continue
    const k = `${st}|${line}`
    ;(platformWays.get(k) ?? platformWays.set(k, new Set()).get(k)!).add(m.ref)
  }
}
const platformTypeOf = (st: number, line: string, structure: Structure): PlatformType => {
  const name = stations[st]!.name
  const o = OVR.platformType?.[`${name}|${line}`] ?? OVR.platformType?.[name]
  if (o) return o
  const n = platformWays.get(`${st}|${line}`)?.size ?? 0
  if (n) return n >= 2 ? 'side' : 'island'
  return structure === 'tunnel' ? 'island' : 'side'
}

// 站台：每条线在车站处的结构、方向、高度（取经过该站的第一个交路）
for (const line of linesById.values()) {
  for (const s of line.services) {
    s.stops.forEach((st, k) => {
      const station = stations[st]!
      if (!station.lines.includes(line.id)) station.lines.push(line.id)
      if (station.platforms.some((p) => p.line === line.id)) return
      const at = s.chainage[k]!
      const path = s.path
      let i = 4
      while (i < path.length - 4 && path[i + 3]! < at) i += 4
      const [ax, az, ah, ak] = [path[i - 4]!, path[i - 3]!, path[i - 2]!, path[i - 1]!]
      const [bx, bz, bh, bk] = [path[i]!, path[i + 1]!, path[i + 2]!, path[i + 3]!]
      const u = bk > ak ? Math.min(1, Math.max(0, (at - ak) / (bk - ak))) : 0
      const h = ah + (bh - ah) * u
      const structure: Structure = h > 4 ? 'viaduct' : h < -1 ? 'tunnel' : 'ground'
      station.platforms.push({
        line: line.id,
        structure,
        angle: round3(Math.atan2(bz - az, bx - ax)),
        pos: [round1(ax + (bx - ax) * u), round1(az + (bz - az) * u)],
        h: round1(h),
        type: platformTypeOf(st, line.id, structure)
      })
    })
  }
}

// 出入口：挂到 500 米内最近的车站
const entrances: MetroEntrance[] = []
for (const [id, n] of nodes) {
  if (n.tags.railway !== 'subway_entrance') continue
  let best = -1
  let bestKm = ENTRANCE_KM
  stations.forEach((s, i) => {
    const d = km(s.lonlat, [n.lon, n.lat])
    if (d < bestKm) {
      bestKm = d
      best = i
    }
  })
  if (best < 0) continue
  stations[best]!.exits.push(entrances.length)
  entrances.push({ station: best, ref: n.tags.ref ?? '', pos: project(n.lon, n.lat).map(round1) as [number, number] })
  void id
}

// 轨道按分块切开；整段都在地下的不输出
const tracks: MetroTrack[] = wayIds.map((id) => ({ lines: [...usedWays.get(id)!.lines].sort(), structure: usedWays.get(id)!.structure }))
const chunks: MetroData['chunks'] = {}
const chunk = (k: string) => (chunks[k] ??= { tracks: [], entrances: [], stations: [] })
const c = world.chunks
wayIds.forEach((id, ti) => {
  const pts = wayGeom.get(id)!.map((p) => [p[0]!, p[1]!, p[4]!])
  if (pts.every((p) => p[2]! <= HEIGHT.tunnel + 0.5)) return
  const xs = pts.map((p) => p[0]!)
  const zs = pts.map((p) => p[1]!)
  for (let cx = Math.max(c.minX, chunkOf(Math.min(...xs))); cx <= Math.min(c.maxX, chunkOf(Math.max(...xs))); cx++)
    for (let cz = Math.max(c.minZ, chunkOf(Math.min(...zs))); cz <= Math.min(c.maxZ, chunkOf(Math.max(...zs))); cz++) {
      const rect = { minX: cx * CHUNK_SIZE, minY: cz * CHUNK_SIZE, maxX: (cx + 1) * CHUNK_SIZE, maxY: (cz + 1) * CHUNK_SIZE }
      for (const piece of clipPolyline(pts, rect)) {
        if (piece.every((p) => p[2]! <= HEIGHT.tunnel + 0.5)) continue
        chunk(chunkKey(cx, cz)).tracks.push([ti, piece.flatMap((p) => [round1(p[0]!), round1(p[1]!), round1(p[2]!)])])
      }
    }
})
entrances.forEach((e, i) => chunk(chunkKey(chunkOf(e.pos[0]), chunkOf(e.pos[1]))).entrances.push(i))
stations.forEach((s, i) => {
  // 车站登记在站点和各站台所在的分块（高架站按站台位置建模）
  const keys = new Set([s.pos, ...s.platforms.map((p) => p.pos)].map((p) => chunkKey(chunkOf(p[0]), chunkOf(p[1]))))
  for (const k of keys) chunk(k).stations.push(i)
})

// ---------------------------------------------------------------- 输出

const lineOrder = (l: MetroLine) => (l.kind === 'subway' ? Number(l.ref) : l.kind === 'apm' ? 100 : 101)
const out: MetroData = {
  version: METRO_DATA_VERSION,
  generatedAt: new Date().toISOString().slice(0, 10),
  osmTimestamp: meta.osmTimestamp,
  rules: OVR.rules,
  lines: [...linesById.values()].sort((a, b) => lineOrder(a) - lineOrder(b)),
  stations: stations.map(({ lonlat: _l, nodes: _n, ...s }) => s),
  entrances,
  tracks,
  chunks
}
const file = join(DATA, 'metro.json')
writeFileSync(file, JSON.stringify(out))

for (const w of warnings) console.warn('  ⚠ ' + w)
console.log('地铁：')
for (const l of out.lines) {
  const main = l.services.reduce((a, b) => (b.stops.length > a.stops.length ? b : a))
  const len = main.chainage[main.chainage.length - 1]!
  const st = new Set(l.services.flatMap((s) => s.stops)).size
  const viaduct = l.services.flatMap((s) => s.stops.map((x) => stations[x]!.platforms.find((p) => p.line === l.id)!.structure)).filter((x) => x === 'viaduct').length
  const all = l.services.reduce((n, s) => n + s.stops.length, 0)
  console.log(`  ${l.name.padEnd(5)} ${l.color}  ${String(l.services.length).padStart(2)} 个交路  ${String(st).padStart(2)} 站  最长交路 ${len.toFixed(1)} km  高架站台 ${Math.round((viaduct / all) * 100)}%`)
}
const transfer = out.stations.filter((s) => s.lines.length > 1).length
const noEn = out.stations.filter((s) => !s.nameEn).map((s) => s.name)
console.log(`  车站 ${out.stations.length} 个（换乘站 ${transfer} 个），出入口 ${entrances.length} 个，轨道 ${tracks.length} 段`)
if (noEn.length) console.warn(`  ⚠ 缺英文站名 ${noEn.length} 个：${noEn.slice(0, 10).join('、')}${noEn.length > 10 ? '…' : ''}`)
console.log(`  → metro.json ${(statSync(file).size / 1048576).toFixed(2)} MB，${Object.keys(chunks).length} 个分块`)

// 把 tools/.cache/ 里的 OSM 图层烘焙成游戏数据：坐标换算 → 抽稀 → 按分块裁剪 → src/cities/shanghai/data/*.json
// 用法：先 node tools/fetch-osm.ts，再 node tools/bake-world.ts。设计见 docs/03-coordinates-and-data.md
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import shanghai from '../src/cities/shanghai/config.ts'
import { createProjection } from '../src/engine/geo/projection.ts'
import { CHUNK_SIZE, chunkKey, chunkOf } from '../src/engine/world/chunks.ts'
import {
  WORLD_DATA_VERSION,
  type AreaLayer,
  type AreaPiece,
  type DistrictLayer,
  type DistrictShape,
  type FlatPolygon,
  type RoadClass,
  type RoadInfo,
  type RoadLayer,
  type WorldMeta
} from '../src/engine/world/data.ts'
import { buildSea } from './lib/coastline.ts'
import { bounds, clipPolyline, clipRing, densify, labelPoint, mergeLines, pointInRing, ringArea, simplify, simplifyRing, type Pt, type Rect } from './lib/geom.ts'
import { rampHeights } from './lib/heights.ts'
import { CACHE, parseOpl, polygonsOf, readSeq } from './lib/osm.ts'

const OUT = join(import.meta.dirname, '..', 'src', 'cities', 'shanghai', 'data')
const proj = createProjection(shanghai.projection)
const [south, west, north, east] = shanghai.osm.bbox
const BBOX: Rect = { minX: west, minY: south, maxX: east, maxY: north }

// 抽稀容差（格）和最小面积（格²）
const TOL = { water: 1.5, sea: 2, parks: 1.5, roads: 1, districts: 3 }
const MIN_AREA = { water: 150, parks: 300, districts: 2000 }
// 换算坐标前在长边上插点的间距（度，约 200 米），让外圈的径向压缩不把直边拉变形
const DENSIFY_DEG = 0.002

// 道路：宽度按人物尺度（docs/03 第 3 节）；高架每层的高度（格）；匝道坡长（格）
const ROAD_WIDTH: Record<RoadClass, number> = { motorway: 14, trunk: 14, primary: 12, secondary: 10, motorway_link: 7, trunk_link: 7 }
const LEVEL_HEIGHT = 7
const MAX_LEVEL = 5
const RAMP_LEN = 40
// 普通道路的桥超过这个真实长度（米）才当作高架，否则是过河的小桥
const ELEVATED_MIN_M = 600

const round1 = (v: number) => Math.round(v * 10) / 10

const project = (p: Pt): Pt => {
  const { x, z } = proj.project(p[1]!, p[0]!)
  return [x, z]
}

const projectRing = (ring: Pt[]) => densify(ring, DENSIFY_DEG).map(project)

// 经纬度折线的真实长度（米）
function realLengthM(pts: Pt[]) {
  const kx = 111320 * Math.cos((shanghai.projection.origin.lat * Math.PI) / 180)
  let d = 0
  for (let i = 1; i < pts.length; i++) d += Math.hypot((pts[i]![0]! - pts[i - 1]![0]!) * kx, (pts[i]![1]! - pts[i - 1]![1]!) * 110574)
  return d
}

// ---------------------------------------------------------------- 世界范围

const outline = densify([[west, south], [east, south], [east, north], [west, north], [west, south]], 0.005).slice(0, -1).map(project)
const ob = bounds(outline)
const CHUNKS = { minX: chunkOf(ob.minX), maxX: chunkOf(ob.maxX), minZ: chunkOf(ob.minY), maxZ: chunkOf(ob.maxY) }

const worldRect: Rect = {
  minX: CHUNKS.minX * CHUNK_SIZE,
  minY: CHUNKS.minZ * CHUNK_SIZE,
  maxX: (CHUNKS.maxX + 1) * CHUNK_SIZE,
  maxY: (CHUNKS.maxZ + 1) * CHUNK_SIZE
}

function chunkRect(cx: number, cz: number): Rect {
  return { minX: cx * CHUNK_SIZE, minY: cz * CHUNK_SIZE, maxX: (cx + 1) * CHUNK_SIZE, maxY: (cz + 1) * CHUNK_SIZE }
}

// 与包围盒相交的分块（限制在世界范围内）
function* chunksOver(b: Rect) {
  for (let cx = Math.max(CHUNKS.minX, chunkOf(b.minX)); cx <= Math.min(CHUNKS.maxX, chunkOf(b.maxX)); cx++)
    for (let cz = Math.max(CHUNKS.minZ, chunkOf(b.minY)); cz <= Math.min(CHUNKS.maxZ, chunkOf(b.maxY)); cz++) yield [cx, cz] as const
}

const flat = (ring: Pt[]) => ring.flatMap((p) => [round1(p[0]!), round1(p[1]!)])

// 已换算、已抽稀的多边形按分块切开，写入图层
function addArea(layer: AreaLayer, kind: string, poly: Pt[][]) {
  const [outer, ...holes] = poly
  for (const [cx, cz] of chunksOver(bounds(outer!))) {
    const r = chunkRect(cx, cz)
    const o = clipRing(outer!, r)
    if (!o.length) continue
    const hs = holes.map((h) => clipRing(h, r)).filter((h) => h.length)
    const area = Math.abs(ringArea(o)) - hs.reduce((s, h) => s + Math.abs(ringArea(h)), 0)
    if (area < 1) continue
    const piece: AreaPiece = { kind, polygon: [flat(o), ...hs.map(flat)] }
    ;(layer.chunks[chunkKey(cx, cz)] ??= []).push(piece)
  }
}

// 经纬度多边形 → 换算 → 抽稀 → 去掉过小的面和洞
function prepPolygon(poly: Pt[][], tol: number, minArea: number): Pt[][] | null {
  const outer = simplifyRing(projectRing(poly[0]!), tol)
  if (outer.length < 3 || Math.abs(ringArea(outer)) < minArea) return null
  const holes = poly
    .slice(1)
    .map((h) => simplifyRing(projectRing(h), tol))
    .filter((h) => h.length >= 3 && Math.abs(ringArea(h)) >= minArea / 4)
  return [outer, ...holes]
}

// ---------------------------------------------------------------- 水面

function waterKind(p: Record<string, string | number>) {
  if (p.waterway === 'riverbank' || p.water === 'river' || p.water === 'canal') return 'river'
  if (p.landuse === 'reservoir' || p.landuse === 'basin' || ['lake', 'reservoir', 'pond', 'lagoon'].includes(String(p.water))) return 'lake'
  return 'water'
}

// 海面（游戏坐标），区名标注要避开海面
const seaPolygons: Pt[][][] = []

function bakeWater() {
  const layer: AreaLayer = { version: WORLD_DATA_VERSION, chunks: {} }
  let n = 0
  for (const f of readSeq('water')) {
    for (const poly of polygonsOf(f)) {
      const p = prepPolygon(poly, TOL.water, MIN_AREA.water)
      if (!p) continue
      addArea(layer, waterKind(f.properties), p)
      n++
    }
  }
  // 海面：海岸线在经纬度空间里拼成多边形，再换算
  const coast = readSeq('coastline').flatMap((f) => (f.geometry.type === 'LineString' ? [f.geometry.coordinates] : []))
  const sea = buildSea(coast, BBOX)
  for (const w of sea.warnings) console.warn('  ⚠ ' + w)
  for (const poly of sea.polygons) {
    const p = prepPolygon(poly, TOL.sea, MIN_AREA.water)
    if (!p) continue
    addArea(layer, 'sea', p)
    seaPolygons.push(p)
  }
  console.log(`  水面 ${n} 个 + 海面 ${sea.polygons.length} 块（岛屿 ${sea.polygons.reduce((s, p) => s + p.length - 1, 0)} 个）`)
  return layer
}

// ---------------------------------------------------------------- 公园

function bakeParks() {
  const layer: AreaLayer = { version: WORLD_DATA_VERSION, chunks: {} }
  let n = 0
  for (const f of readSeq('parks')) {
    const p = f.properties
    const kind = p.leisure === 'park' ? 'park' : p.leisure === 'garden' ? 'garden' : String(p.landuse)
    for (const poly of polygonsOf(f)) {
      const pp = prepPolygon(poly, TOL.parks, MIN_AREA.parks)
      if (!pp) continue
      addArea(layer, kind, pp)
      n++
    }
  }
  console.log(`  公园绿地 ${n} 个`)
  return layer
}

// ---------------------------------------------------------------- 道路

interface RawRoad {
  key: string
  pts: Pt[]
  name: string
  cls: RoadClass
  bridge: boolean
  layer: number
  oneway: boolean
}

function bakeRoads() {
  const raw: RawRoad[] = []
  let tunnels = 0
  for (const f of readSeq('roads')) {
    if (f.geometry.type !== 'LineString') continue
    const p = f.properties
    const layer = Number.parseInt(String(p.layer ?? 0)) || 0
    if ((p.tunnel && p.tunnel !== 'no') || layer < 0) {
      tunnels++
      continue
    }
    const cls = String(p.highway) as RoadClass
    const bridge = !!p.bridge && p.bridge !== 'no'
    const oneway = p.oneway === 'yes'
    const name = String(p.name ?? p.ref ?? '')
    raw.push({ key: `${name}|${cls}|${bridge}|${bridge ? layer : 0}|${oneway}`, pts: f.geometry.coordinates, name, cls, bridge, layer, oneway })
  }
  const merged = mergeLines(raw, true)

  const infos: RoadInfo[] = []
  const lines: { pts: Pt[]; base: number }[] = []
  for (const r of merged) {
    const highway = r.cls === 'motorway' || r.cls === 'trunk' || r.cls === 'motorway_link' || r.cls === 'trunk_link'
    const elevated = r.bridge && r.layer >= 1 && (highway || realLengthM(r.pts) > ELEVATED_MIN_M)
    const level = elevated ? Math.min(r.layer, MAX_LEVEL) : 0
    // 双向分离的道路在 OSM 里是两条单行线，各画窄一点，并排看起来是一条宽路
    const width = ROAD_WIDTH[r.cls] * (r.oneway && !r.cls.endsWith('_link') ? 0.6 : 1)
    infos.push({ name: r.name, class: r.cls, width: round1(width), level, bridge: r.bridge && !elevated })
    lines.push({ pts: simplify(r.pts.map(project), TOL.roads), base: level * LEVEL_HEIGHT })
  }
  const withH = rampHeights(lines, RAMP_LEN)

  const layer: RoadLayer = { version: WORLD_DATA_VERSION, roads: infos, chunks: {} }
  withH.forEach((pts, idx) => {
    for (const [cx, cz] of chunksOver(bounds(pts))) {
      for (const piece of clipPolyline(pts, chunkRect(cx, cz))) {
        ;(layer.chunks[chunkKey(cx, cz)] ??= []).push([idx, piece.flatMap((p) => [round1(p[0]!), round1(p[1]!), round1(p[2]!)])])
      }
    }
  })
  console.log(`  道路 ${raw.length} 段 → 合并为 ${merged.length} 条（其中高架 ${infos.filter((r) => r.level > 0).length} 条），跳过隧道 ${tunnels} 段`)
  return layer
}

// ---------------------------------------------------------------- 区界

function bakeDistricts(): DistrictLayer {
  const { ways, relations } = parseOpl(readFileSync(join(CACHE, 'boundaries.opl'), 'utf8'))
  const byName = new Map(Object.entries(shanghai.districts).map(([id, d]) => [d.name, id]))
  const districts: DistrictShape[] = []
  for (const rel of relations) {
    const id = byName.get(rel.tags.name ?? '')
    if (!id || rel.tags.admin_level !== '6') continue
    const rings = (role: string) => {
      const parts = rel.members.filter((m) => m.type === 'w' && (m.role === role || (role === 'outer' && m.role === '')))
      // 不在提取包里、或节点缺坐标的成员都算缺失
      const usable = (ref: number) => (ways.get(ref)?.length ?? 0) >= 2
      const missing = parts.filter((m) => !usable(m.ref)).length
      const lines = parts.flatMap((m) => (usable(m.ref) ? [{ key: '', pts: ways.get(m.ref)! }] : []))
      const chains = mergeLines(lines, true)
      const closed = chains.filter((c) => c.pts.length > 3 && c.pts[0]![0] === c.pts[c.pts.length - 1]![0] && c.pts[0]![1] === c.pts[c.pts.length - 1]![1])
      if (missing || closed.length !== chains.length)
        console.warn(`  ⚠ ${rel.tags.name} ${role}：缺 ${missing} 条成员，${chains.length - closed.length} 段未闭合（已丢弃）`)
      return closed.map((c) => simplifyRing(projectRing(c.pts), TOL.districts))
    }
    const inners = rings('inner')
    // 裁到世界范围内：静安、宝山在苏北有飞地，浦东、崇明的区界延伸到海上
    const outers = rings('outer')
      .map((o) => clipRing(o, worldRect))
      .filter((o) => Math.abs(ringArea(o)) >= MIN_AREA.districts)
    const polygons: Pt[][][] = outers.map((o) => [o])
    for (const h of inners) polygons.find((p) => pointInRing(h[0]![0]!, h[0]![1]!, p[0]!))?.push(clipRing(h, worldRect))
    const b = bounds(outers.flat())
    const inSea = (x: number, z: number) => seaPolygons.some((p) => pointInRing(x, z, p[0]!) && !p.slice(1).some((h) => pointInRing(x, z, h)))
    const near = (r: Pt[]) => {
      const rb = bounds(r)
      return rb.maxX >= b.minX && rb.minX <= b.maxX && rb.maxY >= b.minY && rb.minY <= b.maxY
    }
    const coast = seaPolygons.flat().filter(near).map((r) => r.filter((p) => p[0]! >= b.minX && p[0]! <= b.maxX && p[1]! >= b.minY && p[1]! <= b.maxY))
    const label = labelPoint(polygons, inSea, coast) ?? [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2]
    districts.push({
      id,
      name: rel.tags.name!,
      polygons: polygons.map((p): FlatPolygon => p.filter((r) => r.length).map(flat)),
      bounds: [round1(b.minX), round1(b.minY), round1(b.maxX), round1(b.maxY)],
      label: [round1(label[0]!), round1(label[1]!)]
    })
  }
  const missing = Object.keys(shanghai.districts).filter((id) => !districts.some((d) => d.id === id))
  if (missing.length) throw new Error(`缺少区界：${missing.join('、')}`)
  console.log(`  区界 ${districts.length} 个`)
  return { version: WORLD_DATA_VERSION, districts }
}

// ---------------------------------------------------------------- 输出

function write(name: string, data: unknown) {
  const file = join(OUT, `${name}.json`)
  writeFileSync(file, JSON.stringify(data))
  const extra = name !== 'world' && data && typeof data === 'object' && 'chunks' in data && typeof data.chunks === 'object' ? `，${Object.keys(data.chunks as object).length} 个分块` : ''
  console.log(`  → ${name}.json ${(statSync(file).size / 1048576).toFixed(2)} MB${extra}`)
}

const meta = JSON.parse(readFileSync(join(CACHE, 'meta.json'), 'utf8')) as { osmTimestamp: string }
console.log(`烘焙（OSM ${meta.osmTimestamp}，分块 ${CHUNK_SIZE} 格，范围 x ${CHUNKS.minX}..${CHUNKS.maxX} / z ${CHUNKS.minZ}..${CHUNKS.maxZ}）`)
const t0 = performance.now()
const world: WorldMeta = {
  version: WORLD_DATA_VERSION,
  generatedAt: new Date().toISOString().slice(0, 10),
  osmTimestamp: meta.osmTimestamp,
  chunkSize: CHUNK_SIZE,
  bbox: shanghai.osm.bbox,
  outline: flat(outline),
  chunks: CHUNKS
}
write('water', bakeWater())
write('parks', bakeParks())
write('roads', bakeRoads())
write('districts', bakeDistricts())
write('world', world)
console.log(`完成，用时 ${((performance.now() - t0) / 1000).toFixed(1)} 秒`)

// 烘焙数据的俯视预览（开发用）：npm run dev 后打开 /tools/preview/
// 拖动平移、滚轮或双指缩放。地址参数 ?x=&z=&s= 指定中心（格）和比例（像素/格），grid=1 显示分块网格
import shanghai from '../../src/cities/shanghai/config.ts'
import { createProjection } from '../../src/engine/geo/projection.ts'
import { CHUNK_SIZE, chunkKey, chunkOf } from '../../src/engine/world/chunks.ts'
import type { AreaLayer, DistrictLayer, FlatRing, RoadLayer, WorldMeta } from '../../src/engine/world/data.ts'
import waterUrl from '../../src/cities/shanghai/data/water.json?url'
import parksUrl from '../../src/cities/shanghai/data/parks.json?url'
import roadsUrl from '../../src/cities/shanghai/data/roads.json?url'
import districtsUrl from '../../src/cities/shanghai/data/districts.json?url'
import worldUrl from '../../src/cities/shanghai/data/world.json?url'

const canvas = document.getElementById('map') as HTMLCanvasElement
const hud = document.getElementById('hud')!
const ctx = canvas.getContext('2d')!
const proj = createProjection(shanghai.projection)
const params = new URLSearchParams(location.search)

const view = { x: Number(params.get('x') ?? 0), z: Number(params.get('z') ?? 0), s: Number(params.get('s') ?? 0.08) }
const showGrid = params.get('grid') === '1'

const load = async <T>(url: string) => (await fetch(url)).json() as Promise<T>
const [water, parks, roads, districts, world] = await Promise.all([
  load<AreaLayer>(waterUrl),
  load<AreaLayer>(parksUrl),
  load<RoadLayer>(roadsUrl),
  load<DistrictLayer>(districtsUrl),
  load<WorldMeta>(worldUrl)
])

const WATER = { sea: '#8fb8d8', river: '#9cc4e4', lake: '#9cc4e4', water: '#a6cbe6' } as Record<string, string>
const PARK = { park: '#b9d8a0', garden: '#c4dfa9', forest: '#a3c98c', grass: '#cfe5b4' } as Record<string, string>

let dpr = 1
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = innerWidth * dpr
  canvas.height = innerHeight * dpr
  draw()
}

// 游戏坐标 → 画布像素
const sx = (x: number) => (x - view.x) * view.s * dpr + canvas.width / 2
const sz = (z: number) => (z - view.z) * view.s * dpr + canvas.height / 2

function ringPath(r: FlatRing) {
  ctx.moveTo(sx(r[0]!), sz(r[1]!))
  for (let i = 2; i < r.length; i += 2) ctx.lineTo(sx(r[i]!), sz(r[i + 1]!))
  ctx.closePath()
}

function visibleChunks() {
  const half = (v: number) => v / 2 / view.s
  const x0 = chunkOf(view.x - half(innerWidth))
  const x1 = chunkOf(view.x + half(innerWidth))
  const z0 = chunkOf(view.z - half(innerHeight))
  const z1 = chunkOf(view.z + half(innerHeight))
  const keys: string[] = []
  for (let cx = Math.max(x0, world.chunks.minX); cx <= Math.min(x1, world.chunks.maxX); cx++)
    for (let cz = Math.max(z0, world.chunks.minZ); cz <= Math.min(z1, world.chunks.maxZ); cz++) keys.push(chunkKey(cx, cz))
  return keys
}

function fillArea(layer: AreaLayer, colors: Record<string, string>, keys: string[]) {
  for (const [kind, color] of Object.entries(colors)) {
    ctx.beginPath()
    for (const k of keys) for (const p of layer.chunks[k] ?? []) if (p.kind === kind) p.polygon.forEach(ringPath)
    ctx.fillStyle = color
    ctx.fill('evenodd')
  }
}

function draw() {
  ctx.fillStyle = '#efe9dc'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  const keys = visibleChunks()

  // 区划底色
  for (const d of districts.districts) {
    ctx.beginPath()
    for (const poly of d.polygons) poly.forEach(ringPath)
    ctx.globalAlpha = 0.28
    ctx.fillStyle = shanghai.districts[d.id as keyof typeof shanghai.districts].color
    ctx.fill('evenodd')
    ctx.globalAlpha = 1
  }
  fillArea(parks, PARK, keys)
  fillArea(water, WATER, keys)

  // 道路：先地面后高架；宽度按真实格数，太细时至少 1 像素
  for (const elevated of [false, true]) {
    for (const k of keys) {
      for (const [idx, pts] of roads.chunks[k] ?? []) {
        const info = roads.roads[idx]!
        if (info.level > 0 !== elevated) continue
        ctx.beginPath()
        ctx.moveTo(sx(pts[0]!), sz(pts[1]!))
        for (let i = 3; i < pts.length; i += 3) ctx.lineTo(sx(pts[i]!), sz(pts[i + 1]!))
        ctx.lineWidth = Math.max(dpr * (info.class.startsWith('secondary') ? 0.6 : 1), info.width * view.s * dpr)
        ctx.strokeStyle = elevated ? '#e0913a' : info.bridge ? '#8a7a66' : info.class === 'secondary' ? '#ffffff' : '#f7e3a6'
        ctx.stroke()
      }
    }
  }

  // 区界线和区名
  ctx.lineWidth = dpr
  ctx.strokeStyle = 'rgba(80, 60, 120, 0.7)'
  ctx.setLineDash([4 * dpr, 3 * dpr])
  for (const d of districts.districts) {
    ctx.beginPath()
    for (const poly of d.polygons) poly.forEach(ringPath)
    ctx.stroke()
  }
  ctx.setLineDash([])

  if (showGrid) {
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)'
    ctx.beginPath()
    for (let cx = world.chunks.minX; cx <= world.chunks.maxX + 1; cx++) {
      ctx.moveTo(sx(cx * CHUNK_SIZE), sz(world.chunks.minZ * CHUNK_SIZE))
      ctx.lineTo(sx(cx * CHUNK_SIZE), sz((world.chunks.maxZ + 1) * CHUNK_SIZE))
    }
    for (let cz = world.chunks.minZ; cz <= world.chunks.maxZ + 1; cz++) {
      ctx.moveTo(sx(world.chunks.minX * CHUNK_SIZE), sz(cz * CHUNK_SIZE))
      ctx.lineTo(sx((world.chunks.maxX + 1) * CHUNK_SIZE), sz(cz * CHUNK_SIZE))
    }
    ctx.stroke()
  }

  // 烘焙范围轮廓、核心区黄圈、原点
  ctx.lineWidth = 2 * dpr
  ctx.strokeStyle = '#555'
  ctx.beginPath()
  ringPath(world.outline)
  ctx.stroke()
  ctx.strokeStyle = '#e6b800'
  ctx.beginPath()
  ctx.arc(sx(0), sz(0), proj.coreRadiusKm * proj.unitsPerKm * view.s * dpr, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = '#c8282a'
  ctx.fillRect(sx(0) - 3 * dpr, sz(0) - 3 * dpr, 6 * dpr, 6 * dpr)

  ctx.font = `${12 * dpr}px system-ui, 'PingFang SC', sans-serif`
  ctx.textAlign = 'center'
  ctx.fillStyle = '#3a2f55'
  for (const d of districts.districts) ctx.fillText(d.name, sx(d.label[0]), sz(d.label[1]))
  updateHud()
}

let pointer: { x: number; z: number } | null = null
function updateHud() {
  const p = pointer ?? { x: view.x, z: view.z }
  const ll = proj.unproject(p.x, p.z)
  hud.textContent =
    `OSM ${world.osmTimestamp} · 烘焙 ${world.generatedAt}\n` +
    `${pointer ? '光标' : '中心'}：${p.x.toFixed(0)}, ${p.z.toFixed(0)} 格 · ${ll.lat.toFixed(5)}, ${ll.lon.toFixed(5)}\n` +
    `比例：1 像素 = ${(1 / view.s).toFixed(1)} 格`
}

// 交互：拖动、滚轮、双指
const toWorld = (cx: number, cy: number) => ({ x: view.x + (cx - innerWidth / 2) / view.s, z: view.z + (cy - innerHeight / 2) / view.s })
function zoomAt(cx: number, cy: number, factor: number) {
  const before = toWorld(cx, cy)
  view.s = Math.min(8, Math.max(0.01, view.s * factor))
  const after = toWorld(cx, cy)
  view.x += before.x - after.x
  view.z += before.z - after.z
  draw()
}
canvas.addEventListener('wheel', (e) => {
  e.preventDefault()
  zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.002))
}, { passive: false })
const touches = new Map<number, { x: number; y: number }>()
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId)
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
})
canvas.addEventListener('pointermove', (e) => {
  pointer = toWorld(e.clientX, e.clientY)
  const prev = touches.get(e.pointerId)
  if (!prev) return updateHud()
  if (touches.size === 2) {
    const [a, b] = [...touches.values()]
    const before = Math.hypot(a!.x - b!.x, a!.y - b!.y)
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const [c, d] = [...touches.values()]
    zoomAt((c!.x + d!.x) / 2, (c!.y + d!.y) / 2, Math.hypot(c!.x - d!.x, c!.y - d!.y) / before)
    return
  }
  view.x -= (e.clientX - prev.x) / view.s
  view.z -= (e.clientY - prev.y) / view.s
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
  draw()
})
const release = (e: PointerEvent) => touches.delete(e.pointerId)
canvas.addEventListener('pointerup', release)
canvas.addEventListener('pointercancel', release)
addEventListener('resize', resize)
resize()
// 供截图脚本判断加载完成
;(window as unknown as { __ready: boolean }).__ready = true

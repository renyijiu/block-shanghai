// 烘焙数据的俯视预览（开发用）：npm run dev 后打开 /tools/preview/
// 拖动平移、滚轮或双指缩放。地址参数 ?x=&z=&s= 指定中心（格）和比例（像素/格），grid=1 显示分块网格
import shanghai from '../../src/cities/shanghai/config.ts'
import { createProjection } from '../../src/engine/geo/projection.ts'
import { drawMap, type MapData, type MapView } from '../../src/engine/map/drawMap.ts'
import type { AreaLayer, DistrictLayer, RoadLayer, WorldMeta } from '../../src/engine/world/data.ts'
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
const data: MapData = { meta: world, water, parks, roads, districts }
const districtColors = Object.fromEntries(Object.entries(shanghai.districts).map(([id, d]) => [id, d.color]))

let dpr = 1
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = innerWidth * dpr
  canvas.height = innerHeight * dpr
  draw()
}

function draw() {
  const v: MapView = { x: view.x, z: view.z, scale: view.s, width: innerWidth, height: innerHeight, dpr }
  drawMap(ctx, data, v, { districtColors, districtLines: true, labels: true, outline: true, grid: showGrid, coreRadius: proj.coreRadiusKm * proj.unitsPerKm })
  // 原点
  ctx.fillStyle = '#c8282a'
  ctx.fillRect(((0 - view.x) * view.s + innerWidth / 2) * dpr - 3 * dpr, ((0 - view.z) * view.s + innerHeight / 2) * dpr - 3 * dpr, 6 * dpr, 6 * dpr)
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

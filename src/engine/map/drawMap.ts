// 2D 地图绘制：小地图、大地图、开发用的俯视预览共用。画在 canvas 2D 上，不依赖界面框架。
// 缩得很小时（看全市）改用一张预先画好的全图底图，避免每次重画几千个分块的矢量数据
import { CHUNK_SIZE, chunkKey, chunkOf } from '../world/chunks.ts'
import type { AreaLayer, DistrictLayer, FlatRing, RoadLayer, WorldMeta } from '../world/data.ts'
import { tr } from '../../i18n/core.ts'

export interface MapData {
  meta: WorldMeta
  water: AreaLayer
  parks: AreaLayer
  roads: RoadLayer
  districts: DistrictLayer
}

export interface MapView {
  /** 视图中心（格） */
  x: number
  z: number
  /** 比例：CSS 像素 / 格 */
  scale: number
  /** 画布大小（CSS 像素） */
  width: number
  height: number
  dpr: number
}

export interface MapStyle {
  /** 区 id → 底色；不给就不画区划底色 */
  districtColors?: Record<string, string>
  districtAlpha?: number
  /** 区界虚线 */
  districtLines?: boolean
  /** 区名 */
  labels?: boolean
  /** 烘焙范围轮廓、分块网格、核心区圈（开发用） */
  outline?: boolean
  grid?: boolean
  coreRadius?: number
}

export const MAP_COLORS = {
  land: '#efe9dc',
  water: '#9cc4e4',
  sea: '#8fb8d8',
  park: '#b9d8a0',
  forest: '#a3c98c',
  primary: '#f7e3a6',
  secondary: '#ffffff',
  elevated: '#e0913a',
  bridge: '#8a7a66',
  label: '#3a2f55'
}

/** 低于这个比例时用全图底图 */
const OVERVIEW_BELOW = 0.12
/** 全图底图的比例（像素 / 格） */
const OVERVIEW_SCALE = 0.16

const overviews = new WeakMap<MapData, { canvas: HTMLCanvasElement | OffscreenCanvas; key: string }>()

export function drawMap(ctx: CanvasRenderingContext2D, data: MapData, view: MapView, style: MapStyle = {}) {
  const { dpr } = view
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = MAP_COLORS.land
  ctx.fillRect(0, 0, view.width * dpr, view.height * dpr)

  if (view.scale < OVERVIEW_BELOW) {
    const ov = overview(data, style)
    const c = data.meta.chunks
    const k = view.scale / OVERVIEW_SCALE
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(
      ov,
      ((c.minX * CHUNK_SIZE - view.x) * view.scale + view.width / 2) * dpr,
      ((c.minZ * CHUNK_SIZE - view.z) * view.scale + view.height / 2) * dpr,
      ov.width * k * dpr,
      ov.height * k * dpr
    )
  } else {
    drawVectors(ctx, data, view, style, visibleChunks(data.meta, view))
  }
  drawOverlays(ctx, data, view, style)
}

/** 游戏坐标 → 画布像素（设备像素） */
export function toScreen(view: MapView, x: number, z: number): [number, number] {
  return [((x - view.x) * view.scale + view.width / 2) * view.dpr, ((z - view.z) * view.scale + view.height / 2) * view.dpr]
}

/** 画布 CSS 像素 → 游戏坐标 */
export function toWorld(view: MapView, px: number, py: number) {
  return { x: view.x + (px - view.width / 2) / view.scale, z: view.z + (py - view.height / 2) / view.scale }
}

function visibleChunks(meta: WorldMeta, view: MapView) {
  const hw = view.width / 2 / view.scale
  const hh = view.height / 2 / view.scale
  const keys: string[] = []
  for (let cx = Math.max(meta.chunks.minX, chunkOf(view.x - hw)); cx <= Math.min(meta.chunks.maxX, chunkOf(view.x + hw)); cx++)
    for (let cz = Math.max(meta.chunks.minZ, chunkOf(view.z - hh)); cz <= Math.min(meta.chunks.maxZ, chunkOf(view.z + hh)); cz++) keys.push(chunkKey(cx, cz))
  return keys
}

function drawVectors(ctx: CanvasRenderingContext2D, data: MapData, view: MapView, style: MapStyle, keys: string[] | null) {
  const { dpr, scale } = view
  const sx = (x: number) => ((x - view.x) * scale + view.width / 2) * dpr
  const sz = (z: number) => ((z - view.z) * scale + view.height / 2) * dpr
  const ring = (r: FlatRing) => {
    ctx.moveTo(sx(r[0]!), sz(r[1]!))
    for (let i = 2; i < r.length; i += 2) ctx.lineTo(sx(r[i]!), sz(r[i + 1]!))
    ctx.closePath()
  }
  const chunkKeys = keys ?? Object.keys({ ...data.water.chunks, ...data.parks.chunks, ...data.roads.chunks })

  // 区划底色（整区多边形）
  if (style.districtColors) {
    ctx.globalAlpha = style.districtAlpha ?? 0.28
    for (const d of data.districts.districts) {
      const color = style.districtColors[d.id]
      if (!color) continue
      ctx.beginPath()
      for (const p of d.polygons) p.forEach(ring)
      ctx.fillStyle = color
      ctx.fill('evenodd')
    }
    ctx.globalAlpha = 1
  }

  // 同一颜色的面合成一条路径一次填充
  const fillKinds = (layer: AreaLayer, kinds: Record<string, string>, fallback: string) => {
    for (const color of new Set([...Object.values(kinds), fallback])) {
      ctx.beginPath()
      for (const k of chunkKeys) for (const p of layer.chunks[k] ?? []) if ((kinds[p.kind] ?? fallback) === color) p.polygon.forEach(ring)
      ctx.fillStyle = color
      ctx.fill('evenodd')
    }
  }
  fillKinds(data.parks, { forest: MAP_COLORS.forest }, MAP_COLORS.park)
  fillKinds(data.water, { sea: MAP_COLORS.sea }, MAP_COLORS.water)

  // 道路：缩小时只画主干道；先地面后高架
  const minor = scale >= 0.3
  for (const elevated of [false, true]) {
    for (const k of chunkKeys) {
      for (const [idx, pts] of data.roads.chunks[k] ?? []) {
        const info = data.roads.roads[idx]!
        if (info.level > 0 !== elevated) continue
        if (!minor && info.class === 'secondary') continue
        ctx.beginPath()
        ctx.moveTo(sx(pts[0]!), sz(pts[1]!))
        for (let i = 3; i < pts.length; i += 3) ctx.lineTo(sx(pts[i]!), sz(pts[i + 1]!))
        ctx.lineWidth = Math.max(dpr * (info.class === 'secondary' ? 0.6 : 1), info.width * scale * dpr)
        ctx.strokeStyle = elevated ? MAP_COLORS.elevated : info.bridge ? MAP_COLORS.bridge : info.class === 'secondary' ? MAP_COLORS.secondary : MAP_COLORS.primary
        ctx.stroke()
      }
    }
  }
}

function drawOverlays(ctx: CanvasRenderingContext2D, data: MapData, view: MapView, style: MapStyle) {
  const { dpr, scale } = view
  const sx = (x: number) => ((x - view.x) * scale + view.width / 2) * dpr
  const sz = (z: number) => ((z - view.z) * scale + view.height / 2) * dpr
  const ring = (r: FlatRing) => {
    ctx.moveTo(sx(r[0]!), sz(r[1]!))
    for (let i = 2; i < r.length; i += 2) ctx.lineTo(sx(r[i]!), sz(r[i + 1]!))
    ctx.closePath()
  }
  if (style.districtLines) {
    ctx.lineWidth = dpr
    ctx.strokeStyle = 'rgba(80, 60, 120, 0.6)'
    ctx.setLineDash([4 * dpr, 3 * dpr])
    ctx.beginPath()
    for (const d of data.districts.districts) for (const p of d.polygons) p.forEach(ring)
    ctx.stroke()
    ctx.setLineDash([])
  }
  const c = data.meta.chunks
  if (style.grid) {
    ctx.lineWidth = dpr
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)'
    ctx.beginPath()
    for (let cx = c.minX; cx <= c.maxX + 1; cx++) {
      ctx.moveTo(sx(cx * CHUNK_SIZE), sz(c.minZ * CHUNK_SIZE))
      ctx.lineTo(sx(cx * CHUNK_SIZE), sz((c.maxZ + 1) * CHUNK_SIZE))
    }
    for (let cz = c.minZ; cz <= c.maxZ + 1; cz++) {
      ctx.moveTo(sx(c.minX * CHUNK_SIZE), sz(cz * CHUNK_SIZE))
      ctx.lineTo(sx((c.maxX + 1) * CHUNK_SIZE), sz(cz * CHUNK_SIZE))
    }
    ctx.stroke()
  }
  if (style.outline) {
    ctx.lineWidth = 2 * dpr
    ctx.strokeStyle = '#555'
    ctx.beginPath()
    ring(data.meta.outline)
    ctx.stroke()
  }
  if (style.coreRadius) {
    ctx.lineWidth = 2 * dpr
    ctx.strokeStyle = '#e6b800'
    ctx.beginPath()
    ctx.arc(sx(0), sz(0), style.coreRadius * scale * dpr, 0, Math.PI * 2)
    ctx.stroke()
  }
  if (style.labels) {
    ctx.font = `600 ${12 * dpr}px system-ui, 'PingFang SC', sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 3 * dpr
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'
    ctx.fillStyle = MAP_COLORS.label
    for (const d of data.districts.districts) {
      const [x, y] = [sx(d.label[0]), sz(d.label[1])]
      const name = tr(d.name)
      ctx.strokeText(name, x, y)
      ctx.fillText(name, x, y)
    }
  }
}

// 全图底图：只画一次（区划底色、公园、水面、主干道），之后缩小查看时直接贴图
function overview(data: MapData, style: MapStyle) {
  const key = JSON.stringify(style.districtColors ?? null)
  const hit = overviews.get(data)
  if (hit && hit.key === key) return hit.canvas
  const c = data.meta.chunks
  const w = Math.ceil((c.maxX - c.minX + 1) * CHUNK_SIZE * OVERVIEW_SCALE)
  const h = Math.ceil((c.maxZ - c.minZ + 1) * CHUNK_SIZE * OVERVIEW_SCALE)
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h })
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
  ctx.fillStyle = MAP_COLORS.land
  ctx.fillRect(0, 0, w, h)
  const view: MapView = { x: c.minX * CHUNK_SIZE + w / 2 / OVERVIEW_SCALE, z: c.minZ * CHUNK_SIZE + h / 2 / OVERVIEW_SCALE, scale: OVERVIEW_SCALE, width: w, height: h, dpr: 1 }
  drawVectors(ctx, data, view, { districtColors: style.districtColors, districtAlpha: style.districtAlpha }, null)
  overviews.set(data, { canvas, key })
  return canvas
}

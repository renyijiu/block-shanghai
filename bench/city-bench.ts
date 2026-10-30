// 渲染基准：同一座程序化方块城市，分别用三种渲染路径跑，比较帧率和初始化耗时
// 用法：/bench/?r=webgpu|fallback|webgl&chunks=15&shadows=1
//   webgpu   WebGPURenderer（WebGPU 后端）
//   fallback WebGPURenderer（forceWebGL，即 WebGPU 不可用时的 WebGL 2 后端）
//   webgl    经典 WebGLRenderer
// 结果写到 window.__bench，便于脚本读取。

// 合并网格时累积的顶点数据：位置、法线、颜色、索引
type Arrays = { pos: number[]; nor: number[]; col: number[]; idx: number[] }
// 建城只用到的核心类：'three' 和 'three/webgpu' 导出的是同一套
type Core = Pick<typeof import('three'), 'BufferGeometry' | 'Float32BufferAttribute' | 'Mesh' | 'MeshLambertMaterial' | 'MeshPhongMaterial' | 'InstancedMesh' | 'BoxGeometry' | 'Matrix4' | 'PlaneGeometry' | 'Scene' | 'Color' | 'Fog' | 'HemisphereLight' | 'DirectionalLight' | 'PerspectiveCamera'>

// WebGLRenderer 和 WebGPURenderer 在基准里用到的公共部分
interface BenchRenderer {
  domElement: HTMLCanvasElement
  shadowMap: { enabled: boolean }
  setPixelRatio(ratio: number): void
  setSize(width: number, height: number): void
  setAnimationLoop(callback: ((time: number) => void) | null): unknown
  render(scene: InstanceType<Core['Scene']>, camera: InstanceType<Core['PerspectiveCamera']>): unknown
  // WebGLRenderer 叫 calls，WebGPURenderer 叫 drawCalls
  info: { render: { calls?: number; drawCalls?: number; triangles: number } }
  init?: () => Promise<unknown>
  backend?: object
}

interface BenchResult {
  mode: string
  backend: string
  hasWebGPU: boolean
  gpu: { webgpu: string | null; webgl: string | null }
  chunks: number
  shadows: boolean
  boxes: number
  trees: number
  drawCalls: number
  triangles: number
  fps: number
  p95ms: number
  split: boolean
  initMs: number
  buildMs: number
  firstFrameMs: number
  viewport: string
}

declare global {
  interface Window {
    __bench?: BenchResult | { mode: string; error: string }
  }
}

const params = new URLSearchParams(location.search)
const mode = params.get('r') || 'webgpu'
const CHUNKS = Number(params.get('chunks') || 15) // 每边分块数
const SHADOWS = params.get('shadows') !== '0'
// split=1：不合并，每栋楼一个独立网格，模拟大量独立物体（NPC、道具）时的 draw call 压力
const SPLIT = params.get('split') === '1'
const CHUNK = 240
const LOT = 24
const WARMUP_MS = 2000
const SAMPLE_MS = 8000

const hud = document.getElementById('hud')!
const links = ['webgpu', 'fallback', 'webgl'].map((m) => `<a href="?r=${m}&chunks=${CHUNKS}&shadows=${SHADOWS ? 1 : 0}&split=${SPLIT ? 1 : 0}">${m}</a>`).join('')

function mulberry32(a: number) {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// 往数组里追加一个轴对齐方块（不含底面：5 个面、10 个三角形）
function pushBox(a: Arrays, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r: number, g: number, b: number) {
  const faces: [number[], number[], number[], number[], number[]][] = [
    [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0]],
    [[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], [-1, 0, 0]],
    [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0]],
    [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]],
    [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]]
  ]
  for (const [p0, p1, p2, p3, n] of faces) {
    const base = a.pos.length / 3
    for (const p of [p0, p1, p2, p3]) {
      a.pos.push(p[0]!, p[1]!, p[2]!)
      a.nor.push(n[0]!, n[1]!, n[2]!)
      a.col.push(r, g, b)
    }
    a.idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
}

function toGeometry(THREE: Core, a: Arrays) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(a.pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(a.nor, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(a.col, 3))
  g.setIndex(a.idx)
  g.computeBoundingSphere()
  return g
}

// 每个分块合并成两个网格（墙体 + 玻璃），树用全局 InstancedMesh
function buildCity(THREE: Core, scene: InstanceType<Core['Scene']>) {
  const rnd = mulberry32(42)
  const wallMat = new THREE.MeshLambertMaterial({ vertexColors: true })
  const glassMat = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 60, specular: 0x8899aa })
  const trees: [number, number][] = []
  let boxes = 0
  const half = (CHUNKS * CHUNK) / 2
  const flush = (wall: Arrays, glass: Arrays) => {
    for (const [a, mat] of [[wall, wallMat], [glass, glassMat]] as const) {
      if (!a.idx.length) continue
      const m = new THREE.Mesh(toGeometry(THREE, a), mat)
      m.castShadow = SHADOWS
      m.receiveShadow = SHADOWS
      scene.add(m)
    }
  }
  for (let cx = 0; cx < CHUNKS; cx++)
    for (let cz = 0; cz < CHUNKS; cz++) {
      let wall: Arrays = { pos: [], nor: [], col: [], idx: [] }
      let glass: Arrays = { pos: [], nor: [], col: [], idx: [] }
      const x0 = cx * CHUNK - half, z0 = cz * CHUNK - half
      const centerDist = Math.hypot(x0 + CHUNK / 2, z0 + CHUNK / 2)
      for (let i = 0; i < CHUNK / LOT; i++)
        for (let j = 0; j < CHUNK / LOT; j++) {
          if (i === 0 || j === 0) {
            if (rnd() < 0.5) trees.push([x0 + i * LOT + 2, z0 + j * LOT + 2])
            continue // 道路
          }
          const lx = x0 + i * LOT + LOT / 2, lz = z0 + j * LOT + LOT / 2
          const w = 8 + rnd() * 8, d = 8 + rnd() * 8
          const tall = centerDist < 900 ? 30 + rnd() * 110 : 6 + rnd() * 30
          const c = 0.7 + rnd() * 0.25
          // 裙楼 + 塔楼 + 屋顶构件
          pushBox(wall, lx - w / 2 - 1, 0, lz - d / 2 - 1, lx + w / 2 + 1, 5, lz + d / 2 + 1, c, c * 0.97, c * 0.92)
          const target = tall > 40 ? glass : wall
          const gc: [number, number, number] = tall > 40 ? [0.45 + rnd() * 0.2, 0.6 + rnd() * 0.15, 0.75] : [c, c, c * 0.95]
          pushBox(target, lx - w / 2, 5, lz - d / 2, lx + w / 2, tall, lz + d / 2, ...gc)
          pushBox(wall, lx - w / 4, tall, lz - d / 4, lx + w / 4, tall + 2, lz + d / 4, 0.6, 0.6, 0.62)
          boxes += 3
          if (SPLIT) {
            flush(wall, glass)
            wall = { pos: [], nor: [], col: [], idx: [] }
            glass = { pos: [], nor: [], col: [], idx: [] }
          }
        }
      flush(wall, glass)
    }
  // 树：树干 + 树冠两个 InstancedMesh
  const trunk = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 3, 0.6), new THREE.MeshLambertMaterial({ color: 0x6a4a2a }), trees.length)
  const crown = new THREE.InstancedMesh(new THREE.BoxGeometry(3.2, 3, 3.2), new THREE.MeshLambertMaterial({ color: 0x3d8a3a }), trees.length)
  const m4 = new THREE.Matrix4()
  trees.forEach(([x, z], k) => {
    trunk.setMatrixAt(k, m4.makeTranslation(x, 1.5, z))
    crown.setMatrixAt(k, m4.makeTranslation(x, 4.5, z))
  })
  crown.castShadow = SHADOWS
  scene.add(trunk, crown)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(CHUNKS * CHUNK, CHUNKS * CHUNK), new THREE.MeshLambertMaterial({ color: 0x8f8a80 }))
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = SHADOWS
  scene.add(ground)
  return { boxes, trees: trees.length }
}

async function main() {
  const adapter = navigator.gpu ? await navigator.gpu.requestAdapter().catch(() => null) : null
  const hasWebGPU = !!adapter
  // 记录实际用到的 GPU，确认不是软件渲染（SwiftShader）
  const gl = document.createElement('canvas').getContext('webgl2')
  const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info')
  const gpu = { webgpu: adapter ? `${adapter.info.vendor} ${adapter.info.architecture}`.trim() : null, webgl: gl && dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : null }

  // webgl 模式只加载经典的 three，不加载 WebGPU 构建
  let THREE: Core
  let renderer: BenchRenderer
  let tImported: number
  if (mode === 'webgl') {
    const m = await import('three')
    tImported = performance.now()
    THREE = m
    renderer = new m.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  } else {
    const m = await import('three/webgpu')
    tImported = performance.now()
    THREE = m
    renderer = new m.WebGPURenderer({ antialias: true, powerPreference: 'high-performance', forceWebGL: mode === 'fallback' })
  }
  renderer.setPixelRatio(1)
  renderer.setSize(innerWidth, innerHeight)
  renderer.shadowMap.enabled = SHADOWS
  document.body.appendChild(renderer.domElement)
  if (renderer.init) await renderer.init()
  const tInit = performance.now()
  const backend = mode === 'webgl' ? 'WebGL 2（WebGLRenderer）' : renderer.backend && 'isWebGPUBackend' in renderer.backend ? 'WebGPU' : 'WebGL 2（WebGPURenderer 回退）'

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x9cc4e4)
  scene.fog = new THREE.Fog(0x9cc4e4, 1200, 3200)
  scene.add(new THREE.HemisphereLight(0xdfefff, 0x8a8478, 1.4))
  const sun = new THREE.DirectionalLight(0xffffff, 1.6)
  sun.position.set(400, 700, 300)
  sun.castShadow = SHADOWS
  sun.shadow.mapSize.set(2048, 2048)
  Object.assign(sun.shadow.camera, { left: -900, right: 900, top: 900, bottom: -900, near: 10, far: 2000 })
  scene.add(sun)

  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 1, 5000)
  const stats = buildCity(THREE, scene)
  const tBuilt = performance.now()

  let first = 0, start = 0, frames = 0
  const dts: number[] = []
  let last = 0
  let result: BenchResult | null = null
  renderer.setAnimationLoop((now) => {
    if (!start) start = now
    const t = (now - start) / 1000
    camera.position.set(Math.cos(t * 0.15) * 700, 160, Math.sin(t * 0.15) * 700)
    camera.lookAt(0, 40, 0)
    renderer.render(scene, camera)
    if (!first) first = performance.now()
    const el = now - start
    if (el > WARMUP_MS && el < WARMUP_MS + SAMPLE_MS) {
      if (last) dts.push(now - last)
      frames++
    }
    last = now
    if (el >= WARMUP_MS + SAMPLE_MS && !result) {
      dts.sort((a, b) => a - b)
      const info = renderer.info.render
      result = {
        mode,
        backend,
        hasWebGPU,
        gpu,
        chunks: CHUNKS,
        shadows: SHADOWS,
        boxes: stats.boxes,
        trees: stats.trees,
        drawCalls: info.drawCalls ?? info.calls ?? 0,
        triangles: info.triangles,
        fps: +((frames / SAMPLE_MS) * 1000).toFixed(1),
        p95ms: +(dts[Math.floor(dts.length * 0.95)] ?? 0).toFixed(1),
        split: SPLIT,
        // 时间拆分（不含模块加载）：渲染器初始化 / 建城 / 首帧（含着色器、管线编译）
        initMs: Math.round(tInit - tImported),
        buildMs: Math.round(tBuilt - tInit),
        firstFrameMs: Math.round(first - tBuilt),
        viewport: `${innerWidth}x${innerHeight}@1x`
      }
      window.__bench = result
      renderer.setAnimationLoop(null)
    }
    if (frames % 30 === 0 || result) {
      const r = result
      hud.innerHTML = links + '\n' + `${backend} · ${CHUNKS}×${CHUNKS} 分块 · 阴影${SHADOWS ? '开' : '关'}\n` +
        (r ? `完成：${r.fps} fps · p95 ${r.p95ms} ms · ${r.drawCalls} draw calls · ${(r.triangles / 1e6).toFixed(2)}M 三角形\n初始化 ${r.initMs} ms · 建城 ${r.buildMs} ms · 首帧 ${r.firstFrameMs} ms` : el < WARMUP_MS ? '预热中…' : '采样中…')
    }
  })
}

main().catch((e: unknown) => {
  hud.textContent = '出错：' + (e instanceof Error ? e.message : String(e))
  window.__bench = { mode, error: String(e) }
})

// declare global 需要本文件是模块
export {}

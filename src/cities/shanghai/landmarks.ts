// 上海景点（docs/05 第 2 节，P3 的 S 级和首批 A 级）。坐标来自 OSM（WGS-84，2026-10-30 查询）；
// 高度按建筑尺度（1 格 ≈ 2.5 米），水平按地图尺度（核心区 1 格 ≈ 5 米），细部适当夸张以保留辨识度
import type { LandmarkContext, LandmarkDef, PartOptions } from '../../engine/city.ts'

const STONE = 0xd8cdb4
const STONE_DARK = 0xb8ab90
const GREEN_ROOF = 0x2f6b55
const TILE = 0x3a3b40
const WARM = 0xffd79a
const LIGHT = { light: true } satisfies PartOptions

// 中式屋顶：几层逐渐收小的瓦顶，最下一层四角起翘（飞檐）
function chineseRoof(c: LandmarkContext, cx: number, cz: number, w: number, d: number, y: number, tiers: number, color = TILE) {
  for (let i = 0; i < tiers; i++) {
    const k = 1 - i * 0.28
    c.box(cx - (w / 2) * k, y + i * 0.7, cz - (d / 2) * k, cx + (w / 2) * k, y + i * 0.7 + 0.45, cz + (d / 2) * k, color, { windows: 0, collide: false })
  }
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x = cx + sx * (w / 2)
      const z = cz + sz * (d / 2)
      c.box(Math.min(x, x + sx * 0.7), y + 0.3, Math.min(z, z + sz * 0.7), Math.max(x, x + sx * 0.7), y + 0.9, Math.max(z, z + sz * 0.7), color, { windows: 0, collide: false })
    }
  // 屋脊
  c.box(cx - (w / 2) * (1 - (tiers - 1) * 0.28), y + tiers * 0.7 - 0.25, cz - 0.2, cx + (w / 2) * (1 - (tiers - 1) * 0.28), y + tiers * 0.7 + 0.2, cz + 0.2, color, { windows: 0, collide: false })
}

/** 中式殿堂：台基、红柱墙身、重檐（eaves 层屋顶） */
function hall(c: LandmarkContext, cx: number, cz: number, w: number, d: number, h: number, wall: number, eaves = 1) {
  c.box(cx - w / 2 - 0.6, 0, cz - d / 2 - 0.6, cx + w / 2 + 0.6, 0.4, cz + d / 2 + 0.6, 0xb5ad9e, { windows: 0 })
  c.box(cx - w / 2, 0.4, cz - d / 2, cx + w / 2, h, cz + d / 2, wall, { windows: 0.35 })
  for (let e = 0; e < eaves; e++) chineseRoof(c, cx, cz, w + 3 - e * 3, d + 3 - e * 3, h + e * 2.2, 3)
}

// ---------------------------------------------------------------- 外滩

// 外滩是弯的：沿线每 5 格量一次 [局部 x, 中山东一路西侧 z, 东侧 z, 江边 z]，由烘焙的道路、水面数据量出
// （锚点是南京东路口的建筑前沿 31.2408, 121.48531，rot 1.35；局部 x 自北向南，z 正向朝内陆）。
// 建筑沿道路西侧一字排开，观景平台铺在道路东侧到江边之间
const BUND_EDGES: [number, number, number, number][] = [
  [-80, -19, -25, -35.5], [-75, -17, -25, -42.5], [-70, -16.5, -25, -52], [-65, -17.5, -25, -51], [-60, -18.5, -25, -46],
  [-55, -18, -25, -44], [-50, -17.5, -25, -41], [-45, -17.5, -24.5, -38.5], [-40, -15.5, -23, -36], [-35, -13.5, -21.5, -33.5],
  [-30, -11.5, -19.5, -31], [-25, -9.5, -18, -28.5], [-20, -7.5, -16, -26.5], [-15, -5.5, -14, -25], [-10, -4, -12, -23.5],
  [-5, -2.5, -10, -22], [0, -1.5, -8.5, -20.5], [5, -0.5, -8, -18.5], [10, 0, -7, -17], [15, 0.5, -6.5, -15.5],
  [20, 1, -6, -15], [25, 1.5, -5.5, -14], [30, 2.5, -5, -13.5], [35, 3, -4.5, -13], [40, 3.5, -4, -12],
  [45, 4, -3, -11.5], [50, 4.5, -2.5, -11], [55, 5, -2, -11], [60, 5.5, -1.5, -11], [65, 6, -1, -11.5],
  [70, 5.5, -1.5, -12], [75, 5, -2, -13], [80, 4, -2, -14], [85, 2.5, -4.5, -15], [90, 0.5, -6, -16],
  [95, 0, -7.5, -16.5], [100, -1.5, -9, -17.5], [105, -3, -10.5, -18.5], [110, -4.5, -12, -19.5], [115, -5.5, -13, -21],
  [120, -6.5, -14, -23], [125, -7.5, -15, -24.5], [130, -8.5, -15, -26]
]

/** 沿线插值：k = 1 道路西侧、2 道路东侧、3 江边 */
function bundEdge(x: number, k: 1 | 2 | 3) {
  const i = Math.max(0, Math.min(BUND_EDGES.length - 2, Math.floor((x + 80) / 5)))
  const a = BUND_EDGES[i]!
  const b = BUND_EDGES[i + 1]!
  return a[k] + ((b[k] - a[k]) * (x - a[0])) / (b[0] - a[0])
}

/** 外滩一栋楼的坐标系：沿街 u（0 → len，自北向南）、进深 v（0 是建筑前沿，向内陆为正）；前沿贴着道路西侧 */
function bundLot(x0: number, x1: number) {
  const f0 = bundEdge(x0, 1) + 1
  const f1 = bundEdge(x1, 1) + 1
  const tw = Math.atan2(f1 - f0, x1 - x0)
  const ux = Math.cos(tw)
  const uz = Math.sin(tw)
  const at = (u: number, v: number): [number, number] => [x0 + ux * u - uz * v, f0 + uz * u + ux * v]
  return { len: Math.hypot(x1 - x0, f1 - f0), tw, at }
}
type BundLot = ReturnType<typeof bundLot>

/** 楼里的一块：u、v 范围 + 高度 */
function lotPart(c: LandmarkContext, l: BundLot, u0: number, u1: number, v0: number, v1: number, y0: number, y1: number, color: number, o: PartOptions = {}) {
  const [cx, cz] = l.at((u0 + u1) / 2, (v0 + v1) / 2)
  c.slab(cx, cz, u1 - u0, v1 - v0, y0, y1, color, l.tw, o)
}

/** 逐层收小的金字塔顶 */
function lotPyramid(c: LandmarkContext, l: BundLot, u: number, v: number, w: number, y: number, h: number, color: number) {
  const n = 4
  for (let i = 0; i < n; i++) {
    const k = 1 - i / n
    lotPart(c, l, u - (w / 2) * k, u + (w / 2) * k, v - (w / 2) * k, v + (w / 2) * k, y + (h / n) * i, y + (h / n) * (i + 1), color, { windows: 0 })
  }
}

/** 通用的外滩老楼：石材墙身、顶部压檐，夜里前沿檐口和两侧壁柱亮金色 */
function bundBlock(c: LandmarkContext, x0: number, x1: number, depth: number, h: number, color: number) {
  const l = bundLot(x0, x1)
  lotPart(c, l, 0, l.len, 0, depth, 0, h, color)
  lotPart(c, l, -0.2, l.len + 0.2, -0.2, depth, h - 0.6, h, STONE_DARK, { windows: 0, collide: false })
  lotPart(c, l, 0, l.len, -0.45, -0.2, h - 1, h - 0.6, WARM, LIGHT)
  for (const u of [0.15, l.len - 0.45]) lotPart(c, l, u, u + 0.3, -0.3, 0, 0.6, h - 1, WARM, { ...LIGHT, collide: false })
  return l
}

const BUND_SUBS = (() => {
  const peace = bundLot(-10.5, -2)
  const customs = bundLot(44, 54)
  const hsbc = bundLot(56, 70)
  const sub = (id: string, name: string, l: BundLot, u: number, y: number) => {
    const [x, z] = l.at(u, 6)
    return { id, name, x, y, z }
  }
  return [sub('peacehotel', '和平饭店', peace, 5, 26), sub('customshouse', '海关大楼', customs, 5, 24), sub('hsbc', '原汇丰银行大楼', hsbc, 7, 15)]
})()

const bund: LandmarkDef = {
  id: 'bund',
  name: '外滩万国建筑群',
  district: 'huangpu',
  grade: 'S',
  lat: 31.2408,
  lon: 121.48531,
  rot: 1.35,
  rect: [-80, -40, 130, 26],
  // 沿线分段避让：江边到楼后，和平饭店沿南京路伸得深一些
  footprint: [
    ...Array.from({ length: 7 }, (_, i): [number, number, number, number] => [-82 + i * 30, -56, -52 + i * 30, 15]),
    [-12, 0, 10, 28]
  ],
  focusY: 18,
  photoR: 900,
  loadR: 1600,
  subs: BUND_SUBS,
  build(c) {
    // 北京东路以北（外滩源一带）
    bundBlock(c, -79, -67, 12, 11, STONE)
    bundBlock(c, -66, -55, 12, 13, STONE_DARK)
    bundBlock(c, -54, -42, 12, 10, 0xc9b9a0)
    // 北京东路到南京东路
    bundBlock(c, -38, -29, 12, 13, STONE)
    bundBlock(c, -28, -19.5, 12, 11, 0xcbbd9f)
    // 中国银行大楼：方塔 + 蓝绿色四坡顶
    const boc = bundBlock(c, -19, -11, 14, 22, STONE_DARK)
    lotPart(c, boc, 1.5, boc.len - 1.5, 2, 12, 22, 26, STONE_DARK)
    lotPyramid(c, boc, boc.len / 2, 7, 7, 26, 5, 0x3f6f7a)
    // 和平饭店北楼：沿南京路很深，转角上是标志性的绿色金字塔顶
    const peace = bundBlock(c, -10.5, -2, 26, 18, STONE)
    lotPart(c, peace, 0.8, peace.len - 0.8, 0.8, 8, 18, 24, STONE)
    lotPart(c, peace, 0.8, peace.len - 0.8, 0.35, 0.8, 23.4, 23.8, WARM, { ...LIGHT, collide: false })
    lotPyramid(c, peace, peace.len / 2, 4.4, 7.4, 24, 6, GREEN_ROOF)
    // 和平饭店南楼：红砖墙、白色横带
    const south = bundLot(2, 9)
    lotPart(c, south, 0, south.len, 0, 18, 0, 12, 0x9a5a48)
    for (let y = 2.5; y < 12; y += 3) lotPart(c, south, -0.1, south.len + 0.1, -0.1, 18, y, y + 0.5, 0xf0ece2, { windows: 0, collide: false })
    lotPart(c, south, 0, south.len, -0.45, -0.2, 11, 11.4, WARM, LIGHT)
    // 南京东路到汉口路
    bundBlock(c, 9.5, 15, 12, 11, STONE)
    bundBlock(c, 15.5, 20.5, 12, 14, 0xcbbd9f)
    bundBlock(c, 23, 28, 12, 10, STONE_DARK)
    bundBlock(c, 28.5, 34, 12, 11, STONE)
    bundBlock(c, 34.5, 42, 12, 12, 0xc9b9a0)
    // 海关大楼：方形钟楼，钟面夜里亮
    const ch = bundBlock(c, 44, 54, 14, 13, STONE)
    const m = ch.len / 2
    lotPart(c, ch, m - 3, m + 3, 1, 7, 13, 24, STONE)
    lotPart(c, ch, m - 2, m + 2, 2, 6, 24, 28, STONE_DARK)
    lotPart(c, ch, m - 0.6, m + 0.6, 3.4, 4.6, 28, 31, STONE_DARK, { windows: 0, collide: false })
    lotPart(c, ch, m - 1.6, m + 1.6, 0.85, 1, 19, 22, 0xfff3d0, { ...LIGHT, collide: false })
    // 原汇丰银行大楼：宽立面，正中圆顶
    const hsbc = bundBlock(c, 56, 70, 16, 11, STONE)
    const [dx, dz] = hsbc.at(hsbc.len / 2, 7)
    c.column(dx, dz, 3.6, 11, 14, STONE_DARK)
    c.ball(dx, 14, dz, 4, 0x9fb5a8, { collide: false })
    lotPart(c, hsbc, hsbc.len / 2 - 4, hsbc.len / 2 + 4, -0.6, 0, 0.5, 9, STONE_DARK, { windows: 0 })
    // 广东路到延安东路
    bundBlock(c, 72.5, 78.5, 12, 10, STONE_DARK)
    bundBlock(c, 79, 85, 12, 12, STONE)
    bundBlock(c, 85.5, 90, 12, 10, 0xcbbd9f)
    bundBlock(c, 90.5, 97, 12, 11, STONE)
    bundBlock(c, 97.5, 106, 12, 12, STONE_DARK)
    // 上海总会：两座小塔楼
    const club = bundBlock(c, 107, 119, 13, 12, STONE)
    for (const u of [1.5, club.len - 3.5]) lotPart(c, club, u, u + 2, 0.5, 2.5, 12, 15, STONE_DARK)
    const asia = bundBlock(c, 120, 128, 12, 14, 0xcbbd9f)
    lotPart(c, asia, 1, asia.len - 1, 1, 10, 14, 16, STONE)
    // 江边观景平台：从道路东侧铺到江边，高 0.45 格能直接走上去；江侧是带灯带的护栏，每 15 格一盏路灯
    for (let x = -80; x < 130; x += 5) {
      const zi = (bundEdge(x, 2) + bundEdge(x + 5, 2)) / 2 - 1.5
      const r0 = bundEdge(x, 3) + 0.5
      const r1 = bundEdge(x + 5, 3) + 0.5
      const tw = Math.atan2(r1 - r0, 5)
      const zo = (r0 + r1) / 2
      c.slab(x + 2.5, (zi + zo) / 2, 5.4, zi - zo, 0, 0.45, 0xb9b3a6, tw, { windows: 0 })
      c.slab(x + 2.5, zo + 0.2, 5.4, 0.4, 0.45, 1.6, 0x8d9096, tw, { windows: 0 })
      c.slab(x + 2.5, zo + 0.2, 5.4, 0.5, 1.6, 1.8, 0xcfe3ff, tw, { ...LIGHT, collide: false })
      if ((x + 80) % 15 === 0) {
        c.box(x + 2.3, 0.45, zo + 1, x + 2.7, 5, zo + 1.4, 0x4a4d52, { windows: 0 })
        c.box(x + 2, 5, zo + 0.7, x + 3, 5.6, zo + 1.7, 0xfff1c9, LIGHT)
      }
    }
  },
  desc: '黄浦江西岸一字排开的几十栋西式建筑，哥特、巴洛克、古典主义、装饰艺术风格都有，被称为“万国建筑博览群”。',
  tip: '傍晚 18:30 以后外立面亮灯；站在江边观景平台能同时拍到对岸的陆家嘴。'
}

// ---------------------------------------------------------------- 陆家嘴

const orientalPearl: LandmarkDef = {
  id: 'orientalpearl',
  name: '东方明珠',
  district: 'pudong',
  grade: 'S',
  lat: 31.2419,
  lon: 121.49527,
  rot: 0,
  rect: [-16, -16, 16, 16],
  focusY: 100,
  photoR: 1300,
  loadR: 2600,
  build(c) {
    const PINK = 0xd2597e
    c.column(0, 0, 13, 0, 3, 0xd8d2c6, { windows: 0 })
    // 三根斜撑用竖柱表示，三根直筒贯穿全塔
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 2
      c.column(Math.cos(a) * 9, Math.sin(a) * 9, 1.6, 0, 34, 0xe8e4dc, { windows: 0 })
      c.column(Math.cos(a) * 2.6, Math.sin(a) * 2.6, 1.3, 0, 140, 0xe8e4dc, { windows: 0 })
    }
    c.ball(0, 35, 0, 10, PINK, LIGHT)
    for (const y of [57, 69, 81]) c.ball(0, y, 0, 2.2, PINK, LIGHT)
    // 上球挡人：球外一圈悬空观光廊，只能绕着它走
    c.ball(0, 104, 0, 8, PINK, { ...LIGHT, collide: true })
    c.ball(0, 138, 0, 3, PINK, LIGHT)
    c.column(0, 0, 0.8, 141, 184, 0xd8d8d8, { windows: 0, collide: false })
    c.box(-0.6, 184, -0.6, 0.6, 187, 0.6, 0xff6060, { ...LIGHT, collide: false })
    // 观光廊：上球外一圈，四周玻璃护栏（1.6 格高，跳不过去）
    c.box(-9, 99.5, -9, 9, 100, 9, 0x9aa3ad, { windows: 0, collide: false })
    c.platform(-9, -9, 9, 9, 100)
    for (const [x0, z0, x1, z1] of [
      [-9, -9, 9, -8.7],
      [-9, 8.7, 9, 9],
      [-9, -8.7, -8.7, 8.7],
      [8.7, -8.7, 9, 8.7]
    ] as const)
      c.box(x0, 100, z0, x1, 101.6, z1, 0xb7e3ff, { ...LIGHT, collide: true })
    c.elevator(0, 15, 0, 100, 8, '263 米观光层')
  },
  desc: '468 米的广播电视塔，11 个大小不一的球体串在三根立柱上，取“大珠小珠落玉盘”的意境。',
  tip: '在塔下按 E 乘电梯上观光层；入夜后球体亮起紫红色灯光。'
}

const shanghaiTower: LandmarkDef = {
  id: 'shanghaitower',
  name: '上海中心大厦',
  district: 'pudong',
  grade: 'S',
  lat: 31.23554,
  lon: 121.50131,
  rot: 0,
  rect: [-16, -16, 16, 16],
  focusY: 150,
  photoR: 1500,
  loadR: 2800,
  build(c) {
    c.box(-14, 0, -14, 14, 6, 14, 0xb8c2c8)
    // 扭转塔身：36 层逐层收小、累计扭转 120°
    const n = 36
    for (let i = 0; i < n; i++) {
      const t = i / n
      const w = 16 - 7 * t
      c.slab(0, 0, w, w, 6 + 240 * t, 6 + 240 * (t + 1 / n), 0x8fb2c7, (t * 2 * Math.PI) / 3, { glass: true })
    }
    // 塔冠：顶上的观光平台和一圈灯
    c.slab(0, 0, 9, 9, 246, 247, 0xc9d4da, (2 * Math.PI) / 3, { windows: 0, collide: false })
    c.platform(-4.5, -4.5, 4.5, 4.5, 247)
    for (const [x0, z0, x1, z1] of [
      [-4.5, -4.5, 4.5, -4.2],
      [-4.5, 4.2, 4.5, 4.5],
      [-4.5, -4.2, -4.2, 4.2],
      [4.2, -4.2, 4.5, 4.2]
    ] as const)
      c.box(x0, 247, z0, x1, 248.6, z1, 0xdff1ff, { glass: true, windows: 0, collide: true })
    for (const y of [248, 251]) c.slab(0, 0, 9.4, 9.4, y, y + 0.4, 0xbfe3ff, (2 * Math.PI) / 3, { ...LIGHT, collide: false })
    c.elevator(0, 16, 0, 247, 0, '顶层观光厅“上海之巅”')
  },
  desc: '632 米的中国第一高楼，外幕墙旋转 120° 向上收窄，像一条盘旋上升的龙。',
  tip: '在楼下按 E 乘高速电梯上顶层观光厅——新手任务的终点“上海之巅”。'
}

const swfc: LandmarkDef = {
  id: 'swfc',
  name: '上海环球金融中心',
  district: 'pudong',
  grade: 'A',
  lat: 31.23659,
  lon: 121.50299,
  rot: Math.PI / 4,
  rect: [-12, -12, 12, 12],
  focusY: 120,
  photoR: 1400,
  loadR: 2600,
  build(c) {
    c.box(-12, 0, -12, 12, 6, 12, 0xb8c2c8)
    // 一个方向不变、另一个方向往上收窄成刀刃
    const n = 30
    for (let i = 0; i < n; i++) {
      const t = i / n
      c.slab(0, 0, 13, 13 - 10 * t, 6 + 174 * t, 6 + 174 * (t + 1 / n), 0x7d97ad, 0, { glass: true })
    }
    // 顶部的“开瓶器”洞口：两侧立柱 + 顶梁
    for (const x of [-5.5, 5.5]) c.box(x - 1, 180, -1.5, x + 1, 197, 1.5, 0x7d97ad, { glass: true })
    c.box(-6.5, 193, -1.5, 6.5, 197, 1.5, 0x7d97ad, { glass: true })
    c.box(-6.5, 197, -1.6, 6.5, 197.5, 1.6, 0x8fd0ff, { ...LIGHT, collide: false })
  },
  desc: '492 米，顶部的梯形洞口让它得了“开瓶器”的外号。',
  tip: '三件套里它和金茂、上海中心挨在一起，从外滩看最清楚。'
}

const jinmao: LandmarkDef = {
  id: 'jinmao',
  name: '金茂大厦',
  district: 'pudong',
  grade: 'A',
  lat: 31.23726,
  lon: 121.50139,
  rot: Math.PI / 4,
  rect: [-12, -12, 12, 12],
  focusY: 110,
  photoR: 1300,
  loadR: 2600,
  build(c) {
    c.box(-12, 0, -12, 12, 5, 12, 0xa9b0b6)
    // 像塔一样逐级收进的塔身，每级檐口夜里亮金色
    let y = 5
    for (let i = 0; i < 12; i++) {
      const w = 13 - i * 0.8
      const h = 18 - i * 1.2
      c.slab(0, 0, w, w, y, y + h, 0x5d6a74, 0, { glass: true })
      c.slab(0, 0, w + 0.6, w + 0.6, y + h - 0.5, y + h, 0xffc861, 0, { ...LIGHT, collide: false })
      y += h
    }
    c.column(0, 0, 0.8, y, y + 14, 0xc9ccd0, { windows: 0, collide: false })
  },
  desc: '420 米，层层收进的塔身取自中国古塔“密檐”的形式，88 层寓意吉祥。',
  tip: '夜里每一级檐口都亮金色。'
}

const ljzBridge: LandmarkDef = {
  id: 'ljzbridge',
  name: '陆家嘴环形天桥',
  district: 'pudong',
  grade: 'A',
  lat: 31.23962,
  lon: 121.49604,
  rot: 0,
  rect: [-21, -21, 21, 21],
  focusY: 4,
  photoR: 300,
  build(c) {
    const R = 16
    const DECK = 3.2
    const segs = 32
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2
      const x = Math.cos(a) * R
      const z = Math.sin(a) * R
      // 环上的一段：桥面、外侧栏杆灯带；切线方向
      c.slab(x, z, 3.5, 4, DECK - 0.5, DECK, 0xdedcd6, a + Math.PI / 2, { windows: 0, collide: false })
      c.slab(Math.cos(a) * (R + 1.9), Math.sin(a) * (R + 1.9), 3.5, 0.25, DECK, DECK + 1, 0x9fd8ff, a + Math.PI / 2, { ...LIGHT, collide: false })
      c.platform(x - 2, z - 2, x + 2, z + 2, DECK)
      if (i % 4 === 0) c.column(Math.cos(a) * R, Math.sin(a) * R, 0.7, 0, DECK - 0.5, 0xc8c6c0, { windows: 0 })
    }
    // 四处台阶：每级 0.45 格，直接能走上去
    for (const a of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) {
      for (let k = 1; k <= 7; k++) {
        const r = R + 2 + (8 - k) * 1.1
        c.slab(Math.cos(a) * r, Math.sin(a) * r, 1.1, 3, 0, k * 0.45, 0xcfcac0, a, { windows: 0 })
      }
    }
  },
  desc: '世纪大道和陆家嘴环路路口上方的圆形步行天桥，周长 360 多米，是拍陆家嘴“三件套”的经典机位。',
  tip: '从四个角的台阶走上去，在桥上能同时拍到东方明珠和三件套。'
}

// ---------------------------------------------------------------- 浦西

const yuyuan: LandmarkDef = {
  id: 'yuyuan',
  name: '豫园 · 城隍庙',
  district: 'huangpu',
  grade: 'S',
  // 锚点是湖心亭（OSM）。九曲桥和荷花池在园墙外西南，豫园在东北，城隍庙在东南；池塘按游戏尺度放大
  lat: 31.22866,
  lon: 121.48742,
  rot: 0,
  rect: [-19, -27, 20, 32],
  focusY: 4,
  photoR: 400,
  subs: [
    { id: 'huxinting', name: '湖心亭', x: 0, y: 3, z: 0 },
    { id: 'chenghuangmiao', name: '城隍庙', x: 11, y: 5, z: 17 }
  ],
  build(c) {
    const RED = 0x8b3a2a
    const WALL = 0xf2efe6
    const LANTERN = 0xff4a3a
    // 荷花池：浅水，四周石栏杆（只在九曲桥两头留口）；掉下桥能蹚水走回岸边
    c.box(-16, 0, -7, 5, 0.06, 9, 0x4f8f8a, { windows: 0, collide: false })
    for (const [x0, z0, x1, z1] of [
      [-16.4, -7.4, 5.4, -7],
      [5, -7, 5.4, 9.4],
      [-12.5, 9, 5.4, 9.4],
      [-16.4, -7, -16, 6.5]
    ] as const)
      c.box(x0, 0, z0, x1, 0.9, z1, 0xc9c2b2, { windows: 0 })
    // 湖心亭：两层，架在池中的台子上，四角挂灯笼
    c.box(-4.5, 0, -3.5, 4.5, 0.5, 3.5, 0xb9b0a0, { windows: 0, collide: false })
    c.platform(-4.5, -3.5, 4.5, 3.5, 0.5)
    c.box(-3, 0.5, -2, 3, 3, 2, RED, { windows: 0.4 })
    chineseRoof(c, 0, 0, 8, 5.6, 3, 2)
    c.box(-2.2, 4.4, -1.4, 2.2, 5.8, 1.4, RED, { windows: 0.4, collide: false })
    chineseRoof(c, 0, 0, 6, 4, 5.8, 3)
    for (const [dx, dz] of [
      [-3.6, -2.6],
      [3.6, -2.6],
      [-3.6, 2.6],
      [3.6, 2.6]
    ]) c.box(dx! - 0.25, 2.3, dz! - 0.25, dx! + 0.25, 2.9, dz! + 0.25, LANTERN, { ...LIGHT, collide: false })
    // 九曲桥：从亭子西南角折来折去走到池塘西南角（九段，交替向西、向南）；桥面是平台，石栏只做样子
    let x = -4.5
    let z = 2
    for (let i = 0; i < 9; i++) {
      const west = i % 2 === 0
      const nx = west ? x - 2.4 : x
      const nz = west ? z : z + 2.2
      const [x0, x1] = [Math.min(x, nx) - 0.8, Math.max(x, nx) + 0.8]
      const [z0, z1] = [Math.min(z, nz) - 0.8, Math.max(z, nz) + 0.8]
      c.box(x0, 0, z0, x1, 0.5, z1, 0xc9c2b2, { windows: 0, collide: false })
      c.platform(x0, z0, x1, z1, 0.5)
      // 外侧石栏
      if (west) c.box(x0, 0.5, z0, x1, 0.9, z0 + 0.15, 0xd8d2c4, { windows: 0, collide: false })
      else c.box(x1 - 0.15, 0.5, z0, x1, 0.9, z1, 0xd8d2c4, { windows: 0, collide: false })
      x = nx
      z = nz
    }
    // 桥头的九曲桥广场
    c.box(-19, 0, 9.4, -9, 0.08, 16, 0xbdb5a5, { windows: 0, collide: false })
    // 豫园：白墙黛瓦的园墙，南墙是起伏的“龙墙”；园里有三穗堂、点春堂和大假山
    const walls: [number, number, number, number][] = [
      [-6, -25.4, 18, -25],
      [-6.4, -25, -6, -8],
      [-6, -8.4, 5, -8],
      [5, -8, 5.4, 4],
      [5, 12, 18, 12.4],
      [18, -25, 18.4, 12.4]
    ]
    for (const [x0, z0, x1, z1] of walls) {
      c.box(x0, 0, z0, x1, 2.4, z1, WALL, { windows: 0 })
      c.box(x0 - 0.2, 2.4, z0 - 0.2, x1 + 0.2, 2.75, z1 + 0.2, TILE, { windows: 0, collide: false })
    }
    for (let x = -5.5; x < 4.5; x += 1) c.box(x, 2.75, -8.35, x + 1, 2.95 + 0.5 * (1 + Math.sin(x * 0.9)), -8.05, TILE, { windows: 0, collide: false })
    hall(c, 6, -18, 10, 6, 4, RED, 2)
    hall(c, 12, -2, 6, 5, 3.2, RED)
    for (const [rx, rz, h] of [
      [-2, -21, 4],
      [0, -22, 6],
      [1.5, -20, 3],
      [-3.5, -19, 2.5]
    ] as const)
      c.box(rx - 1.6, 0, rz - 1.4, rx + 1.6, h, rz + 1.4, 0x8e8b84, { windows: 0 })
    c.box(11.5, 0, 6.5, 12.5, 3.2, 7.3, 0x9a968c, { windows: 0 })
    // 城隍庙：坐北朝南，大殿、山门、门前牌楼；檐下一排红灯笼
    hall(c, 11, 17, 12, 7, 5, 0xc9a24a, 2)
    for (let k = -5; k <= 5; k += 2) c.box(11 + k - 0.25, 4.3, 20.6, 11 + k + 0.25, 4.9, 21, LANTERN, { ...LIGHT, collide: false })
    hall(c, 11, 25, 10, 4, 4, RED)
    for (const px of [5.5, 9, 13, 16.5]) c.box(px - 0.4, 0, 30.6, px + 0.4, 5, 31.4, RED, { windows: 0 })
    chineseRoof(c, 11, 31, 13, 2.4, 5, 2)
    for (const [x0, z0, x1, z1] of [
      [5, 12.4, 5.4, 28],
      [16.6, 12.4, 17, 28]
    ] as const)
      c.box(x0, 0, z0, x1, 2.6, z1, 0xc9a24a, { windows: 0 })
  },
  desc: '明代的江南园林，湖心亭和九曲桥是最经典的画面；隔壁城隍庙一带是老城厢的小吃中心。',
  tip: '元宵节有灯会；湖心亭四角的灯笼夜里会亮。'
}

const waibaidu: LandmarkDef = {
  id: 'waibaidu',
  name: '外白渡桥',
  district: 'huangpu',
  grade: 'A',
  // OSM 桥梁中心，局部 x 自北向南顺着桥
  lat: 31.24538,
  lon: 121.48576,
  rot: 1.833,
  rect: [-14, -6, 14, 6],
  focusY: 3,
  photoR: 350,
  build(c) {
    const STEEL = 0x6e747a
    // 桥面：架在苏州河上的平台，两端搭到岸上
    c.box(-14, 0.05, -4, 14, 0.3, 4, 0x8c8a86, { windows: 0, collide: false })
    c.platform(-14, -4, 14, 4, 0.3)
    // 两跨钢桁架：每跨上弦拱起，竖杆按拱高
    for (const side of [-4.3, 4.3]) {
      for (const [s0, s1] of [
        [-13, 0],
        [0, 13]
      ] as const) {
        const n = 8
        const arch = (t: number) => 1.6 + 2.6 * (1 - (2 * t - 1) ** 2)
        for (let i = 0; i <= n; i++) {
          const t = i / n
          const x = s0 + (s1 - s0) * t
          const h = arch(t)
          c.box(x - 0.15, 0.3, side - 0.2, x + 0.15, h, side + 0.2, STEEL, { windows: 0 })
          if (i < n) {
            const x2 = s0 + (s1 - s0) * ((i + 1) / n)
            const h2 = arch((i + 1) / n)
            c.box(x, Math.min(h, h2) - 0.3, side - 0.25, x2, Math.max(h, h2), side + 0.25, STEEL, { windows: 0, collide: false })
            c.box(x, Math.max(h, h2), side - 0.1, x2, Math.max(h, h2) + 0.15, side + 0.1, 0xfff0c8, { ...LIGHT, collide: false })
          }
        }
        c.box(s0, 0.3, side - 0.25, s1, 0.7, side + 0.25, STEEL, { windows: 0, collide: false })
      }
    }
  },
  desc: '1907 年建成的钢桁架桥，横跨苏州河口，是上海第一座全钢结构桥梁。',
  tip: '从外滩往北走到苏州河口就是，过了桥是上海大厦。'
}

const nanjingRoad: LandmarkDef = {
  id: 'nanjingroad',
  name: '南京路步行街',
  district: 'huangpu',
  grade: 'A',
  // OSM 的步行街东段（外滩到河南中路）中点，局部 x 自东向西；东头 26 格是和平饭店（外滩景点里）
  lat: 31.24024,
  lon: 121.48288,
  rot: 2.839,
  rect: [-48, -13, 46, 13],
  footprint: [
    [-48, -13, -16, 13],
    [-16, -13, 16, 13],
    [16, -13, 46, 13]
  ],
  focusY: 6,
  photoR: 250,
  build(c) {
    const NEON = [0xff3d6e, 0x37c8ff, 0xffd23a, 0x7cff6b, 0xff7a2f, 0xc77dff]
    const FACADE = [0xd9cfbd, 0xc9b9a0, 0xe4dccb, 0xb9a88c]
    // 步行街路面
    c.box(-48, 0, -4, 46, 0.06, 4, 0xb8b1a6, { windows: 0, collide: false })
    let k = 0
    for (const side of [1, -1]) {
      // 两边的商铺：宽窄、高低错开，四川中路（x ≈ -2）、江西中路（x ≈ 22）两个路口留空
      let x = -22
      while (x < 44) {
        const x1 = Math.min(44, x + 7 + ((k * 5) % 4))
        if (x < -1 && x1 > -3) {
          x = -1
          continue
        }
        if (x < 23 && x1 > 21) {
          x = 23
          continue
        }
        const h = 7 + ((k * 7 + (side > 0 ? 3 : 0)) % 6)
        const [z0, z1] = side > 0 ? [4, 12] : [-12, -4]
        c.box(x, 0, z0, x1 - 0.4, h, z1, FACADE[k % FACADE.length]!, { windows: 1 })
        // 竖向霓虹招牌，伸出立面
        const sz = side > 0 ? 3.6 : -3.6
        c.box(x + 2.5, 2.5, sz - 0.15, x + 3.5, 6.5, sz + 0.15, NEON[k % NEON.length]!, { ...LIGHT, collide: false })
        // 门头灯带
        c.box(x, 2.2, side > 0 ? 3.8 : -4, x1 - 0.4, 2.5, side > 0 ? 4 : -3.8, NEON[(k + 2) % NEON.length]!, { ...LIGHT, collide: false })
        k++
        x = x1
      }
    }
    // 路中间的路灯
    for (let x = -40; x <= 40; x += 12) {
      c.box(x - 0.15, 0, -0.15, x + 0.15, 3.5, 0.15, 0x4a4d52, { windows: 0 })
      c.box(x - 0.6, 3.5, -0.6, x + 0.6, 4, 0.6, 0xfff1c9, LIGHT)
    }
  },
  desc: '“中华商业第一街”，百年老字号和霓虹招牌林立，2020 年步行街向东延伸，直通外滩。',
  tip: '夜里霓虹灯全亮，是拍“外滩夜色”滤镜的好地方。'
}

const peoplesSquare: LandmarkDef = {
  id: 'peoplessquare',
  name: '人民广场',
  district: 'huangpu',
  grade: 'A',
  lat: 31.2301,
  lon: 121.4707,
  rot: 0,
  rect: [-80, -40, 19, 12],
  footprint: [
    [-10, -17, 19, 12],
    [-80, -40, -48, -12]
  ],
  focusY: 8,
  photoR: 400,
  subs: [
    { id: 'shmuseum', name: '上海博物馆', x: 4.6, y: 9, z: -2.2 },
    { id: 'grandtheatre', name: '上海大剧院', x: -64, y: 9, z: -26 }
  ],
  build(c) {
    // 上海博物馆：方形基座 + 圆形顶，形似古代青铜鼎
    const [mx, mz] = c.local(31.2302, 121.47094)
    c.box(mx - 13, 0, mz - 13, mx + 13, 6, mz + 13, 0xc9b48a, { windows: 0.3 })
    c.column(mx, mz, 11, 6, 12, 0xd9c69c, { windows: 0.3 })
    // 圆顶上的四个“鼎耳”
    for (const [dx, dz] of [
      [0, -11],
      [0, 11],
      [-11, 0],
      [11, 0]
    ]) c.box(mx + dx! - 2, 12, mz + dz! - 0.6, mx + dx! + 2, 14.5, mz + dz! + 0.6, 0xc9b48a, { windows: 0, collide: false })
    c.box(mx - 12, 5.8, mz - 13.2, mx + 12, 6.2, mz - 13, WARM, LIGHT)
    // 上海大剧院：玻璃盒子上一片两端翘起的白色屋顶
    const [gx, gz] = c.local(31.23129, 121.46733)
    c.box(gx - 12, 0, gz - 10, gx + 12, 10, gz + 10, 0xe8eef2, { glass: true })
    c.box(gx - 15, 10, gz - 13, gx + 15, 11, gz + 13, 0xf4f4f2, { windows: 0, collide: false })
    for (const s of [-1, 1]) c.box(gx + s * 15 - (s > 0 ? 3 : 0), 11, gz - 13, gx + s * 15 + (s < 0 ? 3 : 0), 13, gz + 13, 0xf4f4f2, { windows: 0, collide: false })
    c.box(gx - 15, 10, gz - 13.2, gx + 15, 10.4, gz - 13, 0xbfe3ff, LIGHT)
  },
  desc: '上海的中心广场：上海博物馆、上海大剧院、人民公园都在这里，周末的“相亲角”很有名。',
  tip: '地铁 1、2、8 号线人民广场站，出站就到。'
}

export const landmarks: LandmarkDef[] = [bund, orientalPearl, shanghaiTower, yuyuan, swfc, jinmao, ljzBridge, nanjingRoad, peoplesSquare, waibaidu]

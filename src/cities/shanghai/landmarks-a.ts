// 上海景点 · 其余 A 级（docs/05 第 2 节，P5）。坐标来自 OSM（WGS-84，2026-10-31 查询）；
// 高度按建筑尺度（1 格 ≈ 2.5 米），水平按地图尺度。游戏里的主干道画得比实际宽，贴着马路的建筑按游戏里的路面往里让
import type { LandmarkContext, LandmarkDef, PartOptions } from '../../engine/city.ts'
import { chineseRoof, hall, LIGHT, TILE, WARM } from './parts.ts'

const GOLD = 0xe0a82e
const TEMPLE_RED = 0x9e2f22
const YELLOW_WALL = 0xe4c46e
const PAVE = 0x8d8a83
const NEON = [0xff3d6e, 0x37c8ff, 0xffd23a, 0x7cff6b, 0xff7a2f, 0xc77dff]
const BRICK_GREY = [0x9c978d, 0xa8a297, 0x938e85, 0xaea89c]
const FLAT = { windows: 0, collide: false } as const

/** 阶梯式双坡顶：屋脊沿 x 或 z */
function stepRoof(c: LandmarkContext, x0: number, z0: number, x1: number, z1: number, y: number, h: number, color: number, along: 'x' | 'z', n = 3) {
  for (let i = 0; i < n; i++) {
    const k = (0.5 * i) / n
    const y0 = y + (h * i) / n
    const y1 = y + (h * (i + 1)) / n
    if (along === 'x') {
      const d = (z1 - z0) * k
      c.box(x0 - 0.15, y0, z0 + d - 0.15, x1 + 0.15, y1, z1 - d + 0.15, color, FLAT)
    } else {
      const d = (x1 - x0) * k
      c.box(x0 + d - 0.15, y0, z0 - 0.15, x1 - d + 0.15, y1, z1 + 0.15, color, FLAT)
    }
  }
}

type Face = 'x+' | 'x-' | 'z+' | 'z-'

/**
 * 一排石库门：矩形沿门面方向切成约 3 格宽的单元，每个单元一扇石库门（石门框、乌漆门、门楣），
 * 青砖墙夹红砖腰线，黑瓦双坡顶。face 是门朝哪边；signs 时门边挂竖招牌（夜里亮）
 */
function shikumenRow(c: LandmarkContext, x0: number, z0: number, x1: number, z1: number, face: Face, seed: number, o: { signs?: boolean } = {}) {
  const alongX = face[0] === 'z'
  const sgn = face[1] === '+' ? 1 : -1
  const a0 = alongX ? x0 : z0
  const a1 = alongX ? x1 : z1
  const n = Math.max(1, Math.round((a1 - a0) / 3))
  const step = (a1 - a0) / n
  const front = alongX ? (sgn > 0 ? z1 : z0) : sgn > 0 ? x1 : x0
  for (let i = 0; i < n; i++) {
    const r = (seed * 7 + i * 13) % 17
    const h = 3.6 + (r % 4) * 0.45
    const b0 = a0 + i * step
    const b1 = b0 + step
    const mid = (b0 + b1) / 2
    const [ux0, uz0, ux1, uz1] = alongX ? [b0 + 0.05, z0, b1 - 0.05, z1] : [x0, b0 + 0.05, x1, b1 - 0.05]
    c.box(ux0, 0, uz0, ux1, h, uz1, BRICK_GREY[r % BRICK_GREY.length]!, { windows: 0.5 })
    // 门面上的构件：u 沿这一排（相对单元中点），d 是伸出门面的厚度
    const facePart = (u0: number, u1: number, y0: number, y1: number, d: number, color: number, opt: PartOptions = {}) => {
      const [p0, p1] = sgn > 0 ? [front, front + d] : [front - d, front]
      if (alongX) c.box(mid + u0, y0, p0, mid + u1, y1, p1, color, { ...FLAT, ...opt })
      else c.box(p0, y0, mid + u0, p1, y1, mid + u1, color, { ...FLAT, ...opt })
    }
    facePart(-step / 2 + 0.05, step / 2 - 0.05, 1.25, 1.45, 0.06, 0xa5523a)
    facePart(-step / 2 + 0.05, step / 2 - 0.05, h - 0.55, h - 0.35, 0.06, 0xa5523a)
    facePart(-0.7, 0.7, 0, 2.3, 0.12, 0xd8cfbe)
    facePart(-0.45, 0.45, 0, 2.0, 0.18, 0x1d1b19)
    facePart(-0.85, 0.85, 2.3, 2.75, 0.2, 0xcfc4ae)
    if (o.signs && r % 3 !== 0) facePart(-1.15, -0.8, 1.6, 3.0, 0.35, NEON[r % NEON.length]!, LIGHT)
    stepRoof(c, ux0, uz0, ux1, uz1, h, 1.1, 0x4a4c52, alongX ? 'x' : 'z')
  }
}

/** 敞开的门殿：台基、两排红柱、檐枋和中式屋顶；柱子排在 x = cx ± w/2 两条线上，中间能走过去 */
function gatePavilion(c: LandmarkContext, cx: number, cz: number, w: number, d: number, h: number, roof: number) {
  c.box(cx - w / 2 - 0.4, 0, cz - d / 2 - 0.4, cx + w / 2 + 0.4, 0.3, cz + d / 2 + 0.4, 0xb5ad9e, { windows: 0 })
  for (const sx of [-1, 1])
    for (const k of [-1, -1 / 3, 1 / 3, 1]) c.box(cx + (sx * w) / 2 - 0.25, 0.3, cz + (k * d) / 2 - 0.25, cx + (sx * w) / 2 + 0.25, h, cz + (k * d) / 2 + 0.25, TEMPLE_RED, { windows: 0, collide: true })
  c.box(cx - w / 2 - 0.1, h - 0.6, cz - d / 2 - 0.1, cx + w / 2 + 0.1, h, cz + d / 2 + 0.1, TEMPLE_RED, { ...FLAT, bottom: true })
  chineseRoof(c, cx, cz, w + 2.4, d + 2.4, h, 3, roof)
}

// ---------------------------------------------------------------- 衡复、静安、新天地、田子坊

const wukang: LandmarkDef = {
  id: 'wukang',
  name: '武康大楼',
  district: 'xuhui',
  grade: 'A',
  // OSM 楼的轮廓整体往西北挪了约 4.5 格：游戏里的淮海中路画得比实际宽，不挪楼就压在马路上
  lat: 31.206425,
  lon: 121.433517,
  rot: 0,
  rect: [-9, -9, 9, 8],
  focusY: 7,
  photoR: 220,
  build(c) {
    const STONE = 0xcdbf9f
    const BRICK = 0x9b4a37
    const TRIM = 0xe6dccb
    // 楼角（船头）在 T：一翼沿淮海中路往东，一翼沿武康路往北；side 是楼里那一侧
    const T = [-4.7, 5.4] as const
    const wing = (bx: number, bz: number, side: 1 | -1) => {
      const len = Math.hypot(bx - T[0], bz - T[1])
      const ux = (bx - T[0]) / len
      const uz = (bz - T[1]) / len
      const nx = -uz * side
      const nz = ux * side
      const tw = Math.atan2(uz, ux)
      const part = (u0: number, u1: number, v0: number, v1: number, y0: number, y1: number, color: number, o: PartOptions = {}) => {
        const u = (u0 + u1) / 2
        const v = (v0 + v1) / 2
        c.slab(T[0] + ux * u + nx * v, T[1] + uz * u + nz * v, u1 - u0, v1 - v0, y0, y1, color, tw, o)
      }
      return { len, part }
    }
    const W = 2.6
    for (const { len, part } of [wing(6.3, -1, -1), wing(1.9, -6.8, 1)]) {
      // 底层骑楼：临街一侧退进去一格，一排石柱
      part(0, len, 1, W, 0, 2.2, STONE, { windows: 0.6 })
      for (let u = 0.8; u < len - 0.3; u += 1.6) part(u - 0.18, u + 0.18, 0, 0.36, 0, 2.2, STONE, { windows: 0 })
      part(0, len, 0, 1, 1.9, 2.2, STONE, { ...FLAT, bottom: true })
      part(0, len, 0, W, 2.2, 3.4, STONE, { windows: 0.8 })
      part(0, len, 0, W, 3.4, 10.6, BRICK, { windows: 1 })
      // 一层层的阳台
      for (const y of [4.8, 6.8, 8.8]) part(1.2, len - 0.4, -0.3, 0.05, y, y + 0.18, TRIM, { ...FLAT, bottom: true })
      part(0, len, -0.2, W + 0.1, 10.6, 11, TRIM, FLAT)
      part(0.4, len, 0.3, W, 11, 12.4, STONE, { windows: 0.6 })
    }
    // 船头：楼角是一根圆柱
    c.column(-4.05, 4.75, 1.3, 0, 12.8, BRICK, { windows: 0.8 })
    c.column(-4.05, 4.75, 1.42, 2.2, 3.4, STONE, { windows: 0 })
    c.column(-4.05, 4.75, 1.45, 10.6, 11, TRIM, { windows: 0 })
    c.column(-4.05, 4.75, 0.9, 12.8, 13.6, STONE, { windows: 0 })
  },
  desc: '邬达克设计的法国文艺复兴风格公寓（原名诺曼底公寓），1924 年建成，船头一样的楼角正对几条马路的交汇处，是上海最出片的路口之一。',
  tip: '地铁 10、11 号线交通大学站步行可到；路口总有人等着拍照，往北就是武康路。'
}

const jingansi: LandmarkDef = {
  id: 'jingansi',
  name: '静安寺',
  district: 'jingan',
  grade: 'A',
  // OSM 寺院范围的中心；局部 x 沿中轴线指向山门（朝南偏东，对着南京西路）。前面、西侧给游戏里的南京西路、华山路让出路面
  lat: 31.22546,
  lon: 121.44058,
  rot: 1.058,
  rect: [-12.5, -9, 13.5, 5.8],
  focusY: 6,
  photoR: 260,
  build(c) {
    const Z = -1.6
    // 院墙：黄墙金顶，山门处留口
    for (const [x0, z0, x1, z1] of [
      [-12, -8.4, 12.6, -8],
      [-12, 4.8, 12.6, 5.2],
      [-12.4, -8.4, -12, 5.2],
      [12.6, -8.4, 13, -4.9],
      [12.6, 1.7, 13, 5.2]
    ] as const) {
      c.box(x0, 0, z0, x1, 2.6, z1, YELLOW_WALL, { windows: 0 })
      c.box(x0 - 0.15, 2.6, z0 - 0.15, x1 + 0.15, 2.9, z1 + 0.15, GOLD, FLAT)
    }
    // 山门是敞开的门殿，能穿过去；后面依次是天王殿、阿育王柱、大雄宝殿、法堂
    gatePavilion(c, 11, Z, 3, 6, 3.8, GOLD)
    hall(c, 5.5, Z, 3.5, 5, 4, TEMPLE_RED, 1, GOLD)
    c.column(1.5, Z, 1, 0, 0.6, 0xc9c2b2, { windows: 0 })
    c.column(1.5, Z, 0.45, 0.6, 7, 0xe8e2d4, { windows: 0 })
    c.column(1.5, Z, 0.7, 7, 7.4, GOLD, { windows: 0, collide: false })
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ] as const)
      c.box(1.5 + dx * 0.4 - 0.28, 7.4, Z + dz * 0.4 - 0.28, 1.5 + dx * 0.4 + 0.28, 8.1, Z + dz * 0.4 + 0.28, GOLD, FLAT)
    c.box(1.35, 8.1, Z - 0.15, 1.65, 8.8, Z + 0.15, GOLD, FLAT)
    hall(c, -4.5, Z, 6, 9.5, 5.5, TEMPLE_RED, 2, GOLD)
    c.box(-7.6, 4.9, Z - 4.85, -1.4, 5.1, Z + 4.85, WARM, { ...LIGHT, collide: false })
    hall(c, -10.2, Z, 2.6, 10, 6.5, TEMPLE_RED, 2, GOLD)
    // 两侧配殿
    for (const z of [-7.4, 4.2]) hall(c, 4.5, z, 9, 1, 2.8, TEMPLE_RED, 1, GOLD)
  },
  desc: '始建于三国时期的古刹，金色殿顶夹在南京西路的高楼之间，被叫作“闹市里的寺庙”；院子正中立着一根阿育王柱。',
  tip: '地铁 2、7、14 号线静安寺站出站就到；从马路对面的静安公园能拍到金顶和高楼同框。'
}

const xintiandi: LandmarkDef = {
  id: 'xintiandi',
  name: '新天地',
  district: 'huangpu',
  grade: 'A',
  // OSM 街区范围的中心；局部 x 朝东（街道方向偏 -0.2），z 朝南。北里、南里中间是兴业路
  lat: 31.22226,
  lon: 121.47038,
  rot: -0.2,
  rect: [-10.5, -21.5, 10, 39.5],
  focusY: 4,
  photoR: 200,
  build(c) {
    // 弄堂、广场的石板路和兴业路
    c.box(-1.5, 0, -21, 1.5, 0.05, 30, PAVE, FLAT)
    c.box(-10, 0, -10, 9.5, 0.05, -7, PAVE, FLAT)
    c.box(-5, 0, -7, 5, 0.05, 0, PAVE, FLAT)
    c.box(-10, 0, 6, 9.5, 0.05, 10, 0x6f6c66, FLAT)
    // 北里
    shikumenRow(c, -10, -21, -1.5, -10, 'x+', 1, { signs: true })
    shikumenRow(c, 1.5, -21, 9.5, -10, 'x-', 2, { signs: true })
    shikumenRow(c, -10, -7, -5, -0.5, 'z-', 3)
    shikumenRow(c, -10, -0.5, -5, 6, 'z+', 4)
    shikumenRow(c, 5, -7, 9.5, -0.5, 'z-', 5)
    shikumenRow(c, 5, -0.5, 9.5, 6, 'z+', 6)
    shikumenRow(c, -5, 0, -1.5, 6, 'x+', 7, { signs: true })
    shikumenRow(c, 1.5, 0, 5, 6, 'x-', 8, { signs: true })
    // 南里
    shikumenRow(c, -10, 10, -1.5, 30, 'x+', 9, { signs: true })
    shikumenRow(c, 1.5, 10, 9.5, 30, 'x-', 10, { signs: true })
    // 南头的玻璃商场
    c.box(-9, 0, 30.5, 9, 7, 39, 0x9fc3d6, { glass: true })
    c.box(-9.2, 7, 30.3, 9.2, 7.5, 39.2, 0xd8d4cc, FLAT)
    c.box(-3, 5.6, 30.3, 3, 6.3, 30.5, WARM, { ...LIGHT, collide: false })
    // 弄堂上空的串灯
    for (let z = -20; z <= 29; z += 2.5) c.box(-1.4, 3.1, z - 0.08, 1.4, 3.18, z + 0.08, WARM, { ...LIGHT, collide: false })
    // 广场上的遮阳伞
    for (const x of [-3.6, 3.6]) {
      c.box(x - 0.06, 0, -4.8 - 0.06, x + 0.06, 2.2, -4.8 + 0.06, 0xdddddd, { windows: 0 })
      c.box(x - 0.8, 2.2, -5.6, x + 0.8, 2.35, -4, 0xf2efe6, { ...FLAT, bottom: true })
      c.box(x - 0.45, 0, -5.25, x + 0.45, 0.75, -4.35, 0x5a4636, { windows: 0 })
    }
  },
  desc: '老石库门街区改造成的步行街区，青砖墙、乌漆门里开着餐厅、酒吧和咖啡馆；北里有中共一大会址。',
  tip: '地铁 10、13 号线新天地站，或 1 号线黄陂南路站；晚上弄堂里亮起串灯。'
}

const tianzifang: LandmarkDef = {
  id: 'tianzifang',
  name: '田子坊',
  district: 'huangpu',
  grade: 'A',
  // OSM 街区范围的中心；南边是泰康路，弄堂口的牌坊朝南
  lat: 31.2105,
  lon: 121.46401,
  rot: 0,
  rect: [-11.5, -6.5, 17.5, 15],
  focusY: 4,
  photoR: 180,
  build(c) {
    // 弄堂（2 格宽）和中间的小广场
    for (const [x0, z0, x1, z1] of [
      [-5, -6, -3, 14.5],
      [10, -6, 12, 14],
      [-11, 3, 17, 5],
      [1, 2, 10, 9]
    ] as const)
      c.box(x0, 0, z0, x1, 0.05, z1, PAVE, FLAT)
    shikumenRow(c, -11, -6, -5, 3, 'x+', 11, { signs: true })
    shikumenRow(c, -11, 5, -5, 14, 'x+', 12, { signs: true })
    shikumenRow(c, -3, -6, 10, 2, 'z+', 13, { signs: true })
    shikumenRow(c, -3, 5, 1, 14, 'x-', 14, { signs: true })
    shikumenRow(c, 1, 9, 10, 14, 'z-', 15, { signs: true })
    shikumenRow(c, 12, -6, 17, 3, 'x-', 16, { signs: true })
    shikumenRow(c, 12, 5, 17, 14, 'x-', 17, { signs: true })
    // 弄堂口的牌坊
    for (const x of [-5.2, -2.8]) c.box(x - 0.25, 0, 13.6, x + 0.25, 3.6, 14.1, 0x6b6560, { windows: 0 })
    c.box(-5.6, 3, 13.5, -2.4, 3.8, 14.2, 0x5a5550, { ...FLAT, bottom: true })
    c.box(-5, 3.1, 14.2, -3, 3.7, 14.3, 0xc8282a, { ...LIGHT, collide: false })
    // 弄堂上空晾衣服的竹竿
    for (const z of [-3, 0.5, 7, 11]) c.box(-5, 3.3, z - 0.04, -3, 3.36, z + 0.04, 0x8a7a5a, FLAT)
  },
  desc: '泰康路上几条老弄堂改成的创意街区，石库门和老厂房里挤满小店、画廊和咖啡馆，弄堂七拐八绕像迷宫。',
  tip: '地铁 9 号线打浦桥站；从泰康路 210 弄的弄堂口走进去。'
}

// ---------------------------------------------------------------- 浦东世博、徐家汇、龙华

const chinaart: LandmarkDef = {
  id: 'chinaart',
  name: '中华艺术宫',
  district: 'pudong',
  grade: 'A',
  // OSM 建筑轮廓（顶层的大方形）的中心和朝向
  lat: 31.186484,
  lon: 121.489926,
  rot: -0.181,
  rect: [-14.5, -15.5, 14.5, 14.5],
  focusY: 18,
  photoR: 380,
  build(c) {
    const RED = 0xb3261e
    const DARK = 0x7a1813
    // 台基和北面的大台阶
    c.box(-12, 0, -12, 12, 3, 12, 0xcfc8bb, { windows: 0.3 })
    for (let i = 0; i < 6; i++) c.box(-4, 0, -15 + 0.5 * i, 4, 0.5 * (i + 1), -12, 0xbdb6a8, { windows: 0 })
    // 四根核心筒撑起上面的“斗冠”
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) c.box(sx * 5.1 - 1.85, 3, sz * 5.1 - 1.85, sx * 5.1 + 1.85, 13, sz * 5.1 + 1.85, RED, { windows: 0, collide: true })
    // 倒金字塔：12 层，一层比一层宽，横梁纵横交替伸出（斗拱）
    for (let i = 0; i < 12; i++) {
      const y = 13 + i
      const h = 7 + (6.9 * (i + 1)) / 12
      c.box(-h + 0.6, y, -h + 0.6, h - 0.6, y + 1, h - 0.6, DARK, { ...FLAT, bottom: true })
      const n = Math.max(4, Math.round((2 * h) / 2.2))
      for (let k = 0; k < n; k++) {
        const p = -h + 0.4 + ((k + 0.5) * (2 * h - 0.8)) / n
        if (i % 2) c.box(p - 0.38, y + 0.3, -h - 0.25, p + 0.38, y + 1, h + 0.25, RED, { ...FLAT, bottom: true })
        else c.box(-h - 0.25, y + 0.3, p - 0.38, h + 0.25, y + 1, p + 0.38, RED, { ...FLAT, bottom: true })
      }
    }
    c.box(-14.2, 25, -14.2, 14.2, 25.5, 14.2, DARK, { ...FLAT, bottom: true })
    // 顶上一圈红色灯带
    for (const [x0, z0, x1, z1] of [
      [-14.3, -14.3, 14.3, -14],
      [-14.3, 14, 14.3, 14.3],
      [-14.3, -14, -14, 14],
      [14, -14, 14.3, 14]
    ] as const)
      c.box(x0, 25.5, z0, x1, 25.75, z1, 0xff5a3c, { ...LIGHT, collide: false })
  },
  desc: '2010 年世博会的中国馆，层层出挑的红色斗拱撑起“东方之冠”，现在是美术馆。',
  tip: '地铁 8 号线中华艺术宫站；夜里整座建筑透着红光，从北面的台阶能走上台基。'
}

const xjhCathedral: LandmarkDef = {
  id: 'xjhcathedral',
  name: '徐家汇天主堂',
  district: 'xuhui',
  grade: 'A',
  // OSM 建筑轮廓的中心；坐东朝西，双塔在西头
  lat: 31.19299,
  lon: 121.43154,
  rot: 0,
  rect: [-7.5, -5.5, 7.8, 4.7],
  // 西边留出门前的空地
  footprint: [[-16, -6, 7.8, 5.2]],
  focusY: 10,
  photoR: 260,
  build(c) {
    const BRICK = 0x9a4434
    const STONE = 0xc4bdb0
    const SLATE = 0x4c5157
    const GLASS = 0x7f9fd6
    const Z = -0.4
    // 中殿和圣坛、横厅、后殿
    c.box(-3.6, 0, Z - 2.9, 6.4, 8.5, Z + 2.9, BRICK, { windows: 0 })
    stepRoof(c, -3.6, Z - 2.9, 6.4, Z + 2.9, 8.5, 3.2, SLATE, 'x', 4)
    c.box(0.6, 0, Z - 4.2, 3, 8.5, Z + 4.2, BRICK, { windows: 0 })
    stepRoof(c, 0.6, Z - 4.2, 3, Z + 4.2, 8.5, 2.4, SLATE, 'z', 3)
    c.box(6.4, 0, Z - 2, 7.3, 7, Z + 2, BRICK, { windows: 0 })
    stepRoof(c, 6.4, Z - 2, 7.3, Z + 2, 7, 1.2, SLATE, 'x', 2)
    // 扶壁和尖拱窗（夜里透出彩色玻璃的光）
    for (let x = -2.6; x < 6; x += 1.6) {
      if (x > 0.2 && x < 3.4) continue
      for (const s of [-1, 1]) {
        const z0 = Z + s * 2.9
        c.box(x - 0.2, 0, Math.min(z0, z0 + s * 0.45), x + 0.2, 6.5, Math.max(z0, z0 + s * 0.45), STONE, { windows: 0 })
        c.box(x + 0.45, 2, Math.min(z0, z0 + s * 0.06), x + 1.05, 6.6, Math.max(z0, z0 + s * 0.06), GLASS, { ...LIGHT, collide: false })
      }
    }
    // 西立面：山墙、玫瑰窗、大门
    c.box(-6.8, 0, Z - 1.5, -3.6, 10, Z + 1.5, BRICK, { windows: 0 })
    c.box(-6.95, 10, Z - 1, -6.6, 11.2, Z + 1, STONE, FLAT)
    for (let dy = -0.9; dy <= 0.91; dy += 0.3) {
      const w = 2 * Math.sqrt(Math.max(0, 1 - dy * dy))
      c.box(-6.9, 7.6 + dy - 0.15, Z - w / 2, -6.8, 7.6 + dy + 0.15, Z + w / 2, 0xb48ae0, { ...LIGHT, collide: false })
    }
    c.box(-6.95, 0, Z - 0.9, -6.8, 3.6, Z + 0.9, STONE, FLAT)
    c.box(-7, 0, Z - 0.6, -6.9, 3.2, Z + 0.6, 0x3a2a22, FLAT)
    // 双塔：砖砌塔身、石砌钟楼、八角尖顶和十字架
    for (const s of [-1, 1]) {
      const tz = Z + s * 2.9
      c.box(-7, 0, tz - 1.4, -4.2, 13.5, tz + 1.4, BRICK, { windows: 0.3 })
      c.box(-7.15, 13.5, tz - 1.55, -4.05, 15.2, tz + 1.55, STONE, { windows: 0, collide: false })
      for (const dx of [-1.3, 1.3]) for (const dz of [-1.3, 1.3]) c.box(-5.6 + dx - 0.15, 15.2, tz + dz - 0.15, -5.6 + dx + 0.15, 16.6, tz + dz + 0.15, STONE, FLAT)
      for (let i = 0; i < 9; i++) c.column(-5.6, tz, 1.25 * (1 - i / 9) + 0.08, 15.2 + i, 16.2 + i, SLATE, FLAT)
      c.box(-5.66, 24.2, tz - 0.06, -5.54, 25.4, tz + 0.06, 0xe8d8a0, FLAT)
      c.box(-5.66, 24.8, tz - 0.4, -5.54, 24.95, tz + 0.4, 0xe8d8a0, FLAT)
    }
  },
  desc: '1910 年落成的哥特式教堂，两座 50 多米高的尖塔是徐家汇的地标，红砖墙身配灰色石饰，玫瑰窗夜里透着彩光。',
  tip: '地铁 1、9、11 号线徐家汇站，往南走几分钟；从漕溪北路能拍到双塔全景。'
}

const longhua: LandmarkDef = {
  id: 'longhua',
  name: '龙华寺 · 龙华塔',
  district: 'xuhui',
  grade: 'A',
  // 锚点是龙华塔（OSM）；龙华寺在塔北面，中轴线略偏西（局部 -z 朝北）
  lat: 31.17562,
  lon: 121.44733,
  rot: -0.113,
  rect: [-11, -57, 14.5, 4],
  footprint: [
    [-4, -4, 4, 4],
    [-11, -57, 14.5, -5.5]
  ],
  focusY: 8,
  photoR: 320,
  subs: [
    { id: 'longhuata', name: '龙华塔', x: 0, y: 8, z: 0 },
    { id: 'longhuasi', name: '龙华寺', x: 1.6, y: 4, z: -25 }
  ],
  build(c) {
    // 龙华塔：七层八角砖木塔，每层一圈红栏杆、一道深色挑檐，顶上塔刹
    const EAVE = 0x3e3a36
    c.column(0, 0, 3.2, 0, 0.8, 0xb5ad9e, { windows: 0 })
    for (let i = 0; i < 7; i++) {
      const y = 0.8 + i * 2.1
      const r = 2 - i * 0.12
      c.column(0, 0, r, y, y + 1.6, 0xd2b48a, { windows: 0.3 })
      c.column(0, 0, r + 0.35, y + 0.15, y + 0.3, 0x8b2a20, FLAT)
      c.column(0, 0, r + 1.1, y + 1.6, y + 1.9, EAVE, { ...FLAT, bottom: true })
      c.column(0, 0, r + 0.6, y + 1.9, y + 2.1, EAVE, FLAT)
    }
    const top = 0.8 + 7 * 2.1
    c.column(0, 0, 0.5, top, top + 0.6, EAVE, FLAT)
    c.column(0, 0, 0.18, top + 0.6, top + 3, 0xc9a24a, FLAT)
    for (let k = 0; k < 4; k++) c.column(0, 0, 0.32, top + 0.9 + k * 0.5, top + 1.05 + k * 0.5, 0xc9a24a, FLAT)
    // 龙华寺：黄墙，山门、天王殿、大雄宝殿、三圣殿、方丈室、藏经楼依次往北，东西两侧钟楼鼓楼
    const X = 1.6
    for (const [x0, z0, x1, z1] of [
      [X - 12, -6.4, X - 2, -6],
      [X + 2, -6.4, X + 12, -6],
      [X - 12, -56.4, X + 12, -56],
      [X - 12.4, -56.4, X - 12, -6],
      [X + 12, -56.4, X + 12.4, -6]
    ] as const) {
      c.box(x0, 0, z0, x1, 2.4, z1, YELLOW_WALL, { windows: 0 })
      c.box(x0 - 0.15, 2.4, z0 - 0.15, x1 + 0.15, 2.7, z1 + 0.15, TILE, FLAT)
    }
    gatePavilion(c, X, -8.5, 6, 3, 3.6, TILE)
    hall(c, X, -15, 8, 4.5, 4, TEMPLE_RED, 1)
    hall(c, X, -25, 11, 7, 5.2, TEMPLE_RED, 2)
    hall(c, X, -35, 9, 5, 4.4, TEMPLE_RED, 1)
    hall(c, X, -43, 9, 4.5, 4, TEMPLE_RED, 1)
    hall(c, X, -51, 12, 5, 7, TEMPLE_RED, 2)
    for (const dx of [-7.5, 7.5]) {
      c.box(X + dx - 1.5, 0, -21.5, X + dx + 1.5, 5, -18.5, TEMPLE_RED, { windows: 0.3 })
      chineseRoof(c, X + dx, -20, 4.4, 4.4, 2.6, 1)
      chineseRoof(c, X + dx, -20, 4.2, 4.2, 5, 3)
    }
  },
  desc: '上海最古老的寺院之一，寺前的龙华塔七层八角、高 40 米，是上海现存的古塔里最高的；春天寺外桃花盛开。',
  tip: '地铁 11、12 号线龙华站；每年除夕夜龙华寺有撞钟仪式。'
}

// ---------------------------------------------------------------- 黄浦江上的大桥、延安东路立交

const nanpuBridge: LandmarkDef = {
  id: 'nanpubridge',
  name: '南浦大桥',
  district: 'huangpu',
  grade: 'A',
  // 锚点在江心的桥面中线上（按游戏里的桥面道路），局部 x 顺着桥往浦东；桥面高 21 格。两座 H 形桥塔立在两岸
  lat: 31.207522,
  lon: 121.500912,
  rot: 0.396,
  rect: [-44, -10, 47, 10],
  footprint: [
    [-43, -10, -38, 10],
    [41, -10, 46, 10]
  ],
  pierFree: [[-39, -8, 42, 8]],
  loadR: 1100,
  focusY: 32,
  photoR: 460,
  build(c) {
    const TOWER = 0xd6d2c8
    const CABLE = 0xf0f0f0
    const DECK = 21
    const legZ = (y: number) => 8.2 - (2 * y) / 58
    for (const t of [-40.5, 43.5]) {
      for (const s of [-1, 1]) {
        c.beam(t, 0, s * legZ(0), t, 58, s * legZ(58), 2.4, 2.4, TOWER)
        c.box(t - 1.6, 0, s * 8.2 - 1.6, t + 1.6, 4, s * 8.2 + 1.6, 0xb8b2a6, { windows: 0 })
        c.box(t - 0.3, 58, s * legZ(58) - 0.3, t + 0.3, 58.6, s * legZ(58) + 0.3, 0xff3b30, { ...LIGHT, collide: false })
      }
      // 桥面下和塔顶的横梁（H 形）
      c.box(t - 1.1, DECK - 3, -7.6, t + 1.1, DECK - 1.2, 7.6, TOWER, { ...FLAT, bottom: true })
      c.box(t - 1.1, 50, -6.6, t + 1.1, 53, 6.6, TOWER, { ...FLAT, bottom: true })
      c.box(t - 1.15, 51, -6.4, t + 1.15, 51.4, 6.4, WARM, { ...LIGHT, collide: false })
      // 斜拉索：两侧各一面，向江心和岸上各 11 根，扇形
      for (const dir of [-1, 1])
        for (const s of [-1, 1])
          for (let k = 0; k < 11; k++) {
            const y = 44 + k * 1.15
            c.beam(t, y, s * legZ(y), t + dir * (6 + k * 3.4), DECK + 0.3, s * 5.8, 0.18, 0.18, CABLE)
          }
    }
  },
  desc: '1991 年通车，黄浦江上第一座大桥。两座 150 米的 H 形桥塔拉起扇形斜拉索，浦西一侧的螺旋引桥绕了好几圈才爬上桥面。',
  tip: '地铁 4 号线南浦大桥站；从老码头一带的江边能拍到桥塔和螺旋引桥。'
}

const lupuBridge: LandmarkDef = {
  id: 'lupubridge',
  name: '卢浦大桥',
  district: 'huangpu',
  grade: 'A',
  // 锚点在桥面中线上（按游戏里的桥面道路），局部 x 顺着桥往浦东。钢拱跨过江面，拱顶有观光平台
  lat: 31.191153,
  lon: 121.476413,
  rot: 1.243,
  rect: [-64, -15, 60, 15],
  footprint: [
    [-61, -13, -51, 13],
    [49, -13, 59, 13],
    [-64, 11, -60, 17]
  ],
  pierFree: [[-53, -8, 51, 8]],
  loadR: 1100,
  focusY: 30,
  photoR: 460,
  build(c) {
    const STEEL = 0xc2c8cf
    const T0 = -1
    const HALF = 55
    const TOP = 38
    const archY = (t: number) => TOP * (1 - ((t - T0) / HALF) ** 2)
    const ribZ = (t: number) => 6.4 + 3 * ((t - T0) / HALF) ** 2
    // 游戏里的桥面：江面上 7 格，两头沿引桥爬升
    const deckY = (t: number) => 7 + Math.max(0, (t - 34.6) * 0.35) + Math.max(0, (-53 - t) * 0.35)
    const N = 24
    for (const s of [-1, 1]) {
      for (let i = 0; i < N; i++) {
        const ta = T0 - HALF + (2 * HALF * i) / N
        const tb = T0 - HALF + (2 * HALF * (i + 1)) / N
        c.beam(ta, archY(ta) + 1.3, s * ribZ(ta), tb, archY(tb) + 1.3, s * ribZ(tb), 2.2, 2.6, STEEL)
        c.beam(ta, archY(ta) + 2.65, s * ribZ(ta), tb, archY(tb) + 2.65, s * ribZ(tb), 0.6, 0.12, 0xdfefff, LIGHT)
      }
      for (const t of [T0 - HALF, T0 + HALF]) c.box(t - 3, 0, s * 9.4 - 2.5, t + 3, 3, s * 9.4 + 2.5, 0xb0aaa0, { windows: 0 })
      // 吊杆（拱在桥面上方）和立柱（拱在桥面下方）
      for (let t = -48; t <= 46; t += 4) {
        const a = archY(t)
        const d = deckY(t)
        if (a > d + 2) c.beam(t, d + 0.1, s * 5.6, t, a, s * ribZ(t), 0.15, 0.15, 0xe8ecf0)
        else if (d > a + 3) c.box(t - 0.4, a + 2.6, s * ribZ(t) - 0.4, t + 0.4, d - 1.2, s * ribZ(t) + 0.4, STEEL, FLAT)
      }
    }
    // 两片拱肋之间的风撑
    for (let t = -33; t <= 31; t += 8) {
      const y = archY(t) + 1.3
      c.beam(t, y, -ribZ(t), t, y, ribZ(t), 1, 1.2, STEEL)
      if (t < 31) c.beam(t, y, -ribZ(t), t + 8, archY(t + 8) + 1.3, ribZ(t + 8), 0.7, 0.7, STEEL)
    }
    // 拱顶观光平台：四周栏杆，坐电梯上下
    const PY = TOP + 2.6
    c.box(T0 - 4, PY - 0.3, -7.6, T0 + 4, PY, 7.6, 0x9aa1a8, { ...FLAT, bottom: true })
    c.platform(T0 - 4, -7.6, T0 + 4, 7.6, PY)
    for (const [x0, z0, x1, z1] of [
      [T0 - 4, -7.6, T0 + 4, -7.3],
      [T0 - 4, 7.3, T0 + 4, 7.6],
      [T0 - 4.3, -7.6, T0 - 4, 7.6],
      [T0 + 4, -7.6, T0 + 4.3, 7.6]
    ] as const)
      c.box(x0, PY, z0, x1, PY + 1.1, z1, STEEL, { windows: 0, collide: true })
    c.box(-63, 0, 13, -61, 3, 15, STEEL, { windows: 0 })
    c.elevator(-62, 14, T0, PY, 0, '拱顶观光平台')
  },
  desc: '2003 年通车的钢拱桥，主跨 550 米，曾是世界跨度最大的拱桥。拱顶离江面约 100 米，有观光平台可以俯瞰世博园区和黄浦江。',
  tip: '浦西桥头有电梯上拱顶观光平台（按 E）；地铁 13 号线世博会博物馆站离浦西桥头最近。'
}

const yananDragon: LandmarkDef = {
  id: 'yanandragon',
  name: '延安东路立交 · 龙柱',
  district: 'huangpu',
  grade: 'A',
  // 延安高架和南北高架交汇的中心（按游戏里的高架道路）
  lat: 31.22633,
  lon: 121.464665,
  rot: 0,
  rect: [-4, -4, 4, 4],
  pierFree: [[-10, -10, 10, 10]],
  loadR: 600,
  focusY: 4,
  photoR: 120,
  build(c) {
    const STEEL = 0xd2d6db
    const DRAGON = 0xd4a73a
    c.column(0, 0, 3.3, 0, 1, 0xb5ad9e, { windows: 0 })
    c.column(0, 0, 2.3, 1, 6.4, STEEL, { windows: 0 })
    c.column(0, 0, 2.9, 6.4, 7, STEEL, { ...FLAT, bottom: true })
    // 盘龙：三条龙身沿螺旋往上盘，龙头朝上
    for (let d = 0; d < 3; d++) {
      let prev = [0, 0, 0]
      for (let k = 0; k <= 30; k++) {
        const a = (d * 2 * Math.PI) / 3 + k * 0.42
        const p = [Math.cos(a) * 2.6, 1.2 + k * 0.17, Math.sin(a) * 2.6]
        if (k) c.beam(prev[0]!, prev[1]!, prev[2]!, p[0]!, p[1]!, p[2]!, 0.7 + 0.2 * Math.sin(k * 0.6), 0.6, DRAGON)
        prev = p
      }
      c.box(prev[0]! - 0.5, prev[1]! - 0.1, prev[2]! - 0.5, prev[0]! + 0.5, prev[1]! + 0.6, prev[2]! + 0.5, DRAGON, FLAT)
    }
  },
  desc: '延安高架和南北高架在这里多层交汇，桥下正中一根粗柱撑着整座立交，柱身包着不锈钢、盘着金色龙纹，上海人叫它“龙柱”。',
  tip: '站在延安东路重庆中路路口往上看，一层层桥面从龙柱顶上分出去。'
}

// ---------------------------------------------------------------- 青浦

const zhujiajiao: LandmarkDef = {
  id: 'zhujiajiao',
  name: '朱家角 · 放生桥',
  district: 'qingpu',
  grade: 'A',
  // 锚点是放生桥（OSM），局部 x 顺着桥跨过漕港河，z 顺着河。远郊的地图压缩过，河道比实际窄，景点按原尺度
  lat: 31.11358,
  lon: 121.05145,
  rot: 1.18,
  rect: [-9.5, -17, 9.5, 17],
  focusY: 3,
  photoR: 200,
  build(c) {
    const STONE = 0xc2bcae
    const WALL = 0xf0ede4
    const WOOD = 0x6b4a32
    // 放生桥：五孔石拱，两头台阶，中间拱起；两侧石栏
    const L = 9
    for (let k = 0; k < 9; k++) {
      const x = L - 0.9 * k
      const y = 0.3 * (k + 1)
      c.box(-x, 0, -1.5, x, y, 1.5, STONE, { windows: 0 })
      for (const s of [-1, 1]) c.box(-x, y, s > 0 ? 1.5 : -1.75, x, y + 0.6, s > 0 ? 1.75 : -1.5, 0x8f8a80, { windows: 0, collide: true })
    }
    // 两侧的桥洞
    for (const [a, r] of [
      [-6, 0.8],
      [-3, 1.1],
      [0, 1.3],
      [3, 1.1],
      [6, 0.8]
    ] as const)
      for (let dy = 0; dy < r; dy += 0.25) {
        const w = 2 * Math.sqrt(r * r - dy * dy)
        for (const s of [-1, 1]) c.box(a - w / 2, dy, s > 0 ? 1.5 : -1.56, a + w / 2, dy + 0.25, s > 0 ? 1.56 : -1.5, 0x1e2b2b, FLAT)
      }
    // 两岸枕河的老房子：白墙黛瓦，临河一面是木板墙，檐下挂红灯笼
    for (const sx of [-1, 1])
      for (const [z0, z1] of [
        [-16, -2.5],
        [2.5, 16]
      ] as const) {
        const n = Math.round((z1 - z0) / 3)
        for (let i = 0; i < n; i++) {
          const a = z0 + ((z1 - z0) * i) / n + 0.05
          const b = z0 + ((z1 - z0) * (i + 1)) / n - 0.05
          const h = 3.4 + ((i * 5 + (sx > 0 ? 2 : 0)) % 3) * 0.5
          const [x0, x1] = sx > 0 ? [3.6, 7] : [-7, -3.6]
          c.box(x0, 0, a, x1, h, b, WALL, { windows: 0.4 })
          const fx = sx > 0 ? x0 : x1
          c.box(Math.min(fx, fx - sx * 0.08), 0, a, Math.max(fx, fx - sx * 0.08), 1.6, b, WOOD, FLAT)
          stepRoof(c, x0, a, x1, b, h, 1.2, 0x3a3b40, 'z')
          const lx = fx - sx * 0.4
          c.box(lx - 0.15, h - 0.75, (a + b) / 2 - 0.15, lx + 0.15, h - 0.35, (a + b) / 2 + 0.15, 0xff4a3a, { ...LIGHT, collide: false })
        }
      }
    // 河里的手摇船
    for (const [x, z] of [
      [0.3, -8],
      [-0.4, 10]
    ] as const) {
      c.box(x - 0.6, 0, z - 1.8, x + 0.6, 0.45, z + 1.8, WOOD, FLAT)
      c.box(x - 0.65, 1.05, z - 0.9, x + 0.65, 1.2, z + 0.9, 0x2f2a25, { ...FLAT, bottom: true })
      for (const dz of [-0.85, 0.85]) for (const dx of [-0.55, 0.55]) c.box(x + dx - 0.04, 0.45, z + dz - 0.04, x + dx + 0.04, 1.05, z + dz + 0.04, WOOD, FLAT)
    }
  },
  desc: '江南水乡古镇，横跨漕港河的放生桥是上海现存最长的五孔石拱桥，两岸白墙黛瓦的老房子枕河而居。',
  tip: '地铁 17 号线朱家角站，往南走进古镇；站在桥顶能看到河两岸。'
}

export const aLandmarks: LandmarkDef[] = [wukang, jingansi, xintiandi, tianzifang, chinaart, xjhCathedral, longhua, nanpuBridge, lupuBridge, yananDragon, zhujiajiao]

// 上海景点 · B 级（docs/05 第 2 节，P6）：区域氛围，几块有辨识度的构件 + 周边环境。坐标来自 OSM（WGS-84，2026-10-31 查询）
import type { LandmarkContext, LandmarkDef } from '../../engine/city.ts'
import { chineseRoof, FLAT, LIGHT, lawn, NEON, PAVE, pond, statue, stepRoof, tree, WARM } from './parts.ts'

const CONCRETE = 0xc9c3b6
const BRICK = 0x9a4b38
const CABLE = 0xf0f0f0

/** 白墙黛瓦的江南房子（马头墙两头高出屋顶） */
function jiangnanHouse(c: LandmarkContext, x0: number, z0: number, x1: number, z1: number, h: number) {
  c.box(x0, 0, z0, x1, h, z1, 0xf0ede4, { windows: 0.4 })
  stepRoof(c, x0, z0, x1, z1, h, 1.4, 0x3a3b40, 'x')
  for (const x of [x0, x1 - 0.3]) c.box(x, h, z0 - 0.1, x + 0.3, h + 1.8, z1 + 0.1, 0xf0ede4, { windows: 0, collide: false, top: 0x3a3b40 })
}

// ---------------------------------------------------------------- 杨浦、虹口

const yangpuBridge: LandmarkDef = {
  id: 'yangpubridge',
  name: '杨浦大桥',
  district: 'yangpu',
  grade: 'B',
  // 锚点在江心的桥面中线上（游戏里的内环高架，桥面 7 格），局部 x 顺着桥往浦东；钻石形桥塔立在两岸
  lat: 31.25721,
  lon: 121.54131,
  rot: 0.74,
  rect: [-58, -12, 68, 12],
  footprint: [
    [-58, -12, -52, 12],
    [62, -12, 68, 12]
  ],
  pierFree: [[-52, -9, 62, 9]],
  loadR: 1300,
  focusY: 40,
  photoR: 520,
  build(c) {
    const TOWER = 0xd9d4ca
    const DECK = 7
    for (const t of [-55, 65]) {
      for (const s of [-1, 1]) {
        // 桥面下往外撇，桥面上往里收，到顶并成一根
        c.beam(t, 0, s * 4.5, t, DECK - 1.2, s * 9.5, 2.4, 2.4, TOWER)
        c.beam(t, DECK - 1.2, s * 9.5, t, 62, s * 1.3, 2.2, 2.2, TOWER)
        c.box(t - 1.6, 0, s * 4.5 - 1.6, t + 1.6, 3, s * 4.5 + 1.6, 0xb8b2a6, { windows: 0 })
      }
      c.box(t - 1.1, DECK - 2.6, -9.8, t + 1.1, DECK - 1.2, 9.8, TOWER, { ...FLAT, bottom: true })
      c.box(t - 1.3, 61, -1.5, t + 1.3, 83, 1.5, TOWER, { windows: 0, collide: false })
      c.box(t - 0.3, 83, -0.3, t + 0.3, 83.6, 0.3, 0xff3b30, { ...LIGHT, collide: false })
      for (const dir of [-1, 1])
        for (const s of [-1, 1])
          for (let k = 0; k < 14; k++) c.beam(t, 60 + k * 1.6, s * 1.2, t + dir * (6 + k * 3.7), DECK + 0.3, s * 7.4, 0.18, 0.18, CABLE)
    }
  },
  desc: '1993 年通车的斜拉桥，主跨 602 米，两座钻石形桥塔高 200 多米，内环线从这里跨过黄浦江。',
  tip: '从杨浦滨江沿江往东走，桥塔越来越近。'
}

const yangpuRiverside: LandmarkDef = {
  id: 'yangpuriverside',
  name: '杨浦滨江',
  district: 'yangpu',
  grade: 'B',
  // 锚点在江边，局部 x 顺着岸线往东北，+z 朝江（江岸在 z ≈ 7）
  lat: 31.255315,
  lon: 121.533056,
  rot: -0.49,
  rect: [-26, -18, 26, 8],
  focusY: 8,
  photoR: 300,
  build(c) {
    // 沿江步道和栏杆
    c.box(-26, 0, 1, 26, 0.05, 6.6, 0xb9a98e, FLAT)
    c.box(-26, 0, 6.6, 26, 1, 6.9, 0x5a5d62, { windows: 0 })
    for (let x = -24; x <= 24; x += 8) c.box(x - 0.12, 0, 0.6, x + 0.12, 3.6, 0.84, 0x4a4d52, { windows: 0 })
    // 老码头的门式吊车：四条腿骑在轨道上，吊臂伸向江面
    for (const x of [-16, 0, 15]) {
      for (const dx of [-1.4, 1.4]) for (const z of [2, 6]) c.box(x + dx - 0.25, 0, z - 0.25, x + dx + 0.25, 7, z + 0.25, 0x2f6b8a, { windows: 0 })
      c.box(x - 2, 7, 1.5, x + 2, 8.6, 6.5, 0x2f6b8a, { windows: 0, collide: false, bottom: true })
      c.box(x - 1.2, 8.6, 2.5, x + 1.2, 10.6, 5, 0xe8c547, { windows: 0.3, collide: false })
      c.beam(x, 10, 4, x, 13.5, 16, 0.6, 0.8, 0x2f6b8a)
      c.beam(x, 14, 3, x, 13.5, 16, 0.15, 0.15, 0x333333)
    }
    for (const z of [2, 6]) c.box(-26, 0.05, z - 0.1, 26, 0.15, z + 0.1, 0x6e6a64, FLAT)
    // 红砖锯齿屋顶的老厂房和一根大烟囱
    for (let i = 0; i < 4; i++) {
      const x0 = -22 + i * 6
      c.box(x0, 0, -14, x0 + 5.8, 4, -4, BRICK, { windows: 0.6 })
      c.box(x0, 4, -14, x0 + 2.9, 5.4, -4, 0x8a8580, { windows: 0, collide: false })
      c.box(x0 + 0.1, 4, -14, x0 + 0.4, 5.4, -4, 0xbfd6e6, { windows: 0, collide: false })
    }
    c.box(4, 0, -14, 20, 5, -5, 0x8f8a80, { windows: 0.8 })
    c.column(10, -16, 1.4, 0, 22, BRICK, { windows: 0 })
    c.column(10, -16, 1.6, 21, 22.5, 0x5a3a2a, { windows: 0, collide: false })
  },
  desc: '杨浦滨江曾是上海最大的工业区，老码头的吊车、厂房和烟囱保留下来，串成了沿江的步道和公园。',
  tip: '往东能看到杨浦大桥；沿江步道一直连到北外滩。'
}

const laochangfang: LandmarkDef = {
  id: 'laochangfang',
  name: '1933 老场坊',
  district: 'hongkou',
  grade: 'B',
  // OSM 建筑轮廓（外方内圆）的中心和朝向
  lat: 31.25652,
  lon: 121.48771,
  rot: -0.662,
  rect: [-8.5, -8.5, 8.5, 8.5],
  focusY: 5,
  photoR: 200,
  build(c) {
    const H = 8
    // 外圈方楼：四面墙，留一个入口
    for (const [x0, z0, x1, z1] of [
      [-8, -8, 8, -6.6],
      [-8, 6.6, -1.5, 8],
      [1.5, 6.6, 8, 8],
      [-8, -6.6, -6.6, 6.6],
      [6.6, -6.6, 8, 6.6]
    ] as const)
      c.box(x0, 0, z0, x1, H, z1, CONCRETE, { windows: 0.7 })
    c.box(-1.5, 2.6, 6.6, 1.5, H, 8, CONCRETE, { windows: 0.7, collide: false, bottom: true })
    // 中间的圆楼和一圈圈廊桥
    c.column(0, 0, 3.6, 0, H + 1, 0xd2ccc0, { windows: 0.6 })
    for (const y of [2.6, 4.6, 6.6])
      for (const [dx, dz] of [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1]
      ] as const)
        c.slab(dx * 4.9, dz * 4.9, 3.4, 1.1, y - 0.3, y, CONCRETE, Math.atan2(dz, dx), { windows: 0, collide: false, bottom: true })
  },
  desc: '1933 年建成的工部局宰牲场，外方内圆的混凝土建筑，里面廊桥、坡道交错像迷宫，现在是创意园区。',
  tip: '在沙泾路 10 号，沙泾港边上。'
}

const duolun: LandmarkDef = {
  id: 'duolun',
  name: '多伦路文化名人街',
  district: 'hongkou',
  grade: 'B',
  // 锚点是鸿德堂（OSM）；教堂往南挪了一点，给北边的 Citywalk 步道让路
  lat: 31.26385,
  lon: 121.47796,
  rot: 0,
  rect: [-6, -8, 26, 6],
  focusY: 4,
  photoR: 180,
  build(c) {
    // 鸿德堂：青砖墙、中式重檐屋顶，门前一座钟楼
    c.box(-2.5, 0, 0.5, 2.5, 4, 4.5, 0x7d7a74, { windows: 0.5 })
    chineseRoof(c, 0, 2.5, 6.2, 5, 4, 2)
    chineseRoof(c, 0, 2.5, 4.4, 3.2, 5.2, 3)
    c.box(-1, 0, 0.3, 1, 7, 1.7, 0x7d7a74, { windows: 0.3 })
    chineseRoof(c, 0, 1, 3, 2.4, 7, 3)
    c.box(-0.08, 9, 0.92, 0.08, 10.2, 1.08, 0xe8d8a0, FLAT)
    c.box(-0.45, 9.6, 0.92, 0.45, 9.75, 1.08, 0xe8d8a0, FLAT)
    // 路边坐着的文化名人铜像
    for (const x of [4, 11]) statue(c, x, -6.6, 0x6b5a3a, 0.5, true)
    // 南口的牌坊，跨在步道上
    for (const z of [-5.2, -0.2]) c.box(21.7, 0, z - 0.3, 22.3, 4.2, z + 0.3, 0x6b6560, { windows: 0 })
    c.box(21.5, 3.6, -5.6, 22.5, 4.6, 0.2, 0x5a5550, { ...FLAT, bottom: true })
    c.box(22.5, 3.8, -4.4, 22.6, 4.4, -1, 0xc8282a, { ...LIGHT, collide: false })
    chineseRoof(c, 22, -2.7, 2, 6.4, 4.6, 2)
  },
  desc: '一条弯弯的小马路，三十年代鲁迅、茅盾、郭沫若等文化名人在这一带住过；路口的鸿德堂是一座中式屋顶的教堂。',
  tip: 'Citywalk“多伦路—鲁迅公园”从南口的牌坊出发。'
}

const luxunPark: LandmarkDef = {
  id: 'luxunpark',
  name: '鲁迅公园',
  district: 'hongkou',
  grade: 'B',
  // 锚点是鲁迅纪念馆（OSM）；鲁迅墓在公园里，纪念馆西北
  lat: 31.27168,
  lon: 121.47932,
  rot: 0,
  rect: [-18, -30, 8, 6],
  focusY: 3,
  photoR: 180,
  build(c) {
    // 纪念馆：白墙黛瓦、马头墙的两层江南房子
    jiangnanHouse(c, -7, -5, 3, 3, 4.2)
    c.box(-3, 0, 3, 1, 2.4, 3.2, 0x3a2a22, FLAT)
    // 鲁迅墓：石台、花岗岩墓碑墙、坐像
    c.box(-16, 0, -28, -4, 0.5, -20, 0xb5ad9e, { windows: 0 })
    c.box(-14, 0.5, -28, -6, 3.2, -27, 0x8a8580, { windows: 0 })
    c.box(-11, 1.4, -27.05, -9, 2.6, -27, 0xd8c7a0, FLAT)
    statue(c, -10, -23, 0x6b5a3a, 1.2, true)
    for (const [x, z] of [
      [-17, -18],
      [-3, -18],
      [-17, -26],
      [-2.5, -26],
      [5, -10],
      [-12, -8]
    ] as const)
      tree(c, x, z, 5)
  },
  desc: '原名虹口公园，园里有鲁迅墓和鲁迅纪念馆；早上很多人在这里打太极、唱歌、跳舞。',
  tip: 'Citywalk“多伦路—鲁迅公园”的终点；地铁 3、8 号线虹口足球场站就在旁边。'
}

const northBund: LandmarkDef = {
  id: 'northbund',
  name: '北外滩 · 白玉兰广场',
  district: 'hongkou',
  grade: 'B',
  // 锚点是白玉兰广场主塔（OSM，320 米）
  lat: 31.25127,
  lon: 121.49362,
  rot: 0,
  rect: [-24, -20, 22, 20],
  loadR: 2200,
  focusY: 60,
  photoR: 1200,
  build(c) {
    const GLASS = 0x8fb3cf
    // 裙楼商场
    c.box(-22, 0, -16, 20, 5, 16, 0xd8d2c6, { windows: 0.5 })
    c.box(-22.2, 4.6, -16.2, 20.2, 5, 16.2, WARM, { ...LIGHT, collide: false })
    // 主塔：切角方塔，上部收两次，顶上一圈灯和避雷针
    c.slab(0, 0, 11, 11, 5, 112, GLASS, 0, { glass: true })
    c.slab(0, 0, 11, 11, 5, 112, GLASS, Math.PI / 4, { glass: true })
    c.slab(0, 0, 9, 9, 112, 121, GLASS, 0, { glass: true })
    c.slab(0, 0, 7, 7, 121, 126, 0xe8eef2, Math.PI / 4, { windows: 0 })
    c.box(-3.6, 124, -3.6, 3.6, 124.6, 3.6, 0xe8f4ff, { ...LIGHT, collide: false })
    c.box(-0.2, 126, -0.2, 0.2, 134, 0.2, 0xdddddd, FLAT)
    // 旁边的酒店塔楼
    c.slab(-14, -6, 9, 7, 5, 69, 0x9fb6c4, 0.3, { glass: true })
    c.slab(-14, -6, 9.2, 7.2, 69, 70, 0xe8f4ff, 0.3, LIGHT)
  },
  desc: '北外滩的新地标白玉兰广场，主塔高 320 米，是浦西最高的楼；楼下就是北外滩滨江，隔江正对陆家嘴。',
  tip: '从外白渡桥沿江往东走十几分钟。'
}

// ---------------------------------------------------------------- 苏州河、静安、普陀

const suzhouCreek: LandmarkDef = {
  id: 'suzhoucreek',
  name: '苏州河步道 · 四行仓库',
  district: 'jingan',
  grade: 'B',
  // 锚点是四行仓库（OSM），局部 x 顺着苏州河，+z 朝河（河岸在 z ≈ 8）
  lat: 31.2423,
  lon: 121.46654,
  rot: -0.42,
  rect: [-14, -6, 22, 8.5],
  focusY: 5,
  photoR: 220,
  build(c) {
    // 六层的钢筋混凝土仓库，西墙保留着炮弹孔
    c.box(-9.4, 0, -5.3, 9.4, 9.6, 5.3, 0xb7b0a2, { windows: 0.8 })
    c.box(-9.6, 9.6, -5.5, 9.6, 10.1, 5.5, 0x8f8a80, FLAT)
    for (let i = 0; i < 18; i++) {
      const y = 1.5 + ((i * 7) % 8)
      const z = -4.4 + ((i * 5) % 9)
      c.box(-9.48, y, z, -9.4, y + 0.5 + (i % 3) * 0.2, z + 0.45 + (i % 2) * 0.3, 0x3a3632, FLAT)
    }
    // 沿河步道：铺地、栏杆、路灯和长椅
    c.box(-14, 0, 5.8, 22, 0.05, 7.9, 0xb9a98e, FLAT)
    c.box(-14, 0, 7.9, 22, 1, 8.2, 0x5a5d62, { windows: 0 })
    for (let x = -12; x <= 20; x += 8) {
      c.box(x - 0.12, 0, 6, x + 0.12, 3.4, 6.24, 0x4a4d52, { windows: 0 })
      c.box(x - 0.4, 3.4, 5.9, x + 0.4, 3.7, 6.5, 0xfff1c9, LIGHT)
      c.box(x + 2, 0, 6.6, x + 4, 0.6, 7.2, 0x8a6a4a, { windows: 0 })
    }
  },
  desc: '1937 年“八百壮士”在这里守了四天四夜，西墙上的弹孔保留至今；仓库前的苏州河两岸修成了连续的滨河步道。',
  tip: '地铁 8、12 号线曲阜路站；沿河往东一直能走到外白渡桥。'
}

const m50: LandmarkDef = {
  id: 'm50',
  name: 'M50 创意园',
  district: 'putuo',
  grade: 'B',
  // OSM 园区范围的中心，东南边是苏州河
  lat: 31.25005,
  lon: 121.44475,
  rot: -0.5,
  rect: [-16, -14, 16, 12],
  focusY: 5,
  photoR: 200,
  build(c) {
    // 老纺织厂：红砖、灰砖厂房，锯齿形屋顶
    for (const [x0, z0, x1, z1, h, col] of [
      [-15, -12, -3, -3, 6, BRICK],
      [-1, -12, 14, -4, 7.5, 0x8f8a80],
      [-15, 0, 0, 8, 5, 0x8f8a80],
      [3, -1, 14, 8, 6.5, BRICK]
    ] as const) {
      c.box(x0, 0, z0, x1, h, z1, col, { windows: 0.8 })
      for (let x = x0; x + 2 <= x1; x += 2) c.box(x, h, z0, x + 1, h + 1.2, z1, 0x6e6a64, { windows: 0, collide: false })
    }
    c.column(1, -14.5, 1, 0, 16, BRICK, { windows: 0 })
    // 莫干山路一侧的涂鸦墙
    for (let i = 0; i < 16; i++) c.box(-16 + i * 2, 0, 10.6, -14 + i * 2, 2.6, 11, NEON[(i * 5) % NEON.length]!, { windows: 0 })
  },
  desc: '苏州河边的老纺织厂改成的艺术园区，几十家画廊和工作室挤在老厂房里，莫干山路上有一长段涂鸦墙。',
  tip: '离上海火车站不远，沿苏州河往西走。'
}

const shRailway: LandmarkDef = {
  id: 'shrailway',
  name: '上海火车站',
  district: 'jingan',
  grade: 'B',
  // OSM 站房轮廓的中心；站房朝南，北边是一排排站台雨棚
  lat: 31.25135,
  lon: 121.451,
  rot: 0,
  rect: [-30, -44, 30, 22],
  focusY: 8,
  photoR: 320,
  build(c) {
    // 南广场
    c.box(-28, 0, 9, 28, 0.05, 21, PAVE, FLAT)
    // 站房：中间大厅（正面一排玻璃），两翼，屋顶上“上海站”的红字招牌
    c.box(-22, 0, -12, 22, 9, 8, 0xd8d2c6, { windows: 0.7 })
    c.box(-14, 1.5, 8, 14, 8, 8.2, 0x9fc3d6, { glass: true, collide: false })
    for (const s of [-1, 1]) c.box(s > 0 ? 22 : -29, 0, -10, s > 0 ? 29 : -22, 6.5, 6, 0xcfc8bb, { windows: 0.8 })
    c.box(-8, 9, 7, 8, 11, 7.6, 0xc8282a, { ...LIGHT, collide: false })
    // 站台雨棚
    for (let k = 0; k < 6; k++) {
      const z = -16 - k * 4.5
      c.box(-24, 3.2, z - 1.6, 24, 3.6, z + 1.6, 0x8a8f96, { ...FLAT, bottom: true })
      for (let x = -20; x <= 20; x += 10) c.box(x - 0.15, 0, z - 0.15, x + 0.15, 3.2, z + 0.15, 0x5a5d62, { windows: 0 })
    }
  },
  desc: '1987 年启用的上海站，当年叫“新客站”。很多人到上海的第一站就是这里的南广场。',
  tip: '地铁 1、3、4 号线上海火车站站。'
}

// ---------------------------------------------------------------- 公园

const fuxingPark: LandmarkDef = {
  id: 'fuxingpark',
  name: '复兴公园',
  district: 'huangpu',
  grade: 'B',
  lat: 31.21911,
  lon: 121.46452,
  rot: 0,
  rect: [-18, -14, 18, 14],
  focusY: 3,
  photoR: 160,
  build(c) {
    // 法式下沉花坛：一圈石沿，里面几何形的花床
    c.box(-10, 0, -6, 10, 0.5, -5.6, 0xb5ad9e, { windows: 0 })
    c.box(-10, 0, 5.6, 10, 0.5, 6, 0xb5ad9e, { windows: 0 })
    for (const [x, z, col] of [
      [-6, -3, 0xd8456a],
      [6, -3, 0xf2c46b],
      [-6, 3, 0xf2c46b],
      [6, 3, 0xd8456a]
    ] as const)
      c.box(x - 3, 0, z - 1.6, x + 3, 0.3, z + 1.6, col, FLAT)
    // 喷泉
    c.column(0, 0, 2.2, 0, 0.6, 0xb5ad9e, { windows: 0 })
    c.column(0, 0, 1.8, 0.6, 0.65, 0x6fb7d6, FLAT)
    c.column(0, 0, 0.3, 0.6, 2.2, 0xdfefff, FLAT)
    // 马克思、恩格斯像
    statue(c, -1, -10, 0xa8a49c, 1.6)
    statue(c, 1, -10, 0xa8a49c, 1.6)
    for (let x = -16; x <= 16; x += 4) for (const z of [-13, 12]) tree(c, x, z, 6)
  },
  desc: '1909 年开放的法式园林，规整的花坛、喷泉和高大的梧桐还是老法国公园的样子；园里有马克思、恩格斯像。',
  tip: '离新天地、田子坊都不远。'
}

const zhongshanPark: LandmarkDef = {
  id: 'zhongshanpark',
  name: '中山公园',
  district: 'changning',
  grade: 'B',
  lat: 31.22351,
  lon: 121.41395,
  rot: 0,
  rect: [-20, -16, 20, 16],
  focusY: 3,
  photoR: 160,
  build(c) {
    // 大草坪、白色音乐亭、湖和石拱桥
    lawn(c, -16, -12, 4, 6)
    c.column(-6, -3, 2.6, 0, 0.4, 0xe8e2d4, { windows: 0 })
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4
      c.box(-6 + Math.cos(a) * 2.2 - 0.12, 0.4, -3 + Math.sin(a) * 2.2 - 0.12, -6 + Math.cos(a) * 2.2 + 0.12, 3.2, -3 + Math.sin(a) * 2.2 + 0.12, 0xf4f1ea, { windows: 0 })
    }
    c.column(-6, -3, 2.8, 3.2, 3.6, 0xf4f1ea, { ...FLAT, bottom: true })
    c.column(-6, -3, 1.6, 3.6, 4.4, 0x5d8a6a, FLAT)
    pond(c, 7, -10, 17, 4)
    for (let k = 0; k < 5; k++) c.box(11 - 1.4 + k * 0.35, 0, -3.6 - k * 0.6 + 0.6, 13 + 1.4 - k * 0.35, 0.3 * (k + 1), -2.4 + k * 0.6 - 0.6, 0xc2bcae, { windows: 0 })
    for (const [x, z] of [
      [-18, -14],
      [-10, -14],
      [-2, -14],
      [-18, 10],
      [-8, 12],
      [2, 12],
      [10, 10],
      [18, 8]
    ] as const)
      tree(c, x, z, 6.5)
  },
  desc: '原名兆丰公园，有百年历史的英式园林，大草坪、老树和湖面是长宁区的“绿肺”。',
  tip: '地铁 2、3、4 号线中山公园站。'
}

const shZoo: LandmarkDef = {
  id: 'shzoo',
  name: '上海动物园',
  district: 'changning',
  grade: 'B',
  // OSM 动物园范围的中心；园子很大，这里只建中间一片
  lat: 31.19439,
  lon: 121.35961,
  rot: 0,
  rect: [-34, -34, 34, 34],
  focusY: 3,
  photoR: 160,
  build(c) {
    // 北边是动物园里的湖，草坪从湖南边铺起
    lawn(c, -34, -18, 34, 34, 0x8cbf6e)
    // 长颈鹿
    for (const [x, z] of [
      [-18, -8],
      [-14, -11]
    ] as const) {
      for (const dx of [-0.4, 0.4]) for (const dz of [-0.8, 0.8]) c.box(x + dx - 0.15, 0, z + dz - 0.15, x + dx + 0.15, 2, z + dz + 0.15, 0xd9a440, { windows: 0 })
      c.box(x - 0.6, 2, z - 1.1, x + 0.6, 3, z + 1.1, 0xd9a440, { windows: 0 })
      c.box(x - 0.25, 3, z - 1.1, x + 0.25, 6, z - 0.6, 0xd9a440, { windows: 0, collide: false })
      c.box(x - 0.3, 6, z - 1.6, x + 0.3, 6.6, z - 0.5, 0xd9a440, { windows: 0, collide: false })
    }
    // 大象
    c.box(10, 0, -10, 14, 1.4, -7, 0x8a8a8a, { windows: 0 })
    c.box(9.5, 1.4, -10.5, 14.5, 3.6, -6.5, 0x8a8a8a, { windows: 0 })
    c.box(8.6, 2, -9.2, 9.5, 3.4, -7.8, 0x8a8a8a, { windows: 0, collide: false })
    c.box(8.6, 0.4, -8.8, 9, 2, -8.2, 0x8a8a8a, { windows: 0, collide: false })
    // 大熊猫
    c.box(-4, 0, 14, -2, 1.2, 15.4, 0xf4f4f0, { windows: 0, top: 0xf4f4f0 })
    c.box(-4.2, 0, 13.8, -3.6, 0.6, 15.6, 0x222222, { windows: 0 })
    c.box(-1.8, 0.6, 14.2, -0.8, 1.6, 15.2, 0xf4f4f0, { windows: 0 })
    c.box(-1.7, 1.3, 14.1, -1.4, 1.7, 14.4, 0x222222, FLAT)
    c.box(-1.7, 1.3, 15, -1.4, 1.7, 15.3, 0x222222, FLAT)
    // 火烈鸟池
    pond(c, 12, 8, 22, 16)
    for (let i = 0; i < 6; i++) {
      const x = 13.5 + (i % 3) * 3
      const z = 10 + Math.floor(i / 3) * 3
      c.box(x - 0.05, 0.06, z - 0.05, x + 0.05, 1, z + 0.05, 0xf08aa0, FLAT)
      c.box(x - 0.3, 1, z - 0.15, x + 0.3, 1.4, z + 0.15, 0xf08aa0, FLAT)
    }
    // 围栏和树
    for (const [x0, z0, x1, z1] of [
      [-24, -15, -8, -14.8],
      [4, -15, 20, -14.8],
      [-10, 10, 4, 10.2]
    ] as const)
      c.box(x0, 0, z0, x1, 1, z1, 0x6b4a32, { windows: 0 })
    for (let i = 0; i < 14; i++) tree(c, -30 + ((i * 13) % 60), -16 + ((i * 29) % 46), 6)
  },
  desc: '上海最大的动物园，原来是高尔夫球场，大草坪和树林里住着大熊猫、长颈鹿、大象等几百种动物。',
  tip: '地铁 10 号线上海动物园站。'
}

const gongqingPark: LandmarkDef = {
  id: 'gongqing',
  name: '共青森林公园',
  district: 'yangpu',
  grade: 'B',
  lat: 31.3208,
  lon: 121.54736,
  rot: 0,
  rect: [-20, -20, 20, 20],
  focusY: 4,
  photoR: 160,
  build(c) {
    // 水杉林、小湖、木头码头和划船
    for (let i = 0; i < 30; i++) tree(c, -18 + ((i * 7) % 36), -18 + ((i * 11) % 14), 9 + (i % 3), 0x2f5f3a, true)
    pond(c, -6, 2, 12, 14)
    c.box(-2, 0, 1, 2, 0.4, 6, 0x8a6a4a, { windows: 0 })
    for (const [x, z] of [
      [2, 8],
      [6, 10]
    ] as const)
      c.box(x - 0.7, 0.06, z - 1.4, x + 0.7, 0.5, z + 1.4, [0xd8452f, 0x2f7fd8][x > 3 ? 1 : 0]!, FLAT)
    // 原木小屋
    c.box(-16, 0, 4, -10, 3, 9, 0x8a5a3a, { windows: 0.4 })
    stepRoof(c, -16, 4, -10, 9, 3, 1.6, 0x5a3a2a, 'x')
  },
  desc: '黄浦江边的森林公园，成片的水杉林、草坪和小河，是市区里能“进森林”的地方。',
  tip: '在杨浦区北边的军工路上。'
}

// ---------------------------------------------------------------- 浦东、徐汇滨江

const westBund: LandmarkDef = {
  id: 'westbund',
  name: '西岸 · 油罐艺术公园',
  district: 'xuhui',
  grade: 'B',
  // 锚点是油罐艺术中心的主楼（OSM），五个油罐按 OSM 位置
  lat: 31.16681,
  lon: 121.45942,
  rot: 0,
  rect: [-18, -14, 16, 18],
  focusY: 4,
  photoR: 200,
  build(c) {
    lawn(c, -18, -14, 16, 18)
    for (const [x, z, r] of [
      [10.5, 7.7, 2.8],
      [8.8, -2.1, 2.8],
      [-13.5, -8.9, 2.3],
      [-3.5, -1.5, 2.3],
      [-1.8, 11.1, 2.6]
    ] as const) {
      c.column(x, z, r, 0, 5, 0xd8d4cc, { windows: 0 })
      c.column(x, z, r + 0.05, 2.3, 2.6, 0x8a8f96, FLAT)
      c.column(x, z, r * 0.9, 5, 5.5, 0x7fb069, FLAT)
    }
    // 主楼：长条的白色展厅，屋顶是草坡
    for (let i = 0; i < 4; i++) c.box(-14 + i * 0.6, 0, 2 + i * 0.3, 2 - i * 0.6, 1.6 + i * 0.8, 6 - i * 0.3, i ? 0x7fb069 : 0xe8e2d4, { windows: i ? 0 : 0.6 })
  },
  desc: '徐汇滨江原来是机场和码头的储油区，五个老油罐改成了艺术中心，罐顶和屋顶连成草坡公园。',
  tip: '沿徐汇滨江往北走，是龙美术馆和西岸美术馆。'
}

const expoCenter: LandmarkDef = {
  id: 'expo',
  name: '世博文化中心',
  district: 'pudong',
  grade: 'B',
  // OSM 建筑轮廓的中心：一只“飞碟”
  lat: 31.19095,
  lon: 121.48869,
  rot: 0,
  rect: [-20, -20, 20, 20],
  loadR: 1200,
  focusY: 8,
  photoR: 400,
  build(c) {
    const SILVER = 0xd6dbe0
    c.column(0, 0, 17, 0, 4, 0x9fc3d6, { glass: true })
    // 碟身：先往外扩再往里收
    const rings = [17.5, 18.8, 19.4, 19.2, 18.2, 16.5, 14, 10.5]
    rings.forEach((r, i) => c.column(0, 0, r, 4 + i, 5 + i, SILVER, { windows: 0, collide: false, bottom: i < 3 }))
    c.column(0, 0, 19.6, 6.4, 6.7, 0x8a7dff, { ...LIGHT, collide: false })
    c.column(0, 0, 7, 12, 12.5, SILVER, FLAT)
  },
  desc: '2010 年世博会留下的场馆，像一只飞碟落在黄浦江边，现在是演唱会和比赛的场地。',
  tip: '夜里碟身亮起一圈灯；往南走几百米就是中华艺术宫。'
}

const pudongArt: LandmarkDef = {
  id: 'pudongart',
  name: '浦东美术馆',
  district: 'pudong',
  grade: 'B',
  // OSM 建筑轮廓的中心；西面朝着外滩
  lat: 31.24013,
  lon: 121.49183,
  rot: 0,
  rect: [-10.5, -10.5, 10.5, 10.5],
  focusY: 6,
  photoR: 300,
  build(c) {
    c.box(-9.5, 0, -9.5, 9.5, 12, 9.5, 0xf2efe8, { windows: 0 })
    // 朝外滩的玻璃“镜厅”
    c.box(-9.7, 4, -7, -9.5, 10, 7, 0xbfd6e6, { glass: true, collide: false })
    c.box(-9.8, 3.8, -7.2, -9.7, 4, 7.2, WARM, { ...LIGHT, collide: false })
    c.box(-9.8, 0, -3, -9.5, 3, 3, 0x9fc3d6, { glass: true, collide: false })
    // 屋顶平台的栏杆
    c.box(-9.5, 12, -9.5, 9.5, 12.8, -9.2, 0xd8d4cc, FLAT)
    c.box(-9.5, 12, 9.2, 9.5, 12.8, 9.5, 0xd8d4cc, FLAT)
  },
  desc: '让·努维尔设计的白色方盒子美术馆，朝外滩的一面是两层楼高的玻璃“镜厅”，屋顶平台正对外滩。',
  tip: '在东方明珠西边的江边。'
}

const shLibraryEast: LandmarkDef = {
  id: 'shlibeast',
  name: '上海图书馆东馆',
  district: 'pudong',
  grade: 'B',
  lat: 31.222,
  lon: 121.54285,
  rot: 0.333,
  rect: [-18, -22, 18, 22],
  focusY: 10,
  photoR: 300,
  build(c) {
    // 玻璃底座上“浮”着的白色石盒子，一道道横向长窗
    c.box(-15, 0, -19, 15, 4, 19, 0x9fc3d6, { glass: true })
    c.box(-17, 4, -21, 17, 20, 21, 0xf0ede6, { windows: 0, bottom: true, collide: false })
    for (const y of [7, 11, 15]) for (const s of [-1, 1]) c.box(-15, y, s * 21 - 0.1, 15, y + 1.2, s * 21 + 0.1, 0x7e95a8, { ...FLAT })
  },
  desc: '2022 年开馆的上海图书馆东馆，白色的大石盒子像浮在玻璃底座上，是全国单体面积最大的图书馆之一。',
  tip: '在世纪公园东边。'
}

const shMuseumEast: LandmarkDef = {
  id: 'shmuseumeast',
  name: '上海博物馆东馆',
  district: 'pudong',
  grade: 'B',
  lat: 31.22193,
  lon: 121.53464,
  rot: 0.968,
  rect: [-19, -17, 19, 17],
  focusY: 8,
  photoR: 300,
  build(c) {
    // 深色石材基座 + 浅色石材上部，中间一个圆形中庭
    c.box(-18, 0, -16, 18, 6, 16, 0x7a746b, { windows: 0.3 })
    c.box(-15, 6, -13, 15, 14, 13, 0xd8cdb4, { windows: 0.2 })
    c.column(0, 0, 6, 14, 15, 0x9fc3d6, { glass: true, collide: false })
    c.box(-18.1, 5.6, -16.1, 18.1, 6, 16.1, WARM, { ...LIGHT, collide: false })
  },
  desc: '2024 年开放的上海博物馆东馆，石材外墙的大体量建筑，和人民广场的老馆一东一西。',
  tip: '在世纪大道上，离图书馆东馆不远。'
}

// ---------------------------------------------------------------- 远郊（地图压缩过的地方，景点按原尺度）

/** 一架停在机坪上的飞机：机头朝 +z（局部），在 (x, z) 转 ang */
function plane(c: LandmarkContext, x: number, z: number, ang: number) {
  const at = (u: number, v: number): [number, number] => [x + u * Math.cos(ang) - v * Math.sin(ang), z + u * Math.sin(ang) + v * Math.cos(ang)]
  const part = (u: number, v: number, w: number, d: number, y0: number, y1: number, color: number) => {
    const [px, pz] = at(u, v)
    c.slab(px, pz, w, d, y0, y1, color, ang, { windows: 0, collide: y0 < 1 })
  }
  part(0, 0, 2, 16, 1, 3, 0xf4f4f0)
  part(0, 8.6, 1.4, 1.4, 1.3, 2.7, 0xf4f4f0)
  part(0, 0.5, 18, 2.6, 1.6, 1.9, 0xdcdcdc)
  for (const u of [-4, 4]) part(u, 1.4, 0.9, 2, 0.8, 1.6, 0x9aa1a8)
  part(0, -7.2, 0.3, 2.4, 3, 6, 0x2f6fb5)
  part(0, -7.2, 6, 1.4, 2.6, 2.9, 0xdcdcdc)
  for (const v of [5, -1]) part(0, v, 0.3, 0.3, 0, 1, 0x333333)
  part(0, 0, 2.05, 14, 2.2, 2.45, 0x2f6fb5)
}

/** 一列白色高铁：沿局部 z，从 z0 到 z1 */
function bulletTrain(c: LandmarkContext, x: number, z0: number, z1: number) {
  c.box(x - 0.9, 0.2, z0 + 2, x + 0.9, 2.4, z1 - 2, 0xf4f4f0, { windows: 0.5 })
  c.box(x - 0.92, 1.1, z0 + 2, x + 0.92, 1.35, z1 - 2, 0x2f6fb5, FLAT)
  for (const [a, b] of [
    [z0, z0 + 2],
    [z1 - 2, z1]
  ] as const)
    c.box(x - 0.7, 0.2, a, x + 0.7, 1.8, b, 0xf4f4f0, { windows: 0 })
}

const resort: LandmarkDef = {
  id: 'resort',
  name: '上海国际旅游度假区 · 星愿湖',
  district: 'pudong',
  grade: 'B',
  // OSM 度假区小镇的中心；局部 x 顺着湖岸，+z 朝星愿湖（湖岸在 z ≈ 17）。只做湖边小镇的氛围，乐园本身不在游戏里
  lat: 31.14235,
  lon: 121.65727,
  rot: -0.85,
  rect: [-24, -14, 24, 18],
  focusY: 4,
  photoR: 200,
  build(c) {
    const PASTEL = [0xf2c6c2, 0xf7e3a6, 0xbfe0d0, 0xc8d6f0, 0xf4d6a8, 0xe0c8f0]
    // 小镇：一条步行街，两边彩色立面的两层小楼
    c.box(-22, 0, -3, 22, 0.05, 3, 0xd8cfb8, FLAT)
    for (const side of [-1, 1])
      for (let i = 0; i < 7; i++) {
        const x0 = -21 + i * 6
        const h = 4 + ((i * 3 + (side > 0 ? 1 : 0)) % 3) * 0.8
        const [z0, z1] = side > 0 ? [3.5, 10] : [-10, -3.5]
        c.box(x0, 0, z0, x0 + 5.6, h, z1, PASTEL[(i + (side > 0 ? 3 : 0)) % PASTEL.length]!, { windows: 0.6 })
        stepRoof(c, x0, z0, x0 + 5.6, z1, h, 1.2, 0x8a5a4a, 'x', 2)
        c.box(x0 + 1, 2.2, side > 0 ? 3.3 : -3.5, x0 + 4.6, 2.5, side > 0 ? 3.5 : -3.3, WARM, { ...LIGHT, collide: false })
      }
    // 湖边步道、栏杆和一排路灯
    c.box(-24, 0, 12, 24, 0.05, 16.6, 0xb9a98e, FLAT)
    c.box(-24, 0, 16.6, 24, 1, 16.9, 0xf4f1ea, { windows: 0 })
    for (let x = -20; x <= 20; x += 8) {
      c.box(x - 0.1, 0, 12.2, x + 0.1, 3.6, 12.4, 0x4a4d52, { windows: 0 })
      c.box(x - 0.35, 3.6, 12, x + 0.35, 4, 12.6, 0xfff1c9, LIGHT)
    }
  },
  desc: '上海国际旅游度假区的湖边小镇：彩色小楼围着步行街，沿着星愿湖是一圈步道，晚上沿湖亮起灯。（乐园本身不在游戏里）',
  tip: '地铁 11 号线的终点站就在度假区。'
}

const sheshan: LandmarkDef = {
  id: 'sheshan',
  name: '佘山 · 圣母大殿',
  district: 'songjiang',
  grade: 'B',
  // 锚点是西佘山山顶（OSM）；山按台阶一层层堆起来，能一直走到山顶的大殿和天文台
  lat: 31.09622,
  lon: 121.18742,
  rot: 0.215,
  rect: [-19, -19, 19, 19],
  loadR: 1100,
  focusY: 14,
  photoR: 400,
  build(c) {
    // 山：从半径 18 收到 8，每层高 0.42（走得上去），树林绿，越往上越深
    const rings = 22
    for (let i = 0; i < rings; i++) {
      const r = 18 - (10 * i) / rings
      c.column(0, 0, r, 0, 0.42 * (i + 1), i % 4 === 3 ? 0x5e8f4e : 0x6f9f5a, { windows: 0 })
    }
    const top = 0.42 * rings
    // 圣母大殿：罗马式，长条殿身、钟楼，顶上一尊圣母像
    c.box(-4.5, top, -2.4, 4.5, top + 5, 2.4, 0xd8cdb4, { windows: 0.4 })
    stepRoof(c, -4.5, -2.4, 4.5, 2.4, top + 5, 1.6, 0x9a4b38, 'x', 3)
    c.box(3.5, top, -1.6, 6.7, top + 9.5, 1.6, 0xd8cdb4, { windows: 0.3 })
    c.box(4.4, top + 9.5, -0.7, 5.8, top + 11.5, 0.7, 0xd8cdb4, FLAT)
    c.box(4.9, top + 11.5, -0.2, 5.3, top + 12.6, 0.2, 0xe8d8a0, FLAT)
    // 天文台：白色圆顶
    c.box(-6.8, top, 2.6, -2.8, top + 3, 6.2, 0xf0ede6, { windows: 0.3 })
    c.ball(-4.8, top + 3.2, 4.4, 1.9, 0xe8eef2, { windows: 0 })
  },
  desc: '松江的佘山是上海陆地上少有的山。西佘山顶上是罗马式的佘山圣母大殿，旁边是一百多年历史的佘山天文台。',
  tip: '地铁 9 号线佘山站往北；山坡一层层的台阶能一直走到山顶。'
}

const qibao: LandmarkDef = {
  id: 'qibao',
  name: '七宝古镇',
  district: 'minhang',
  grade: 'B',
  // OSM 古镇范围的中心；一条老街，中间一段小河上架着石拱桥
  lat: 31.1532,
  lon: 121.34992,
  rot: 0,
  rect: [-9, -16, 16, 16],
  focusY: 3,
  photoR: 180,
  build(c) {
    // 老街：石板路，两边白墙黛瓦的店铺挂红灯笼
    c.box(-2, 0, -16, 2, 0.05, 16, 0xa9a49a, FLAT)
    for (const side of [-1, 1])
      for (let i = 0; i < 8; i++) {
        const z0 = -16 + i * 4
        if (z0 >= -2 && z0 < 2) continue
        const [x0, x1] = side > 0 ? [2.2, 7] : [-7, -2.2]
        const h = 3.4 + (i % 3) * 0.4
        c.box(x0, 0, z0 + 0.1, x1, h, z0 + 3.9, 0xf0ede4, { windows: 0.4 })
        stepRoof(c, x0, z0 + 0.1, x1, z0 + 3.9, h, 1.2, 0x3a3b40, 'z')
        const fx = side > 0 ? x0 - 0.3 : x1 + 0.3
        c.box(fx - 0.15, h - 0.8, z0 + 1.85, fx + 0.15, h - 0.4, z0 + 2.15, 0xff4a3a, { ...LIGHT, collide: false })
        c.box(side > 0 ? x0 - 0.05 : x1 - 0.05, 0, z0 + 0.6, side > 0 ? x0 + 0.05 : x1 + 0.05, 2.2, z0 + 3.4, 0x6b4a32, FLAT)
      }
    // 小河和石拱桥（蒲汇塘）
    pond(c, -9, -1.8, 16, 1.8)
    for (let k = 0; k < 5; k++) c.box(-2.4, 0, -2.6 + k * 0.25, 2.4, 0.3 * (k + 1), 2.6 - k * 0.25, 0xc2bcae, { windows: 0 })
    c.box(-2.4, 0, -0.9, 2.4, 0.9, 0.9, 0x1e2b2b, FLAT)
    // 老街口的牌楼
    for (const x of [-2.6, 2.6]) c.box(x - 0.3, 0, 15, x + 0.3, 4, 15.6, 0x6b6560, { windows: 0 })
    chineseRoof(c, 0, 15.3, 7, 1.6, 4, 2)
  },
  desc: '有上千年历史的江南古镇，老街上挤满小吃和老店，蒲汇塘上架着石拱桥，是市区边上最近的古镇。',
  tip: '地铁 9 号线七宝站。'
}

const dishuihu: LandmarkDef = {
  id: 'dishuihu',
  name: '滴水湖',
  district: 'pudong',
  grade: 'B',
  // 锚点是西岸的庆典广场（OSM），局部 +x 朝湖（湖岸在 x ≈ 5）
  lat: 30.89982,
  lon: 121.92313,
  rot: 0,
  rect: [-14, -12, 20, 12],
  focusY: 4,
  photoR: 260,
  build(c) {
    c.box(-12, 0, -10, 5, 0.05, 10, 0xd8cfb8, FLAT)
    // 白色风帆一样的景观亭
    for (const [z, h] of [
      [-7, 7],
      [0, 9],
      [7, 6]
    ] as const) {
      c.box(-4.2, 0, z - 0.15, -3.9, h, z + 0.15, 0xdddddd, { windows: 0 })
      for (let k = 0; k < 6; k++) c.box(-3.9, (h * k) / 6, z - 0.08, -3.9 + 3.2 * (1 - k / 6), (h * (k + 1)) / 6, z + 0.08, 0xf4f4f0, FLAT)
    }
    // 伸进湖里的观景栈桥，尽头一圈栏杆
    c.box(4, 0.2, -1.2, 18, 0.45, 1.2, 0x8a6a4a, { windows: 0, collide: false })
    c.platform(4, -1.2, 18, 1.2, 0.45)
    c.box(14, 0.2, -3, 19, 0.45, 3, 0x8a6a4a, { windows: 0, collide: false })
    c.platform(14, -3, 19, 3, 0.45)
    for (const [x0, z0, x1, z1] of [
      [14, -3.2, 19.2, -3],
      [14, 3, 19.2, 3.2],
      [19, -3, 19.2, 3]
    ] as const)
      c.box(x0, 0.45, z0, x1, 1.4, z1, 0xd8d4cc, { windows: 0, collide: true })
    for (let x = 6; x < 14; x += 4) c.box(x, 0, -1.4, x + 0.3, 0.3, 1.4, 0x6b4a32, FLAT)
  },
  desc: '临港新城中心的圆形人工湖，直径约 2.6 公里，像一滴落入大海的水滴；西岸的栈桥伸进湖里。',
  tip: '地铁 16 号线终点滴水湖站。'
}

const dongtan: LandmarkDef = {
  id: 'dongtan',
  name: '崇明东滩湿地',
  district: 'chongming',
  grade: 'B',
  // OSM 湿地公园范围的中心；木栈道架在芦苇滩上，观鸟塔可以坐电梯上去
  lat: 31.52014,
  lon: 121.94499,
  rot: 0,
  rect: [-18, -12, 18, 12],
  focusY: 4,
  photoR: 220,
  build(c) {
    // 芦苇
    for (let i = 0; i < 40; i++) {
      const x = -17 + ((i * 7) % 34)
      const z = -11 + ((i * 13) % 22)
      if (Math.abs(z) < 2) continue
      c.box(x - 0.6, 0, z - 0.6, x + 0.6, 1.4 + (i % 3) * 0.3, z + 0.6, i % 2 ? 0xc9b97a : 0xa8a060, { windows: 0, collide: false })
    }
    // 木栈道（之字形），平台架在滩涂上
    for (const [x0, z0, x1, z1] of [
      [-18, -1.2, -4, 1.2],
      [-5.2, -1.2, -2.8, 8],
      [-2.8, 5.6, 12, 8]
    ] as const) {
      c.box(x0, 0.4, z0, x1, 0.6, z1, 0x8a6a4a, { windows: 0, collide: false })
      c.platform(x0, z0, x1, z1, 0.6)
    }
    // 观鸟塔
    for (const dx of [-1.5, 1.5]) for (const dz of [-1.5, 1.5]) c.box(12 + dx - 0.2, 0, 4 + dz - 0.2, 12 + dx + 0.2, 8, 4 + dz + 0.2, 0x6b4a32, { windows: 0 })
    c.box(10, 8, 2, 14, 8.3, 6, 0x8a6a4a, { windows: 0, collide: false })
    c.platform(10, 2, 14, 6, 8.3)
    for (const [x0, z0, x1, z1] of [
      [10, 1.8, 14, 2],
      [10, 6, 14, 6.2],
      [14, 2, 14.2, 6]
    ] as const)
      c.box(x0, 8.3, z0, x1, 9.2, z1, 0x6b4a32, { windows: 0, collide: true })
    stepRoof(c, 10, 2, 14, 6, 10.4, 1, 0x5a3a2a, 'x', 2)
    c.elevator(9, 7, 12, 8.3, 4, '观鸟塔')
    // 白鹭：站在滩上的和飞着的
    for (const [x, z, y] of [
      [-10, 6, 0],
      [-8, -6, 0],
      [4, -5, 0],
      [8, 10, 0],
      [-2, 10, 6],
      [3, 0, 8],
      [-12, -2, 7]
    ] as const) {
      c.box(x - 0.15, y + 0.6, z - 0.35, x + 0.15, y + 0.95, z + 0.35, 0xf8f8f8, FLAT)
      c.box(x - 0.05, y + 0.95, z + 0.25, x + 0.05, y + 1.35, z + 0.35, 0xf8f8f8, FLAT)
      if (y) c.box(x - 0.9, y + 0.8, z - 0.15, x + 0.9, y + 0.85, z + 0.15, 0xf8f8f8, FLAT)
      else c.box(x - 0.03, y, z - 0.03, x + 0.03, y + 0.6, z + 0.03, 0x333333, FLAT)
    }
  },
  desc: '崇明岛最东端的湿地，大片芦苇和滩涂，每年冬天有成千上万只候鸟在这里停歇。',
  tip: '沿木栈道走到观鸟塔，坐电梯上去看滩涂（按 E）。'
}

const pvg: LandmarkDef = {
  id: 'pvg',
  name: '浦东国际机场',
  district: 'pudong',
  grade: 'B',
  // 锚点是 2 号航站楼（OSM），局部 x 顺着航站楼的长边；+z 朝陆侧（出发层高架），-z 朝机坪
  lat: 31.15345,
  lon: 121.80536,
  rot: 1.478,
  rect: [-42, -34, 42, 9],
  loadR: 1100,
  focusY: 6,
  photoR: 400,
  build(c) {
    // 航站楼：玻璃幕墙，屋顶起伏像海浪
    c.box(-40, 0, -12, 40, 7, 8, 0x9fc3d6, { glass: true })
    for (let x = -40; x < 40; x += 4) {
      const h = 7.5 + 1.2 * Math.sin((x + 2) / 7)
      c.box(x, h - 0.8, -13, x + 4, h, 9, 0xe8e8e2, { windows: 0, collide: false, bottom: true })
      c.box(x, 7, -12, x + 4, h - 0.8, -11.8, 0x9fc3d6, { glass: true, collide: false })
    }
    // 廊桥和停着的飞机
    for (const x of [-28, -10, 8, 26]) {
      c.box(x - 0.8, 2, -21, x + 0.8, 4, -12, 0xc8ccd2, { windows: 0, collide: false, bottom: true })
      c.box(x - 0.3, 0, -20.3, x + 0.3, 2, -19.7, 0x8a8f96, { windows: 0 })
      plane(c, x + 2.4, -30, Math.PI)
    }
    // 塔台
    c.column(-36, -26, 1.2, 0, 18, 0xe8e2d4, { windows: 0.2 })
    c.column(-36, -26, 2.4, 18, 21, 0x6f8fa8, { glass: true })
    c.column(-36, -26, 2.6, 21, 21.6, 0xe8e2d4, FLAT)
    // 机坪的地面
    c.box(-42, 0, -34, 42, 0.05, -13, 0x8a8f96, FLAT)
  },
  desc: '上海的主要国际机场，2 号航站楼的屋顶像起伏的海浪，1 号航站楼像展开的翅膀；磁浮从这里开往龙阳路。',
  tip: '坐磁浮或地铁 2 号线到浦东国际机场。'
}

const hongqiao: LandmarkDef = {
  id: 'hongqiao',
  name: '虹桥枢纽',
  district: 'minhang',
  grade: 'B',
  // 锚点是虹桥站（OSM），站房架在一排排南北向的站台上，出发层的高架路从南边接进来
  lat: 31.19605,
  lon: 121.3164,
  rot: 0,
  rect: [-18, -46, 18, 46],
  focusY: 8,
  photoR: 400,
  build(c) {
    // 站台和停着的高铁
    for (let k = 0; k < 6; k++) {
      const x = -13 + k * 5.2
      c.box(x - 1.2, 0, -45, x + 1.2, 0.6, 45, 0xb8b2a6, { windows: 0 })
      if (k % 2 === 0) bulletTrain(c, x + 2.3, -40 + k * 3, 30 - k * 4)
      c.box(x - 1.6, 4.2, -40, x + 1.6, 4.5, 40, 0xd8d4cc, { ...FLAT, bottom: true })
      for (let z = -36; z <= 36; z += 12) c.box(x - 0.15, 0.6, z - 0.15, x + 0.15, 4.2, z + 0.15, 0x8a8f96, { windows: 0 })
    }
    // 站房：架在站台上方的大厅，玻璃立面
    c.box(-17, 6, -11, 17, 12, 11, 0xdfe6ec, { windows: 0.5, bottom: true, collide: false })
    c.box(-17.2, 7, -11.2, 17.2, 11, -11, 0x9fc3d6, { glass: true, collide: false })
    c.box(-17.2, 7, 11, 17.2, 11, 11.2, 0x9fc3d6, { glass: true, collide: false })
    c.box(-17.5, 12, -11.5, 17.5, 12.6, 11.5, 0xc8ccd2, FLAT)
    for (const x of [-16, 16]) for (const z of [-10, 0, 10]) c.box(x - 0.5, 0, z - 0.5, x + 0.5, 6, z + 0.5, 0xc8ccd2, { windows: 0 })
  },
  desc: '虹桥枢纽把高铁站、机场和地铁连在一起。虹桥站是亚洲最大的铁路客站之一，一列列白色高铁从这里开往全国。',
  tip: '地铁 2、10、17 号线虹桥火车站站。'
}

const jdConfucius: LandmarkDef = {
  id: 'jdconfucius',
  name: '嘉定孔庙',
  district: 'jiading',
  grade: 'B',
  // OSM 孔庙范围的中心；局部 x 顺着门前的塔城路，+z 往庙里（路在 z ≈ -4）
  lat: 31.38346,
  lon: 121.24842,
  rot: -0.72,
  rect: [-8, -1, 8, 14],
  focusY: 4,
  photoR: 180,
  build(c) {
    // 门前栏杆上一排石狮子
    c.box(-7, 0, 0.6, 7, 0.8, 0.9, 0xc2bcae, { windows: 0 })
    for (let x = -6.6; x <= 6.7; x += 0.95) c.box(x - 0.18, 0.8, 0.55, x + 0.18, 1.2, 0.95, 0xb5ad9e, FLAT)
    // 棂星门：三道石牌坊
    for (const x of [-3, 0, 3]) {
      for (const dx of [-1, 1]) c.box(x + dx - 0.2, 0, 2.1, x + dx + 0.2, 3.4, 2.5, 0xb5ad9e, { windows: 0 })
      c.box(x - 1.3, 3, 2, x + 1.3, 3.5, 2.6, 0xb5ad9e, FLAT)
    }
    // 泮池和大成殿，红墙围着
    pond(c, -3, 4, 3, 6)
    c.box(-2, 0, 4.7, 2, 0.5, 5.3, 0xc2bcae, { windows: 0 })
    c.box(-4, 0, 8, 4, 0.6, 12.5, 0xb5ad9e, { windows: 0 })
    c.box(-3.4, 0.6, 8.8, 3.4, 4, 12, 0x9e2f22, { windows: 0.3 })
    chineseRoof(c, 0, 10.4, 9, 5.6, 4, 3)
    chineseRoof(c, 0, 10.4, 7, 4.2, 5.8, 3)
    for (const [x0, z0, x1, z1] of [
      [-7.5, 1.5, -7.1, 13.5],
      [7.1, 1.5, 7.5, 13.5],
      [-7.5, 13.1, 7.5, 13.5]
    ] as const)
      c.box(x0, 0, z0, x1, 2.4, z1, 0x9e2f22, { windows: 0 })
  },
  desc: '始建于南宋的嘉定孔庙，有“吴中第一”之称；门前栏杆上蹲着一排石狮子，旁边是汇龙潭公园。',
  tip: '在嘉定老城的塔城路上。'
}

export const bLandmarks: LandmarkDef[] = [
  yangpuBridge,
  yangpuRiverside,
  laochangfang,
  duolun,
  luxunPark,
  northBund,
  suzhouCreek,
  m50,
  shRailway,
  fuxingPark,
  zhongshanPark,
  shZoo,
  gongqingPark,
  westBund,
  expoCenter,
  pudongArt,
  shLibraryEast,
  shMuseumEast,
  resort,
  sheshan,
  qibao,
  dishuihu,
  dongtan,
  pvg,
  hongqiao,
  jdConfucius
]


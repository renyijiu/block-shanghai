// 地铁口的站名灯箱（docs/04 第 6 节）：线路色块、中英文站名，右边红底方块写出口号，挂在 M 标志柱上。
// 文字画在 canvas 上做贴图，每个车站一张（这个站所有出入口共用），只给玩家附近的车站建，走远了释放，
// 免得一千多个出入口的贴图占满手机显存。灯箱用不受光照的材质，夜里也是亮的
import * as THREE from 'three/webgpu'
import { fit, FONT } from '../interior/signs.ts'
import type { MetroData } from './data.ts'
import { entranceFootprint, entrancePole } from './structures.ts'

/** 玩家离车站最近的出入口多近时挂牌（格），走出 HIDE_R 再拆掉 */
const SHOW_R = 250
const HIDE_R = 300
/** 站名区：贴图 512×112 像素，牌面 2.9 格宽；出口号是边长 0.64 格的方块 */
const TEX_W = 512
const NAME_H = 112
const CELL = 64
const PANEL_W = 2.9
const PANEL_H = (PANEL_W * NAME_H) / TEX_W
const EXIT = PANEL_H
/** 灯箱中心离地高度（M 标志从 3.6 开始） */
const SIGN_Y = 3.05

interface Built {
  mesh: THREE.Mesh
  texture: THREE.CanvasTexture
}

export class EntranceSigns {
  readonly root = new THREE.Group()
  private readonly data: MetroData
  /** 车站 → 它的出入口序号 */
  private readonly byStation = new Map<number, number[]>()
  private readonly built = new Map<number, Built>()
  private lastCheck = -Infinity

  constructor(data: MetroData) {
    this.data = data
    this.root.name = 'entrance signs'
    data.entrances.forEach((e, i) => {
      const list = this.byStation.get(e.station) ?? []
      list.push(i)
      this.byStation.set(e.station, list)
    })
  }

  /** 每帧调用；每半秒按玩家位置增减车站 */
  update(x: number, z: number, now: number) {
    if (now - this.lastCheck < 500) return
    this.lastCheck = now
    for (const [station, list] of this.byStation) {
      const d = Math.min(...list.map((i) => Math.hypot(this.data.entrances[i]!.pos[0] - x, this.data.entrances[i]!.pos[1] - z)))
      if (d < SHOW_R && !this.built.has(station)) this.build(station, list)
      else if (d > HIDE_R && this.built.has(station)) this.remove(station)
    }
  }

  /** 现在挂着牌子的车站数（测试用） */
  get count() {
    return this.built.size
  }

  private build(station: number, entrances: number[]) {
    const st = this.data.stations[station]!
    const refs = [...new Set(entrances.map((i) => this.data.entrances[i]!.ref).filter(Boolean))]
    const texture = this.texture(st.name, st.nameEn, st.lines, refs)
    const rows = Math.ceil(refs.length / (TEX_W / CELL))
    const texH = NAME_H + rows * CELL
    const pos: number[] = []
    const uv: number[] = []
    const quad = (cx: number, cy: number, cz: number, rx: number, rz: number, hw: number, hh: number, u0: number, v0: number, u1: number, v1: number) => {
      // 从牌子正面看：左下、右下、右上、左上（rx, rz 是看牌子的人右手方向）
      const bl = [cx - rx * hw, cy - hh, cz - rz * hw]
      const br = [cx + rx * hw, cy - hh, cz + rz * hw]
      const tr = [cx + rx * hw, cy + hh, cz + rz * hw]
      const tl = [cx - rx * hw, cy + hh, cz - rz * hw]
      pos.push(...bl, ...br, ...tr, ...bl, ...tr, ...tl)
      uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1)
    }
    // canvas 像素矩形 → 贴图坐标（CanvasTexture 默认上下翻转，v 从下往上）
    const rect = (x: number, y: number, w: number, h: number): [number, number, number, number] => [x / TEX_W, 1 - (y + h) / texH, (x + w) / TEX_W, 1 - y / texH]
    for (const i of entrances) {
      const f = entranceFootprint(this.data, i)
      const { px, pz } = entrancePole(f)
      // 牌面朝出入口开口的方向（人从那边走过来），背面也贴一份
      const [nx, nz] = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[f.open]
      const ref = this.data.entrances[i]!.ref
      const k = refs.indexOf(ref)
      // 灯箱从柱子朝出入口中间那边伸出去，柱子不挡字
      const full = PANEL_W + (k >= 0 ? 0.06 + EXIT : 0)
      const [ax, az] = f.open === 'n' || f.open === 's' ? [Math.sign((f.x0 + f.x1) / 2 - px) || 1, 0] : [0, Math.sign((f.z0 + f.z1) / 2 - pz) || 1]
      const [bx, bz] = [px + ax * (0.3 + full / 2), pz + az * (0.3 + full / 2)]
      for (const side of [1, -1]) {
        const [fnx, fnz] = [nx * side, nz * side]
        const [rx, rz] = [fnz, -fnx]
        const [cx, cz] = [bx + fnx * 0.08, bz + fnz * 0.08]
        // 有出口号时站名往左让一点，右边是出口号方块
        const shift = k >= 0 ? -(EXIT + 0.06) / 2 : 0
        quad(cx + rx * shift, SIGN_Y, cz + rz * shift, rx, rz, PANEL_W / 2, PANEL_H / 2, ...rect(0, 0, TEX_W, NAME_H))
        if (k >= 0) {
          const s = PANEL_W / 2 + 0.06 + EXIT / 2 + shift
          const col = k % (TEX_W / CELL)
          const row = Math.floor(k / (TEX_W / CELL))
          quad(cx + rx * s, SIGN_Y, cz + rz * s, rx, rz, EXIT / 2, EXIT / 2, ...rect(col * CELL, NAME_H + row * CELL, CELL, CELL))
        }
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    const material = new THREE.MeshBasicMaterial({ map: texture })
    const mesh = new THREE.Mesh(geo, material)
    mesh.name = `entrance sign ${st.name}`
    mesh.matrixAutoUpdate = false
    this.root.add(mesh)
    this.built.set(station, { mesh, texture })
  }

  /** 一个站的贴图：上面一行是线路色块 + 中英文站名，下面每格一个出口号（红底白字） */
  private texture(name: string, nameEn: string, lines: string[], refs: string[]) {
    const per = TEX_W / CELL
    const canvas = document.createElement('canvas')
    canvas.width = TEX_W
    canvas.height = NAME_H + Math.ceil(refs.length / per) * CELL
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#1f2a36'
    ctx.fillRect(0, 0, TEX_W, NAME_H)
    // 线路色块：号线写数字，浦江线、磁浮线写前两个字
    let x = 12
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const id of lines) {
      const l = this.data.lines.find((q) => q.id === id)
      if (!l) continue
      const label = /^\d+号线$/.test(l.name) ? l.name.replace('号线', '') : l.name.slice(0, 2)
      const w = label.length > 1 && !/^\d+$/.test(label) ? 56 : 40
      ctx.fillStyle = l.color
      ctx.fillRect(x, (NAME_H - 40) / 2, w, 40)
      ctx.fillStyle = '#ffffff'
      ctx.font = `700 ${label.length > 2 || w > 40 ? 20 : 26}px ${FONT}`
      ctx.fillText(label, x + w / 2, NAME_H / 2 + 1)
      x += w + 6
    }
    const left = x + 8
    const max = TEX_W - left - 12
    ctx.textAlign = 'left'
    ctx.fillStyle = '#ffffff'
    ctx.font = `700 46px ${FONT}`
    ctx.fillText(fit(ctx, name, max), left, NAME_H * 0.36)
    ctx.fillStyle = '#cfd6de'
    ctx.font = `500 24px ${FONT}`
    ctx.fillText(fit(ctx, nameEn, max), left, NAME_H * 0.76)
    // 出口号
    refs.forEach((ref, k) => {
      const cx = (k % per) * CELL
      const cy = NAME_H + Math.floor(k / per) * CELL
      ctx.fillStyle = '#e4002b'
      ctx.fillRect(cx, cy, CELL, CELL)
      ctx.fillStyle = '#ffffff'
      ctx.textAlign = 'center'
      ctx.font = `800 ${ref.length > 2 ? 26 : 36}px ${FONT}`
      ctx.fillText(ref, cx + CELL / 2, cy + CELL / 2 + 2)
    })
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4
    return texture
  }

  private remove(station: number) {
    const b = this.built.get(station)!
    this.root.remove(b.mesh)
    b.mesh.geometry.dispose()
    ;(b.mesh.material as THREE.Material).dispose()
    b.texture.dispose()
    this.built.delete(station)
  }

  dispose() {
    for (const station of [...this.built.keys()]) this.remove(station)
  }
}

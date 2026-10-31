// 景点共用的构件：瓦色、灯光选项、中式屋顶和殿堂
import type { LandmarkContext, PartOptions } from '../../engine/city.ts'

export const TILE = 0x3a3b40
export const WARM = 0xffd79a
export const LIGHT = { light: true } satisfies PartOptions

// 中式屋顶：几层逐渐收小的瓦顶，最下一层四角起翘（飞檐）
export function chineseRoof(c: LandmarkContext, cx: number, cz: number, w: number, d: number, y: number, tiers: number, color = TILE) {
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
export function hall(c: LandmarkContext, cx: number, cz: number, w: number, d: number, h: number, wall: number, eaves = 1, roof = TILE) {
  c.box(cx - w / 2 - 0.6, 0, cz - d / 2 - 0.6, cx + w / 2 + 0.6, 0.4, cz + d / 2 + 0.6, 0xb5ad9e, { windows: 0 })
  c.box(cx - w / 2, 0.4, cz - d / 2, cx + w / 2, h, cz + d / 2, wall, { windows: 0.35 })
  for (let e = 0; e < eaves; e++) chineseRoof(c, cx, cz, w + 3 - e * 3, d + 3 - e * 3, h + e * 2.2, 3, roof)
}

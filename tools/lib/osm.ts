// 读 tools/.cache/ 里 osmium 导出的文件：GeoJSONSeq（每行一个要素）和带坐标的 OPL
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Pt } from './geom.ts'

export const CACHE = join(import.meta.dirname, '..', '.cache')

export interface Feature {
  type: 'Feature'
  geometry: { type: 'LineString'; coordinates: Pt[] } | { type: 'Polygon'; coordinates: Pt[][] } | { type: 'MultiPolygon'; coordinates: Pt[][][] }
  properties: Record<string, string | number>
}

export function readSeq(name: string): Feature[] {
  const text = readFileSync(join(CACHE, `${name}.geojsonseq`), 'utf8')
  return text
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Feature)
}

/** 面要素统一成多边形数组，每个多边形是 [外环, ...内环] */
export function polygonsOf(f: Feature): Pt[][][] {
  if (f.geometry.type === 'Polygon') return [f.geometry.coordinates]
  if (f.geometry.type === 'MultiPolygon') return f.geometry.coordinates
  return []
}

// OPL 里的特殊字符写成 %十六进制码位%
export const decodeOpl = (s: string) => s.replace(/%([0-9a-f]+)%/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))

export interface OplRelation {
  id: number
  tags: Record<string, string>
  members: { type: string; ref: number; role: string }[]
}

/**
 * 解析 osmium add-locations-to-ways 之后 cat 出来的 OPL：way 的节点带经纬度（n123x121.4y31.2）。
 * 用来自己组装行政区边界：osmium export 遇到成员不全的 relation 会整个跳过（宝山区就是这样）
 */
export function parseOpl(text: string): { ways: Map<number, Pt[]>; relations: OplRelation[] } {
  const ways = new Map<number, Pt[]>()
  const relations: OplRelation[] = []
  for (const line of text.split('\n')) {
    const kind = line[0]
    if (kind !== 'w' && kind !== 'r') continue
    const fields = line.split(' ')
    const id = Number(fields[0]!.slice(1))
    const tagField = fields.find((f) => f[0] === 'T')?.slice(1) ?? ''
    if (kind === 'w') {
      const nodes = fields.find((f) => f[0] === 'N')?.slice(1) ?? ''
      const coords: Pt[] = []
      for (const n of nodes.split(',')) {
        const m = /x(-?[\d.]+)y(-?[\d.]+)/.exec(n)
        if (m) coords.push([Number(m[1]), Number(m[2])])
      }
      ways.set(id, coords)
    } else {
      const tags: Record<string, string> = {}
      for (const kv of tagField ? tagField.split(',') : []) {
        const i = kv.indexOf('=')
        tags[decodeOpl(kv.slice(0, i))] = decodeOpl(kv.slice(i + 1))
      }
      const memberField = fields.find((f) => f[0] === 'M')?.slice(1) ?? ''
      const members = memberField
        ? memberField.split(',').map((m) => {
            const at = m.indexOf('@')
            return { type: m[0]!, ref: Number(m.slice(1, at)), role: decodeOpl(m.slice(at + 1)) }
          })
        : []
      relations.push({ id, tags, members })
    }
  }
  return { ways, relations }
}

// 存档：localStorage，key 带结构版本；结构变化时提升版本并在 MIGRATIONS 里写迁移函数（docs/02 第 6 节）。
// 照片存 IndexedDB（photo/album.ts），存档里只存 id。本模块不依赖浏览器 API，Node 里也能测

import { newLife, type LifeProgress } from '../life/progress.ts'
import { newProgress, type MetroProgress } from '../metro/collection.ts'

export const SAVE_SCHEMA = 5
const PREFIX = 'block-shanghai:save:v'
export const saveKey = (schema = SAVE_SCHEMA) => PREFIX + schema

export type QualityLevel = 'low' | 'mid' | 'high'

export interface SaveData {
  schema: typeof SAVE_SCHEMA
  /** 城市包 id，换城市不读这份存档 */
  city: string
  savedAt: string
  player: { x: number; y: number; z: number; facing: number }
  camera: { yaw: number; pitch: number; distance: number; mode: 'third' | 'first' }
  settings: { quality: QualityLevel }
  /** 游戏时间（秒，从第 0 天 0 点起） */
  time: number
  /** 钱包（元） */
  money: number
  /** 地铁：乘车次数、到访车站（集站图鉴）、坐过的区间（线路徽章）、换乘过的车站、成就、每日任务（metro/collection.ts） */
  metro: MetroProgress
  /**
   * 景点图鉴：found 是发现过的景点 → 发现时的游戏时间（秒）；
   * shot 是拍到过的景点或子景点 → 第一张照片的 id（照片本身在 IndexedDB 相册里）
   */
  codex: { found: Record<string, number>; shot: Record<string, string> }
  /** 生活进度：美食、背包、文化图鉴、咖啡地图、Citywalk、任务、计数器（life/progress.ts） */
  life: LifeProgress
}

/** 新游戏的初始值 */
export const NEW_GAME = { time: 8.5 * 3600, money: 200, metro: newProgress(), codex: { found: {}, shot: {} }, life: newLife() }

/** 只用到的 Storage 接口，测试时可以传假的 */
export type SaveStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/**
 * 迁移函数：MIGRATIONS[n] 把 v(n) 的存档升级成 v(n+1)。
 * 例：以后加了 money 字段、版本升到 2，就加 1: (s) => ({ ...s, schema: 2, money: 0 })
 */
const MIGRATIONS: Record<number, (s: Record<string, unknown>) => Record<string, unknown>> = {
  // v1 → v2（P2）：加游戏时间、钱包、地铁统计
  1: (s) => ({ ...s, schema: 2, time: NEW_GAME.time, money: NEW_GAME.money, metro: { rides: 0, visited: [] } }),
  // v2 → v3（P3）：加景点图鉴
  2: (s) => ({ ...s, schema: 3, codex: { found: {}, shot: {} } }),
  // v3 → v4（P4）：地铁统计扩成收集进度；到访过的车站保留，到访时间记成存档时的游戏时间
  3: (s) => {
    const old = (s.metro ?? {}) as { rides?: number; visited?: string[] }
    const t = typeof s.time === 'number' ? s.time : NEW_GAME.time
    return { ...s, schema: 4, metro: { ...newProgress(), rides: old.rides ?? 0, visits: Object.fromEntries((old.visited ?? []).map((id) => [id, t])) } }
  },
  // v4 → v5（P5）：加生活进度
  4: (s) => ({ ...s, schema: 5, life: newLife() })
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isRecord = (v: unknown, item: (x: unknown) => boolean) => !!v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every(item)

function valid(s: Record<string, unknown>): s is SaveData & Record<string, unknown> {
  const p = s.player as SaveData['player'] | undefined
  const c = s.camera as SaveData['camera'] | undefined
  const st = s.settings as SaveData['settings'] | undefined
  return (
    s.schema === SAVE_SCHEMA &&
    typeof s.city === 'string' &&
    !!p && isNum(p.x) && isNum(p.y) && isNum(p.z) && isNum(p.facing) &&
    !!c && isNum(c.yaw) && isNum(c.pitch) && isNum(c.distance) && (c.mode === 'third' || c.mode === 'first') &&
    !!st && ['low', 'mid', 'high'].includes(st.quality) &&
    isNum(s.time) && isNum(s.money) &&
    validMetro(s.metro) &&
    validLife(s.life) &&
    !!s.codex && isRecord((s.codex as SaveData['codex']).found, isNum) && isRecord((s.codex as SaveData['codex']).shot, (v) => typeof v === 'string')
  )
}

function validLife(v: unknown): v is LifeProgress {
  const l = v as LifeProgress | undefined
  const walk = (x: unknown) => !!x && typeof x === 'object' && isNum((x as { next: unknown }).next)
  const quest = (x: unknown) => !!x && typeof x === 'object' && isNum((x as { step: unknown }).step)
  return (
    !!l &&
    isRecord(l.foods, isNum) &&
    isRecord(l.items, isNum) &&
    isRecord(l.culture, isNum) &&
    isRecord(l.coffee, isNum) &&
    isRecord(l.walks, walk) &&
    isRecord(l.quests, quest) &&
    isRecord(l.stats, isNum)
  )
}

function validMetro(v: unknown): v is MetroProgress {
  const m = v as MetroProgress | undefined
  return (
    !!m &&
    isNum(m.rides) &&
    isRecord(m.visits, isNum) &&
    Array.isArray(m.segments) &&
    Array.isArray(m.transfers) &&
    isRecord(m.achievements, isNum) &&
    !!m.daily &&
    typeof m.daily.date === 'string' &&
    Array.isArray(m.daily.lines) &&
    Array.isArray(m.daily.done)
  )
}

/** 读档：先找当前版本，没有就从新到旧找旧版本并逐级迁移；坏档返回 null */
export function loadSave(storage: SaveStorage, city: string): SaveData | null {
  for (let v = SAVE_SCHEMA; v >= 1; v--) {
    const raw = storage.getItem(PREFIX + v)
    if (!raw) continue
    try {
      let s = JSON.parse(raw) as Record<string, unknown>
      for (let from = v; from < SAVE_SCHEMA; from++) {
        const m = MIGRATIONS[from]
        if (!m) return null
        s = m(s)
      }
      if (!valid(s) || s.city !== city) return null
      // 迁移过的写回新 key，删掉旧的
      if (v !== SAVE_SCHEMA) {
        storage.setItem(PREFIX + SAVE_SCHEMA, JSON.stringify(s))
        storage.removeItem(PREFIX + v)
      }
      return s
    } catch {
      return null
    }
  }
  return null
}

export function writeSave(storage: SaveStorage, data: Omit<SaveData, 'schema' | 'savedAt'>) {
  const s: SaveData = { schema: SAVE_SCHEMA, savedAt: new Date().toISOString(), ...data }
  try {
    storage.setItem(PREFIX + SAVE_SCHEMA, JSON.stringify(s))
  } catch {
    // 隐私模式或空间满时写不进去，不影响游戏
  }
}

import { expect, test } from 'vitest'
import { loadSave, SAVE_SCHEMA, writeSave, type SaveStorage } from '../src/engine/state/save.ts'

function memory(): SaveStorage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) }
}

const sample = {
  city: 'shanghai',
  player: { x: 12.5, y: 0, z: -40, facing: 1.2 },
  camera: { yaw: 0.3, pitch: 0.35, distance: 7, mode: 'third' as const },
  settings: { quality: 'mid' as const },
  time: 9 * 3600,
  money: 180,
  metro: {
    rides: 2,
    visits: { 'peoples-square': 30600, lujiazui: 31200 },
    segments: ['L2:lujiazui|east-nanjing-road'],
    transfers: [],
    achievements: { 'first-ride': 31200 },
    daily: { date: '2026-10-31', lines: ['L2'], done: [] }
  },
  life: { foods: { xiaolongbao: 31000 }, items: { metrocard: 1 }, culture: {}, coffee: {}, walks: { wukang: { next: 2 } }, quests: { novice: { step: 1 } }, stats: { talk: 3 } },
  codex: { found: { bund: 32400, orientalpearl: 33000 }, shot: { orientalpearl: 'p-1' } }
}

test('写入再读出', () => {
  const s = memory()
  writeSave(s, sample)
  const loaded = loadSave(s, 'shanghai')
  expect(loaded?.schema).toBe(SAVE_SCHEMA)
  expect(loaded?.player).toEqual(sample.player)
  expect(loaded?.settings.quality).toBe('mid')
  expect(loaded?.codex).toEqual(sample.codex)
})

test('其他城市的存档不读', () => {
  const s = memory()
  writeSave(s, sample)
  expect(loadSave(s, 'guangzhou')).toBeNull()
})

test('坏档、字段不全返回 null', () => {
  const s = memory()
  s.setItem(`block-shanghai:save:v${SAVE_SCHEMA}`, '{not json')
  expect(loadSave(s, 'shanghai')).toBeNull()
  s.setItem(`block-shanghai:save:v${SAVE_SCHEMA}`, JSON.stringify({ ...sample, schema: SAVE_SCHEMA, player: { x: 1 } }))
  expect(loadSave(s, 'shanghai')).toBeNull()
  s.setItem(`block-shanghai:save:v${SAVE_SCHEMA}`, JSON.stringify({ ...sample, schema: SAVE_SCHEMA, codex: { found: { bund: 'x' }, shot: {} } }))
  expect(loadSave(s, 'shanghai')).toBeNull()
})

test('没有存档返回 null', () => {
  expect(loadSave(memory(), 'shanghai')).toBeNull()
})

test('v1 存档逐级迁移到最新：补上时间、钱包、地铁进度、图鉴、生活进度，写回新 key 并删掉旧的', () => {
  const s = memory()
  const { time: _t, money: _m, metro: _x, codex: _c, life: _l, ...v1 } = sample
  s.setItem('block-shanghai:save:v1', JSON.stringify({ ...v1, schema: 1, savedAt: '2026-10-30T00:00:00Z' }))
  const loaded = loadSave(s, 'shanghai')!
  expect(loaded.schema).toBe(SAVE_SCHEMA)
  expect(loaded.player).toEqual(sample.player)
  expect(loaded.money).toBe(200)
  expect(loaded.metro.rides).toBe(0)
  expect(loaded.metro.visits).toEqual({})
  expect(loaded.codex).toEqual({ found: {}, shot: {} })
  expect(loaded.life.foods).toEqual({})
  expect(s.data.has('block-shanghai:save:v1')).toBe(false)
  expect(s.data.has(`block-shanghai:save:v${SAVE_SCHEMA}`)).toBe(true)
})

test('v2 存档迁移到最新：保留钱包、乘车次数和到访车站，图鉴为空', () => {
  const s = memory()
  const { codex: _c, metro: _m, life: _l, ...v2 } = sample
  s.setItem('block-shanghai:save:v2', JSON.stringify({ ...v2, schema: 2, metro: { rides: 2, visited: ['peoples-square', 'lujiazui'] }, savedAt: '2026-10-31T00:00:00Z' }))
  const loaded = loadSave(s, 'shanghai')!
  expect(loaded.schema).toBe(SAVE_SCHEMA)
  expect(loaded.money).toBe(180)
  expect(loaded.metro.rides).toBe(2)
  expect(Object.keys(loaded.metro.visits)).toEqual(['peoples-square', 'lujiazui'])
  expect(loaded.metro.visits['lujiazui']).toBe(sample.time)
  expect(loaded.codex).toEqual({ found: {}, shot: {} })
  expect(s.data.has('block-shanghai:save:v2')).toBe(false)
})

test('v3 存档迁移到最新：地铁统计扩成收集进度，景点图鉴原样保留', () => {
  const s = memory()
  const { life: _l, ...v3 } = sample
  s.setItem('block-shanghai:save:v3', JSON.stringify({ ...v3, schema: 3, metro: { rides: 1, visited: ['lujiazui'] }, savedAt: '2026-10-31T00:00:00Z' }))
  const loaded = loadSave(s, 'shanghai')!
  expect(loaded.schema).toBe(SAVE_SCHEMA)
  expect(loaded.metro).toEqual({ rides: 1, visits: { lujiazui: sample.time }, segments: [], transfers: [], achievements: {}, daily: { date: '', lines: [], done: [] } })
  expect(loaded.codex).toEqual(sample.codex)
})

test('v4 存档迁移到 v5：加空的生活进度，地铁进度原样保留', () => {
  const s = memory()
  const { life: _l, ...v4 } = sample
  s.setItem('block-shanghai:save:v4', JSON.stringify({ ...v4, schema: 4, savedAt: '2026-11-01T00:00:00Z' }))
  const loaded = loadSave(s, 'shanghai')!
  expect(loaded.schema).toBe(5)
  expect(loaded.metro).toEqual(sample.metro)
  expect(loaded.life).toEqual({ foods: {}, items: {}, culture: {}, coffee: {}, walks: {}, quests: {}, stats: {} })
})

test('写入再读出：生活进度原样保留', () => {
  const s = memory()
  writeSave(s, sample)
  expect(loadSave(s, 'shanghai')!.life).toEqual(sample.life)
})

test('地铁进度字段不全当坏档', () => {
  const s = memory()
  s.setItem(`block-shanghai:save:v${SAVE_SCHEMA}`, JSON.stringify({ ...sample, schema: SAVE_SCHEMA, metro: { rides: 1, visits: {} } }))
  expect(loadSave(s, 'shanghai')).toBeNull()
})

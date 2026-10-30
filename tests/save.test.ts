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
  metro: { rides: 2, visited: ['peoples-square', 'lujiazui'] }
}

test('写入再读出', () => {
  const s = memory()
  writeSave(s, sample)
  const loaded = loadSave(s, 'shanghai')
  expect(loaded?.schema).toBe(SAVE_SCHEMA)
  expect(loaded?.player).toEqual(sample.player)
  expect(loaded?.settings.quality).toBe('mid')
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
})

test('没有存档返回 null', () => {
  expect(loadSave(memory(), 'shanghai')).toBeNull()
})

test('v1 存档迁移到 v2：补上时间、钱包、地铁统计，写回新 key 并删掉旧的', () => {
  const s = memory()
  const { time: _t, money: _m, metro: _x, ...v1 } = sample
  s.setItem('block-shanghai:save:v1', JSON.stringify({ ...v1, schema: 1, savedAt: '2026-10-30T00:00:00Z' }))
  const loaded = loadSave(s, 'shanghai')!
  expect(loaded.schema).toBe(2)
  expect(loaded.player).toEqual(sample.player)
  expect(loaded.money).toBe(200)
  expect(loaded.metro).toEqual({ rides: 0, visited: [] })
  expect(s.data.has('block-shanghai:save:v1')).toBe(false)
  expect(s.data.has('block-shanghai:save:v2')).toBe(true)
})

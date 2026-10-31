import { expect, test } from 'vitest'
import { boats } from '../src/cities/shanghai/boats.ts'
import { buses } from '../src/cities/shanghai/buses.ts'
import config from '../src/cities/shanghai/config.ts'
import { content } from '../src/cities/shanghai/content.ts'
import { en } from '../src/cities/shanghai/en.ts'
import { landmarks } from '../src/cities/shanghai/landmarks.ts'
import { people } from '../src/cities/shanghai/people.ts'
import { ACHIEVEMENTS } from '../src/engine/metro/collection.ts'
import { translateIn, tr } from '../src/i18n/core.ts'
import { EN_UI } from '../src/i18n/en-ui.ts'

const HAN = /[一-鿿]/

/** 数据里所有含汉字、会显示给玩家的字符串（方言原句除外：英文模式下也显示上海话原文） */
function chinese(data: unknown) {
  const out = new Set<string>()
  const walk = (o: unknown) => {
    if (!o || typeof o !== 'object') return
    const rec = o as Record<string, unknown>
    const dialect = !Array.isArray(o) && typeof rec.gloss === 'string'
    for (const [k, v] of Object.entries(rec)) {
      if (typeof v === 'string') {
        if (HAN.test(v) && !(dialect && k === 'text')) out.add(v)
      } else walk(v)
    }
  }
  walk(data)
  return [...out]
}

test('中文模式：原文照旧，占位符替换', () => {
  expect(tr('还车 · 骑了 {m} 分钟 · {fare} 元', { m: 12, fare: 1.5 })).toBe('还车 · 骑了 12 分钟 · 1.5 元')
  expect(tr('没有这个词条')).toBe('没有这个词条')
})

test('换成英文：查得到的换掉，方言原句保留、只翻 gloss', () => {
  const dict = new Map(Object.entries({ 爷叔: 'Uncle', '你好！': 'Hello!', '侬好！': 'Nong hao!' }))
  const data = { name: '爷叔', lines: [{ text: '侬好！', gloss: '你好！' }], other: '查不到' }
  translateIn(data, (s) => dict.get(s))
  expect(data).toEqual({ name: 'Uncle', lines: [{ text: '侬好！', gloss: 'Hello!' }], other: '查不到' })
})

test('城市包里给玩家看的文字都有英文', () => {
  const dict = { ...EN_UI, ...en }
  const data = { landmarks, content, people, boats, buses, districts: config.districts, filters: config.photoFilters, achievements: ACHIEVEMENTS }
  const missing = chinese(data).filter((s) => !(s in dict))
  expect(missing).toEqual([])
})

test('英文词条的占位符和中文原文一致', () => {
  for (const [zh, english] of Object.entries({ ...EN_UI, ...en })) {
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
    expect(vars(english), zh).toEqual(vars(zh))
  }
})

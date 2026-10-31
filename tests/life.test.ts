import { expect, test } from 'vitest'
import { content } from '../src/cities/shanghai/content.ts'
import { foodAvailable, foodWhen, newLife, recordLife } from '../src/engine/life/progress.ts'

const food = (id: string) => content.foods.find((f) => f.id === id)!

test('季节限定按真实月份，早点按游戏时刻', () => {
  const oct = new Date(2026, 9, 31)
  const apr = new Date(2027, 3, 5)
  expect(foodAvailable(food('hairycrab'), oct, 12)).toBe(true)
  expect(foodAvailable(food('hairycrab'), apr, 12)).toBe(false)
  expect(foodAvailable(food('qingtuan'), apr, 12)).toBe(true)
  // 糖炒栗子跨年：10 月到 2 月
  expect(foodAvailable(food('chestnut'), new Date(2027, 0, 10), 12)).toBe(true)
  expect(foodAvailable(food('cifantuan'), oct, 7.5)).toBe(true)
  expect(foodAvailable(food('cifantuan'), oct, 13)).toBe(false)
  expect(foodWhen(food('hairycrab'))).toBe('9–11 月')
  expect(foodWhen(food('xiaolongbao'))).toBe('')
})

test('吃东西：第一次记进美食图鉴，再吃不算新的；咖啡记咖啡地图', () => {
  const p = newLife()
  expect(recordLife(content, p, { type: 'eat', food: 'xiaolongbao', shop: 'njxiaolong' }, 100).foods).toEqual(['xiaolongbao'])
  expect(recordLife(content, p, { type: 'eat', food: 'xiaolongbao', shop: 'yysnack' }, 200).foods).toEqual([])
  expect(p.foods.xiaolongbao).toBe(100)
  recordLife(content, p, { type: 'eat', food: 'coffee', shop: 'ljzcoffee' }, 300)
  expect(p.coffee).toEqual({ ljzcoffee: 300 })
  expect(p.stats.eat).toBe(3)
})

test('买纪念品放进背包，旗袍书签同时解锁“旗袍”', () => {
  const p = newLife()
  const g = recordLife(content, p, { type: 'buy', item: 'qipaobookmark' }, 10)
  expect(g.items).toEqual(['qipaobookmark'])
  expect(g.culture).toEqual(['qipao'])
  const again = recordLife(content, p, { type: 'buy', item: 'qipaobookmark' }, 20)
  expect(again.items).toEqual([])
  expect(p.items.qipaobookmark).toBe(2)
})

test('自动纪念品只给一次：第一次坐地铁、登东方明珠', () => {
  const p = newLife()
  expect(recordLife(content, p, { type: 'auto', key: 'metro' }, 1).items).toEqual(['metrocard'])
  expect(recordLife(content, p, { type: 'auto', key: 'metro' }, 2).items).toEqual([])
  expect(p.items.metrocard).toBe(1)
  expect(recordLife(content, p, { type: 'auto', key: 'deck:orientalpearl' }, 3).items).toEqual(['pearlmodel'])
  expect(recordLife(content, p, { type: 'auto', key: 'deck:jinmao' }, 4).items).toEqual([])
})

test('文化图鉴：聊天（上海话、老克勒）、滤镜、拍到景点、文化牌各自解锁', () => {
  const p = newLife()
  expect(recordLife(content, p, { type: 'talk', speech: 'mandarin', npc: 'office' }, 1).culture).toEqual([])
  expect(recordLife(content, p, { type: 'talk', speech: 'wu', npc: 'uncle' }, 2).culture.sort()).toEqual(['huyu', 'longtang'])
  expect(recordLife(content, p, { type: 'talk', speech: 'wu', npc: 'klaoke' }, 3).culture).toEqual(['klaoke'])
  expect(recordLife(content, p, { type: 'photo', filter: 'yuefenpai', recognized: ['bund', 'peacehotel'], people: 0 }, 4).culture).toEqual(['yuefenpai', 'bundarch'])
  expect(recordLife(content, p, { type: 'photo', filter: 'original', recognized: ['huxinting'], people: 2 }, 5).culture).toEqual(['lantern'])
  expect(p.stats).toMatchObject({ talk: 3, photo: 2, groupPhoto: 1 })
  expect(recordLife(content, p, { type: 'plaque', culture: 'haipai' }, 6).culture).toEqual(['haipai'])
  expect(recordLife(content, p, { type: 'plaque', culture: 'haipai' }, 7).culture).toEqual([])
  expect(recordLife(content, p, { type: 'citywalk', route: 'wukang' }, 8).culture).toEqual(['citywalk'])
})

test('内容表自洽：商店卖的东西都存在、有价格；文化牌的景点、可买纪念品都有店卖', () => {
  const foods = new Set(content.foods.map((f) => f.id))
  const gifts = new Map(content.souvenirs.map((s) => [s.id, s]))
  for (const s of content.shops) for (const id of s.items) expect(foods.has(id) || gifts.get(id)?.price !== undefined, `${s.id}/${id}`).toBe(true)
  for (const s of content.souvenirs) if (s.price !== undefined) expect(content.shops.some((sh) => sh.items.includes(s.id)), s.id).toBe(true)
  for (const f of content.foods) expect(content.shops.some((sh) => sh.items.includes(f.id)), f.id).toBe(true)
})

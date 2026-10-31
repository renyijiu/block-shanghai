import { describe, expect, test } from 'vitest'
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
  expect(recordLife(content, p, { type: 'photo', filter: 'yuefenpai', recognized: ['bund', 'peacehotel'], people: 0, hour: 12, spot: null }, 4).culture).toEqual(['yuefenpai', 'bundarch'])
  expect(recordLife(content, p, { type: 'photo', filter: 'original', recognized: ['huxinting'], people: 2, hour: 19, spot: 'yuyuan' }, 5).culture).toEqual(['lantern'])
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

test('Citywalk：起点开始，按顺序打卡，走过头、回头都不算，走完记完成', async () => {
  const { walkStep } = await import('../src/engine/life/progress.ts')
  const p = newLife()
  expect(walkStep(p, 'wukang', 2, 4, 1)).toBeNull()
  expect(walkStep(p, 'wukang', 0, 4, 1)).toBe('start')
  expect(p.activeWalk).toBe('wukang')
  expect(walkStep(p, 'wukang', 0, 4, 2)).toBeNull()
  expect(walkStep(p, 'wukang', 2, 4, 3)).toBeNull()
  expect(walkStep(p, 'wukang', 1, 4, 4)).toBe('stop')
  expect(walkStep(p, 'wukang', 2, 4, 5)).toBe('stop')
  // 中途去走另一条，再回来接着走
  expect(walkStep(p, 'duolun', 0, 5, 6)).toBe('start')
  expect(p.activeWalk).toBe('duolun')
  expect(walkStep(p, 'wukang', 3, 4, 7)).toBe('done')
  expect(p.walks.wukang).toEqual({ next: 4, done: 7 })
  expect(walkStep(p, 'wukang', 0, 4, 8)).toBeNull()
})

test('Citywalk 路线：打卡点都在路线上，沿途咖啡馆有区域名', () => {
  for (const w of content.walks) {
    expect(w.stops.length).toBeGreaterThanOrEqual(3)
    for (const s of w.stops) {
      // 到折线各段的距离（米）
      const m = (lat: number, lon: number) => [(lon - s.lon) * 95000, (lat - s.lat) * 111000] as const
      const d = Math.min(
        ...w.path.slice(1).map((q, i) => {
          const [ax, ay] = m(...w.path[i]!)
          const [bx, by] = m(...q)
          const t = Math.max(0, Math.min(1, -(ax * (bx - ax) + ay * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2 || 1)))
          return Math.hypot(ax + (bx - ax) * t, ay + (by - ay) * t)
        })
      )
      expect(d, `${w.id}/${s.name}`).toBeLessThan(10)
    }
  }
  for (const s of content.shops) if ('lat' in s.at) expect(s.area).toBeTruthy()
})

test('拍照计数：拍到什么、夜景时段、站在哪个景点上拍的', () => {
  const p = newLife()
  recordLife(content, p, { type: 'photo', filter: 'original', recognized: ['shanghaitower', 'swfc'], people: 0, hour: 19, spot: 'ljzbridge' }, 1)
  expect(p.stats).toMatchObject({ 'shot:shanghaitower': 1, 'shot:shanghaitower:night': 1, 'shot@ljzbridge:swfc': 1 })
  recordLife(content, p, { type: 'photo', filter: 'original', recognized: ['orientalpearl'], people: 0, hour: 23, spot: null }, 2)
  expect(p.stats['shot:orientalpearl:night']).toBeUndefined()
})

describe('任务', async () => {
  const { goalProgress, rollDaily, updateQuests } = await import('../src/engine/life/quests.ts')
  const world = (shot: string[] = [], found: string[] = [], metroRides = 0) => ({ shot: (id: string) => shot.includes(id), found: (id: string) => found.includes(id), metroRides })
  const quests = content.quests

  test('新手任务按顺序：后面的步骤先做了也要等前面的做完', () => {
    const p = newLife()
    expect(updateQuests(quests, p, world([], [], 1), 1, '2026-10-31').advanced).toEqual([])
    const g = updateQuests(quests, p, world(['orientalpearl'], [], 1), 2, '2026-10-31')
    expect(g.advanced.map((q) => q.id)).toContain('novice')
    expect(p.quests.novice).toEqual({ step: 1 })
    // 吃了小笼包：第 2 步做完，坐过地铁的第 3 步也算上
    recordLife(content, p, { type: 'eat', food: 'xiaolongbao', shop: 'njxiaolong' }, 3)
    updateQuests(quests, p, world(['orientalpearl'], [], 1), 4, '2026-10-31')
    expect(p.quests.novice).toEqual({ step: 3 })
    recordLife(content, p, { type: 'auto', key: 'deck:shanghaitower' }, 5)
    const done = updateQuests(quests, p, world(['orientalpearl'], [], 1), 6, '2026-10-31')
    expect(done.completed.map((q) => q.id)).toContain('novice')
    expect(p.quests.novice).toEqual({ step: 4, done: 6 })
  })

  test('区域任务不分先后；完成一次以后不再重复发奖励', () => {
    const p = newLife()
    recordLife(content, p, { type: 'eat', food: 'shengjian', shop: 'yysnack' }, 1)
    const found = ['yuyuan', 'xintiandi', 'tianzifang']
    const g = updateQuests(quests, p, world([], found), 2, '2026-10-31')
    expect(g.completed.map((q) => q.id)).toContain('area-oldtown')
    expect(updateQuests(quests, p, world([], found), 3, '2026-10-31').completed.map((q) => q.id)).not.toContain('area-oldtown')
  })

  test('三件套要站在环形天桥上拍；几个计数器的目标按达到几个算进度', () => {
    const p = newLife()
    const goal = quests.find((q) => q.id === 'area-lujiazui')!.steps[0]!.goal
    recordLife(content, p, { type: 'photo', filter: 'original', recognized: ['shanghaitower', 'swfc', 'jinmao'], people: 0, hour: 12, spot: null }, 1)
    expect(goalProgress(goal, p, world())).toEqual([0, 3])
    recordLife(content, p, { type: 'photo', filter: 'original', recognized: ['shanghaitower', 'swfc'], people: 0, hour: 12, spot: 'ljzbridge' }, 2)
    expect(goalProgress(goal, p, world())).toEqual([2, 3])
  })

  test('每日生活任务：同一天挑同样的 3 个，从当天开始计数', () => {
    const p = newLife()
    p.stats.talk = 5
    const d = rollDaily(quests, p, '2026-10-31')
    expect(d.ids).toHaveLength(3)
    expect(new Set(d.ids).size).toBe(3)
    expect(rollDaily(quests, newLife(), '2026-10-31').ids).toEqual(d.ids)
    // 当天之前的聊天不算
    p.daily = { ...d, ids: ['daily-talk', 'daily-eat', 'daily-photo'] }
    expect(updateQuests(quests, p, world(), 1, '2026-10-31').completed).toEqual([])
    for (let i = 0; i < 3; i++) recordLife(content, p, { type: 'talk', speech: 'mandarin', npc: 'office' }, 2)
    expect(updateQuests(quests, p, world(), 3, '2026-10-31').completed.map((q) => q.id)).toEqual(['daily-talk'])
    // 第二天换一批
    expect(rollDaily(quests, p, '2026-11-01').done).toEqual([])
  })
})

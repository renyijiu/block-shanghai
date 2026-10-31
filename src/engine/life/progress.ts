// 生活进度（docs/05 第 5–7、11 节）：吃过的美食、背包里的纪念品、文化图鉴、咖啡地图、Citywalk、任务和计数器。
// 纯函数：事件来了更新进度、返回新得到的东西；存档里只存这份进度
import type { CultureDef, FoodDef, LifeContent } from '../city.ts'

export interface LifeProgress {
  /** 吃过的美食 → 第一次吃的游戏时间 */
  foods: Record<string, number>
  /** 背包：纪念品 → 数量 */
  items: Record<string, number>
  /** 解锁的文化图鉴 → 解锁时的游戏时间 */
  culture: Record<string, number>
  /** 去过（买过咖啡）的咖啡馆 → 游戏时间 */
  coffee: Record<string, number>
  /** Citywalk：路线 → 下一个打卡点序号，走完记完成时间 */
  walks: Record<string, { next: number; done?: number }>
  /** 正在走的 Citywalk（界面显示下一站） */
  activeWalk?: string
  /** 今天的每日生活任务：日期、挑中的任务、当天开始时的计数器、做完的 */
  daily?: { date: string; ids: string[]; base: Record<string, number>; done: string[] }
  /** 任务：任务 id → 当前步骤，完成记完成时间 */
  quests: Record<string, { step: number; done?: number }>
  /** 计数器：聊天次数、合影次数等 */
  stats: Record<string, number>
}

export const newLife = (): LifeProgress => ({ foods: {}, items: {}, culture: {}, coffee: {}, walks: {}, quests: {}, stats: {} })

/** 生活事件 */
export type LifeEvent =
  | { type: 'eat'; food: string; shop: string }
  | { type: 'buy'; item: string }
  | { type: 'auto'; key: string }
  | { type: 'talk'; speech: string; npc: string }
  | { type: 'photo'; filter: string; recognized: string[]; people: number; hour: number; spot: string | null }
  | { type: 'plaque'; culture: string }
  | { type: 'citywalk'; route: string }

export interface LifeGain {
  foods: string[]
  items: string[]
  culture: string[]
}

/** 某样美食现在卖不卖：季节限定按真实月份，早点按游戏时刻 */
export function foodAvailable(f: FoodDef, date: Date, hour: number) {
  if (f.months && !f.months.includes(date.getMonth() + 1)) return false
  if (f.hours && (hour < f.hours[0] || hour >= f.hours[1])) return false
  return true
}

/** 季节限定的说明：“3–4 月”“9–11 月”“早上 5–11 点” */
export function foodWhen(f: FoodDef) {
  const parts: string[] = []
  if (f.months) parts.push(`${f.months[0]}–${f.months[f.months.length - 1]} 月`)
  if (f.hours) parts.push(`${f.hours[0]}–${f.hours[1]} 点`)
  return parts.join('，')
}

/**
 * Citywalk 打卡：走到第 index 个打卡点（共 count 个）。起点开始一条路线；按顺序走到下一站算打卡，最后一站算走完。
 * 返回 'start' / 'stop' / 'done'，不算数（走过头、走回头路、已经走完）返回 null
 */
export function walkStep(p: LifeProgress, route: string, index: number, count: number, t: number): 'start' | 'stop' | 'done' | null {
  const w = p.walks[route]
  if (w?.done !== undefined) return null
  if (!w) {
    if (index !== 0) return null
    p.walks[route] = { next: 1 }
    p.activeWalk = route
    return 'start'
  }
  if (index !== w.next) return null
  p.activeWalk = route
  w.next++
  if (w.next < count) return 'stop'
  w.done = t
  delete p.activeWalk
  return 'done'
}

// 文化图鉴：这个事件能不能解锁它
function unlocks(c: CultureDef, e: LifeEvent, p: LifeProgress): boolean {
  const u = c.unlock
  if ('plaque' in u) return e.type === 'plaque' && e.culture === c.id
  if ('talk' in u) return e.type === 'talk' && (u.talk === e.npc || u.talk === e.speech)
  if ('filter' in u) return e.type === 'photo' && e.filter === u.filter
  if ('photo' in u) return e.type === 'photo' && e.recognized.includes(u.photo)
  if ('item' in u) return (p.items[u.item] ?? 0) > 0
  return e.type === 'citywalk'
}

/** 记一个生活事件，t 是游戏时间；返回第一次吃到的美食、新得到的纪念品、新解锁的文化图鉴 */
export function recordLife(content: LifeContent, p: LifeProgress, e: LifeEvent, t: number): LifeGain {
  const out: LifeGain = { foods: [], items: [], culture: [] }
  const give = (id: string) => {
    if (!p.items[id]) out.items.push(id)
    p.items[id] = (p.items[id] ?? 0) + 1
  }
  const count = (k: string) => (p.stats[k] = (p.stats[k] ?? 0) + 1)
  switch (e.type) {
    case 'eat':
      if (p.foods[e.food] === undefined) {
        p.foods[e.food] = t
        out.foods.push(e.food)
      }
      if (e.food === 'coffee' && p.coffee[e.shop] === undefined) p.coffee[e.shop] = t
      count('eat')
      count(`eat:${e.food}`)
      count(`eat@${e.shop}`)
      count(`eat:${e.food}@${e.shop}`)
      break
    case 'buy':
      give(e.item)
      break
    case 'auto':
      for (const s of content.souvenirs) if (s.auto === e.key && !p.items[s.id]) give(s.id)
      break
    case 'talk':
      count('talk')
      break
    case 'photo':
      count('photo')
      if (e.people > 0) count('groupPhoto')
      // 拍到了什么：夜景灯光时段（18:30–22:00）另记一笔；站在某个景点上拍的（环形天桥上拍三件套）也记
      for (const id of e.recognized) {
        count(`shot:${id}`)
        if (e.hour >= 18.5 && e.hour < 22) count(`shot:${id}:night`)
        if (e.spot) count(`shot@${e.spot}:${id}`)
      }
      break
    case 'plaque':
      count('plaque')
      break
  }
  for (const c of content.culture) {
    if (p.culture[c.id] !== undefined || !unlocks(c, e, p)) continue
    p.culture[c.id] = t
    out.culture.push(c.id)
  }
  return out
}

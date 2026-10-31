// 任务（docs/05 第 11 节）：新手任务按顺序一步一步做，区域、主题任务各步不分先后，每日生活任务每天按日期挑 3 个。
// 纯函数：拿生活进度和世界状态（拍到、发现过的景点，坐地铁次数）判断进度；完成的任务记在生活进度里
import type { QuestDef, QuestGoal } from '../city.ts'
import type { LifeProgress } from './progress.ts'

/** 判断任务用到的世界状态 */
export interface QuestWorld {
  shot(id: string): boolean
  found(id: string): boolean
  metroRides: number
}

/** 每日生活任务每天几个、每个奖励多少由任务表定 */
export const DAILY_COUNT = 3

/** 一个目标的进度：[已完成, 需要]；每日任务的计数器从当天开始算（base） */
export function goalProgress(g: QuestGoal, life: LifeProgress, w: QuestWorld, base: Record<string, number> = {}): [number, number] {
  if ('shot' in g) return [g.shot.filter((id) => w.shot(id)).length, g.shot.length]
  if ('found' in g) return [g.found.filter((id) => w.found(id)).length, g.found.length]
  if ('stat' in g) {
    const n = g.n ?? 1
    const keys = typeof g.stat === 'string' ? [g.stat] : g.stat
    const done = keys.map((k) => Math.min(n, (life.stats[k] ?? 0) - (base[k] ?? 0)))
    // 几个计数器都要达到：一个计数器显示次数，几个显示达到了几个
    return keys.length === 1 ? [Math.max(0, done[0]!), n] : [done.filter((d) => d >= n).length, keys.length]
  }
  if ('count' in g) {
    const have = { foods: Object.keys(life.foods).length, culture: Object.keys(life.culture).length, coffee: Object.keys(life.coffee).length, walks: Object.values(life.walks).filter((x) => x.done !== undefined).length }[g.count]
    return [Math.min(have, g.n), g.n]
  }
  if ('walk' in g) return [life.walks[g.walk]?.done !== undefined ? 1 : 0, 1]
  if ('culture' in g) return [life.culture[g.culture] !== undefined ? 1 : 0, 1]
  if ('item' in g) return [(life.items[g.item] ?? 0) > 0 ? 1 : 0, 1]
  return [Math.min(w.metroRides, g.metro), g.metro]
}

export const goalDone = (g: QuestGoal, life: LifeProgress, w: QuestWorld, base?: Record<string, number>) => {
  const [a, b] = goalProgress(g, life, w, base)
  return a >= b
}

/** 任务做到第几步（新手任务：按顺序做完的步数；其他：做完的步数） */
export function questStep(q: QuestDef, life: LifeProgress, w: QuestWorld) {
  if (q.kind === 'novice') {
    let i = 0
    while (i < q.steps.length && goalDone(q.steps[i]!.goal, life, w)) i++
    return i
  }
  return q.steps.filter((s) => goalDone(s.goal, life, w)).length
}

// 日期字符串的简单哈希（同一天挑出同样的每日任务）
function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/** 换了一天就重新挑每日生活任务，记下当天开始时的计数器 */
export function rollDaily(defs: QuestDef[], life: LifeProgress, date: string) {
  if (life.daily?.date === date) return life.daily
  const pool = defs.filter((q) => q.kind === 'daily')
  const ids: string[] = []
  let h = hash(date)
  while (ids.length < Math.min(DAILY_COUNT, pool.length)) {
    const q = pool[h % pool.length]!
    if (!ids.includes(q.id)) ids.push(q.id)
    h = Math.imul(h, 1103515245) + 12345
    h >>>= 0
  }
  life.daily = { date, ids, base: { ...life.stats }, done: [] }
  return life.daily
}

export interface QuestGain {
  /** 新完成的任务 */
  completed: QuestDef[]
  /** 往前推进了一步（还没完成）的任务 */
  advanced: QuestDef[]
}

/** 按当前进度更新任务：t 是游戏时间，date 是今天（每日任务） */
export function updateQuests(defs: QuestDef[], life: LifeProgress, w: QuestWorld, t: number, date: string): QuestGain {
  const out: QuestGain = { completed: [], advanced: [] }
  for (const q of defs) {
    if (q.kind === 'daily') continue
    const rec = life.quests[q.id]
    if (rec?.done !== undefined) continue
    const step = questStep(q, life, w)
    if (step === (rec?.step ?? 0)) continue
    if (step >= q.steps.length) {
      life.quests[q.id] = { step, done: t }
      out.completed.push(q)
    } else {
      life.quests[q.id] = { step }
      out.advanced.push(q)
    }
  }
  const daily = rollDaily(defs, life, date)
  for (const id of daily.ids) {
    const q = defs.find((d) => d.id === id)
    if (!q || daily.done.includes(id) || !q.steps.every((s) => goalDone(s.goal, life, w, daily.base))) continue
    daily.done.push(id)
    out.completed.push(q)
  }
  return out
}

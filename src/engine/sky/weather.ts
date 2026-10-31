// 天气与季节（docs/05 第 9 节）：季节按设备的真实日期，天气每 4 个游戏小时换一次，按季节的概率抽，
// 种子是真实日期 + 游戏日 + 时段，同一时刻每次算出来都一样。纯函数
export type Season = 'spring' | 'summer' | 'autumn' | 'winter'
export type WeatherKind = 'sunny' | 'cloudy' | 'rain' | 'plum' | 'typhoon' | 'snow' | 'fog'

export const SEASON_NAMES: Record<Season, string> = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' }
export const WEATHER_NAMES: Record<WeatherKind, string> = { sunny: '晴', cloudy: '多云', rain: '雨', plum: '梅雨', typhoon: '台风', snow: '雪', fog: '雾' }
export const WEATHER_ICONS: Record<WeatherKind, string> = { sunny: '☀️', cloudy: '⛅', rain: '🌧️', plum: '🌧️', typhoon: '🌀', snow: '❄️', fog: '🌫️' }

/** 季节：3–5 月春、6–8 月夏、9–11 月秋、12–2 月冬 */
export function seasonOf(d: Date): Season {
  const m = d.getMonth() + 1
  return m >= 3 && m <= 5 ? 'spring' : m >= 6 && m <= 8 ? 'summer' : m >= 9 && m <= 11 ? 'autumn' : 'winter'
}

/** 梅雨季：6 月 15 日到 7 月 10 日 */
export function isPlumSeason(d: Date) {
  const m = d.getMonth() + 1
  const day = d.getDate()
  return (m === 6 && day >= 15) || (m === 7 && day <= 10)
}

/** 某天的天气概率表 */
export function weatherTable(d: Date): [WeatherKind, number][] {
  const m = d.getMonth() + 1
  if (isPlumSeason(d)) return [['plum', 0.7], ['cloudy', 0.2], ['rain', 0.1]]
  switch (seasonOf(d)) {
    case 'spring':
      return [['sunny', 0.4], ['cloudy', 0.3], ['rain', 0.25], ['fog', 0.05]]
    case 'summer':
      // 台风只在 7–9 月
      return m >= 7 ? [['sunny', 0.45], ['cloudy', 0.25], ['rain', 0.2], ['typhoon', 0.1]] : [['sunny', 0.45], ['cloudy', 0.3], ['rain', 0.25]]
    case 'autumn':
      return m === 9 ? [['sunny', 0.45], ['cloudy', 0.3], ['rain', 0.17], ['typhoon', 0.08]] : [['sunny', 0.5], ['cloudy', 0.3], ['rain', 0.15], ['fog', 0.05]]
    default:
      return [['sunny', 0.35], ['cloudy', 0.3], ['rain', 0.2], ['snow', 0.08], ['fog', 0.07]]
  }
}

/** 天气多久换一次（游戏秒） */
export const WEATHER_PERIOD = 4 * 3600

const dateKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`

function hash(s: string) {
  let h = 2166136261
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  // 再搅一下，相邻时段的结果不要太像
  h ^= h >>> 13
  h = Math.imul(h, 0x5bd1e995)
  h ^= h >>> 15
  return (h >>> 0) / 4294967296
}

/** 真实日期 d、游戏时间 t（秒）时的天气 */
export function weatherAt(d: Date, t: number): WeatherKind {
  const period = Math.floor(t / WEATHER_PERIOD)
  const r = hash(`${dateKey(d)}#${period}`)
  let acc = 0
  const table = weatherTable(d)
  for (const [k, p] of table) {
    acc += p
    if (r < acc) return k
  }
  return table[table.length - 1]![0]
}

/** 天气的画面参数（0–1）：阴天程度、雨、雪、雾、风 */
export interface WeatherLook {
  cloud: number
  rain: number
  snow: number
  fog: number
  wind: number
}

export function lookOf(k: WeatherKind): WeatherLook {
  switch (k) {
    case 'sunny':
      return { cloud: 0, rain: 0, snow: 0, fog: 0, wind: 0 }
    case 'cloudy':
      return { cloud: 0.55, rain: 0, snow: 0, fog: 0.15, wind: 0.1 }
    case 'rain':
      return { cloud: 0.8, rain: 0.6, snow: 0, fog: 0.35, wind: 0.2 }
    case 'plum':
      return { cloud: 0.85, rain: 0.4, snow: 0, fog: 0.45, wind: 0.05 }
    case 'typhoon':
      return { cloud: 1, rain: 1, snow: 0, fog: 0.6, wind: 1 }
    case 'snow':
      return { cloud: 0.75, rain: 0, snow: 0.8, fog: 0.4, wind: 0.15 }
    case 'fog':
      return { cloud: 0.5, rain: 0, snow: 0, fog: 0.85, wind: 0 }
  }
}

/** 两组画面参数之间插值（天气切换时慢慢过渡） */
export function mixLook(a: WeatherLook, b: WeatherLook, f: number): WeatherLook {
  const m = (x: number, y: number) => x + (y - x) * f
  return { cloud: m(a.cloud, b.cloud), rain: m(a.rain, b.rain), snow: m(a.snow, b.snow), fog: m(a.fog, b.fog), wind: m(a.wind, b.wind) }
}

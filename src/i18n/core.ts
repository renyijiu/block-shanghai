// 语言核心（docs/06 P6 多语言），不依赖 Vue，引擎和界面共用。
// 中文是源文字，英文按中文原文查表，查不到就显示中文。语言在页面加载时定下来，切换语言会重新加载页面，
// 这样引擎建模时写进去的文字（站牌、船名、提示）和界面始终是同一种语言
import { EN_UI } from './en-ui.ts'

export type Locale = 'zh' | 'en'
const KEY = 'block-shanghai:locale'

function load(): Locale {
  // 单元测试（Node）里没有浏览器存储，默认中文
  if (!('document' in globalThis)) return 'zh'
  try {
    return localStorage.getItem(KEY) === 'en' ? 'en' : 'zh'
  } catch {
    return 'zh'
  }
}

export const LOCALE: Locale = load()
export const isEn = LOCALE === 'en'

/** 存下语言选择（下次加载生效） */
export function saveLocale(l: Locale) {
  try {
    localStorage.setItem(KEY, l)
  } catch {
    // 隐私模式下存不了，就只对这次有效
  }
}

const dict = new Map<string, string>(Object.entries(EN_UI))

/** 登记一批英文：中文原文 → 英文 */
export function addDict(d: Record<string, string>) {
  for (const [k, v] of Object.entries(d)) dict.set(k, v)
}

/** 中文原文 → 当前语言；vars 填 {名字} 占位 */
export function tr(zh: string, vars?: Record<string, string | number>): string {
  let s = isEn ? (dict.get(zh) ?? zh) : zh
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v))
  return s
}

/** 查得到英文吗（测试用：找漏翻的文字） */
export function hasEn(zh: string) {
  return dict.has(zh)
}

/**
 * 英文模式下把一份数据里所有能查到英文的字符串原地换掉（城市包的景点、美食、对白、船名……）。
 * 方言对白（带 gloss 的那句）原文保留，只翻 gloss，英文里也能看到上海话原句
 */
export function localize<T>(data: T): T {
  return isEn ? translateIn(data, (s) => dict.get(s)) : data
}

/** localize 的实现：按 lookup 原地替换字符串（方言原句不换） */
export function translateIn<T>(data: T, lookup: (zh: string) => string | undefined): T {
  const seen = new WeakSet<object>()
  const walk = (o: unknown) => {
    if (!o || typeof o !== 'object' || seen.has(o)) return
    seen.add(o)
    const rec = o as Record<string, unknown>
    const dialect = !Array.isArray(o) && typeof rec.gloss === 'string'
    for (const k of Object.keys(rec)) {
      const v = rec[k]
      if (typeof v === 'string') {
        if (dialect && k === 'text') continue
        const en = lookup(v)
        if (en !== undefined) rec[k] = en
      } else if (v && typeof v === 'object') walk(v)
    }
  }
  walk(data)
  return data
}

/** 自带英文名的东西（地铁站、地铁线路）：英文模式用 nameEn；站牌这类中英双语的地方不用它 */
export function nameOf(o: { name: string; nameEn?: string }) {
  return isEn && o.nameEn ? o.nameEn : o.name
}

/** 地铁线路的短名（线路色块上用）：“2号线”→“2”，“Line 2”→“2” */
export function lineShort(o: { name: string; nameEn?: string }) {
  return isEn && o.nameEn ? o.nameEn.replace(/^Line /, '') : o.name.replace('号线', '')
}

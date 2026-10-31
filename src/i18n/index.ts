// 界面语言（docs/06 P6 多语言）：Vue 组件用的入口，文字查表在 core.ts。
// 中文为源文字，英文按中文原文查表；切换语言会存下选择并重新加载页面
import { ref } from 'vue'
import { LOCALE, saveLocale, tr, type Locale } from './core.ts'

export type { Locale }
export { tr }
export const locale = ref<Locale>(LOCALE)
document.documentElement.lang = LOCALE === 'en' ? 'en' : 'zh-CN'

/** 换语言：存下来，重新加载页面（游戏会在页面关闭时存档） */
export function setLocale(l: Locale) {
  if (l === LOCALE) return
  saveLocale(l)
  location.reload()
}

/** 界面文字：中文原文 → 当前语言；vars 填 {名字} 占位 */
export const t = tr

/** “⛅ 多云 · 秋”这类用 · 和空格分开的短语，逐段翻译 */
export function tPhrase(text: string) {
  return LOCALE === 'en' ? text.split(' · ').map((seg) => seg.split(' ').map((w) => tr(w)).join(' ')).join(' · ') : text
}

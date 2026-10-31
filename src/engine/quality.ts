// 三档画质（docs/02 第 7 节）：视距、渲染分辨率上限、水面倒影、同屏路人数
import type { QualityLevel } from './state/save.ts'

export type { QualityLevel }

export interface QualityPreset {
  label: string
  /** 视距（格）：分块加载半径、雾、相机远裁剪面都跟着它 */
  viewDistance: number
  /** 渲染分辨率上限（设备像素比） */
  pixelRatio: number
  reflection: boolean
  /** 同屏路人数 */
  npcs: number
}

export const QUALITY_PRESETS: Record<QualityLevel, QualityPreset> = {
  low: { label: '低', viewDistance: 800, pixelRatio: 1, reflection: false, npcs: 22 },
  mid: { label: '中', viewDistance: 1050, pixelRatio: 1.5, reflection: false, npcs: 40 },
  high: { label: '高', viewDistance: 1300, pixelRatio: 2, reflection: true, npcs: 55 }
}

export const QUALITY_ORDER: QualityLevel[] = ['low', 'mid', 'high']

/** 默认画质：触屏设备（多半是手机）用低档，其余用中档 */
export function defaultQuality(): QualityLevel {
  return typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches ? 'low' : 'mid'
}

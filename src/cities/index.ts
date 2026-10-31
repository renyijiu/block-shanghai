// 城市包注册表。新增城市：在 src/cities/<id>/ 下实现同样的契约，再在这里登记
import type { CityPackage } from '../engine/city.ts'
import { addDict, localize } from '../i18n/core.ts'
import shanghai from './shanghai/index.ts'

export const CITIES = { shanghai } satisfies Record<string, CityPackage>
export const DEFAULT_CITY: keyof typeof CITIES = 'shanghai'

/** 取一个城市包：登记它的英文，英文模式下把包里的文字换成英文（只做一次） */
const ready = new Set<CityPackage>()
export function loadCity(id: keyof typeof CITIES): CityPackage {
  const city = CITIES[id]
  if (!ready.has(city)) {
    ready.add(city)
    if (city.en) addDict(city.en)
    const { config, spawns, buildings, landmarks, boats, buses, people, content } = city
    localize({ config, spawns, buildings, landmarks, boats, buses, people, content })
  }
  return city
}

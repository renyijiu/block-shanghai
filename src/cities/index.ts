// 城市包注册表。新增城市：在 src/cities/<id>/ 下实现同样的契约，再在这里登记
import type { CityConfig } from '../engine/city.ts'
import shanghai from './shanghai/config.ts'

export const CITIES = { shanghai } satisfies Record<string, CityConfig>
export const DEFAULT_CITY: keyof typeof CITIES = 'shanghai'

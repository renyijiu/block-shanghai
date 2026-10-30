// 城市包注册表。新增城市：在 src/cities/<id>/ 下实现同样的契约，再在这里登记
import shanghai from './shanghai/config.js'

export const CITIES = { shanghai }
export const DEFAULT_CITY = 'shanghai'

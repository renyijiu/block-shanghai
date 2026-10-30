// 上海城市包。数据文件按地址引用（?url），由引擎在运行时加载，不打进 JS 包
import type { CityPackage } from '../../engine/city.ts'
import { buildings } from './buildings.ts'
import config from './config.ts'
import world from './data/world.json?url'
import water from './data/water.json?url'
import parks from './data/parks.json?url'
import roads from './data/roads.json?url'
import districts from './data/districts.json?url'

export default {
  config,
  data: { world, water, parks, roads, districts },
  spawns: [{ id: 'peoplessquare', name: '人民广场', lat: 31.2304, lon: 121.4737 }],
  buildings
} satisfies CityPackage

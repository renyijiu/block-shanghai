// 上海城市包。数据文件按地址引用（?url），由引擎在运行时加载，不打进 JS 包
import type { CityPackage } from '../../engine/city.ts'
import { boats } from './boats.ts'
import { buildings, RESORT } from './buildings.ts'
import config from './config.ts'
import { buses } from './buses.ts'
import { content } from './content.ts'
import { en } from './en.ts'
import { landmarks } from './landmarks.ts'
import { people } from './people.ts'
import world from './data/world.json?url'
import water from './data/water.json?url'
import parks from './data/parks.json?url'
import roads from './data/roads.json?url'
import districts from './data/districts.json?url'
import metro from './data/metro.json?url'

export default {
  config,
  data: { world, water, parks, roads, districts, metro },
  // 人民广场北侧的绿地（原点在延安高架和南北高架的立交下面，不适合出生）
  spawns: [{ id: 'peoplessquare', name: '人民广场', lat: 31.2325, lon: 121.4712 }],
  buildings,
  landmarks,
  boats,
  buses,
  // 星愿湖烟火：湖面中心（按烘焙的水面数据取），每晚 20:30 起半小时（游戏时间，现实约一分半）
  // 度假区：环形河道里整片铺草坪、成片种树（住宅楼在 buildings.ts 里已经去掉）
  landscapes: [{ name: '上海国际旅游度假区', polygon: RESORT, lawn: 0x86b56e, treeSpacing: 12, treeDensity: 0.55 }],
  fireworks: [{ name: '星愿湖烟火', lat: 31.1415, lon: 121.6607, start: '20:30', minutes: 30, spread: 40 }],
  people,
  content,
  en
} satisfies CityPackage

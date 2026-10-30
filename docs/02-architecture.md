# 02 · 架构设计

## 1. 技术栈

| 项 | 选择 | 版本（锁定） |
| --- | --- | --- |
| UI 框架 | Vue 3（Composition API，`<script setup>`） | 3.5.44 |
| 3D 渲染 | Three.js `WebGPURenderer`（`three/webgpu`），不支持 WebGPU 时自动回退 WebGL 2；着色器和后处理用 TSL | 0.186.1 |
| 语言 | TypeScript（`vue-tsc` 做类型检查） | 6.0.3 / vue-tsc 3.3.14 |
| 构建 | Vite + @vitejs/plugin-vue | 8.3.4 / 6.0.10 |
| 运行环境 | Node 22.18+ / 24 / 26+（Vitest 5 要求；Node 直接运行 `tools/`、`bench/` 的 `.ts` 脚本） | — |
| 测试 | Vitest（纯函数模块） | 5.0.5 |
| 存储 | localStorage（存档）+ IndexedDB（照片） | — |

依赖用精确版本锁定，升级时手动改。

> 选型理由见 [07](./07-tech-selection.md)；2026-10-30 确认并完成迁移，记录见 [07 第 10 节](./07-tech-selection.md#10-迁移记录)。

## 2. 分层

```
┌──────────────────────────────────────────────┐
│ UI（Vue）  菜单、HUD、面板、移动端控制        │  只读写 store，调用 Game 的公开方法
├──────────────────────────────────────────────┤
│ engine/    与城市无关的引擎                   │  渲染循环、世界流式加载、玩家、交通、
│                                              │  摄影、NPC、天气、存档、任务结算
├──────────────────────────────────────────────┤
│ cities/<id>/  城市包                          │  配置 + 烘焙数据 + 景点建模 + 内容数据
├──────────────────────────────────────────────┤
│ tools/     离线数据烘焙（Node）               │  OSM → 投影 → 抽稀 → JSON
└──────────────────────────────────────────────┘
```

规则：

- `engine/` 不能 import `cities/` 里的任何东西，城市包由入口注入。
- 城市包不能修改引擎内部状态，只能通过契约里的钩子（建模函数的 `ctx`、任务事件等）交互。
- 投影只有一份实现（`engine/geo/projection.ts`），运行时和 `tools/` 共用（Node 直接运行 `.ts`，不需要编译步骤）。

## 3. 目录结构（目标）

```
block-shanghai/
├── index.html
├── vite.config.ts             Vite + Vitest 配置
├── tsconfig.json              引用 tsconfig.app.json（浏览器）和 tsconfig.node.json（Node）
├── docs/                      设计文档
├── bench/                     渲染基准（WebGPU / WebGL 对比，性能回归）
├── tests/                     单元测试（*.test.ts）
├── tools/                     数据烘焙脚本（fetch-osm.ts、bake-world.ts）
│   ├── lib/                   几何算法、海岸线、OSM 读取（有单元测试）
│   ├── preview/               烘焙数据的俯视预览页（开发用，/tools/preview/）
│   └── .cache/                OSM 原始数据缓存（不入库）
└── src/
    ├── main.ts
    ├── App.vue
    ├── style.css
    ├── components/            MiniMap / BigMap / DistrictToast / TouchControls / Menu / Panels / MetroMap …
    ├── engine/
    │   ├── Game.ts            主循环、系统调度
    │   ├── city.ts            城市包契约（类型）
    │   ├── geo/               projection、碰撞世界（CollisionWorld）
    │   ├── map/               2D 地图绘制（小地图、大地图、俯视预览共用）
    │   ├── world/             分块（chunks.ts）、烘焙数据格式（data.ts）、地面、水面、道路、高架、分块管理
    │   ├── build/             Builder（方块合并网格 + 碰撞登记）、通用构件
    │   ├── actors/            玩家、角色皮肤、NPC
    │   ├── metro/             地铁：数据格式、线网与路线规划、时刻表、轨道和车站建模、列车
    │   ├── landmarks/         LandmarkManager：景点按距离加载、远近两档细节、发现检测
    │   ├── transport/         巴士、船、电梯
    │   ├── interior/          独立室内场景（地铁站、车厢）
    │   ├── photo/             摄影、滤镜、景点识别
    │   ├── sky/               昼夜、天气、季节
    │   ├── state/             存档（save.ts）、store、事件与任务结算
    │   ├── quality.ts         三档画质
    │   └── debug.ts           调试面板（?debug=1 按需加载）
    └── cities/
        ├── index.ts           城市注册表
        └── shanghai/
            ├── config.ts      投影、尺度、区划、OSM 范围
            ├── data/          烘焙产物（water / roads / parks / districts / metro）
            ├── landmarks.ts   景点定义和建模（景点多了再按区拆成目录）
            ├── content.ts     美食、文化、纪念品、商店、任务、对白
            └── strings.ts     UI 文案
```

目录按路线图逐步加入，以仓库实际内容为准。

## 4. 城市包契约

一个城市包需要提供下面这些东西。字段先按上海的需要定，第二个城市接入时再调整。类型定义在 `src/engine/city.ts`，城市配置用 `satisfies CityConfig` 检查。

```js
// cities/<id>/index.ts（P1 起）
export default {
  config,        // 见下
  data: {        // 烘焙产物，可按需动态 import
    water, roads, parks, districts, metro
  },
  buildings,     // 程序化建筑：mixAt(place) 风格权重、styles 各风格的建模函数、treeMixAt / trees 行道树（P1 起）
  landmarks,     // 景点定义数组
  content,       // 美食 / 文化 / 纪念品 / 商店 / 任务 / 对白
  strings,       // UI 文案
  spawns         // 出生点
}
```

### config

| 字段 | 说明 |
| --- | --- |
| `id` `name` `nameEn` | 城市标识与名称 |
| `projection` | `origin`（WGS-84）、`unitsPerKm`、`coreRadiusKm`、`outerCompress` |
| `scale` | 地图、建筑高度、人物三套尺度（见 [03](./03-coordinates-and-data.md)） |
| `osm.bbox` | 烘焙范围 `[south, west, north, east]` |
| `districts` | `{ id: { name, color, theme } }` |
| `buildingProfiles`（P1） | 区域 → 建筑画像规则（见 [05](./05-shanghai-content.md)） |
| `streetTrees`（P1） | 行道树种类和比例 |
| `weather`（P5） | 各天气概率、季节事件 |
| `photoFilters`（P3） | 滤镜 id → 名称、参数 |

### 景点定义

类型是 `src/engine/city.ts` 的 `LandmarkDef`，上海的定义在 `src/cities/shanghai/landmarks.ts`（P3）。

```js
{
  id: 'orientalpearl',
  name: '东方明珠',
  district: 'pudong',
  grade: 'S',                    // S 高度还原 / A 主要建筑 / B 区域氛围
  lat: 31.2419, lon: 121.49527,  // 锚点（WGS-84），取 OSM 建筑轮廓中心或关键点
  rot: 0,                        // 局部 x 轴的朝向（弧度，atan2(dz, dx)）
  rect: [-16, -16, 16, 16],      // 占地范围（局部坐标 x0, z0, x1, z1），发现检测和远近细节按它算
  footprint: [[...]],            // 程序化建筑和行道树的避让范围，可分几块；默认就是 rect
  focusY: 100,                   // 拍照识别时的瞄准高度
  photoR: 1300,                  // 可被拍到的最大距离（格）
  loadR: 2600,                   // 加载半径，默认 900；超高层要远处也能看到
  subs: [{ id, name, x, y, z }], // 可单独识别的子景点（外滩的海关大楼、和平饭店等），局部坐标
  build: (c) => {},              // 建模，c 是 LandmarkContext（见下）
  desc: '', tip: ''
}
```

`build` 拿到的 `LandmarkContext` 都用局部坐标：`box` / `slab`（可绕中心扭转，上海中心的扭转塔身）/ `ball` / `column` 拼方块，选项 `light` 是夜景灯（18:30–22:00 发光）、`glass` 进玻璃网格、`collide` 控制碰撞；`platform` 登记可站立的平台（水面上也能走：九曲桥、外白渡桥、观光层）；`elevator` 登记观光电梯的上下两个交互点；`local(lat, lon)` 把 OSM 坐标换成局部坐标，用来摆附属建筑。

远近细节不用单独写简模：`LandmarkManager` 建模时同时收集最长边 ≥ 3 格的构件做远景网格，相机离占地 450 格以外只画它。玩家走到占地 30 格以内算“发现”，记进存档。

### 内容数据

任务条件统一写成 `{ type, ... }`，由引擎的事件计数器结算。地铁新增的事件类型见 [04](./04-metro-system.md#8-第-4-层收集与任务)。

## 5. 运行时系统

| 系统 | 职责 | 每帧调用 |
| --- | --- | --- |
| `Game` | 主循环、系统调度、场景切换（城市 ↔ 室内） | ✅ |
| `ChunkManager` | 按玩家位置加载/卸载 240×240 格分块：地面、建筑、行道树、地铁口、高架段。每个分块的公园、水面、地面道路、高架各合并成一个网格（`world/chunkMesh.ts`，纯函数） | ✅（有时间预算） |
| `LandmarkManager` | 景点按距离加载、LOD、发现检测 | ✅ |
| `InteractRegistry` | 交互点，按 owner 增删；分块和景点卸载时一并清理（`world/interact.ts`，P2 起地铁口） | 查询 |
| `CollisionWorld` | 碰撞盒和可站立平台，按 owner 增删。斜放的方块带 `obb`，查询时按实际朝向判断；`deck` 平台在水面上也能走 | 查询 |
| `Player` | 移动、跳跃、骑乘、第一/第三人称、脚本动画（电梯等）。`actors/Input` 把键鼠和触屏统一成一份输入状态，`actors/CameraRig` 管跟随相机（撞墙拉近，碰撞盒带 `soft` 的只挡相机） | ✅ |
| `NPCManager` | 路人生成、行为、人群区域、对白 | ✅ |
| `Transport` | 巴士、渡轮、游船、观光车、电梯 | ✅ |
| `MetroSystem` | 线网、路线规划、按时刻表算列车位置（`metro/MetroSystem.ts`）；`TrainRenderer` 负责高架列车渲染（`metro/trains.ts`）；乘车流程（P4） | ✅ |
| `InteriorManager` | 站厅、站台、车厢等独立场景的构建与切换 | 在室内时 |
| `PhotoSystem` | 滤镜后处理、景点识别、存相册 | 拍照时 |
| `Sky` | 昼夜、天气、季节、夜间材质 | ✅ |
| `store` | 响应式 UI 状态 + 存档 + 事件 → 任务结算 | — |

### 场景切换

城市是一个 `THREE.Scene`；站内、车厢是另外的 `Scene`。切换时用淡入淡出遮住，`Game` 只换当前渲染的场景和相机，城市场景停止更新但不销毁。好处是不用在地形里挖洞，地面实心、碰撞默认 y ≥ 0 的假设都不受影响。

### 流式加载

所有带位置的静态对象（建筑、行道树、地铁口、高架段、高架站、交互点）都按分块编入空间索引，分块加载时一起生成、卸载时一起销毁。不能开局一次性建全城：上海全网有几百个车站、近 1500 个出入口。

每帧建块的时间预算约 6ms；出生和传送时用加载进度条预建周围分块。

## 6. 存档

实现：`src/engine/state/save.ts`（不依赖浏览器 API，有单元测试）。

- key：`block-shanghai:save:v<schema>`，存档里记着城市 id，换城市不读。结构变化时提升 `SAVE_SCHEMA` 并在 `MIGRATIONS` 里写迁移函数；读档时找不到当前版本，就从新到旧找旧版本、逐级迁移后写回新 key。坏档、字段不全一律当没有存档。
- 时机：每 10 秒、切走页面（`visibilitychange`）、关闭页面（`pagehide`）自动存；测试参数（`?cam` / `?walk` / `?start`）下不读不写。
- P1 已存：位置、朝向、相机（朝向、俯仰、距离、视角）、画质。P2（v2）加游戏时间、钱包、地铁统计；P3（v3）加景点图鉴 `codex`：发现过的景点（发现时的游戏时间）、拍到过的景点和子景点（第一张照片的 id）。
- 内容：角色外观、金钱、位置、已发现景点、图鉴、背包、任务进度、统计（步行距离、乘车次数、到访车站等）、设置。
- 照片存 IndexedDB，存档里只存照片 id。

## 7. 性能预算（中档画质，桌面集显）

| 指标 | 目标 |
| --- | --- |
| 帧率 | ≥ 50 fps |
| Draw call | 目标 ≤ 600；硬上限 1000（再多 WebGPURenderer 的单物体开销会拖垮帧率，见 [07 第 4.3 节](./07-tech-selection.md#43-实测本仓库-bench)） |
| 视距 | 低 800 / 中 1050 / 高 1300 格（`src/engine/quality.ts`，同时调渲染分辨率上限 1 / 1.5 / 2 和水面倒影；触屏设备默认低档） |
| 同屏 NPC | 低 22 / 中 40 / 高 55 |
| 同屏渲染列车 | ≤ 12 列 |
| 首次进入加载 | ≤ 5 秒 |

手段：静态方块按材质合并网格——每个分块的建筑和行道树合并成一个网格、玻璃幕墙一个、高架（含桥墩）一个，合并比 InstancedMesh 的 draw call 更少；跨分块共享、数量大的构件（如以后的地铁口）再考虑 InstancedMesh / BatchedMesh；远处景点用 LOD 简模；倒影和阴影随画质开关。

## 8. 代码约定

- TypeScript `strict` 模式，ES Modules，2 空格缩进，不写分号。`npm run typecheck` 必须通过。
- 只写 Node 能直接擦除的语法（tsconfig 开了 `erasableSyntaxOnly`、`verbatimModuleSyntax`）：相对导入写 `.ts` 扩展名，类型导入写 `import type`，不用 `enum` / `namespace` / 构造函数参数属性。这样 `tools/`、`bench/` 的脚本能用 `node xxx.ts` 直接运行。
- 渲染只用 `three/webgpu`：自定义着色器和后处理写 TSL，不用 `ShaderMaterial` / `onBeforeCompile` / `EffectComposer`（WebGPURenderer 不支持）。
- 注释用中文，只写“为什么”和不明显的约定。
- 坐标一律注明是经纬度（WGS-84）还是游戏坐标（格）。
- 纯函数模块（投影、空间索引、路线规划、票价、时刻表）必须有单元测试（Vitest）：`npm test`。

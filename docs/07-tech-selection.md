# 07 · 技术选型调研

> 调研日期：2026-10-30
> 状态：**已确认**（2026-10-30），已按第 10 节完成迁移，[02](./02-architecture.md) 的技术栈表已同步。

参考项目用的是 Vue 3 + Three.js（WebGLRenderer）+ Vite。本文重新评估每一层：有没有更合适的新框架，现有选择要不要升级。

## 1. 什么在决定选型

| 需求 | 对选型的影响 |
| --- | --- |
| 纯前端、静态托管、打开即玩 | 首包要小，排除需要下载几十 MB WASM 的引擎 |
| 手机是主要平台（iOS Safari、安卓 Chrome、**微信内置浏览器**） | WebGPU 不是到处都有，必须有可靠的 WebGL 2 兜底 |
| 世界是**程序化生成的方块建筑**，不是可编辑的体素世界 | 不需要体素引擎（区块存储、贪心网格化），要的是高效合并网格和实例化 |
| 大世界流式加载，几百个分块 | 每帧建块有时间预算，生成逻辑要能挪进 Web Worker |
| 大量 HTML 界面（地图、图鉴、线路图、商店、任务） | UI 用成熟的 Web 框架，3D 只负责画面 |
| 离线 OSM 数据管线 | 工具链在 Node 里，和前端共用投影代码 |
| 一个人或小团队，大量借助 AI 写代码 | 生态大、资料多、API 稳定的库更省事 |

## 2. 结论速览

| 层 | 选择 | 版本 | 相对迁移前 |
| --- | --- | --- | --- |
| 渲染 | **Three.js `WebGPURenderer`** + TSL 着色器，自动回退 WebGL 2 | 0.186.1 | 改：WebGLRenderer → WebGPURenderer |
| UI | **Vue 3.5**（只做界面，不管 3D） | 3.5.44 | 不变 |
| 语言 | **TypeScript 6.0**（暂不用 7.0） | 6.0.3 | 新增 |
| 构建 | Vite 8 | 8.3.4 | 不变 |
| 测试 | **Vitest** | 5.0.5 | 改：node:test → Vitest |
| 运行环境 | Node 22.18+ / 24 / 26+ | — | 改：≥ 20.19 → 22.18+（Vitest 5 要求；Node 可直接运行 `.ts`） |
| 碰撞 | 自写 AABB 网格碰撞；需要时再引入 Rapier | — | — |
| 实体管理 | 不用 ECS，按系统类管理 | — | — |
| 后处理 / 滤镜 | Three.js 自带的 TSL 后处理 | — | — |
| 调试 | lil-gui（参数面板）+ stats-gl（性能面板）+ 本仓库 `bench/` | 0.21 / 4.2 | 新增（`bench/` 已有；lil-gui、stats-gl 到 P1 需要调参时再装） |
| 地图数据 | **Geofabrik 上海 + 江苏提取包 + osmium-tool**；Overpass 只做补充 | osmium 1.19 | 改：Overpass → 本地提取包 |

## 3. 渲染引擎对比

npm 活跃度为过去 12 个月的发版次数（2026-10-30 查询）。

| 方案 | 定位 | WebGPU | 适配本项目 | 结论 |
| --- | --- | --- | --- | --- |
| **Three.js** 0.186.1（锁定；0.187.0 于 2026-10-30 发布，升级时重跑 `bench/` 对比） | 渲染库，自己搭游戏系统 | `three/webgpu`，自动回退 WebGL 2 | 程序化几何最灵活；生态和示例最多；参考项目的思路可以直接对应 | ✅ 采用 |
| Babylon.js 9.33（139 次发版） | 完整引擎：物理、GUI、Inspector、导航网格、Frame Graph、集群光照 | 成熟 | 能力全面，但大部分内置功能（GUI、编辑器、物理）用不上；包更大；程序化方块场景的资料和示例比 Three.js 少 | 备选 |
| PlayCanvas 2.23 | 引擎 + 云端编辑器 | 有 | 优势在编辑器工作流和高斯泼溅；我们几乎全靠代码生成场景，用不上编辑器 | ❌ |
| Godot 4 Web 导出 | 完整游戏引擎（GDScript） | 官方 Web 版仍只有 WebGL 2（WebGPU 只有第三方分支） | WASM 包大、首次加载慢；HTML 界面、IndexedDB 等要绕路 | ❌ |
| Bevy（Rust → WASM） | ECS 游戏引擎 | 有 | 还没到 1.0，API 常变；Rust 编译慢、WASM 包大；UI 不成熟 | ❌ |
| R3F（React）/ TresJS 5（Vue）/ Threlte 8（Svelte） | Three.js 的声明式封装 | 跟随 Three.js | 适合模型展示和产品页；我们的世界是命令式流式生成的，几千个合并网格不适合放进组件树，只会多一层开销 | ❌（核心不用；小型 3D 界面组件可以考虑 TresJS） |
| 体素引擎（noa-engine 等） | 可编辑方块世界 | — | 我们不需要可编辑体素；noa-engine 自 2023 年后没有发版 | ❌ |

## 4. WebGPU 还是 WebGL

### 4.1 浏览器支持（gpuweb 实现状态页）

| 浏览器 | WebGPU |
| --- | --- |
| Chrome / Edge 桌面版 | ✅ Mac、Windows、ChromeOS（113 起） |
| Chrome Android | ✅ Android 12+，高通 / ARM / Intel GPU（121 起）；其他 GPU 待定 |
| Safari | ✅ macOS / iOS / iPadOS 26 起 |
| Firefox | ✅ Windows（141 起）、macOS（147 起）；Linux、Android 还没正式开启 |
| 微信内置浏览器 | **未知，需实测**，按不支持准备 |

结论：主流新设备大多支持，但 iOS 26 以下、部分安卓、微信内置浏览器很可能走 WebGL 2。**WebGL 2 兜底必须做好，并且要实测。**

### 4.2 Three.js 的 WebGPURenderer 现状

官方手册的说法：

- 仍处于实验状态，但最近几年成熟度大幅提升；个别场景可能缺功能，或者性能不如 WebGLRenderer。
- 默认用 WebGPU，不支持时**自动回退 WebGL 2**。
- **不支持** `ShaderMaterial`、`RawShaderMaterial`、`onBeforeCompile`，自定义着色器要用 TSL（用 JS 写，编译成 WGSL 或 GLSL）。
- **不支持** `EffectComposer`，后处理改用新的节点式后处理。
- 初始化是异步的，要 `await renderer.init()` 或用 `setAnimationLoop`。

我们从零开始，没有旧着色器要迁移，这些限制基本没有成本。

### 4.3 实测（本仓库 `bench/`）

**测试条件**：Apple M1 Max · Chrome 156 无头模式（真实 GPU，Metal）· 1280×713 · 像素比 1 · 关闭垂直同步和帧率上限 · 开阴影（2048 阴影贴图）· 相机绕城一圈采样 8 秒。

场景是程序化方块城市：每个 240 格分块合并成 2 个网格（墙体、玻璃），树用 InstancedMesh。

| 场景 | 渲染路径 | draw calls | 三角形 | fps | p95 帧时间 | 首帧 |
| --- | --- | --- | --- | --- | --- | --- |
| 15×15 分块（5.5 万个方块），合并网格 | WebGPU | 292 | 0.58M | **1373** | 1.1 ms | 64 ms |
| | WebGPURenderer 回退 WebGL 2 | 292 | 0.58M | 469 | 3.7 ms | 99 ms |
| | WebGLRenderer | 291 | 0.58M | 580 | 3.1 ms | 90 ms |
| 30×30 分块（22 万个方块），合并网格 | WebGPU | 523 | 1.37M | **607** | 2.2 ms | 95 ms |
| | WebGPURenderer 回退 WebGL 2 | 524 | 1.37M | 331 | 4.8 ms | 101 ms |
| | WebGLRenderer | 523 | 1.37M | 413 | 3.9 ms | 67 ms |
| 15×15 分块，**不合并**（约 2 万个独立网格） | WebGPU | 19877 | 0.50M | 10.3 | 116 ms | 1279 ms |
| | WebGPURenderer 回退 WebGL 2 | 19880 | 0.50M | 8.8 | 133 ms | 697 ms |
| | WebGLRenderer | 19880 | 0.50M | **18.9** | 68 ms | 371 ms |

压缩包体积（只引入渲染器 + 几个基础类，Vite 打包）：WebGLRenderer 约 127 KB gzip，WebGPURenderer 约 206 KB gzip，多出约 80 KB。

**解读**：

1. **按我们的架构（分块合并网格）**，WebGPU 比 WebGL 快 1.5–2.4 倍。
2. **物体一多就反过来**：两万个独立网格时，WebGPURenderer 的单个物体 CPU 开销明显更高，帧率只有 WebGLRenderer 的一半，首帧也慢（要为每个物体建管线和绑定）。→ **硬性约定：静态物体必须合并，重复物体必须 InstancedMesh / BatchedMesh**，同屏 draw call 中档画质目标 ≤ 600、任何画质都不超过 1000（即 [02 第 7 节](./02-architecture.md#7-性能预算中档画质桌面集显)的性能预算）。
3. WebGPURenderer 回退 WebGL 2 时比原生 WebGLRenderer 慢约 20%。不支持 WebGPU 的设备会吃这个亏，可以接受，但要在真机上确认够用。
4. 只测了一台高端 Mac，**手机才是瓶颈**，结论要在真机上复核（见下）。

### 4.4 决定

- 采用 `WebGPURenderer`，着色器和后处理全部用 TSL。
- **P1 设一个检查点**：在 iPhone（iOS 26，WebGPU）、iPhone（iOS 18，WebGL 2 回退）、中端安卓、微信内置浏览器上跑 `bench/`。如果 WebGL 2 回退在中端机上达不到 30 fps，再评估“WebGPU 设备用 WebGPURenderer、其余用 WebGLRenderer”的双渲染器方案（代价是着色器要写两份）。
- 手机测法：`npm run dev`（已开启局域网访问），手机打开 `http://<电脑 IP>:5173/bench/`，结果显示在页面左上角。

## 5. UI 框架

| 方案 | 评价 |
| --- | --- |
| **Vue 3.5** | 模板直观，响应式适合 HUD 和面板；参考项目也是 Vue；生态成熟。✅ 保持 |
| Vue 3.6（RC） | Vapor 模式（无虚拟 DOM）能减少 UI 开销，等正式版再评估 |
| React 19 | 生态最大；但我们不用 R3F，React 的优势用不上，HUD 高频更新还要额外注意重渲染 |
| Svelte 5 | 运行时小、性能好；生态和资料比 Vue、React 少 |
| Solid | 细粒度响应式性能最好；生态最小 |

**引擎和 UI 的边界**：引擎不依赖 Vue。引擎维护一个与框架无关的状态对象并按 5 Hz 发出更新，Vue 层把它包成响应式数据；UI 通过 `Game` 的公开方法发指令。将来换 UI 框架不影响引擎。

## 6. 语言与工具链

- **TypeScript**：城市包契约、`metro.json`、存档结构都是复杂数据结构，类型能挡掉大量错误，对 AI 生成代码尤其有用。现在代码只有几百行，迁移成本最低。
  - **用 6.0，不用 7.0**：TypeScript 7.0（2026-07 发布，Go 原生实现）还没有供 vue-tsc / Volar 调用的编译器 API，Vue 项目普遍建议暂留 6.0；据报道 7.1 会补上插件接口，届时再升级。
- **Vite 8**：保持。
- **Vitest 5**：和 Vite 共用配置和转换，测 TS 方便。替换 `node:test`。
- **lil-gui + stats-gl**：开发期调参数、看性能（stats-gl 支持 WebGPU）。
- **`bench/`**：本次写的渲染基准，保留下来做性能回归测试。

## 7. 游戏系统用的库

| 需求 | 建议 | 理由 |
| --- | --- | --- |
| 碰撞 | 自写 AABB + 网格空间索引 | 世界全是轴对齐方块，自写最简单；参考项目也是这么做的 |
| 物理引擎 | 先不用；需要时选 Rapier（0.21）或 Jolt（1.1） | 角色控制器、车辆有需要时再引入，二者都是 WASM，会增加首包体积 |
| ECS | 不用 | NPC ≤ 55、车 ≤ 30、列车 ≤ 12，规模小；按系统类管理就够 |
| 分块生成 | 写成纯函数（数据进、TypedArray 出），先在主线程跑，超预算再挪进 Web Worker | 实测 225 个分块的简单方块城市生成约 90 ms；真实分块细节更多，P1 再量 |
| 后处理 / 拍照滤镜 | Three.js 的 TSL 后处理 | pmndrs `postprocessing` 只支持 WebGL，不能用 |
| 音频 | Web Audio（Three.js 的 Audio 封装） | 报站、环境音，P4 以后 |

## 8. 数据管线

| 方案 | 评价 |
| --- | --- |
| **Geofabrik 上海 + 江苏提取包** | 上海 `asia/china/shanghai-latest.osm.pbf` 约 25 MB，江苏 `asia/china/jiangsu-latest.osm.pbf` 约 76 MB，每天更新。上海包按市界切割，不含 11 号线昆山段（兆丰路、光明路、花桥），所以要合并江苏包再按 bbox 裁剪，比下载全国包（1.5 GB）小得多。下载一次本地反复烘焙，稳定 ✅ |
| **osmium-tool 1.19**（`brew install osmium-tool`） | C++ 命令行工具，按标签过滤、导出 GeoJSON（自动组装多边形）、导出保留成员顺序的线路关系。持续维护 ✅ |
| Overpass API | 小范围临时查询方便，但公共服务器经常 504（本次调研也遇到了），只做补充 |
| JS 的 PBF 解析库（osm-pbf-parser、osm-read 等） | 多年没有更新，不用 |
| DuckDB 空间扩展（`@duckdb/node-api`） | 能用 SQL 直接读 PBF，很有意思，但 Node 包还是 RC，先不用 |
| Turf 7.4 / earcut 3.2 | 抽稀、面积计算 / 多边形三角化，烘焙时用 |

管线：`osmium merge` 合并上海、江苏包 → `osmium extract --bbox` 按 `config.osm.bbox` 裁剪 → `osmium tags-filter` 按图层切出小文件 → `osmium export` 成 GeoJSON（水系、道路、公园、区界）或 OSM XML（地铁线路，保留成员顺序）→ Node 脚本投影、抽稀、分块索引 → JSON。

## 9. 部署

静态托管即可。但**主要玩家在国内**：GitHub Pages、Vercel、Cloudflare Pages 在大陆的访问速度和稳定性都没有保障；国内对象存储 + CDN（阿里云 OSS、腾讯云 COS）速度好，但绑定自定义域名需要 ICP 备案。

**P6 的准备（托管位置仍待定）**：

- `npm run build` 的产物 `dist/` 约 8 MB（最大的是道路数据 4.9 MB，开 gzip 后小很多），全部用相对路径，放在任意静态托管的根目录或子路径下都能用（已在本地静态服务器的子路径下验证）。
- GitHub Pages：`.github/workflows/pages.yml` 只能手动触发（推送代码不会自动发布）。仓库 Settings → Pages 的 Source 选“GitHub Actions”，再到 Actions 页面运行“部署到 GitHub Pages”。
- 国内对象存储：把 `dist/` 整个上传到存储桶，首页设成 `index.html`，开启 gzip / Brotli；`assets/` 下的文件名带内容哈希，可以设长缓存，`index.html` 和 `manifest.webmanifest` 设不缓存。绑定自定义域名需要 ICP 备案。
- 定下来以后在 06 的“已定事项”里记一笔。

## 10. 迁移记录

2026-10-30 完成：

1. ✅ 加 TypeScript 6.0.3、vue-tsc 3.3.14、`@types/three` 0.186.0、`@types/node` 22；全部源码改 `.ts`。`npm run typecheck`（`vue-tsc --build`）同时检查浏览器端（`tsconfig.app.json`）和 Node 端（`tsconfig.node.json`）；`npm run build` 先做类型检查再打包
2. ✅ `node:test` 换 Vitest 5.0.5，配置合在 `vite.config.ts` 里
3. ✅ `Game.ts` 改用 `three/webgpu` 的 `WebGPURenderer` 和 `setAnimationLoop`，HUD 显示当前后端（WebGPU / WebGL 2）
4. ✅ `bench/` 改成 TS：页面脚本由 Vite 转译，驱动脚本 `run-bench.ts` 由 Node 直接运行（`npm run bench`，原来就有这个命令）
5. ✅ 更新 02 的技术栈表和 README

迁移时新增的约定：

- **Node 要求提到 22.18+ / 24 / 26+**。Vitest 5 本身要求 Node 22.12+；22.18 起 Node 默认能直接运行 `.ts`（类型擦除），`tools/` 的烘焙脚本可以直接 import `src/engine/geo/projection.ts`，不需要额外的编译步骤或 tsx 之类的工具。
- 为此 tsconfig 开了 `erasableSyntaxOnly`、`verbatimModuleSyntax`、`allowImportingTsExtensions`：相对导入写 `.ts` 扩展名，类型导入写 `import type`，不用 enum / namespace（见 [02 第 8 节](./02-architecture.md#8-代码约定)）。
- OrbitControls 等 addons 从 `three` 导入核心类，和 `three/webgpu` 共用同一份 three.core，不会重复打包；打包产物里也没有 WebGLRenderer。

迁移后的验证：

- 类型检查通过，9 个单元测试通过
- 无头 Chrome（M1 Max）打开主页面：WebGPU 正常渲染、无报错；屏蔽 `navigator.gpu` 后回退到 WebGL 2，画面一致
- `bench/` 15×15 分块：WebGPU 1336 fps / 回退 449 fps / WebGLRenderer 541 fps，与第 4.3 节的数据一致（差几个百分点）
- P0 预览整包 875 KB（gzip 245 KB，含 Vue 和 OrbitControls）

## 11. 参考来源

- [three.js 手册：WebGPURenderer](https://threejs.org/manual/pages/webgpurenderer.html)
- [three.js 文档：WebGPURenderer](https://threejs.org/docs/pages/WebGPURenderer.html)
- [WebGPU 实现状态（gpuweb wiki）](https://github.com/gpuweb/gpuweb/wiki/implementation-status)
- [web.dev：WebGPU is now supported in major browsers](https://web.dev/blog/webgpu-supported-major-browsers)
- [Announcing Babylon.js 9.0](https://blogs.windows.com/windowsdeveloper/2026/03/26/announcing-babylon-js-9-0)
- [Goodbye vue-tsc? TypeScript 7 content mappers](https://alexop.dev/posts/goodbye-vue-tsc-typescript-7-content-mappers/)
- [Upgrade to TypeScript 7](https://blog.openreplay.com/upgrade-typescript-7/)
- [Geofabrik：China 提取包](https://download.geofabrik.de/asia/china.html)
- npm 版本与发版记录：2026-10-30 用 `npm view` 查询

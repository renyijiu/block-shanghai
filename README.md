# 方块上海 · Block Shanghai

> 方块风格的上海城市漫游：在真实形状的上海里散步、拍照收集景点、坐遍真实的地铁网络。

基于 **Vue 3 + Three.js（WebGPU，自动回退 WebGL 2）+ TypeScript**，纯前端运行。地理和地铁数据来自 OpenStreetMap，离线烘焙成游戏坐标。

**当前阶段：P1 · 世界底座**（技术栈迁移已完成，路线图见 [docs/06-roadmap.md](./docs/06-roadmap.md)）

---

## 核心特色（规划）

- 🗺️ **真实城市格局**：黄浦江、苏州河、高架路网、16 个区；市中心 1:1 比例（1km ≈ 200 格），远郊按比例压缩
- 🚇 **真实地铁网络**：1–18 号线、浦江线、磁浮；路线规划和票价；3/4 号线高架上有列车跑；进站、乘车、换乘、选出口出站
- 📷 **拍照收集**：外滩、陆家嘴、豫园等 47 个景点，拍照自动识别并解锁图鉴
- 🌿 **上海生活**：石库门弄堂、梧桐区 Citywalk、沪语路人、小笼生煎、梅雨和四季

## 快速开始

需要 Node 22.18+、24 或 26+（Vitest 5 的要求；22.18 起 Node 能直接运行 `.ts` 脚本）。

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 单元测试（Vitest）
npm run typecheck  # 类型检查（vue-tsc）
npm run build      # 类型检查 + 打包，输出 dist/，可直接静态部署
npm run bench      # 渲染基准，需先 npm run dev（见 docs/07 第 4 节）
```

地图数据已经烘焙好放在仓库里。要用最新的 OSM 数据重新生成：先 `brew install osmium-tool`，再 `npm run fetch-osm && npm run bake`，详见 [tools/README.md](./tools/README.md)。烘焙结果可以在 http://localhost:5173/tools/preview/ 俯视检查。

P0 的预览画面：分块网格、核心区 12km 边界（黄圈）和原点标记，可以用鼠标拖动、缩放查看。左上角显示当前渲染后端（WebGPU / WebGL 2）。

## 项目结构

```
block-shanghai/
├── docs/                    设计文档（从这里开始读）
├── src/
│   ├── engine/              与城市无关的引擎
│   │   ├── Game.ts
│   │   ├── city.ts          城市包契约（类型）
│   │   └── geo/projection.ts
│   └── cities/
│       ├── index.ts         城市注册表
│       └── shanghai/
│           ├── config.ts    投影、尺度、区划、OSM 范围
│           └── data/        OSM 烘焙产物
├── bench/                   渲染基准（WebGPU / WebGL 对比，npm run bench）
├── tools/                   数据烘焙脚本、俯视预览页
└── tests/                   单元测试
```

## 文档

| 文档 | 内容 |
| --- | --- |
| [01 · 参考项目分析](./docs/01-reference-analysis.md) | 借鉴什么、不照搬什么 |
| [02 · 架构设计](./docs/02-architecture.md) | 分层、城市包契约、运行时系统 |
| [03 · 坐标、尺度与数据管线](./docs/03-coordinates-and-data.md) | WGS-84、投影、OSM 烘焙 |
| [04 · 地铁系统设计](./docs/04-metro-system.md) | 本项目的重点 |
| [05 · 上海内容设计](./docs/05-shanghai-content.md) | 景点、美食、NPC、季节、任务 |
| [06 · 路线图](./docs/06-roadmap.md) | 分阶段计划 |
| [07 · 技术选型调研](./docs/07-tech-selection.md) | 框架对比与 WebGPU 实测 |

## 数据与致谢

- 地图与地铁数据 © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors，按 ODbL 许可使用。
- 玩法灵感来自 [方块羊城 · Block Guangzhou](https://github.com/ns2250225/guangzhou)。该项目未声明许可证，本项目只借鉴设计思路，未使用其代码。

## 许可证

待定。

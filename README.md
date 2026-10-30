# 方块上海 · Block Shanghai

> 方块风格的上海城市漫游：在真实形状的上海里散步、拍照收集景点、坐遍真实的地铁网络。

基于 **Vue 3 + Three.js（WebGPU，自动回退 WebGL 2）+ TypeScript**，纯前端运行。地理和地铁数据来自 OpenStreetMap，离线烘焙成游戏坐标。

**当前阶段：P1 · 世界底座已完成**，下一步 P2 地铁（路线图见 [docs/06-roadmap.md](./docs/06-roadmap.md)）

---

## 核心特色（规划）

- 🗺️ **真实城市格局**：黄浦江、苏州河、高架路网、16 个区；市中心 1:1 比例（1km ≈ 200 格），远郊按比例压缩
- 🚇 **真实地铁网络**：1–18 号线、浦江线、磁浮；路线规划和票价；3/4 号线高架上有列车跑；进站、乘车、换乘、选出口出站
- 📷 **拍照收集**：外滩、陆家嘴、豫园等 47 个景点，拍照自动识别并解锁图鉴
- 🌿 **上海生活**：石库门弄堂、梧桐区 Citywalk、沪语路人、小笼生煎、梅雨和四季

## 现在能玩什么（P1）

- 在真实形状的上海里走路：16 个区、黄浦江、苏州河、长江口和崇明岛，主干道和多层高架（含匝道、桥墩）
- 程序化的城市：陆家嘴超高层、石库门弄堂、衡复老洋房、工人新村、远郊村镇；浦西梧桐、浦东香樟
- 第三 / 第一人称，手机上有摇杆；小地图、按区着色的大地图，进入新区弹出区名
- 自动存档，三档画质

| 操作 | 键鼠 | 手机 |
| --- | --- | --- |
| 移动 / 奔跑 / 跳 | WASD / Shift / 空格 | 左下摇杆 / 跑 / 跳 |
| 转视角 / 远近 | 拖动 / 滚轮 | 右半屏拖动 |
| 切换视角 / 地图 | V / M | 视角按钮 / 点小地图 |

开发用的地址参数：`?debug=1` 调试面板；`?quality=low|mid|high`；`?cam=x,y,z&at=x,y,z` 自由相机；`?walk=x,z;x,z` 自动跑（测试用）。

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

左上角显示当前渲染后端（WebGPU / WebGL 2）和帧率。

## 项目结构

```
block-shanghai/
├── docs/                    设计文档（从这里开始读）
├── src/
│   ├── engine/              与城市无关的引擎
│   │   ├── Game.ts          主循环、系统调度
│   │   ├── city.ts          城市包契约（类型）
│   │   ├── actors/          玩家、输入、跟随相机
│   │   ├── build/           Builder（方块合并 + 碰撞登记）
│   │   ├── geo/             投影、碰撞世界
│   │   ├── map/             2D 地图绘制
│   │   ├── world/           分块流式加载、几何生成、地块、区划
│   │   └── state/           存档
│   ├── components/          小地图、大地图、区名提示、触屏控件
│   └── cities/
│       ├── index.ts         城市注册表
│       └── shanghai/
│           ├── config.ts    投影、尺度、区划、OSM 范围
│           ├── buildings.ts 建筑风格和行道树
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

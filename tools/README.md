# tools —— 数据烘焙

把 OpenStreetMap 数据转成游戏可直接加载的 JSON，输出到 `src/cities/shanghai/data/`。浏览器端不做投影、不解析 OSM。

计划中的脚本（P1 实现，设计见 [docs/03-coordinates-and-data.md](../docs/03-coordinates-and-data.md)）：

| 脚本 | 作用 |
| --- | --- |
| `fetch-osm.ts` | 下载 Geofabrik 上海、江苏提取包（同一天），osmium 合并、按 `config.osm.bbox` 裁剪、按图层过滤，导出到 `tools/.cache/` |
| `bake-world.ts` | 水系、道路、高架、公园、区界 → 投影、抽稀、按分块索引 |
| `bake-metro.ts` | 地铁线路、站点、出入口、轨道结构 → `metro.json` |

约定：

- 脚本写 TypeScript，用 Node 直接运行（如 `node tools/bake-metro.ts`），Node 22.18+ 自带类型擦除，不需要编译；语法限制见 [docs/02 第 8 节](../docs/02-architecture.md#8-代码约定)
- 投影直接复用 `src/engine/geo/projection.ts`，和运行时保证一致
- 要合并江苏包，是因为 Geofabrik 上海包按市界切割，不含 11 号线昆山段（兆丰路、光明路、花桥），见 [docs/03 第 5 节](../docs/03-coordinates-and-data.md#5-烘焙管线)
- `tools/.cache/` 不入库；烘焙产物入库
- 需要本机安装 osmium-tool：`brew install osmium-tool`（选型见 [docs/07](../docs/07-tech-selection.md#8-数据管线)）
- Overpass 只做小范围临时查询；公共服务器经常 504：请求带 User-Agent、用 bbox 而不是 area 查询、失败换镜像并重试

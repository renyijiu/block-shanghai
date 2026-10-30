# tools —— 数据烘焙

把 OpenStreetMap 数据转成游戏可直接加载的 JSON，输出到 `src/cities/shanghai/data/`。浏览器端不做投影、不解析 OSM。

计划中的脚本（P1 实现，设计见 [docs/03-coordinates-and-data.md](../docs/03-coordinates-and-data.md)）：

| 脚本 | 作用 |
| --- | --- |
| `fetch-osm.mjs` | 下载 Geofabrik 上海提取包，用 osmium-tool 按图层过滤、导出到 `tools/.cache/` |
| `bake-world.mjs` | 水系、道路、高架、公园、区界 → 投影、抽稀、按分块索引 |
| `bake-metro.mjs` | 地铁线路、站点、出入口、轨道结构 → `metro.json` |

约定：

- 投影直接复用 `src/engine/geo/projection.js`，和运行时保证一致
- `tools/.cache/` 不入库；烘焙产物入库
- 需要本机安装 osmium-tool：`brew install osmium-tool`（选型见 [docs/07](../docs/07-tech-selection.md#8-数据管线)）
- Overpass 只做小范围临时查询；公共服务器经常 504：请求带 User-Agent、用 bbox 而不是 area 查询、失败换镜像并重试

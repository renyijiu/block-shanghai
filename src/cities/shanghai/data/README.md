# 烘焙数据

此目录存放 `tools/` 从 OpenStreetMap 生成的游戏数据（已投影到游戏坐标、已抽稀），运行时直接加载，不在浏览器里做投影。

产出（格式见 [docs/03-coordinates-and-data.md](../../../../docs/03-coordinates-and-data.md) 和 [docs/04-metro-system.md](../../../../docs/04-metro-system.md)）：

| 文件 | 内容 |
| --- | --- |
| `water.json` | 黄浦江、苏州河、长江口、湖泊（多边形） |
| `roads.json` | 主干道、高架、桥梁 |
| `parks.json` | 公园绿地 |
| `districts.json` | 区界 |
| `metro.json` | 地铁线路、站点、出入口、轨道（标明地下/高架）（P2） |
| `world.json` | 烘焙范围、分块范围、OSM 数据时间 |

## 许可：ODbL 1.0（不是 MIT）

这些文件由 OpenStreetMap 数据派生，按 [开放数据库许可 ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) 提供，仓库其余代码的 MIT 许可证不适用于它们。

- 数据 © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors，使用或转载时要保留这条署名
- 修改后再公开的数据，也要按 ODbL 提供
- 来源：[Geofabrik](https://download.geofabrik.de/asia/china.html) 的上海、江苏提取包，OSM 数据时间 2026-10-29T21:21:26Z，2026-10-30 烘焙（`world.json`、`metro.json` 里的 `osmTimestamp`、`generatedAt`）
- 复现：`npm run fetch-osm && npm run bake`，脚本在 [tools/](../../../../tools/)

## License: ODbL 1.0 (not MIT)

These files are derived from OpenStreetMap and are available under the [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/); the MIT License of the rest of the repository does not apply to them. Data © OpenStreetMap contributors. Source: Geofabrik extracts for Shanghai and Jiangsu, OSM data as of 2026-10-29T21:21:26Z. Rebuild with `npm run fetch-osm && npm run bake`.

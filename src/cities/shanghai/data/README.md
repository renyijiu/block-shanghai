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

这些文件由 OSM 数据派生，适用 **ODbL**：必须注明“© OpenStreetMap contributors”，公开分发时这些数据文件本身也须按 ODbL 提供。

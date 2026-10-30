# 03 · 坐标、尺度与数据管线

## 1. 坐标系：只用 WGS-84

国内地图有三套坐标：

| 坐标系 | 谁在用 | 和 WGS-84 的偏差（上海） |
| --- | --- | --- |
| WGS-84 | OSM、GPS 原始值、Google Earth | — |
| GCJ-02 | 高德、腾讯、Apple 地图（国内） | 约 500 米 |
| BD-09 | 百度 | 在 GCJ-02 基础上再偏移 |

**本项目所有经纬度一律用 WGS-84**：地理数据和地铁来自 OSM，本来就是 WGS-84。景点坐标也从 OSM 查，不要从高德、百度拾取。如果某个点只能从国内地图拿到，必须先转换成 WGS-84，并在数据里注明来源。转换函数到时放在 `tools/lib/`。

## 2. 投影

实现：`src/engine/geo/projection.js`，测试：`tests/projection.test.js`。

1. **局部等距圆柱投影**（以原点为中心，十几公里范围内误差可忽略）：
   - 东向 `ex = (lon − lon0) × 111.32 × cos(lat0)` km
   - 北向 `nz = (lat − lat0) × 110.574` km
2. **径向压缩**：设 `d = √(ex² + nz²)`
   - `d ≤ R` 时不变
   - `d > R` 时变成 `R + (d − R) × c`
3. **换算成格**：`x = ex' × U`，`z = −nz' × U`

当前参数（`src/cities/shanghai/config.js`）：

| 参数 | 值 | 说明 |
| --- | --- | --- |
| 原点 | 31.2304, 121.4737 | 人民广场附近 |
| U `unitsPerKm` | 200 | 核心区 1 格 ≈ 5 米 |
| R `coreRadiusKm` | 12 | 约覆盖到中环 |
| c `outerCompress` | 0.35 | 圈外 1 格 ≈ 14.3 米 |

坐标轴：x 向东，z 向南（北为 −z），y 向上。

> 压缩会让圈外的直线道路在 R 处出现轻微折角，这是有意的取舍。宽度类数据（河宽、路宽）用 `scaleAt()` 同步缩放。

### 主要地点的游戏距离（粗略估算）

下表用的是凭记忆的近似坐标，只用来判断压缩参数是否合适，正式坐标以 OSM 为准。

| 地点 | 离原点真实距离 | 游戏距离 |
| --- | --- | --- |
| 外滩 | 1.9 km | 380 格 |
| 东方明珠 | 2.7 km | 538 格 |
| 徐家汇 | 5.2 km | 1049 格 |
| 虹桥枢纽 | 15.2 km | 2621 格 |
| 迪士尼 | 19.9 km | 2952 格 |
| 嘉定赛车场 | 26.9 km | 3444 格 |
| 佘山 | 30.7 km | 3706 格 |
| 浦东机场 | 33.0 km | 3867 格 |
| 朱家角 | 42.5 km | 4538 格 |
| 崇明东滩 | 54.9 km | 5401 格 |
| 滴水湖 | 56.8 km | 5533 格 |

整个世界大约在 ±6000 格以内，float32 精度足够。远郊主要靠地铁和磁浮到达，不要求步行可达。

## 3. 三套尺度

| 对象 | 1 格 ≈ | 例子 |
| --- | --- | --- |
| 地图水平距离（核心区） | 5 m | 外滩到人民广场约 380 格 |
| 建筑高度 | 2.5 m | 上海中心 632 m ≈ 253 格；东方明珠 468 m ≈ 187 格 |
| 人物、车辆、室内、街道家具 | 1 m | 人高 1.8 格；巴士长约 12 格 |

三套尺度并存是方块城市游戏的常见做法：地图要“缩”才能走得完，人和车要“正常”才有手感，建筑高度在两者之间。

**副作用和应对**：

- **地铁列车会显得很长**：真实 6 节编组约 140 米，按人物尺度是 140 格，而市区站间距压缩后只有 200–300 格。→ 列车做成 3 节左右的风格化编组（约 45 格），站台也相应缩短。
- **建筑高度比例不是真实的**：只保证主要地标的相对高低（上海中心 > 环球金融中心 > 金茂 > 东方明珠）和天际线轮廓。
- **路宽**：主干道按人物尺度做（10–14 格），不按真实路宽缩放。

`buildingMetersPerUnit = 2.5` 是初值，P1 做出陆家嘴天际线后再调。

## 4. 数据来源

| 数据 | 来源 | 说明 |
| --- | --- | --- |
| 水系、海岸、岛屿 | OSM | 黄浦江、苏州河、长江口、淀山湖、滴水湖 |
| 道路、高架、桥梁 | OSM | 只取主干道以上等级；高架靠 `bridge` / `layer` 标签识别 |
| 公园绿地 | OSM | `leisure=park` 等 |
| 区界 | OSM | `admin_level=6` 的 16 个区 |
| 地铁 | OSM | 线路、站点、出入口、轨道结构，详见 [04](./04-metro-system.md) |
| 景点坐标 | OSM | 按名称查出后人工校对 |
| 建筑轮廓和高度 | OSM（可选） | 覆盖不完整，只考虑在外滩、陆家嘴等核心区参考 |
| 地铁运营信息 | 上海地铁官网（人工核对） | 新开通线路 OSM 可能滞后；票价规则 |
| 景点模型 | 手工 | 参考公开照片，用 Builder 拼方块 |

## 5. 烘焙管线

```
fetch-osm.mjs                                   bake-*.mjs
Geofabrik 上海 .osm.pbf ──► osmium 按图层过滤/导出 ──► tools/.cache/ ──► 过滤标签 ──► 合并 way ──► 投影 ──► 抽稀 ──► 分块索引 ──► src/cities/shanghai/data/*.json
```

1. **拉取**：下载 Geofabrik 的 `asia/china/shanghai-latest.osm.pbf`（约 26 MB，每天更新），用 osmium-tool 按图层过滤并导出（选型理由见 [07 第 8 节](./07-tech-selection.md#8-数据管线)）。中间文件放在 `tools/.cache/`（不入库），重复烘焙不重复下载。Overpass 只用来做小范围的临时查询。
2. **过滤**：按下表保留需要的要素和标签。
3. **合并**：把同名、首尾相接的 way 合并成长折线；多边形按 OSM multipolygon 规则组装（外环 / 内环）。
4. **投影**：调用 `createProjection(config.projection)`，输出整数或 1 位小数的格坐标。
5. **抽稀**：Douglas–Peucker，容差按图层定（河岸 2 格、道路 1 格、轨道 0.5 格）。
6. **分块索引**：给每条折线、多边形算出覆盖的 240 格分块，运行时只读所需分块。
7. **输出**：写 JSON，并打印每层的要素数和文件大小。

### 图层与 OSM 标签

| 图层 | 标签 |
| --- | --- |
| 水面 | `natural=water`（含 `water=river/lake/reservoir`）、`waterway=riverbank`（旧标签） |
| 海岸线 | `natural=coastline`（长江口、杭州湾；需要拼接成陆地多边形，P1 再定方案） |
| 道路 | `highway=motorway/trunk/primary/secondary`，附带 `name`、`bridge`、`layer`、`lanes` |
| 公园 | `leisure=park/garden`、`landuse=forest/grass`（面积过小的丢掉） |
| 区界 | `boundary=administrative` + `admin_level=6` |
| 地铁 | 见 [04](./04-metro-system.md#3-数据从-osm-到-metrojson) |

### Overpass 使用注意

- 公共服务器经常 504 或拒绝无 User-Agent 的请求：请求带上 `User-Agent`，失败后换镜像（overpass-api.de、maps.mail.ru 等）并重试。
- 用 **bbox** 而不是 `area[...]` 查询，快得多。上海范围：`[bbox:30.67,120.85,31.88,122.05]`（`config.osm.bbox`）。
- 轨道几何用 `out geom`，数据量约 1–2 MB；道路、水系建议按图层分开拉。

已验证可用的地铁查询（2026-10-30）：

```
[out:json][timeout:150][bbox:30.67,120.85,31.88,122.05];
rel["type"="route"]["route"="subway"]["network"="上海地铁"]->.r;
way(r.r)["railway"]->.w;
.r out body;
.w out geom tags;
```

## 6. 输出格式（草案）

坐标都是游戏格，`[x, z]`。

```jsonc
// water.json
{ "polygons": [ { "name": "黄浦江", "outer": [[x, z], ...], "holes": [[[x, z], ...]], "chunks": ["3,-2", ...] } ] }

// roads.json
{ "roads": [ {
  "name": "延安高架路",
  "class": "trunk",            // motorway | trunk | primary | secondary
  "width": 14,                 // 格（人物尺度）
  "level": 1,                  // 0 地面；1、2 为高架层
  "pts": [[x, z], ...],
  "chunks": ["0,-1", ...]
} ] }

// parks.json
{ "parks": [ { "name": "人民公园", "outer": [[x, z], ...], "chunks": [...] } ] }

// districts.json
{ "districts": [ { "id": "huangpu", "outer": [[x, z], ...] } ] }
```

`metro.json` 的格式见 [04](./04-metro-system.md#4-metrojson-数据模型)。

## 7. 许可（ODbL）

- 游戏内“关于”页和 README 必须注明 **© OpenStreetMap contributors**。
- `src/cities/shanghai/data/` 下的烘焙数据属于 OSM 的派生数据库；公开分发时须按 ODbL 提供（入库并在 data/README 注明即可）。
- 游戏画面本身属于“生成作品”，只需要署名。

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

实现：`src/engine/geo/projection.ts`，测试：`tests/projection.test.ts`。

1. **局部等距圆柱投影**（以原点为中心，十几公里范围内误差可忽略）：
   - 东向 `ex = (lon − lon0) × 111.32 × cos(lat0)` km
   - 北向 `nz = (lat − lat0) × 110.574` km
2. **径向压缩**：设 `d = √(ex² + nz²)`
   - `d ≤ R` 时不变
   - `d > R` 时变成 `R + (d − R) × c`
3. **换算成格**：`x = ex' × U`，`z = −nz' × U`

当前参数（`src/cities/shanghai/config.ts`）：

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
npm run fetch-osm（tools/fetch-osm.ts）                                       npm run bake（tools/bake-*.ts）
Geofabrik 上海 + 江苏 .osm.pbf ──► osmium 合并 → 按 bbox 裁剪 → 按图层过滤/导出 ──► tools/.cache/ ──► 过滤标签 ──► 合并 way ──► 投影 ──► 抽稀 ──► 按分块裁剪 ──► src/cities/shanghai/data/*.json
```

烘焙结果可以在开发服务器的 `/tools/preview/` 俯视检查（拖动、缩放，地址参数 `?x=&z=&s=` 指定中心和比例）。

1. **拉取**：下载 Geofabrik 的 `asia/china/shanghai-latest.osm.pbf`（约 25 MB）和 `asia/china/jiangsu-latest.osm.pbf`（约 76 MB），`osmium merge` 合并，`osmium extract --bbox` 按 `config.osm.bbox` 裁剪，再按图层过滤并导出（选型理由见 [07 第 8 节](./07-tech-selection.md#8-数据管线)）。中间文件放在 `tools/.cache/`（不入库），重复烘焙不重复下载。Overpass 只用来做小范围的临时查询。
   - **为什么要江苏包**：Geofabrik 的上海包按上海市界（外扩少量缓冲）切割，11 号线最西边的兆丰路、光明路、花桥三站在江苏昆山，不在包内。2026-10-30 用 Geofabrik 的 `shanghai.poly` 核实：这一纬度上包的西边界约在东经 121.145°，三站分别在 121.1455°、121.1126°、121.0998°。
   - **两个包同一天下载**：Geofabrik 每天用同一份全球数据生成各地的包，同一天的包里同一对象的版本一致，`osmium merge` 才能去重。`fetch-osm.ts` 下载后用 `osmium fileinfo` 核对两个包的数据时间戳，不一致就重新下载。
   - bbox 西南角还盖到浙江嘉善、平湖一带。2026-10-30 实际烘焙时，上海 + 江苏两包里的海岸线在 bbox 内首尾完整，能闭合成海面，**不需要浙江包**。市界外的陆地只铺地面、水系和道路，不生成建筑。
   - **区界自己组装**：`osmium export` 遇到成员不全的 relation 会整个跳过，不报错（宝山区缺 26 条成员，就这样丢了）。所以区界图层导出成带坐标的 OPL，由 `bake-world.ts` 把现有的外圈 way 拼成闭合环，缺的成员只打警告。水面、公园的 relation 没有这个问题（2026-10-30 只丢了 2 个无名小水面）。
2. **过滤**：按下表保留需要的要素和标签。
3. **合并**：把名称、等级、桥梁 / 层级、单行属性都相同且首尾相接的道路 way 合并成长折线（道路允许反向拼接）；海岸线按方向拼接（陆地在左侧，不能反向）；多边形由 osmium 按 multipolygon 规则组装。
4. **投影**：调用 `createProjection(config.projection)`。投影前先在长边上每隔约 0.002°（200 米）插点，外圈的径向压缩不会把直边拉歪；输出保留 1 位小数。
5. **抽稀**：Douglas–Peucker，容差按图层定（水面、公园 1.5 格，海岸 2 格，道路 1 格，区界 3 格，轨道 0.5 格）；面积过小的面丢掉（水面 < 150 格²、公园 < 300 格²）。
6. **按分块裁剪**：多边形用 Sutherland–Hodgman、折线用 Liang–Barsky 裁到每个 240 格分块里，运行时直接三角化，不再做几何运算。区界不裁分块，整体保存（用于判断所在区和画地图）。
7. **输出**：写 JSON，并打印每层的要素数和文件大小。

### 海面

OSM 的海岸线约定陆地在走向左侧。在经纬度空间里把海岸线裁成进出 bbox 的若干段，反向后沿 bbox 边框逆时针连接，得到海面多边形；bbox 内完整闭合的逆时针海岸线是岛屿，作为海面的洞（崇明、长兴、横沙等，共 11 个）。海岸线断在 bbox 内部（数据缺口）时，把断头接到最近的边框上并打警告。实现在 `tools/lib/coastline.ts`。

### 道路高度

- 宽度按人物尺度：motorway / trunk 14 格，primary 12，secondary 10，匝道 7；分离式双向道路在 OSM 里是两条单行线，各取 0.6 倍宽，并排后看起来是一条宽路。
- 高架：`bridge` + `layer ≥ 1` 的快速路和匝道，或者长度超过 600 米的普通道路桥，按层抬高，每层 7 格（最多 5 层）。其余的桥是过河小桥，留在地面层，渲染时加栏杆。
- 匝道：高度不同的道路首尾相接处，在 40 格内平滑过渡（接地面就落地，接高架就升到较高的一层）。每个顶点的高度写进数据。
- 隧道和 `layer < 0` 的路段不输出。
- 已知问题：OSM 里有些匝道被拆成好几段，每段标的层级不同，最短的一段会在二三十格内从地面升到 14 格，坡度偏陡（核心区 48 段匝道里有少数几段）。以后可以把高度变化分摊到相连的几段上。

### 图层与 OSM 标签

| 图层 | 标签 |
| --- | --- |
| 水面 | `natural=water`（含 `water=river/lake/reservoir`）、`waterway=riverbank`（旧标签） |
| 海岸线 | `natural=coastline`（长江口、东海、杭州湾），拼成海面多边形，见下文“海面” |
| 道路 | `highway=motorway/motorway_link/trunk/trunk_link/primary/secondary`，用到 `name`、`ref`、`bridge`、`layer`、`tunnel`、`oneway` |
| 公园 | `leisure=park/garden`、`landuse=forest/grass`（面积过小的丢掉） |
| 区界 | `admin_level=6` 的 relation，按名称匹配 `config.districts` |
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

## 6. 输出格式

类型定义在 `src/engine/world/data.ts`（烘焙脚本和运行时共用）。坐标都是游戏格，用扁平数组 `[x0, z0, x1, z1, ...]` 节省体积，保留 1 位小数；分块键是 `"cx,cz"`（`src/engine/world/chunks.ts`）。

```jsonc
// world.json：范围和元数据
{ "version": 1, "generatedAt": "2026-10-30", "osmTimestamp": "2026-10-29T21:21:26Z", "chunkSize": 240,
  "bbox": [30.67, 120.85, 31.88, 122.05], "outline": [x, z, ...], "chunks": { "minX": -24, "maxX": 22, "minZ": -28, "maxZ": 24 } }

// water.json / parks.json：按分块裁好的多边形，[外环, ...洞]
{ "version": 1, "chunks": { "3,-2": [ { "kind": "river", "polygon": [[x, z, ...], [洞...]] } ] } }
//   水面 kind：sea | river | lake | water；公园 kind：park | garden | forest | grass

// roads.json：道路属性 + 按分块裁好的折线，每个顶点 [x, z, h]，h 为路面高度（含匝道坡度）
{ "version": 1,
  "roads": [ { "name": "延安高架路", "class": "trunk", "width": 8.4, "level": 1, "bridge": false } ],
  "chunks": { "0,-1": [ [道路序号, [x, z, h, x, z, h, ...]] ] } }

// districts.json：整区多边形（已裁到世界范围内，去掉了飞地和碎片）+ 区名标注点
{ "version": 1, "districts": [ { "id": "huangpu", "name": "黄浦区", "polygons": [[[x, z, ...]]], "bounds": [minX, minZ, maxX, maxZ], "label": [x, z] } ] }
```

2026-10-30 的烘焙结果：水面 0.87 MB、公园 0.35 MB、道路 4.71 MB、区界 0.08 MB，共约 6 MB（gzip 后约 1.5 MB），全部入库。

`metro.json` 的格式见 [04](./04-metro-system.md#4-metrojson-数据模型)。

## 7. 许可（ODbL）

- 游戏内“关于”页和 README 必须注明 **© OpenStreetMap contributors**。
- `src/cities/shanghai/data/` 下的烘焙数据属于 OSM 的派生数据库；公开分发时须按 ODbL 提供（入库并在 data/README 注明即可）。
- 游戏画面本身属于“生成作品”，只需要署名。

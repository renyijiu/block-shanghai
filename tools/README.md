# tools —— 数据烘焙

把 OpenStreetMap 数据转成游戏可直接加载的 JSON，输出到 `src/cities/shanghai/data/`。浏览器端不做投影、不解析 OSM。设计见 [docs/03-coordinates-and-data.md](../docs/03-coordinates-and-data.md)。

```bash
brew install osmium-tool   # 一次性
npm run fetch-osm          # 下载并切图层到 tools/.cache/（约 100 MB；加 -- --force 重新下载）
npm run bake               # 烘焙成 src/cities/shanghai/data/*.json
npm run dev                # 然后打开 http://localhost:5173/tools/preview/ 俯视检查
```

| 文件 | 作用 |
| --- | --- |
| `fetch-osm.ts` | 下载 Geofabrik 上海、江苏提取包（核对同一天），osmium 合并、按 `config.osm.bbox` 裁剪、按图层过滤，导出 GeoJSONSeq；区界导出带坐标的 OPL |
| `bake-world.ts` | 水面、海面、公园、道路（含高架高度和匝道坡度）、区界 → 投影、抽稀、按分块裁剪 → `water / parks / roads / districts / world.json` |
| `bake-metro.ts` | 地铁线路、站点、出入口、轨道结构 → `metro.json`（P2） |
| `lib/geom.ts` | 抽稀、矩形裁剪、折线拼接、插点、标注点等平面几何 |
| `lib/coastline.ts` | 海岸线拼海面多边形 |
| `lib/osm.ts` | 读 GeoJSONSeq 和 OPL |
| `preview/` | 烘焙数据的俯视预览页（开发用）。地址参数 `?x=&z=&s=` 指定中心（格）和比例（像素/格），`grid=1` 显示分块 |

约定：

- 脚本写 TypeScript，用 Node 直接运行（Node 22.18+ 自带类型擦除，不需要编译）；语法限制见 [docs/02 第 8 节](../docs/02-architecture.md#8-代码约定)
- 投影直接复用 `src/engine/geo/projection.ts`，数据格式类型在 `src/engine/world/data.ts`，和运行时保证一致
- `lib/` 下的算法都有单元测试（`tests/geom.test.ts`、`coastline.test.ts`、`osm.test.ts`）
- `tools/.cache/` 不入库；烘焙产物入库（ODbL，见 `src/cities/shanghai/data/README.md`）
- 要合并江苏包，是因为 Geofabrik 上海包按市界切割，不含 11 号线昆山段（兆丰路、光明路、花桥）
- 区界不用 `osmium export` 组装：它遇到成员不全的 relation 会整个跳过，宝山区就这样丢过
- Overpass 只做小范围临时查询；公共服务器经常 504：请求带 User-Agent、用 bbox 而不是 area 查询、失败换镜像并重试

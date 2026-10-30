// 下载 Geofabrik 提取包 → 合并 → 按 bbox 裁剪 → 按图层过滤并导出 GeoJSONSeq，结果放在 tools/.cache/
// 用法：node tools/fetch-osm.ts [--force]   （--force 重新下载提取包）
// 需要 osmium-tool：brew install osmium-tool。设计见 docs/03-coordinates-and-data.md 第 5 节
import { execFileSync } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import shanghai from '../src/cities/shanghai/config.ts'
import { CACHE } from './lib/osm.ts'

// 上海包按市界切割，不含 11 号线昆山段，所以合并江苏包
const REGIONS = ['shanghai', 'jiangsu']
const BASE_URL = 'https://download.geofabrik.de/asia/china'
const UA = 'block-shanghai-tools/0.1 (+https://github.com/renyijiu/block-shanghai)'

// 图层：osmium tags-filter 表达式 + 导出格式
// linestring 图层关闭面识别，闭合的 way 也按折线导出（海岸线岛屿、环形道路）
// 区界导出带坐标的 OPL，由 bake-world 自己组装：osmium export 遇到成员不全的 relation 会整个跳过（宝山区缺 33 条成员）
const LAYERS = {
  water: { filters: ['wr/natural=water', 'wr/waterway=riverbank', 'wr/landuse=reservoir,basin'], geometry: 'polygon' },
  coastline: { filters: ['w/natural=coastline'], geometry: 'linestring' },
  roads: {
    filters: ['w/highway=motorway,motorway_link,trunk,trunk_link,primary,secondary'],
    geometry: 'linestring'
  },
  parks: { filters: ['wr/leisure=park,garden', 'wr/landuse=forest,grass'], geometry: 'polygon' },
  boundaries: { filters: ['r/admin_level=6'], geometry: 'opl', types: ['way', 'relation'] },
  // 地铁：线路关系（保留成员顺序）、轨道、停靠点和出入口节点，都要 OPL（docs/04 第 3.2 节）
  metro: { filters: ['r/route=subway,light_rail,monorail', 'n/railway=subway_entrance'], geometry: 'opl', types: ['node', 'way', 'relation'] }
} as const

const osmium = (...args: string[]) => execFileSync('osmium', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })

async function download(region: string, force: boolean) {
  const file = join(CACHE, `${region}.osm.pbf`)
  if (existsSync(file) && !force) {
    console.log(`  ${region}: 已缓存（${(statSync(file).size / 1048576).toFixed(1)} MB），跳过下载`)
    return file
  }
  const url = `${BASE_URL}/${region}-latest.osm.pbf`
  console.log(`  ${region}: 下载 ${url}`)
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok || !res.body) throw new Error(`下载失败 ${res.status} ${url}`)
  const tmp = file + '.part'
  await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp))
  renameSync(tmp, file)
  console.log(`  ${region}: ${(statSync(file).size / 1048576).toFixed(1)} MB`)
  return file
}

// Geofabrik 每天用同一份全球数据生成各地的包；时间戳一致时同一对象版本相同，osmium merge 才能去重
function replicationTimestamp(file: string) {
  return osmium('fileinfo', '-g', 'header.option.osmosis_replication_timestamp', file).trim()
}

async function main() {
  const force = process.argv.includes('--force')
  mkdirSync(CACHE, { recursive: true })

  console.log('1. 下载提取包')
  const files: string[] = []
  for (const r of REGIONS) files.push(await download(r, force))

  const stamps = files.map(replicationTimestamp)
  console.log(`2. 数据时间戳：${REGIONS.map((r, i) => `${r} ${stamps[i]}`).join('，')}`)
  if (new Set(stamps).size !== 1) throw new Error('各提取包的数据时间戳不一致，请用 --force 重新下载')

  console.log('3. 合并并按 bbox 裁剪')
  const merged = join(CACHE, 'merged.osm.pbf')
  osmium('merge', ...files, '-o', merged, '--overwrite')
  const [south, west, north, east] = shanghai.osm.bbox
  const region = join(CACHE, 'region.osm.pbf')
  // smart：跨出 bbox 的 way 和多边形 / 行政区 relation 补全，保证面能组装完整
  osmium('extract', '-b', `${west},${south},${east},${north}`, '-s', 'smart', '-S', 'types=multipolygon,boundary', merged, '-o', region, '--overwrite')

  console.log('4. 按图层过滤、导出')
  for (const [name, layer] of Object.entries(LAYERS)) {
    const pbf = join(CACHE, `${name}.osm.pbf`)
    osmium('tags-filter', region, ...layer.filters, '-o', pbf, '--overwrite')
    if (layer.geometry === 'opl') {
      const located = join(CACHE, `${name}.located.osm.pbf`)
      osmium('add-locations-to-ways', pbf, '-o', located, '--overwrite')
      const out = join(CACHE, `${name}.opl`)
      osmium('cat', located, ...layer.types.flatMap((t) => ['-t', t]), '-f', 'opl,locations_on_ways=true', '-o', out, '--overwrite')
      console.log(`  ${name}: ${(statSync(out).size / 1048576).toFixed(1)} MB`)
      continue
    }
    const config = join(CACHE, `${name}.export.json`)
    const lines = layer.geometry === 'linestring'
    writeFileSync(config, JSON.stringify({ attributes: { type: true, id: true }, linear_tags: lines, area_tags: !lines }))
    const out = join(CACHE, `${name}.geojsonseq`)
    osmium('export', pbf, '-c', config, '-f', 'geojsonseq', '-x', 'print_record_separator=false', `--geometry-types=${layer.geometry}`, '-o', out, '--overwrite')
    console.log(`  ${name}: ${(statSync(out).size / 1048576).toFixed(1)} MB`)
  }
  writeFileSync(join(CACHE, 'meta.json'), JSON.stringify({ regions: REGIONS, osmTimestamp: stamps[0] }, null, 2))
  console.log('完成，接着运行 node tools/bake-world.ts')
}

await main()

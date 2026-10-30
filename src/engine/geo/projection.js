// 经纬度（WGS-84）↔ 游戏坐标
// 以城市原点做局部等距圆柱投影；核心半径内保持原比例，之外按 outerCompress 径向压缩，
// 让远郊景点（迪士尼、朱家角、滴水湖…）也能放进可漫游范围。
// 游戏坐标系：x 向东，z 向南（北为 -z），y 向上；与 Three.js 右手系一致。

const KM_PER_DEG_LAT = 110.574
const KM_PER_DEG_LON_AT_EQUATOR = 111.32

export function createProjection({ origin, unitsPerKm, coreRadiusKm, outerCompress }) {
  const kx = KM_PER_DEG_LON_AT_EQUATOR * Math.cos((origin.lat * Math.PI) / 180)
  const kz = KM_PER_DEG_LAT

  // 真实距离(km) → 压缩后距离(km)，及其反函数
  const squash = (d) => (d <= coreRadiusKm ? d : coreRadiusKm + (d - coreRadiusKm) * outerCompress)
  const unsquash = (d) => (d <= coreRadiusKm ? d : coreRadiusKm + (d - coreRadiusKm) / outerCompress)

  function project(lat, lon) {
    const ex = (lon - origin.lon) * kx
    const nz = (lat - origin.lat) * kz
    const d = Math.hypot(ex, nz)
    const f = d > 0 ? squash(d) / d : 1
    return { x: ex * f * unitsPerKm, z: -nz * f * unitsPerKm }
  }

  function unproject(x, z) {
    const ex = x / unitsPerKm
    const nz = -z / unitsPerKm
    const d = Math.hypot(ex, nz)
    const f = d > 0 ? unsquash(d) / d : 1
    return { lat: origin.lat + (nz * f) / kz, lon: origin.lon + (ex * f) / kx }
  }

  // 该点处的径向比例：核心区 1，外圈 outerCompress。用于缩放河宽、路宽等"宽度"类数据
  function scaleAt(lat, lon) {
    const ex = (lon - origin.lon) * kx
    const nz = (lat - origin.lat) * kz
    return Math.hypot(ex, nz) > coreRadiusKm ? outerCompress : 1
  }

  // 真实公里数 → 游戏格数（仅核心区内精确）
  const kmToUnits = (km) => km * unitsPerKm

  return { project, unproject, scaleAt, kmToUnits, origin, unitsPerKm, coreRadiusKm, outerCompress }
}

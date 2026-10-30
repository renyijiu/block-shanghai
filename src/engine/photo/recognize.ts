// 景点识别：按快门那一刻，景点（和子景点）的瞄准点在取景框里、距离够近、没被挡住，就算拍到（docs/01 “按视锥 + 遮挡识别”）。
// 纯函数：相机矩阵和遮挡判断由调用方给

/** 一个可以被拍到的点 */
export interface PhotoTarget {
  /** 景点或子景点 id */
  id: string
  /** 子景点所属的景点 id；拍到子景点也算拍到景点 */
  parent?: string
  x: number
  y: number
  z: number
  /** 最远能拍到的距离（格） */
  maxDist: number
}

/** 按快门时的相机：位置和视图投影矩阵（列主序 16 个数，three.js 的 elements） */
export interface ShotCamera {
  x: number
  y: number
  z: number
  viewProj: ArrayLike<number>
}

/** 把世界坐标投影到标准化设备坐标；在相机背后返回 null */
export function toNdc(cam: ShotCamera, x: number, y: number, z: number): [number, number, number] | null {
  const m = cam.viewProj
  const cx = m[0]! * x + m[4]! * y + m[8]! * z + m[12]!
  const cy = m[1]! * x + m[5]! * y + m[9]! * z + m[13]!
  const cz = m[2]! * x + m[6]! * y + m[10]! * z + m[14]!
  const w = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!
  if (w <= 1e-6) return null
  return [cx / w, cy / w, cz / w]
}

/**
 * 识别画面里的景点。margin 是取景框边缘留白（0.9 表示瞄准点要落在画面中间 90% 的范围里）；
 * visible(t) 判断相机到瞄准点之间有没有遮挡。返回拍到的 id（按目标顺序，子景点前面是它的景点，不重复）
 */
export function recognize(targets: PhotoTarget[], cam: ShotCamera, visible: (t: PhotoTarget) => boolean, margin = 0.9): string[] {
  const hits = new Set<string>()
  for (const t of targets) {
    if (hits.has(t.id)) continue
    if (Math.hypot(t.x - cam.x, t.y - cam.y, t.z - cam.z) > t.maxDist) continue
    const p = toNdc(cam, t.x, t.y, t.z)
    if (!p || Math.abs(p[0]) > margin || Math.abs(p[1]) > margin || p[2] > 1) continue
    if (!visible(t)) continue
    hits.add(t.id)
    if (t.parent) hits.add(t.parent)
  }
  // 按目标顺序输出，子景点前先放它所属的景点
  const out: string[] = []
  for (const t of targets) for (const id of [t.parent, t.id]) if (id && hits.has(id) && !out.includes(id)) out.push(id)
  return out
}

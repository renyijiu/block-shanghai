// 方块小人的外观：肤色、发色发型、衣裤颜色、帽子、眼镜，或者上传一张 64×64 的方块皮肤（常见方块游戏的皮肤格式）。
// 模型的各部件以关节为原点，摆动时绕关节转；皮肤按标准布局把每个面的贴图区域映射到方块上
import * as THREE from 'three/webgpu'
import type { Hat, HairStyle, Look } from './look.ts'

/** 皮肤贴图上一个长方体的展开区域：左上角 (u, v)，长方体宽、高、深（像素） */
type Region = [u: number, v: number, w: number, h: number, d: number]
const SKIN: Record<'head' | 'hat' | 'body' | 'armR' | 'armL' | 'legR' | 'legL', Region> = {
  head: [0, 0, 8, 8, 8],
  hat: [32, 0, 8, 8, 8],
  body: [16, 16, 8, 12, 4],
  armR: [40, 16, 4, 12, 4],
  armL: [32, 48, 4, 12, 4],
  legR: [0, 16, 4, 12, 4],
  legL: [16, 48, 4, 12, 4]
}

/**
 * 按皮肤布局设置一个方块的 UV。BoxGeometry 的面顺序是 +x、-x、+y、-y、+z、-z；人朝 -z，
 * 所以 +x 是人的右侧、-z 是正面。每个面的 UV 原本是从外面看过去的 0–1，换成皮肤里对应的区域
 */
function mapSkin(g: THREE.BoxGeometry, [u, v, w, h, d]: Region, size = 64) {
  const faces: [number, number, number, number, boolean][] = [
    [u, v + d, d, h, false], // +x：人的右侧
    [u + d + w, v + d, d, h, false], // -x：人的左侧
    [u + d, v, w, d, true], // +y：头顶（转 180°）
    [u + d + w, v, w, d, false], // -y：底
    [u + d + w + d, v + d, w, h, false], // +z：背面
    [u + d, v + d, w, h, false] // -z：正面
  ]
  const uv = g.getAttribute('uv') as THREE.BufferAttribute
  faces.forEach(([x, y, fw, fh, flip], f) => {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k
      let a = uv.getX(i)
      let b = uv.getY(i)
      if (flip) {
        a = 1 - a
        b = 1 - b
      }
      uv.setXY(i, (x + a * fw) / size, 1 - (y + (1 - b) * fh) / size)
    }
  })
  uv.needsUpdate = true
}

export interface Character {
  group: THREE.Group
  body: THREE.Group
  bike: THREE.Group
  limbs: { armL: THREE.Object3D; armR: THREE.Object3D; legL: THREE.Object3D; legR: THREE.Object3D }
  /** 换外观（皮肤图异步加载，加载完自动换上） */
  apply(look: Look): void
  dispose(): void
}

export function buildCharacter(): Character {
  const group = new THREE.Group()
  group.name = 'player'
  const body = new THREE.Group()
  group.add(body)
  const mats = {
    skin: new THREE.MeshLambertMaterial(),
    shirt: new THREE.MeshLambertMaterial(),
    pants: new THREE.MeshLambertMaterial(),
    hair: new THREE.MeshLambertMaterial(),
    dark: new THREE.MeshLambertMaterial({ color: 0x222222 }),
    textured: new THREE.MeshLambertMaterial(),
    overlay: new THREE.MeshLambertMaterial({ transparent: true, alphaTest: 0.5 })
  }
  // 每个部件两份材质：颜色版、皮肤版；换外观时切换
  const parts: { mesh: THREE.Mesh; plain: THREE.Material }[] = []
  const box = (w: number, h: number, d: number, m: THREE.Material, region?: Region) => {
    const g = new THREE.BoxGeometry(w, h, d)
    if (region) mapSkin(g, region)
    const mesh = new THREE.Mesh(g, m)
    if (region) parts.push({ mesh, plain: m })
    return mesh
  }
  const joint = (x: number, y: number, child: THREE.Mesh) => {
    const j = new THREE.Group()
    j.position.set(x, y, 0)
    child.position.y = -(child.geometry as THREE.BoxGeometry).parameters.height / 2
    j.add(child)
    body.add(j)
    return j
  }
  const torso = box(0.5, 0.62, 0.28, mats.shirt, SKIN.body)
  torso.position.y = 1.12
  const head = box(0.42, 0.42, 0.42, mats.skin, SKIN.head)
  head.position.y = 1.64
  body.add(torso, head)
  // 皮肤的帽子层：比头大一圈，透明的地方不画
  const hatLayer = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.46, 0.46), mats.overlay)
  mapSkin(hatLayer.geometry as THREE.BoxGeometry, SKIN.hat)
  hatLayer.position.y = 1.64
  hatLayer.visible = false
  body.add(hatLayer)
  const armL = joint(-0.34, 1.4, box(0.17, 0.62, 0.17, mats.shirt, SKIN.armL))
  const armR = joint(0.34, 1.4, box(0.17, 0.62, 0.17, mats.shirt, SKIN.armR))
  const legL = joint(-0.12, 0.82, box(0.22, 0.82, 0.24, mats.pants, SKIN.legL))
  const legR = joint(0.12, 0.82, box(0.22, 0.82, 0.24, mats.pants, SKIN.legR))
  // 手（袖口下露出皮肤）
  for (const arm of [armL, armR]) {
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.15), mats.skin)
    hand.position.y = -0.66
    arm.add(hand)
  }

  // 发型、帽子、眼镜：几种方块组合，换外观时显示对应的那组
  const deco = new THREE.Group()
  body.add(deco)
  const hairs: Record<HairStyle, THREE.Group> = { short: new THREE.Group(), long: new THREE.Group(), buzz: new THREE.Group() }
  const add = (g: THREE.Group, w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
    mesh.position.set(x, y, z)
    g.add(mesh)
  }
  add(hairs.short, 0.44, 0.12, 0.44, mats.hair, 0, 1.88, 0)
  add(hairs.short, 0.44, 0.16, 0.08, mats.hair, 0, 1.76, 0.19)
  add(hairs.long, 0.45, 0.13, 0.45, mats.hair, 0, 1.88, 0)
  add(hairs.long, 0.46, 0.5, 0.1, mats.hair, 0, 1.6, 0.2)
  for (const s of [-1, 1]) add(hairs.long, 0.06, 0.42, 0.42, mats.hair, s * 0.225, 1.66, 0.02)
  add(hairs.buzz, 0.43, 0.04, 0.43, mats.hair, 0, 1.86, 0)
  const hats: Record<Exclude<Hat, 'none'>, THREE.Group> = { cap: new THREE.Group(), beret: new THREE.Group() }
  const hatMat = new THREE.MeshLambertMaterial({ color: 0xc8282a })
  add(hats.cap, 0.46, 0.12, 0.46, hatMat, 0, 1.91, 0)
  add(hats.cap, 0.36, 0.03, 0.2, hatMat, 0, 1.86, -0.31)
  add(hats.beret, 0.5, 0.1, 0.5, mats.dark, 0.03, 1.92, 0)
  add(hats.beret, 0.06, 0.06, 0.06, mats.dark, 0.03, 2.0, 0)
  const glasses = new THREE.Group()
  for (const s of [-1, 1]) add(glasses, 0.13, 0.08, 0.02, mats.dark, s * 0.1, 1.68, -0.22)
  add(glasses, 0.07, 0.02, 0.02, mats.dark, 0, 1.69, -0.22)
  for (const g of [...Object.values(hairs), ...Object.values(hats), glasses]) {
    g.visible = false
    deco.add(g)
  }

  // 共享单车：黄色车架、两个轮子、车座、车把和前筐（人朝 -z，车头在 -z）
  const bike = new THREE.Group()
  bike.visible = false
  const frame = new THREE.MeshLambertMaterial({ color: 0xf2c12e })
  const bpart = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
    mesh.position.set(x, y, z)
    bike.add(mesh)
  }
  for (const z of [-0.62, 0.62]) bpart(0.1, 0.66, 0.66, mats.dark, 0, 0.33, z)
  bpart(0.08, 0.1, 1.2, frame, 0, 0.62, 0)
  bpart(0.08, 0.5, 0.1, frame, 0, 0.5, 0.1)
  bpart(0.08, 0.55, 0.1, frame, 0, 0.62, -0.55)
  bpart(0.22, 0.08, 0.3, mats.dark, 0, 0.9, 0.15)
  bpart(0.56, 0.06, 0.06, mats.dark, 0, 1.0, -0.62)
  bpart(0.34, 0.22, 0.26, frame, 0, 0.82, -0.86)
  group.add(bike)

  let texture: THREE.Texture | null = null
  let pending = 0
  const setSkinned = (on: boolean) => {
    for (const p of parts) p.mesh.material = on ? mats.textured : p.plain
    hatLayer.visible = on
    deco.visible = !on
  }

  return {
    group,
    body,
    bike,
    limbs: { armL, armR, legL, legR },
    apply(look: Look) {
      mats.skin.color.setHex(look.skin)
      mats.shirt.color.setHex(look.shirt)
      mats.pants.color.setHex(look.pants)
      mats.hair.color.setHex(look.hair)
      for (const [k, g] of Object.entries(hairs)) g.visible = k === look.hairStyle && (look.hat === 'none' || k === 'long')
      for (const [k, g] of Object.entries(hats)) g.visible = k === look.hat
      glasses.visible = look.glasses
      const id = ++pending
      if (!look.skinImage) {
        setSkinned(false)
        return
      }
      new THREE.TextureLoader().load(look.skinImage, (t) => {
        if (id !== pending) return t.dispose()
        t.magFilter = THREE.NearestFilter
        t.minFilter = THREE.NearestFilter
        t.colorSpace = THREE.SRGBColorSpace
        texture?.dispose()
        texture = t
        mats.textured.map = mats.overlay.map = t
        mats.textured.needsUpdate = mats.overlay.needsUpdate = true
        setSkinned(true)
      })
    },
    dispose() {
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose()
      })
      for (const m of [...Object.values(mats), hatMat, frame]) m.dispose()
      texture?.dispose()
    }
  }
}

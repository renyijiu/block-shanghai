// 方块小人的外观数据（纯数据，存档和界面用；建模在 character.ts）

export type HairStyle = 'short' | 'long' | 'buzz'
export type Hat = 'none' | 'cap' | 'beret'

export interface Look {
  skin: number
  hair: number
  hairStyle: HairStyle
  shirt: number
  pants: number
  hat: Hat
  glasses: boolean
  /** 上传的皮肤（64×64 PNG 的 data URL）；有皮肤时颜色设置不用 */
  skinImage: string | null
}

export const DEFAULT_LOOK: Look = { skin: 0xf0c8a0, hair: 0x2a2220, hairStyle: 'short', shirt: 0x3a7bd5, pants: 0x2f3440, hat: 'none', glasses: false, skinImage: null }

/** 界面上的色板 */
export const LOOK_PALETTE = {
  skin: [0xf6d7b8, 0xf0c8a0, 0xd9a77c, 0xb07a4f, 0x7a4f32],
  hair: [0x2a2220, 0x5a3a24, 0x9a6a3a, 0xd8b26a, 0x8a8a8a, 0xb84a3a],
  shirt: [0x3a7bd5, 0xc8282a, 0xf2f2ee, 0x2f6b55, 0xf2b705, 0x7a4fb0, 0x222222, 0xe88aa8],
  pants: [0x2f3440, 0x3a4a6a, 0x6b5a46, 0xd8d2c6, 0x222222, 0x5a6b3a]
}

/** 存档里的外观是不是合法（字段齐全、皮肤图不太大） */
export function validLook(v: unknown): v is Look {
  const l = v as Look | undefined
  const num = (x: unknown) => typeof x === 'number' && Number.isFinite(x)
  return (
    !!l &&
    num(l.skin) &&
    num(l.hair) &&
    num(l.shirt) &&
    num(l.pants) &&
    ['short', 'long', 'buzz'].includes(l.hairStyle) &&
    ['none', 'cap', 'beret'].includes(l.hat) &&
    typeof l.glasses === 'boolean' &&
    (l.skinImage === null || (typeof l.skinImage === 'string' && l.skinImage.startsWith('data:image/png') && l.skinImage.length < 200_000))
  )
}

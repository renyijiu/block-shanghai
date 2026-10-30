import { expect, test } from 'vitest'
import { InteractRegistry, type InteractPoint } from '../src/engine/world/interact.ts'

const pt = (x: number, label: string): InteractPoint => ({ x, z: 0, r: 4, label, action: '进站', kind: 'metro', station: 0, entrance: 0 })

test('取半径内最近的交互点，卸载 owner 后消失', () => {
  const reg = new InteractRegistry()
  reg.add('0,0', [pt(0, 'a'), pt(6, 'b')])
  expect(reg.nearest(2, 0)?.label).toBe('a')
  expect(reg.nearest(4, 0)?.label).toBe('b')
  expect(reg.nearest(20, 0)).toBeNull()
  reg.removeOwner('0,0')
  expect(reg.nearest(0, 0)).toBeNull()
})

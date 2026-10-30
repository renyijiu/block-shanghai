import { expect, test } from 'vitest'
import { decodeOpl, parseOpl } from '../tools/lib/osm.ts'

test('OPL 转义按码位解码', () => {
  expect(decodeOpl('%5b9d%%5c71%%533a%')).toBe('宝山区')
  expect(decodeOpl('Baoshan%20%District')).toBe('Baoshan District')
})

test('解析带坐标的 way 和 relation', () => {
  const { ways, relations } = parseOpl(
    [
      'w1 v1 dV c0 t2020-01-01T00:00:00Z i0 u Tboundary=administrative Nn1x121.1y31.2,n2x121.3y31.4',
      'r9 v1 dV c0 t2020-01-01T00:00:00Z i0 u Tadmin_level=6,name=%5b9d%%5c71%%533a% Mw1@outer,n5@label'
    ].join('\n')
  )
  expect(ways.get(1)).toEqual([[121.1, 31.2], [121.3, 31.4]])
  expect(relations[0]).toEqual({
    id: 9,
    tags: { admin_level: '6', name: '宝山区' },
    members: [
      { type: 'w', ref: 1, role: 'outer' },
      { type: 'n', ref: 5, role: 'label' }
    ]
  })
})

import { expect, test } from 'vitest'
import { buildings, inPolygon, RESORT } from '../src/cities/shanghai/buildings.ts'

const place = (lat: number, lon: number) => ({ lat, lon, district: 'pudong', distKm: 20 })

test('度假区范围：湖、湖边小镇、星愿游乐园在里面，人民广场和川沙在外面', () => {
  expect(inPolygon(31.1415, 121.6607, RESORT)).toBe(true)
  expect(inPolygon(31.14235, 121.65727, RESORT)).toBe(true)
  expect(inPolygon(31.14926, 121.6676, RESORT)).toBe(true)
  expect(inPolygon(31.2325, 121.4712, RESORT)).toBe(false)
  expect(inPolygon(31.19, 121.7, RESORT)).toBe(false)
})

test('度假区里不盖住宅楼，只有园林和度假酒店；外面一圈以低层为主', () => {
  expect(Object.keys(buildings.mixAt(place(31.145, 121.66))!).sort()).toEqual(['resortgarden', 'resorthotel'])
  const around = buildings.mixAt(place(31.16, 121.672))!
  expect(around.suburban).toBeGreaterThan(0.5)
  expect(around.highrise ?? 0).toBeLessThan(0.2)
})

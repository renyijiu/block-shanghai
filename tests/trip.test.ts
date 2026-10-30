import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { announce, callAt, crowdLevel, exitDirection, loopContinue, nextCall, platformSides, segmentSeconds } from '../src/engine/interior/trip.ts'
import type { MetroData } from '../src/engine/metro/data.ts'
import { MetroSystem } from '../src/engine/metro/MetroSystem.ts'

const data = JSON.parse(readFileSync(new URL('../src/cities/shanghai/data/metro.json', import.meta.url), 'utf8')) as MetroData
const metro = MetroSystem.fromData(data)
const st = (name: string) => data.stations.findIndex((s) => s.name === name)
const H = 3600

test('站台两侧：人民广场 2 号线一侧往浦东机场、一侧往蟠祥路', () => {
  const sides = platformSides(metro, st('人民广场'), 'L2')
  expect(sides).toHaveLength(2)
  const towards = sides.map((s) => s.toward).join('|')
  expect(towards).toContain('浦东1号2号航站楼')
  expect(towards).toContain('蟠祥路')
})

test('环线两侧是内圈、外圈；终点站只剩开出去的一侧', () => {
  expect(platformSides(metro, st('宝山路'), 'L4').map((s) => s.toward).sort()).toEqual(['内圈', '外圈'])
  const xinzhuang = platformSides(metro, st('莘庄'), 'L1')
  expect(xinzhuang).toHaveLength(1)
  expect(xinzhuang[0]!.toward).toContain('富锦路')
})

test('下一班：早高峰几分钟内就有车，时刻和交路时刻表一致', () => {
  const side = platformSides(metro, st('人民广场'), 'L2')[0]!
  const t = 8 * H + 30 * 60
  const c = nextCall(side, t)!
  expect(c.arrive).toBeGreaterThanOrEqual(t)
  expect(c.arrive - t).toBeLessThanOrEqual(3 * 60 + 1)
  const again = callAt(c.rt, c.stop, c.dep)
  expect(again.arrive).toBe(c.arrive)
  expect(again.depart - again.arrive).toBe(data.rules.dwellSec)
  // 半夜没车，下一班是早上首班开出以后
  const night = nextCall(side, 26 * H)!
  expect(night.arrive).toBeGreaterThan(24 * H + 5.5 * H)
  expect(night.arrive).toBeLessThan(24 * H + 7 * H)
})

test('环线跑完一圈接下一班', () => {
  const rt = metro.services.find((s) => s.line.id === 'L4')!
  const c = loopContinue(rt, 10 * H)!
  expect(c.stop).toBe(0)
  expect(c.arrive).toBeGreaterThanOrEqual(10 * H)
})

test('报站：下一站、到站、终点站，中英文都带换乘', () => {
  const next = announce(data, st('人民广场'), 'L2', true, false)
  expect(next.zh).toBe('下一站：人民广场。可换乘8号线、1号线。')
  expect(next.en).toBe("Next stop: People's Square. You can transfer to Line 8 and Line 1.")
  expect(announce(data, st('陆家嘴'), 'L2', false, false).zh).toBe('陆家嘴 到了。可换乘14号线。')
  const end = announce(data, st('莘庄'), 'L1', false, true)
  expect(end.zh).toContain('终点站 莘庄')
  expect(end.en).toContain('terminal station')
})

test('车厢拥挤：干线高峰满员，其他线高峰没座，平峰有座，深夜空', () => {
  const peak = data.rules.peakHours
  expect(crowdLevel('L2', 8 * H, peak)).toBe('full')
  expect(crowdLevel('L12', 8 * H, peak)).toBe('busy')
  expect(crowdLevel('L2', 14 * H, peak)).toBe('normal')
  expect(crowdLevel('L2', 22 * H, peak)).toBe('sparse')
})

test('出口方位、区间展示时长', () => {
  expect(exitDirection([0, 0], [10, 0])).toBe('东')
  expect(exitDirection([0, 0], [0, 10])).toBe('南')
  expect(exitDirection([0, 0], [-10, -10])).toBe('西北')
  expect(segmentSeconds(60)).toBe(10)
  expect(segmentSeconds(150)).toBe(12.5)
  expect(segmentSeconds(600)).toBe(15)
})

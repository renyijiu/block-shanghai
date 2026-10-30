<template>
  <div class="metro">
    <canvas ref="canvas" @wheel="onWheel" @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @pointercancel="onUp"></canvas>

    <div class="top">
      <div class="title">上海地铁<span v-if="inStation && fromStation"> · {{ fromStation.name }}站</span></div>
      <div class="tools">
        <button title="放大" @click="zoom(1.5)">＋</button>
        <button title="缩小" @click="zoom(1 / 1.5)">－</button>
        <button title="关闭（Esc）" @click="emit('close')">✕</button>
      </div>
    </div>

    <div class="legend">
      <span v-for="l in metro.data.lines" :key="l.id" class="chip" :style="{ background: l.color }">{{ l.name.replace('号线', '') }}</span>
    </div>

    <div class="plan">
      <label>
        <span class="dot from">起</span>
        <input v-model="fromText" placeholder="起点站（中文或拼音）" @focus="focus = 'from'" @input="focus = 'from'" />
      </label>
      <label>
        <span class="dot to">终</span>
        <input v-model="toText" placeholder="终点站，也可以在图上点选" @focus="focus = 'to'" @input="focus = 'to'" />
      </label>
      <ul v-if="suggestions.length" class="suggest">
        <li v-for="i in suggestions" :key="i" @pointerdown.prevent="choose(i)">
          {{ stations[i]!.name }} <small>{{ stations[i]!.nameEn }}</small>
          <span v-for="l in stations[i]!.lines" :key="l" class="mini" :style="{ background: lineOf(l).color }"></span>
        </li>
      </ul>
      <div class="modes">
        <button :class="{ on: mode === 'fastest' }" @click="mode = 'fastest'">最快</button>
        <button :class="{ on: mode === 'fewest' }" @click="mode = 'fewest'">少换乘</button>
      </div>

      <div v-if="route" class="result">
        <div class="summary">约 {{ Math.round(route.minutes) }} 分钟 · {{ route.fare }} 元 · {{ route.transfers ? `换乘 ${route.transfers} 次` : '直达' }}</div>
        <ol>
          <li v-for="(leg, k) in route.legs" :key="k">
            <span class="chip" :style="{ background: lineOf(leg.line).color }">{{ lineOf(leg.line).name }}</span>
            {{ stations[leg.from]!.name }} → {{ stations[leg.to]!.name }}
            <small>{{ leg.stations.length - 1 }} 站 · {{ Math.round(leg.minutes) }} 分钟</small>
          </li>
        </ol>
        <button class="go" :disabled="!inStation || from !== initialFrom" @click="emit('travel', route)">快速到达</button>
        <div v-if="!inStation" class="hint">从地铁口进站后才能乘车（走到地铁口按 E）</div>
        <div v-else-if="from !== initialFrom" class="hint">要从本站（{{ stations[initialFrom!]!.name }}）出发才能乘车</div>
      </div>
      <div v-else-if="from !== null && to !== null" class="hint">{{ from === to ? '起点和终点是同一站' : '没有找到路线' }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Game } from '../engine/Game.ts'
import { drawMap, type MapView } from '../engine/map/drawMap.ts'
import { drawMetro, stationAt } from '../engine/map/drawMetro.ts'
import type { Route, RouteMode } from '../engine/metro/network.ts'
import { usePanZoom } from './usePanZoom.ts'

const props = defineProps<{ game: Game; initialFrom: number | null; inStation: boolean }>()
const emit = defineEmits<{ close: []; travel: [route: Route] }>()
const metro = props.game.metro!
const stations = metro.data.stations
const lineOf = (id: string) => metro.lineById.get(id)!

const canvas = ref<HTMLCanvasElement | null>(null)
const from = ref<number | null>(props.initialFrom)
const to = ref<number | null>(null)
const fromText = ref(from.value !== null ? stations[from.value]!.name : '')
const toText = ref('')
const focus = ref<'from' | 'to' | null>(null)
const mode = ref<RouteMode>('fastest')
const fromStation = computed(() => (from.value !== null ? stations[from.value] : null))

// 搜索：中文站名、英文 / 拼音站名都能匹配（英文站名大多就是拼音，如 Lujiazui）
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9一-鿿]/g, '')
const suggestions = computed(() => {
  const text = focus.value === 'from' ? fromText.value : focus.value === 'to' ? toText.value : ''
  const sel = focus.value === 'from' ? from.value : to.value
  const q = norm(text)
  if (!q || (sel !== null && stations[sel]!.name === text)) return []
  const hits: number[] = []
  stations.forEach((s, i) => {
    if (norm(s.name).includes(q) || norm(s.nameEn).includes(q) || norm(s.id).includes(q)) hits.push(i)
  })
  // 站名以输入开头的排前面
  return hits.sort((a, b) => Number(!norm(stations[a]!.name).startsWith(q)) - Number(!norm(stations[b]!.name).startsWith(q))).slice(0, 8)
})

function choose(i: number) {
  if (focus.value === 'from') {
    from.value = i
    fromText.value = stations[i]!.name
  } else {
    to.value = i
    toText.value = stations[i]!.name
  }
  focus.value = null
  dirty = true
}

const route = computed(() => (from.value !== null && to.value !== null && from.value !== to.value ? metro.plan(from.value, to.value, mode.value) : null))
watch(route, () => (dirty = true))

// 线路图：初始以起点为中心
const start = from.value !== null ? stations[from.value]!.pos : [props.game.mapPos.x, props.game.mapPos.z]
const view = { x: start[0]!, z: start[1]!, scale: 0.12 }
let dirty = true
let raf = 0
const { zoom, onWheel, onDown, onMove, onUp } = usePanZoom(view, {
  min: 0.025,
  max: 3,
  onChange: () => (dirty = true),
  // 点图上的车站：没选起点就设起点，否则设终点
  onTap: (px, py) => {
    const i = stationAt(metro.data, { ...view, width: innerWidth, height: innerHeight, dpr: 1 }, px, py)
    if (i === null) return
    focus.value = from.value === null ? 'from' : 'to'
    choose(i)
  }
})

function frame() {
  raf = requestAnimationFrame(frame)
  if (!dirty) return
  dirty = false
  const c = canvas.value
  const world = props.game.world
  if (!c || !world) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  if (c.width !== innerWidth * dpr || c.height !== innerHeight * dpr) {
    c.width = innerWidth * dpr
    c.height = innerHeight * dpr
  }
  const ctx = c.getContext('2d')!
  const v: MapView = { ...view, width: innerWidth, height: innerHeight, dpr }
  drawMap(ctx, world, v)
  // 底图淡化，突出线路
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)'
  ctx.fillRect(0, 0, c.width, c.height)
  drawMetro(ctx, metro.data, v, { route: route.value, from: from.value, to: to.value })
}

onMounted(() => (raf = requestAnimationFrame(frame)))
onBeforeUnmount(() => cancelAnimationFrame(raf))
</script>

<style scoped>
.metro {
  position: fixed;
  inset: 0;
  z-index: 10;
  background: #f4f1ea;
  font-size: 14px;
}

canvas {
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none;
}

.top {
  position: absolute;
  top: max(12px, env(safe-area-inset-top));
  left: max(12px, env(safe-area-inset-left));
  right: max(12px, env(safe-area-inset-right));
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  pointer-events: none;
}

.title {
  padding: 8px 14px;
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
  font-weight: 700;
  border-radius: 8px;
}

.tools {
  display: flex;
  gap: 8px;
  pointer-events: auto;
}

.tools button {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.25);
  font-size: 18px;
  cursor: pointer;
}

.legend {
  position: absolute;
  top: calc(max(12px, env(safe-area-inset-top)) + 46px);
  left: max(12px, env(safe-area-inset-left));
  max-width: 60%;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  pointer-events: none;
}

.chip {
  display: inline-block;
  min-width: 22px;
  padding: 1px 6px;
  border-radius: 4px;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  text-align: center;
  text-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
}

.plan {
  position: absolute;
  right: max(12px, env(safe-area-inset-right));
  bottom: max(12px, env(safe-area-inset-bottom));
  width: min(360px, calc(100% - 24px));
  max-height: 70%;
  overflow: auto;
  padding: 12px;
  background: rgba(255, 255, 255, 0.97);
  border-radius: 12px;
  box-shadow: 0 2px 14px rgba(0, 0, 0, 0.25);
}

label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

input {
  flex: 1;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid #ccc;
  border-radius: 8px;
  font-size: 15px;
  font-family: inherit;
}

.dot {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}

.dot.from {
  background: #2e8b57;
}

.dot.to {
  background: #c8282a;
}

.suggest {
  list-style: none;
  margin: 0 0 6px;
  padding: 0;
  border: 1px solid #ddd;
  border-radius: 8px;
}

.suggest li {
  padding: 7px 10px;
  border-bottom: 1px solid #eee;
  cursor: pointer;
}

.suggest li:last-child {
  border-bottom: none;
}

.suggest small {
  color: #888;
  margin-right: 4px;
}

.mini {
  display: inline-block;
  width: 10px;
  height: 10px;
  margin-left: 2px;
  border-radius: 2px;
}

.modes {
  display: flex;
  gap: 6px;
  margin: 4px 0 8px;
}

.modes button {
  flex: 1;
  padding: 6px;
  border: 1px solid #ccc;
  border-radius: 8px;
  background: #fff;
  font-family: inherit;
  cursor: pointer;
}

.modes button.on {
  background: #2a2a2a;
  color: #fff;
  border-color: #2a2a2a;
}

.summary {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 6px;
}

ol {
  margin: 0 0 10px;
  padding-left: 18px;
}

ol li {
  margin-bottom: 4px;
}

ol small {
  color: #888;
}

.go {
  width: 100%;
  padding: 10px;
  border: none;
  border-radius: 10px;
  background: #c8282a;
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
}

.go:disabled {
  background: #bbb;
  cursor: default;
}

.hint {
  margin-top: 6px;
  color: #888;
  font-size: 13px;
}
</style>

<template>
  <div class="bigmap">
    <canvas
      ref="canvas"
      @wheel.prevent="onWheel"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
    ></canvas>
    <div class="title">{{ title }}<span v-if="here"> · 你在{{ here }}</span></div>
    <div class="tools">
      <button title="放大" @click="zoom(1.5)">＋</button>
      <button title="缩小" @click="zoom(1 / 1.5)">－</button>
      <button title="回到我的位置" @click="center()">◎</button>
      <button title="关闭（M / Esc）" @click="emit('close')">✕</button>
    </div>
    <div class="credit">© OpenStreetMap contributors</div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { Game } from '../engine/Game.ts'
import { drawMap, toScreen, type MapView } from '../engine/map/drawMap.ts'

const props = defineProps<{ game: Game; title: string; here: string | null }>()
const emit = defineEmits<{ close: [] }>()
const canvas = ref<HTMLCanvasElement | null>(null)
const config = props.game.city.config
const districtColors = Object.fromEntries(Object.entries(config.districts).map(([id, d]) => [id, d.color]))
const view = { x: 0, z: 0, scale: 0.25 }
const pointers = new Map<number, { x: number; y: number }>()
let dirty = true
let raf = 0
let last = 0

function center() {
  view.x = props.game.player.pos.x
  view.z = props.game.player.pos.z
  dirty = true
}

function zoom(k: number, cx = innerWidth / 2, cy = innerHeight / 2) {
  // 以 (cx, cy) 为中心缩放
  const wx = view.x + (cx - innerWidth / 2) / view.scale
  const wz = view.z + (cy - innerHeight / 2) / view.scale
  view.scale = Math.min(4, Math.max(0.03, view.scale * k))
  view.x = wx - (cx - innerWidth / 2) / view.scale
  view.z = wz - (cy - innerHeight / 2) / view.scale
  dirty = true
}

function onWheel(e: WheelEvent) {
  zoom(Math.exp(-e.deltaY * 0.002), e.clientX, e.clientY)
}

function onDown(e: PointerEvent) {
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
}

function onMove(e: PointerEvent) {
  const prev = pointers.get(e.pointerId)
  if (!prev) return
  if (pointers.size === 2) {
    // 双指缩放
    const [a, b] = [...pointers.values()]
    const before = Math.hypot(a!.x - b!.x, a!.y - b!.y)
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const [c, d] = [...pointers.values()]
    zoom(Math.hypot(c!.x - d!.x, c!.y - d!.y) / before, (c!.x + d!.x) / 2, (c!.y + d!.y) / 2)
    return
  }
  view.x -= (e.clientX - prev.x) / view.scale
  view.z -= (e.clientY - prev.y) / view.scale
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  dirty = true
}

function onUp(e: PointerEvent) {
  pointers.delete(e.pointerId)
}

function frame(now: number) {
  raf = requestAnimationFrame(frame)
  // 玩家在动时每 0.2 秒刷新一次位置
  if (!dirty && now - last < 200) return
  last = now
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
  drawMap(ctx, world, v, { districtColors, districtLines: true, labels: true })
  // 玩家：红色箭头
  const p = props.game.player
  const [px, py] = toScreen(v, p.pos.x, p.pos.z)
  ctx.save()
  ctx.translate(px, py)
  ctx.rotate(-p.facing)
  ctx.beginPath()
  ctx.moveTo(0, -11 * dpr)
  ctx.lineTo(7 * dpr, 8 * dpr)
  ctx.lineTo(0, 4 * dpr)
  ctx.lineTo(-7 * dpr, 8 * dpr)
  ctx.closePath()
  ctx.fillStyle = '#c8282a'
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 2 * dpr
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

onMounted(() => {
  center()
  raf = requestAnimationFrame(frame)
})
onBeforeUnmount(() => cancelAnimationFrame(raf))
</script>

<style scoped>
.bigmap {
  position: fixed;
  inset: 0;
  background: #efe9dc;
  z-index: 10;
}

canvas {
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none;
  cursor: grab;
}

.title {
  position: absolute;
  top: max(12px, env(safe-area-inset-top));
  left: max(12px, env(safe-area-inset-left));
  padding: 8px 14px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  border-radius: 8px;
  pointer-events: none;
}

.title span {
  font-weight: 400;
}

.tools {
  position: absolute;
  top: max(12px, env(safe-area-inset-top));
  right: max(12px, env(safe-area-inset-right));
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tools button {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  border: none;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.25);
  font-size: 20px;
  cursor: pointer;
}

.credit {
  position: absolute;
  right: 6px;
  bottom: 4px;
  font-size: 11px;
  color: rgba(0, 0, 0, 0.55);
  pointer-events: none;
}
</style>

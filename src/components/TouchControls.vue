<template>
  <div class="touch">
    <!-- 左下角虚拟摇杆 -->
    <div ref="pad" class="pad" @pointerdown="startStick" @pointermove="moveStick" @pointerup="endStick" @pointercancel="endStick">
      <div class="knob" :style="{ transform: `translate(${knob.x}px, ${knob.y}px)` }"></div>
    </div>
    <!-- 右半屏拖动转视角 -->
    <div class="look" @pointerdown="startLook" @pointermove="moveLook" @pointerup="endLook" @pointercancel="endLook"></div>
    <div v-if="buttons" class="buttons">
      <button v-if="action" class="act" @pointerdown.prevent="input.press('interact')">{{ action }}</button>
      <button :class="{ on: running }" @pointerdown.prevent="toggleRun">跑</button>
      <button @pointerdown.prevent="input.press('view')">视角</button>
      <button class="jump" @pointerdown.prevent="input.press('jump')">跳</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import type { Input } from '../engine/actors/Input.ts'

const props = withDefaults(defineProps<{ input: Input; action: string | null; buttons?: boolean }>(), { buttons: true })
const input = props.input
const pad = ref<HTMLDivElement | null>(null)
const RADIUS = 48 // 摇杆可推动的半径（像素）
const knob = reactive({ x: 0, y: 0 })
const running = ref(false)
let stickId: number | null = null
let look: { id: number; x: number; y: number } | null = null

function startStick(e: PointerEvent) {
  stickId = e.pointerId
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  moveStick(e)
}

function moveStick(e: PointerEvent) {
  if (e.pointerId !== stickId || !pad.value) return
  const r = pad.value.getBoundingClientRect()
  let dx = e.clientX - (r.left + r.width / 2)
  let dy = e.clientY - (r.top + r.height / 2)
  const len = Math.hypot(dx, dy)
  if (len > RADIUS) {
    dx = (dx / len) * RADIUS
    dy = (dy / len) * RADIUS
  }
  knob.x = dx
  knob.y = dy
  input.setStick(dx / RADIUS, -dy / RADIUS)
}

function endStick(e: PointerEvent) {
  if (e.pointerId !== stickId) return
  stickId = null
  knob.x = knob.y = 0
  input.setStick(0, 0)
}

function startLook(e: PointerEvent) {
  look = { id: e.pointerId, x: e.clientX, y: e.clientY }
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}

function moveLook(e: PointerEvent) {
  if (!look || e.pointerId !== look.id) return
  // 触屏转视角比鼠标灵敏一些
  input.look((e.clientX - look.x) * 1.4, (e.clientY - look.y) * 1.4)
  look.x = e.clientX
  look.y = e.clientY
}

function endLook(e: PointerEvent) {
  if (look?.id === e.pointerId) look = null
}

function toggleRun() {
  running.value = !running.value
  input.runToggle = running.value
}
</script>

<style scoped>
.touch {
  position: fixed;
  inset: 0;
  pointer-events: none;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
}

.pad {
  position: absolute;
  left: max(24px, env(safe-area-inset-left));
  bottom: max(28px, env(safe-area-inset-bottom));
  width: 132px;
  height: 132px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.22);
  border: 2px solid rgba(255, 255, 255, 0.45);
  pointer-events: auto;
  display: flex;
  align-items: center;
  justify-content: center;
}

.knob {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.75);
}

.look {
  position: absolute;
  right: 0;
  top: 0;
  width: 50%;
  height: 100%;
  pointer-events: auto;
}

.buttons {
  position: absolute;
  right: max(20px, env(safe-area-inset-right));
  bottom: max(28px, env(safe-area-inset-bottom));
  display: flex;
  gap: 12px;
  align-items: flex-end;
  pointer-events: auto;
}

button {
  width: 58px;
  height: 58px;
  border-radius: 12px;
  border: 2px solid rgba(255, 255, 255, 0.6);
  background: rgba(0, 0, 0, 0.35);
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  font-family: inherit;
}

button.on {
  background: rgba(58, 123, 213, 0.75);
}

button.act {
  background: rgba(200, 40, 42, 0.85);
}

button.jump {
  width: 72px;
  height: 72px;
  border-radius: 50%;
}
</style>

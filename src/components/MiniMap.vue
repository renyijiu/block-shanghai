<template>
  <button class="minimap" title="打开地图（M）" @click="emit('open')">
    <canvas ref="canvas"></canvas>
    <div class="arrow" :style="{ transform: `translate(-50%, -50%) rotate(${-facing}rad)` }"></div>
    <div class="north">北</div>
  </button>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { Game } from '../engine/Game.ts'
import { drawMap } from '../engine/map/drawMap.ts'
import { drawWalks } from '../engine/map/drawWalks.ts'

const props = defineProps<{ game: Game; size: number }>()
const emit = defineEmits<{ open: [] }>()
const canvas = ref<HTMLCanvasElement | null>(null)
const facing = ref(0)
// 小地图比例：1 CSS 像素 ≈ 1.6 格，半径约 120 格（核心区约 600 米）
const SCALE = 0.62
let raf = 0
let last = 0

function frame(now: number) {
  raf = requestAnimationFrame(frame)
  // 10 Hz 重画就够了
  if (now - last < 100) return
  last = now
  const c = canvas.value
  const world = props.game.world
  if (!c || !world) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  if (c.width !== props.size * dpr) {
    c.width = c.height = props.size * dpr
  }
  const p = props.game.player.pos
  facing.value = props.game.player.facing
  const view = { x: p.x, z: p.z, scale: SCALE, width: props.size, height: props.size, dpr }
  const ctx = c.getContext('2d')!
  drawMap(ctx, world, view)
  // 正在走的 Citywalk：路线和下一站
  const g = props.game
  if (g.walks && g.life.activeWalk) drawWalks(ctx, view, { routes: g.walks.routes, progress: g.life.walks, only: g.life.activeWalk })
}

onMounted(() => (raf = requestAnimationFrame(frame)))
onBeforeUnmount(() => cancelAnimationFrame(raf))
</script>

<style scoped>
.minimap {
  position: fixed;
  top: max(12px, env(safe-area-inset-top));
  right: max(12px, env(safe-area-inset-right));
  width: v-bind('props.size + "px"');
  height: v-bind('props.size + "px"');
  padding: 0;
  border-radius: 50%;
  overflow: hidden;
  border: 3px solid rgba(255, 255, 255, 0.85);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
  background: #efe9dc;
  cursor: pointer;
}

canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.arrow {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 0;
  height: 0;
  border-left: 7px solid transparent;
  border-right: 7px solid transparent;
  border-bottom: 16px solid #c8282a;
  filter: drop-shadow(0 0 1px #fff);
}

.north {
  position: absolute;
  top: 3px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 11px;
  font-weight: 700;
  color: #c8282a;
  text-shadow: 0 0 2px #fff;
}
</style>

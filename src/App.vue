<template>
  <div ref="container" class="stage"></div>
  <div class="hud">
    <div class="title">{{ config.name }} · {{ config.nameEn }}</div>
    <div v-if="loading">{{ loading }}</div>
    <template v-else>
      <div>渲染：{{ backend }} · {{ stats.fps }} fps · {{ stats.drawCalls }} 次绘制 · {{ (stats.triangles / 1000).toFixed(0) }}k 三角形</div>
      <div>分块：{{ stats.chunks }}（待建 {{ stats.pending }}）· 位置：{{ stats.x }}, {{ stats.z }} 格</div>
      <div class="hint">WASD 移动 · Q/E 升降 · Shift 加速 · 拖动旋转 · 滚轮缩放</div>
    </template>
  </div>
  <div class="credit">© OpenStreetMap contributors</div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { Game, type GameStats } from './engine/Game.ts'
import { CITIES, DEFAULT_CITY } from './cities/index.ts'

const city = CITIES[DEFAULT_CITY]
const config = city.config
const container = ref<HTMLDivElement | null>(null)
const backend = ref('')
const loading = ref('初始化渲染器…')
const stats = reactive<GameStats>({ fps: 0, drawCalls: 0, triangles: 0, chunks: 0, pending: 0, x: 0, z: 0 })
let game: Game | null = null
let timer = 0

onMounted(async () => {
  if (!container.value) return
  const g = new Game(container.value, city)
  game = g
  try {
    backend.value = await g.init((text) => (loading.value = text))
    loading.value = ''
    g.start()
    // 引擎状态按 5 Hz 同步到界面（docs/07 第 5 节）
    timer = window.setInterval(() => Object.assign(stats, g.stats), 200)
    // 截图脚本用
    Object.assign(window, { __ready: true, __probe: () => ({ backend: backend.value, ...g.stats }) })
  } catch (e) {
    loading.value = '初始化失败：' + (e instanceof Error ? e.message : String(e))
    console.error(e)
  }
})

onBeforeUnmount(() => {
  clearInterval(timer)
  game?.dispose()
  game = null
})
</script>

<style scoped>
.stage {
  position: fixed;
  inset: 0;
}

.hud {
  position: fixed;
  top: 12px;
  left: 12px;
  padding: 10px 14px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 13px;
  line-height: 1.6;
  pointer-events: none;
}

.title {
  font-size: 16px;
  font-weight: 700;
}

.hint {
  opacity: 0.75;
}

.credit {
  position: fixed;
  right: 6px;
  bottom: 4px;
  font-size: 11px;
  color: rgba(0, 0, 0, 0.55);
  pointer-events: none;
}
</style>

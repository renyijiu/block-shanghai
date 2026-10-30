<template>
  <div ref="container" class="stage"></div>
  <div class="hud" :class="{ compact: touch }">
    <div class="title">{{ config.name }}<span v-if="!touch"> · {{ config.nameEn }}</span></div>
    <div v-if="loading">{{ loading }}</div>
    <template v-else>
      <div>{{ backend }} · {{ stats.fps }} fps<span v-if="!touch"> · {{ stats.drawCalls }} 次绘制 · {{ (stats.triangles / 1000).toFixed(0) }}k 三角形</span></div>
      <div v-if="!touch">分块：{{ stats.chunks }}（待建 {{ stats.pending }}）· 位置：{{ stats.x }}, {{ stats.z }} 格</div>
      <div v-if="!touch" class="hint">{{ stats.mode === 'dev' ? 'WASD 移动 · Q/E 升降 · Shift 加速 · 拖动旋转 · 滚轮缩放' : 'WASD 移动 · Shift 奔跑 · 空格跳 · 拖动转视角 · 滚轮远近 · V 切换视角 · M 地图' }}</div>
    </template>
  </div>
  <template v-if="game && !loading && stats.mode === 'player'">
    <MiniMap v-if="!mapOpen" :game="game" :size="mapSize" @open="mapOpen = true" />
    <button v-if="!mapOpen" class="quality" :style="{ top: `calc(max(12px, env(safe-area-inset-top)) + ${mapSize + 10}px)` }" title="切换画质" @click="cycleQuality">
      画质 {{ QUALITY_PRESETS[quality].label }}
    </button>
    <TouchControls v-if="touch && !mapOpen" :input="game.input" />
    <DistrictToast :name="toast.name" :theme="toast.theme" />
    <BigMap v-if="mapOpen" :game="game" :title="config.name" :here="districtName" @close="mapOpen = false" />
  </template>
  <div v-if="!mapOpen" class="credit">© OpenStreetMap contributors</div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import BigMap from './components/BigMap.vue'
import DistrictToast from './components/DistrictToast.vue'
import MiniMap from './components/MiniMap.vue'
import TouchControls from './components/TouchControls.vue'
import { Game, type GameStats } from './engine/Game.ts'
import { QUALITY_ORDER, QUALITY_PRESETS, type QualityLevel } from './engine/quality.ts'
import { CITIES, DEFAULT_CITY } from './cities/index.ts'

const city = CITIES[DEFAULT_CITY]
const config = city.config
const container = ref<HTMLDivElement | null>(null)
const backend = ref('')
const loading = ref('初始化渲染器…')
const stats = reactive<GameStats>({ fps: 0, drawCalls: 0, triangles: 0, chunks: 0, pending: 0, buildAvg: 0, buildMax: 0, x: 0, z: 0, mode: 'player', view: 'third', district: null })
// 触屏设备显示摇杆和按钮
const touch = matchMedia('(pointer: coarse)').matches
const game = shallowRef<Game | null>(null)
let timer = 0
const mapOpen = ref(false)
const mapSize = touch ? 112 : 160

// 画质：低 → 中 → 高 循环，切换后立即存档
const quality = ref<QualityLevel>('mid')
function cycleQuality() {
  const g = game.value
  if (!g) return
  const next = QUALITY_ORDER[(QUALITY_ORDER.indexOf(quality.value) + 1) % QUALITY_ORDER.length]!
  g.setQuality(next)
  g.saveNow()
  quality.value = next
}

// 区名：进入新的区时弹出提示（docs/06 P1 验收）
type DistrictId = keyof typeof config.districts
const districtName = computed(() => (stats.district ? config.districts[stats.district as DistrictId]?.name ?? null : null))
const toast = reactive({ name: '', theme: '' })
watch(
  () => stats.district,
  (id) => {
    const d = id ? config.districts[id as DistrictId] : null
    if (d) Object.assign(toast, { name: d.name, theme: d.theme })
  }
)

// 地图打开时暂停移动；M 开关地图，Esc 关闭
watch(mapOpen, (open) => {
  if (game.value) game.value.input.enabled = !open
})
function onKey(e: KeyboardEvent) {
  if (loading.value || stats.mode !== 'player') return
  if (e.code === 'KeyM' && !e.repeat) mapOpen.value = !mapOpen.value
  else if (e.code === 'Escape') mapOpen.value = false
}
addEventListener('keydown', onKey)

onMounted(async () => {
  if (!container.value) return
  const g = new Game(container.value, city)
  game.value = g
  try {
    backend.value = await g.init((text) => (loading.value = text))
    quality.value = g.quality
    loading.value = ''
    g.start()
    // 引擎状态按 5 Hz 同步到界面（docs/07 第 5 节）
    timer = window.setInterval(() => Object.assign(stats, g.stats), 200)
    // 截图脚本用
    const p = g.player.pos
    Object.assign(window, {
      __ready: true,
      __probe: () => ({ backend: backend.value, ...g.stats, player: [+p.x.toFixed(1), +p.y.toFixed(2), +p.z.toFixed(1)], autopilot: g.autopilot, toast: toast.name }),
      __openMap: () => (mapOpen.value = true)
    })
  } catch (e) {
    loading.value = '初始化失败：' + (e instanceof Error ? e.message : String(e))
    console.error(e)
  }
})

onBeforeUnmount(() => {
  removeEventListener('keydown', onKey)
  clearInterval(timer)
  game.value?.dispose()
  game.value = null
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

.hud.compact {
  top: max(8px, env(safe-area-inset-top));
  left: max(8px, env(safe-area-inset-left));
  padding: 6px 10px;
  font-size: 12px;
  line-height: 1.5;
}

.hud.compact .title {
  font-size: 14px;
}

.quality {
  position: fixed;
  right: max(12px, env(safe-area-inset-right));
  padding: 5px 12px;
  border: none;
  border-radius: 14px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
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

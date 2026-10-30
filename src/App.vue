<template>
  <div ref="container" class="stage"></div>
  <div class="hud" :class="{ compact: touch }">
    <div class="title">{{ config.name }}<span v-if="!touch"> · {{ config.nameEn }}</span></div>
    <div v-if="loading">{{ loading }}</div>
    <template v-else>
      <div class="status">🕘 {{ stats.time }} · ¥{{ stats.money }} · 景点 {{ stats.found }}/{{ stats.landmarks }}</div>
      <div>{{ backend }} · {{ stats.fps }} fps<span v-if="!touch"> · {{ stats.drawCalls }} 次绘制 · {{ (stats.triangles / 1000).toFixed(0) }}k 三角形</span></div>
      <div v-if="!touch">分块：{{ stats.chunks }}（待建 {{ stats.pending }}）· 位置：{{ stats.x }}, {{ stats.z }} 格</div>
      <div v-if="!touch" class="hint">{{ stats.mode === 'dev' ? 'WASD 移动 · Q/E 升降 · Shift 加速 · 拖动旋转 · 滚轮缩放' : 'WASD 移动 · Shift 奔跑 · 空格跳 · 拖动转视角 · 滚轮远近 · V 切换视角 · M 地图 · E 交互' }}</div>
    </template>
  </div>
  <template v-if="game && !loading && stats.mode === 'player'">
    <template v-if="!panelOpen">
      <MiniMap :game="game" :size="mapSize" @open="mapOpen = true" />
      <div class="side" :style="{ top: `calc(max(12px, env(safe-area-inset-top)) + ${mapSize + 10}px)` }">
        <button title="地铁线路图" @click="openMetro(null)">🚇 地铁</button>
        <button title="切换画质" @click="cycleQuality">画质 {{ QUALITY_PRESETS[quality].label }}</button>
      </div>
      <TouchControls v-if="touch" :input="game.input" :action="stats.prompt?.action ?? null" />
      <div v-if="stats.prompt" class="prompt">
        <b v-if="!touch">E</b> {{ stats.prompt.action }} · {{ stats.prompt.label }}
      </div>
    </template>
    <DistrictToast :name="toast.name" :theme="toast.theme" />
    <DiscoverToast :landmark="discovered" />
    <BigMap v-if="mapOpen" :game="game" :title="config.name" :here="districtName" @close="mapOpen = false" />
    <MetroPanel v-if="metroPanel" :game="game" :initial-from="metroPanel.from" :in-station="metroPanel.inStation" @close="metroPanel = null" @travel="travel" />
    <Transition name="fade">
      <div v-if="travelText" class="travel">{{ travelText }}</div>
    </Transition>
    <Transition name="fade">
      <div v-if="notice" class="notice">{{ notice }}</div>
    </Transition>
  </template>
  <div v-if="!panelOpen" class="credit">© OpenStreetMap contributors</div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import BigMap from './components/BigMap.vue'
import DiscoverToast, { type DiscoverInfo } from './components/DiscoverToast.vue'
import DistrictToast from './components/DistrictToast.vue'
import MetroPanel from './components/MetroPanel.vue'
import MiniMap from './components/MiniMap.vue'
import TouchControls from './components/TouchControls.vue'
import { Game, type GameStats } from './engine/Game.ts'
import type { Route } from './engine/metro/network.ts'
import type { InteractPoint } from './engine/world/interact.ts'
import { QUALITY_ORDER, QUALITY_PRESETS, type QualityLevel } from './engine/quality.ts'
import { CITIES, DEFAULT_CITY } from './cities/index.ts'

const city = CITIES[DEFAULT_CITY]
const config = city.config
const container = ref<HTMLDivElement | null>(null)
const backend = ref('')
const loading = ref('初始化渲染器…')
const stats = reactive<GameStats>({ fps: 0, drawCalls: 0, triangles: 0, chunks: 0, pending: 0, buildAvg: 0, buildMax: 0, x: 0, z: 0, mode: 'player', view: 'third', district: null, time: '', money: 0, prompt: null, found: 0, landmarks: 0 })
// 触屏设备显示摇杆和按钮
const touch = matchMedia('(pointer: coarse)').matches
const game = shallowRef<Game | null>(null)
let timer = 0
const mapOpen = ref(false)
const mapSize = touch ? 112 : 160
// 地铁面板：from 是起点站；inStation 表示从地铁口进站打开的，才能乘车
const metroPanel = ref<{ from: number | null; inStation: boolean } | null>(null)
const panelOpen = computed(() => mapOpen.value || !!metroPanel.value)
const travelText = ref('')
const notice = ref('')
let noticeTimer = 0

function openMetro(from: number | null, inStation = false) {
  const g = game.value
  if (!g?.metro) return
  metroPanel.value = { from: from ?? g.metro.nearestStation(g.player.pos.x, g.player.pos.z), inStation }
}

function showNotice(text: string) {
  notice.value = text
  clearTimeout(noticeTimer)
  noticeTimer = window.setTimeout(() => (notice.value = ''), 4000)
}

// 快速到达：关面板 → 淡出 → 推进时钟、扣票价、在目的站出口出站 → 淡入（docs/04 第 5 节）
async function travel(route: Route) {
  const g = game.value
  if (!g) return
  metroPanel.value = null
  travelText.value = '乘坐地铁…'
  try {
    const r = await g.fastTravel(route, (t) => (travelText.value = t))
    showNotice(r.message)
  } catch (e) {
    showNotice('乘车出错：' + (e instanceof Error ? e.message : String(e)))
    console.error(e)
  } finally {
    travelText.value = ''
  }
  Object.assign(stats, g.stats, { time: g.clock.format(), money: g.money })
}

// 观光电梯：淡出 → 上下 → 淡入
async function rideElevator(p: InteractPoint) {
  const g = game.value
  if (!g || travelText.value) return
  travelText.value = p.action === '下楼' ? '电梯下行…' : '电梯上行…'
  await new Promise((r) => setTimeout(r, 900))
  const text = g.rideElevator(p)
  travelText.value = ''
  if (text) showNotice(text)
}

// 发现景点：弹出景点卡片；同时发现好几个时排队，一个接一个弹
const discovered = ref<DiscoverInfo | null>(null)
const discoverQueue: DiscoverInfo[] = []
let discoverTimer = 0
function showDiscover(info: DiscoverInfo) {
  if (discoverTimer) return void discoverQueue.push(info)
  discovered.value = info
  discoverTimer = window.setTimeout(() => {
    discoverTimer = 0
    const next = discoverQueue.shift()
    if (next) showDiscover(next)
  }, 4500)
}

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

// 地图、地铁面板打开时暂停移动；M 开关地图，Esc 关闭面板
watch([panelOpen, travelText], ([open, traveling]) => {
  if (game.value) game.value.input.enabled = !open && !traveling
})
function onKey(e: KeyboardEvent) {
  if (loading.value || stats.mode !== 'player') return
  if (e.target instanceof HTMLInputElement) {
    if (e.code === 'Escape') metroPanel.value = null
    return
  }
  if (e.code === 'KeyM' && !e.repeat && !metroPanel.value) mapOpen.value = !mapOpen.value
  else if (e.code === 'Escape') {
    mapOpen.value = false
    metroPanel.value = null
  }
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
    // 走到地铁口按 E（或点“进站”）打开地铁面板，起点是这个站
    g.onInteract = (p) => {
      if (p.kind === 'metro') openMetro(p.station ?? null, true)
      else if (p.kind === 'elevator') void rideElevator(p)
    }
    g.onDiscover = ({ def }) => showDiscover({ id: def.id, name: def.name, grade: def.grade, district: config.districts[def.district as DistrictId]?.name ?? '', desc: def.desc, tip: def.tip ?? '' })
    g.start()
    // 引擎状态按 5 Hz 同步到界面（docs/07 第 5 节）
    timer = window.setInterval(() => Object.assign(stats, g.stats), 200)
    // 截图脚本用
    const p = g.player.pos
    Object.assign(window, {
      __ready: true,
      __probe: () => ({ backend: backend.value, ...g.stats, player: [+p.x.toFixed(1), +p.y.toFixed(2), +p.z.toFixed(1)], autopilot: g.autopilot, toast: toast.name, trains: g.trains?.visible.length ?? 0 }),
      __openMap: () => (mapOpen.value = true),
      __openMetro: (from: number | null, inStation: boolean) => openMetro(from, inStation),
      __interact: () => g.prompt && g.onInteract?.(g.prompt),
      __discovered: () => discovered.value?.name ?? null,
      __travel: async (from: string, to: string, mode: 'fastest' | 'fewest' = 'fastest') => {
        const m = g.metro!
        const idx = (n: string) => m.data.stations.findIndex((s) => s.name === n)
        const route = m.plan(idx(from), idx(to), mode)
        if (route) await travel(route)
        return notice.value
      }
    })
  } catch (e) {
    loading.value = '初始化失败：' + (e instanceof Error ? e.message : String(e))
    console.error(e)
  }
})

onBeforeUnmount(() => {
  removeEventListener('keydown', onKey)
  clearInterval(timer)
  clearTimeout(noticeTimer)
  clearTimeout(discoverTimer)
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

.status {
  font-weight: 700;
}

.side {
  position: fixed;
  right: max(12px, env(safe-area-inset-right));
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}

.side button {
  padding: 5px 12px;
  border: none;
  border-radius: 14px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
}

.prompt {
  position: fixed;
  left: 50%;
  bottom: max(110px, calc(env(safe-area-inset-bottom) + 110px));
  transform: translateX(-50%);
  padding: 8px 16px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
  font-size: 14px;
  white-space: nowrap;
  pointer-events: none;
}

.prompt b {
  display: inline-block;
  margin-right: 6px;
  padding: 0 6px;
  border-radius: 4px;
  background: #fff;
  color: #000;
}

.travel {
  position: fixed;
  inset: 0;
  z-index: 20;
  background: #111;
  color: #fff;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.notice {
  position: fixed;
  left: 50%;
  top: 30%;
  transform: translateX(-50%);
  padding: 10px 18px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.72);
  color: #fff;
  font-size: 15px;
  pointer-events: none;
  white-space: nowrap;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.5s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
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

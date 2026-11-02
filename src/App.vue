<template>
  <div ref="container" class="stage"></div>
  <div v-show="!photoOpen" class="hud" :class="{ compact: touch }">
    <div class="title">{{ isEn ? config.nameEn : config.name }}<span v-if="!touch"> · {{ isEn ? config.name : config.nameEn }}</span></div>
    <div v-if="loading">{{ loading }}</div>
    <template v-else>
      <div class="status">🕘 {{ stats.time }} · {{ tPhrase(stats.weather) }} · ¥{{ stats.money }} · {{ t('景点') }} {{ stats.found }}/{{ stats.landmarks }}</div>
      <div v-if="stats.quest" class="quest" @click="codexTab = 'quests'">📌 {{ stats.quest.name }} {{ stats.quest.k + 1 }}/{{ stats.quest.n }}{{ t('：') }}{{ stats.quest.text }}</div>
      <div v-if="stats.bike" class="bikeline">🚲 {{ t('骑行 {m} 分钟', { m: stats.bike.minutes }) }} · ¥{{ stats.bike.fare }}<span v-if="!touch">{{ t('（B 还车）') }}</span></div>
      <div v-if="stats.walk" class="walk">🚶 {{ stats.walk.name }} {{ stats.walk.k }}/{{ stats.walk.n }} · {{ t('下一站') }} {{ stats.walk.next }} · {{ t('约 {m} 米', { m: Math.max(10, Math.round(stats.walk.dist / 2) * 10) }) }}</div>
      <div>{{ backend }} · {{ stats.fps }} fps<span v-if="!touch"> · {{ stats.drawCalls }} {{ t('次绘制') }} · {{ (stats.triangles / 1000).toFixed(0) }}k {{ t('三角形') }}</span></div>
      <div v-if="!touch">{{ t('分块') }}{{ t('：') }}{{ stats.chunks }} ({{ t('待建') }} {{ stats.pending }}) · {{ t('位置') }}{{ t('：') }}{{ stats.x }}, {{ stats.z }} {{ t('格') }}</div>
      <div v-if="!touch" class="hint">{{ t(stats.mode === 'dev' ? 'WASD 移动 · Q/E 升降 · Shift 加速 · 拖动旋转 · 滚轮缩放' : 'WASD 移动 · Shift 奔跑 · 空格跳 · 拖动转视角 · 滚轮远近 · V 切换视角 · M 地图 · E 交互 · P 拍照 · C 图鉴 · B 单车 · T 打车') }}</div>
    </template>
  </div>
  <template v-if="game && !loading && stats.mode === 'player'">
    <template v-if="!panelOpen">
      <!-- 触屏控件放在最下层：右半屏的拖动区不能盖住小地图、侧栏和站内按钮 -->
      <TouchControls v-if="touch" :input="game.input" :action="photoOpen ? null : stats.prompt ? t(stats.prompt.action) : null" :buttons="!photoOpen" />
      <template v-if="!photoOpen">
        <MiniMap v-if="!stats.station" :game="game" :size="mapSize" @open="mapOpen = true" />
        <MetroHud v-else :status="stats.station" :announce="stats.announce" @skip-wait="game.interior?.skipWait(game.player.pos.x)" @skip-next="game.interior?.skipNext()" @skip-to="(i) => game?.interior?.skipTo(i)" />
        <div class="side" :style="{ top: stats.station ? 'max(12px, env(safe-area-inset-top))' : `calc(max(12px, env(safe-area-inset-top)) + ${mapSize + 10}px)` }">
          <button :title="t('拍照（P）')" @click="photoOpen = true">{{ t('📷 拍照') }}</button>
          <button :title="t('图鉴和相册（C）')" @click="codexTab = 'codex'">{{ t('📖 图鉴') }}</button>
          <button :title="t('地铁线路图')" @click="openMetro(null)">{{ t('🚇 地铁') }}</button>
          <button v-if="!stats.station" :title="t(stats.bike ? '还车（B）' : '扫一辆共享单车（B）')" @click="toggleBike">{{ t(stats.bike ? '🚲 还车' : '🚲 单车') }}</button>
          <button v-if="!stats.station" :title="t('打车（T）')" @click="openTaxi">{{ t('🚕 打车') }}</button>
          <button :title="t('菜单：形象、画质…')" @click="menuOpen = true">{{ t('☰ 菜单') }}</button>
        </div>
        <div v-if="stats.ride" class="prompt ride">
          {{ game.busRide ? '🚌' : '⛴' }} {{ stats.ride.name }} · {{ stats.ride.to }} · {{ stats.ride.sailing ? t('还有 {m} 分钟', { m: stats.ride.minutes }) : t(game.busRide ? '车马上到' : '马上开船') }}
          <button @click="skipRide">{{ t('跳过') }}</button>
        </div>
        <div v-else-if="stats.prompt" class="prompt">
          <b v-if="!touch">E</b> {{ t(stats.prompt.action) }} · {{ stats.prompt.label }}
        </div>
      </template>
      <PhotoMode v-if="photoOpen" :game="game" :touch="touch" @close="photoOpen = false" @album="openAlbum" />
    </template>
    <DistrictToast :name="toast.name" :theme="toast.theme" />
    <DiscoverToast :landmark="discovered" />
    <SpeechBubble :talk="speech" />
    <BigMap v-if="mapOpen" :game="game" :title="isEn ? config.nameEn : config.name" :here="districtName" @close="mapOpen = false" />
    <BoatPanel v-if="boatPanel" :game="game" :pier="boatPanel" @close="boatPanel = null" @board="board" />
    <BusPanel v-if="busPanel" :game="game" :line-id="busPanel.line" :stop="busPanel.stop" @close="busPanel = null" @board="boardBus" />
    <TaxiPanel v-if="taxiPanel" :game="game" @close="taxiPanel = false" @go="takeTaxi" />
    <MenuPanel v-if="menuOpen" :quality-label="t(QUALITY_PRESETS[quality].label)" :fullscreen="fullscreen" @close="menuOpen = false" @quality="cycleQuality" @open="openFromMenu" @fullscreen="toggleFullscreen" />
    <AboutPanel v-if="aboutOpen" :city="config.name" :city-en="config.nameEn" @close="aboutOpen = false" />
    <CharacterPanel v-if="characterOpen" :game="game" @close="characterOpen = false" />
    <CodexPanel v-if="codexTab" :game="game" :initial-tab="codexTab" @close="codexTab = null" />
    <ShopPanel v-if="shopPanel" :game="game" :shop-id="shopPanel" @close="shopPanel = null" />
    <CultureCard v-if="cultureCard" :entry="cultureCard" @close="cultureCard = null" />
    <MetroPanel v-if="metroPanel" :game="game" :initial-from="metroPanel.from" :in-station="metroPanel.inStation" @close="metroPanel = null" @travel="travel" />
    <Transition name="fade">
      <div v-if="travelText" class="travel">{{ travelText }}</div>
    </Transition>
    <TransitionGroup name="fade" tag="div" class="notices">
      <div v-for="n in notices" :key="n.id" class="notice">{{ n.text }}</div>
    </TransitionGroup>
  </template>
  <div v-if="!panelOpen" class="credit">© OpenStreetMap contributors</div>
  <div v-if="portraitHint && !loading && !panelOpen" class="portrait">
    <span>📱↻ {{ t('横过来玩，视野更大') }}</span>
    <button @click="dismissPortrait">{{ t('知道了') }}</button>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import BigMap from './components/BigMap.vue'
import BoatPanel from './components/BoatPanel.vue'
import BusPanel from './components/BusPanel.vue'
import CharacterPanel from './components/CharacterPanel.vue'
import MenuPanel from './components/MenuPanel.vue'
import AboutPanel from './components/AboutPanel.vue'
import { t, tPhrase } from './i18n/index.ts'
import { isEn, nameOf } from './i18n/core.ts'
import TaxiPanel from './components/TaxiPanel.vue'
import CodexPanel, { type CodexTab } from './components/CodexPanel.vue'
import CultureCard from './components/CultureCard.vue'
import DiscoverToast, { type DiscoverInfo } from './components/DiscoverToast.vue'
import DistrictToast from './components/DistrictToast.vue'
import MetroHud from './components/MetroHud.vue'
import MetroPanel from './components/MetroPanel.vue'
import MiniMap from './components/MiniMap.vue'
import PhotoMode from './components/PhotoMode.vue'
import ShopPanel from './components/ShopPanel.vue'
import SpeechBubble from './components/SpeechBubble.vue'
import type { Talk } from './engine/actors/NPCManager.ts'
import TouchControls from './components/TouchControls.vue'
import { emptyStats, Game, type GameStats } from './engine/Game.ts'
import type { Route } from './engine/metro/network.ts'
import { ACHIEVEMENTS, DAILY_REWARD } from './engine/metro/collection.ts'
import type { InteractPoint } from './engine/world/interact.ts'
import type { CultureDef } from './engine/city.ts'
import type { Pier } from './engine/transport/BoatSystem.ts'
import { QUALITY_ORDER, QUALITY_PRESETS, type QualityLevel } from './engine/quality.ts'
import { DEFAULT_CITY, loadCity } from './cities/index.ts'

const city = loadCity(DEFAULT_CITY)
const config = city.config
const container = ref<HTMLDivElement | null>(null)
const backend = ref('')
const loading = ref(t('初始化渲染器…'))
const stats = reactive<GameStats>(emptyStats())
// 触屏设备显示摇杆和按钮
const touch = matchMedia('(pointer: coarse)').matches
const game = shallowRef<Game | null>(null)
let timer = 0
const mapOpen = ref(false)
const mapSize = touch ? 112 : 160
// 地铁面板：from 是起点站；inStation 表示从地铁口进站打开的，才能乘车
const metroPanel = ref<{ from: number | null; inStation: boolean } | null>(null)
// 拍照模式（游戏照常跑）和图鉴 / 相册面板
const photoOpen = ref(false)
const codexTab = ref<CodexTab | null>(null)
// 码头的船票面板：码头名
const boatPanel = ref<string | null>(null)
// 观光巴士站：线路和站；打车面板
const busPanel = ref<{ line: string; stop: number } | null>(null)
const taxiPanel = ref(false)
// 菜单和角色外观
const menuOpen = ref(false)
const characterOpen = ref(false)
const aboutOpen = ref(false)
function openFromMenu(what: string) {
  menuOpen.value = false
  if (what === 'character') characterOpen.value = true
  else if (what === 'about') aboutOpen.value = true
}

// 竖着拿手机时提示横过来（点“知道了”这次不再提示）
const portraitHint = ref(false)
let portraitDismissed = sessionStorage.getItem('block-shanghai:portrait') === '1'
function checkPortrait() {
  portraitHint.value = touch && !portraitDismissed && innerHeight > innerWidth
}
function dismissPortrait() {
  portraitDismissed = true
  sessionStorage.setItem('block-shanghai:portrait', '1')
  portraitHint.value = false
}
checkPortrait()
addEventListener('resize', checkPortrait)

// 全屏：手机上同时锁成横屏（浏览器不支持就提示用“添加到主屏幕”）
const fullscreen = ref(!!document.fullscreenElement)
document.addEventListener('fullscreenchange', () => (fullscreen.value = !!document.fullscreenElement))
async function toggleFullscreen() {
  menuOpen.value = false
  try {
    if (document.fullscreenElement) return void (await document.exitFullscreen())
    if (!document.documentElement.requestFullscreen) return showNotice(t('这个浏览器不能全屏，可以用“添加到主屏幕”打开'))
    await document.documentElement.requestFullscreen()
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }
    if (touch) await orientation.lock?.('landscape').catch(() => {})
  } catch {
    showNotice(t('这个浏览器不能全屏，可以用“添加到主屏幕”打开'))
  }
}
// 小店面板：店 id；文化牌：读到的文化图鉴条目
const shopPanel = ref<string | null>(null)
const cultureCard = ref<CultureDef | null>(null)
const panelOpen = computed(() => mapOpen.value || !!metroPanel.value || !!codexTab.value || !!boatPanel.value || !!shopPanel.value || !!cultureCard.value || !!busPanel.value || taxiPanel.value || menuOpen.value || characterOpen.value || aboutOpen.value)
function openAlbum() {
  photoOpen.value = false
  codexTab.value = 'album'
}
const travelText = ref('')
// 提示：同时来好几条（到站 + 得到纪念品）时叠着显示，每条 4 秒
const notices = ref<{ id: number; text: string }[]>([])
const notice = computed(() => notices.value.at(-1)?.text ?? '')
let noticeId = 0
const noticeTimers = new Set<number>()

function openMetro(from: number | null, inStation = false) {
  const g = game.value
  if (!g?.metro) return
  metroPanel.value = { from: from ?? g.metro.nearestStation(g.player.pos.x, g.player.pos.z), inStation }
}

function showNotice(text: string) {
  const id = ++noticeId
  notices.value = [...notices.value.filter((n) => n.text !== text), { id, text }].slice(-3)
  const t = window.setTimeout(() => {
    noticeTimers.delete(t)
    notices.value = notices.value.filter((n) => n.id !== id)
  }, 4000)
  noticeTimers.add(t)
}

// 快速到达：关面板 → 淡出 → 推进时钟、扣票价、在目的站出口出站 → 淡入（docs/04 第 5 节）
async function travel(route: Route) {
  const g = game.value
  if (!g) return
  metroPanel.value = null
  travelText.value = t('乘坐地铁…')
  try {
    const r = await g.fastTravel(route, (t) => (travelText.value = t))
    showNotice(r.message)
  } catch (e) {
    showNotice(t('乘车出错：') + (e instanceof Error ? e.message : String(e)))
    console.error(e)
  } finally {
    travelText.value = ''
  }
  Object.assign(stats, g.stats, { time: g.clock.format(), money: g.money })
}

// 地铁站内：换场景时淡出淡入；出站要预建目的地分块；站厅的售票机打开线路图（可以快速到达）
const GO_TEXT: Record<string, string> = { platform: '去站台…', hall: '去站厅…', transfer: '换乘…', board: '上车…', alight: '下车…' }
async function interiorGo(go: string) {
  const g = game.value
  if (!g?.interior?.active || travelText.value) return
  const verb = go.split(':')[0]!
  const fade = GO_TEXT[verb] && t(GO_TEXT[verb])
  if (fade) {
    travelText.value = fade
    await new Promise((r) => setTimeout(r, 350))
  }
  const r = g.interiorAction(go)
  if (fade) travelText.value = ''
  if (r.notice) showNotice(r.notice)
  if (r.map) openMetro(g.interior.station, true)
  if (r.leave !== undefined) {
    travelText.value = t('出站…')
    try {
      showNotice(await g.leaveStation(r.leave, (t) => (travelText.value = t)))
    } finally {
      travelText.value = ''
    }
  }
}

async function enterStation(station: number, entrance: number) {
  const g = game.value
  if (!g || travelText.value) return
  travelText.value = t('进站…')
  await new Promise((r) => setTimeout(r, 450))
  g.enterStation(station, entrance)
  travelText.value = ''
}

// 坐船：关面板 → 淡出（要等船时显示“等船”）→ 站到船上 → 淡入
async function board(berth: Pier) {
  const g = game.value
  if (!g) return
  boatPanel.value = null
  travelText.value = t('上船…')
  await new Promise((r) => setTimeout(r, 700))
  const r = g.boardBoat(berth)
  travelText.value = ''
  showNotice(r.message)
}

async function skipRide() {
  const g = game.value
  if (!g?.ride && !g?.busRide) return
  travelText.value = t(g.busRide ? '巴士到站了…' : '船靠岸了…')
  try {
    await g.skipRide((t) => (travelText.value = t))
    await new Promise((r) => setTimeout(r, 800))
  } finally {
    travelText.value = ''
  }
}

// 观光巴士：关面板 → 淡出（要等车时显示“等车”）→ 站牌下等车、上车 → 淡入
async function boardBus(line: string, from: number, to: number) {
  const g = game.value
  if (!g) return
  busPanel.value = null
  travelText.value = t('等车…')
  await new Promise((r) => setTimeout(r, 700))
  const r = g.boardBus(line, from, to)
  travelText.value = ''
  showNotice(r.message)
}

// 共享单车：开锁 / 还车
function toggleBike() {
  const g = game.value
  if (g) showNotice(g.toggleBike().message)
}

// 打车：离马路太远不弹面板；选好地方 → 淡出（预建目的地）→ 淡入
function openTaxi() {
  const g = game.value
  if (!g) return
  if (!g.canHailTaxi) return showNotice(t('要走到马路边才能打到车'))
  taxiPanel.value = true
}
async function takeTaxi(id: string) {
  const g = game.value
  if (!g) return
  taxiPanel.value = false
  travelText.value = t('上车…')
  try {
    showNotice((await g.taxi(id, (t) => (travelText.value = t))).message)
  } finally {
    travelText.value = ''
  }
}

// 观光电梯：淡出 → 上下 → 淡入
async function rideElevator(p: InteractPoint) {
  const g = game.value
  if (!g || travelText.value) return
  travelText.value = t(p.action === '下楼' ? '电梯下行…' : '电梯上行…')
  await new Promise((r) => setTimeout(r, 900))
  const text = g.rideElevator(p)
  travelText.value = ''
  if (text) showNotice(text)
}

// 和路人聊天
const speech = ref<{ talk: Talk; key: number } | null>(null)

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
  // 手动选过画质就不再自动调
  g.autoQuality = false
  g.setQuality(next)
  g.saveNow()
  quality.value = next
}

// 区名：进入新的区时弹出提示（docs/06 P1 验收）
type DistrictId = keyof typeof config.districts
const districtName = computed(() => (stats.district ? (config.districts[stats.district as DistrictId]?.name ?? null) : null))
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
  // 拍照模式自己处理按键（空格快门、数字滤镜、Esc / P 退出）
  if (photoOpen.value || e.repeat) return
  if (e.code === 'KeyM' && !metroPanel.value && !codexTab.value) mapOpen.value = !mapOpen.value
  else if (e.code === 'KeyP' && !panelOpen.value) photoOpen.value = true
  else if (e.code === 'KeyC' && !mapOpen.value && !metroPanel.value && !shopPanel.value && !cultureCard.value) codexTab.value = codexTab.value ? null : 'codex'
  else if (e.code === 'KeyB' && !panelOpen.value && !stats.station) toggleBike()
  else if (e.code === 'KeyT' && !panelOpen.value && !stats.station) openTaxi()
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
      if (p.kind === 'metro' && p.station !== undefined && p.entrance !== undefined) void enterStation(p.station, p.entrance)
      else if (p.kind === 'interior' && p.go) void interiorGo(p.go)
      else if (p.kind === 'elevator') void rideElevator(p)
      else if (p.kind === 'boat' && p.pier) boatPanel.value = p.pier
      else if (p.kind === 'bus' && p.bus && p.stop !== undefined) busPanel.value = { line: p.bus, stop: p.stop }
      else if (p.kind === 'shop' && p.shop) shopPanel.value = p.shop
      else if (p.kind === 'culture' && p.culture) cultureCard.value = g.readPlaque(p.culture)
      else if (p.kind === 'npc' && p.npc !== undefined) {
        const t = g.talk(p.npc)
        if (t) speech.value = { talk: t, key: (speech.value?.key ?? 0) + 1 }
      }
    }
    g.onRideEnd = (message) => showNotice(message)
    g.onShow = (name) => showNotice(t('🎆 {name}开始了，抬头看', { name }))
    g.onQualityAuto = (level) => {
      quality.value = level
      showNotice(t('画质自动调到“{q}”（帧率太低）', { q: t(QUALITY_PRESETS[level].label) }))
      g.saveNow()
    }
    // 地铁成就、线路徽章、每日任务
    g.onProgress = (gain) => {
      const parts = [
        ...gain.achievements.map((id) => t('🏅 达成成就：{name}', { name: ACHIEVEMENTS.find((a) => a.id === id)?.name ?? id })),
        ...gain.badges.map((id) => {
          const line = g.metro?.lineById.get(id)
          return t('点亮线路徽章：{name}', { name: line ? nameOf(line) : id })
        }),
        ...gain.daily.map((id) => t('每日任务完成：{name} +¥{n}', { name: g.dailyTasks().find((d) => d.id === id)?.title ?? id, n: DAILY_REWARD }))
      ]
      if (parts.length) showNotice(parts.join('　'))
    }
    // 第一次吃到美食、得到纪念品、解锁文化图鉴
    const content = city.content
    g.onLife = (gain) => {
      const parts = [
        ...gain.foods.map((id) => t('🥢 美食图鉴 +1：{name}', { name: content.foods.find((f) => f.id === id)?.name ?? id })),
        ...gain.items.map((id) => t('🎒 得到纪念品：{name}', { name: content.souvenirs.find((s) => s.id === id)?.name ?? id })),
        ...gain.culture.map((id) => t('📜 文化图鉴解锁：{name}', { name: content.culture.find((c) => c.id === id)?.name ?? id }))
      ]
      if (parts.length) showNotice(parts.join('　'))
    }
    // 任务：完成发奖励；新手任务往前一步时提示下一步
    g.onQuest = ({ completed, advanced }) => {
      const parts = completed.map((q) =>
        q.kind === 'novice' ? t('🎉 新手任务完成：{name} +¥{n}', { name: q.name, n: q.reward }) : t('🎯 完成任务“{name}” +¥{n}', { name: q.name, n: q.reward }) + (q.badge ? t(' · 徽章“{badge}”', { badge: q.badge }) : '')
      )
      for (const q of advanced) {
        if (q.kind !== 'novice') continue
        const k = g.life.quests[q.id]?.step ?? 0
        const next = q.steps[k]
        if (next) parts.push(t('📌 新手任务 {k}/{n}：{text}', { k: k + 1, n: q.steps.length, text: next.text }))
      }
      for (const p of parts) showNotice(p)
    }
    // Citywalk：开始、打卡、走完都弹一张卡片（和发现景点共用一个队列）
    g.onWalk = ({ kind, route, index }) => {
      const s = route.stops[index]!
      const n = route.stops.length
      const next = route.stops[index + 1]
      showDiscover({
        id: `walk:${route.def.id}:${index}`,
        name: s.name,
        kicker:
          kind === 'start'
            ? t('🚶 开始 Citywalk · {name}', { name: route.def.name })
            : kind === 'done'
              ? t('🏅 走完 Citywalk · 获得徽章“{badge}”', { badge: route.def.badge })
              : t('🚶 Citywalk 打卡 {k}/{n}', { k: index + 1, n }),
        district: route.def.area,
        desc: s.text,
        tip: next ? t('下一站：{name}（跟着地上的步道和绿色标记走）', { name: next.name }) : ''
      })
    }
    g.onDiscover = ({ def }) =>
      showDiscover({ id: def.id, name: def.name, grade: def.grade, district: config.districts[def.district as DistrictId]?.name ?? '', desc: def.desc, tip: def.tip ?? '' })
    g.start()
    // 引擎状态按 5 Hz 同步到界面（docs/07 第 5 节）
    timer = window.setInterval(() => Object.assign(stats, g.stats), 200)
    // 截图脚本用
    const p = g.player.pos
    Object.assign(window, {
      __ready: true,
      __game: g,
      __probe: () => ({ backend: backend.value, ...g.stats, player: [+p.x.toFixed(1), +p.y.toFixed(2), +p.z.toFixed(1)], autopilot: g.autopilot, toast: toast.name, trains: g.trains?.visible.length ?? 0 }),
      __openMap: () => (mapOpen.value = true),
      __openMetro: (from: number | null, inStation: boolean) => openMetro(from, inStation),
      __interact: () => g.prompt && g.onInteract?.(g.prompt),
      __go: (go: string) => interiorGo(go),
      __enter: (name: string, ref?: string) => {
        const m = g.metro!
        const si = m.data.stations.findIndex((s) => s.name === name)
        const ei = m.data.stations[si]!.exits.find((e) => !ref || m.data.entrances[e]!.ref === ref) ?? m.data.stations[si]!.exits[0]!
        return enterStation(si, ei)
      },
      __discovered: () => discovered.value?.name ?? null,
      __photo: (on: boolean) => (photoOpen.value = on),
      __board: async (pier: string, line: string) => {
        const berth = g.boats?.linesAt(pier).find((b) => b.line.id === line)
        if (berth) await board(berth)
        return notice.value
      },
      __skipRide: () => skipRide(),
      __codex: (tab: CodexTab | null) => (codexTab.value = tab),
      __notice: () => notice.value,
      __face: (x: number, y: number, z: number) => {
        // 测试用：让相机朝向某个点（第三人称时相机在人身后）
        const p = g.player.pos
        g.rig.yaw = Math.atan2(-(x - p.x), -(z - p.z))
        g.rig.pitch = g.rig.mode === 'first' ? Math.atan2(y - p.y - 1.6, Math.hypot(x - p.x, z - p.z)) : 0.05
        if (g.rig.mode === 'first') g.rig.pitch = -g.rig.pitch
      },
      __travel: async (from: string, to: string, mode: 'fastest' | 'fewest' = 'fastest') => {
        const m = g.metro!
        const idx = (n: string) => m.data.stations.findIndex((s) => s.name === n)
        const route = m.plan(idx(from), idx(to), mode)
        if (route) await travel(route)
        return notice.value
      }
    })
  } catch (e) {
    loading.value = t('初始化失败：') + (e instanceof Error ? e.message : String(e))
    console.error(e)
  }
})

onBeforeUnmount(() => {
  removeEventListener('keydown', onKey)
  clearInterval(timer)
  for (const t of noticeTimers) clearTimeout(t)
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

.walk {
  color: #7ee2a8;
}

.bikeline {
  color: #ffe08a;
}

.quest {
  color: #ffd98a;
  pointer-events: auto;
  cursor: pointer;
}

.side {
  position: fixed;
  right: max(12px, env(safe-area-inset-right));
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}

/* 横屏手机高度不够：侧栏按钮排成两列，不压住右下角的跳、跑按钮 */
@media (max-height: 480px) {
  .side {
    display: grid;
    grid-template-columns: repeat(2, auto);
    justify-items: end;
  }
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

.prompt.ride {
  pointer-events: auto;
}

.prompt.ride button {
  margin-left: 8px;
  padding: 2px 10px;
  border: none;
  border-radius: 8px;
  background: #fff;
  color: #000;
  font-family: inherit;
  cursor: pointer;
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

.notices {
  position: fixed;
  left: 50%;
  top: 30%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: calc(100% - 32px);
  pointer-events: none;
}

.notice {
  padding: 10px 18px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.72);
  color: #fff;
  font-size: 15px;
  max-width: 100%;
  width: max-content;
  text-align: center;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.5s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.portrait {
  position: fixed;
  left: 50%;
  bottom: max(150px, calc(env(safe-area-inset-bottom) + 150px));
  transform: translateX(-50%);
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 8px 12px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.72);
  color: #fff;
  font-size: 13px;
  white-space: nowrap;
}

.portrait button {
  padding: 4px 10px;
  border: none;
  border-radius: 8px;
  background: #fff;
  font-family: inherit;
  font-size: 13px;
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

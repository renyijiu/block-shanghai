<template>
  <div class="codex">
    <div class="top">
      <div class="tabs">
        <button :class="{ on: tab === 'codex' }" @click="tab = 'codex'">图鉴 {{ shotCount }}/{{ total }}</button>
        <button :class="{ on: tab === 'album' }" @click="tab = 'album'">相册 {{ photos.length }}</button>
      </div>
      <button class="close" title="关闭（Esc）" @click="emit('close')">✕</button>
    </div>

    <div v-if="tab === 'codex'" class="body">
      <p class="intro">走近景点会自动“发现”；拍照时景点在画面里、没被挡住，就会解锁图鉴。外滩、豫园、人民广场的子景点可以单独拍。</p>
      <section v-for="g in grades" :key="g.grade">
        <h3>{{ g.title }}</h3>
        <div class="cards">
          <div v-for="e in g.items" :key="e.id" class="card" :class="{ locked: !e.found, open: openId === e.id }" @click="openId = openId === e.id ? null : e.id">
            <div class="pic">
              <img v-if="e.thumb" :src="e.thumb" alt="" />
              <span v-else-if="e.shot">照片已删除</span>
              <span v-else-if="e.found">📷 还没拍到</span>
              <span v-else class="q">？</span>
            </div>
            <div class="info">
              <div class="name">
                <span class="grade" :class="e.grade">{{ e.grade }}</span>
                {{ e.found ? e.name : '？？？' }}
              </div>
              <div class="meta">{{ e.district }} · {{ e.shot ? '已拍到' : e.found ? '已发现' : '未发现' }}</div>
              <div v-if="e.subs.length" class="subs">
                <span v-for="s in e.subs" :key="s.id" :class="{ done: s.shot }">{{ s.shot ? '✓ ' : '' }}{{ e.found ? s.name : '？？？' }}</span>
              </div>
              <template v-if="openId === e.id && e.found">
                <div class="desc">{{ e.desc }}</div>
                <div v-if="e.tip" class="tip">{{ e.tip }}</div>
              </template>
            </div>
          </div>
        </div>
      </section>
    </div>

    <div v-else class="body">
      <p v-if="!game.album" class="intro">这个浏览器不能在本地保存照片（可能是隐私模式），拍的照片不会进相册，图鉴照常解锁。</p>
      <p v-else-if="!photos.length" class="intro">还没有照片。按 P（或点“📷 拍照”）进入拍照模式。</p>
      <div class="grid">
        <div v-for="p in photos" :key="p.id" class="ph" @click="view(p.id)">
          <img :src="p.url" alt="" />
          <div class="cap">{{ p.caption }}</div>
        </div>
      </div>
    </div>

    <div v-if="viewer" class="viewer" @click.self="closeViewer">
      <img :src="viewer.url" alt="" />
      <div class="bar">
        <span>{{ viewer.caption }}</span>
        <a :href="viewer.url" :download="`方块上海-${viewer.id}.jpg`">下载</a>
        <button @click="remove(viewer.id)">删除</button>
        <button @click="closeViewer">关闭</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Game } from '../engine/Game.ts'
import { formatClock } from '../engine/state/clock.ts'

const props = defineProps<{ game: Game; initialTab?: 'codex' | 'album' }>()
const emit = defineEmits<{ close: [] }>()
const game = props.game
const tab = ref<'codex' | 'album'>(props.initialTab ?? 'codex')
watch(
  () => props.initialTab,
  (t) => t && (tab.value = t)
)
const openId = ref<string | null>(null)
const photos = ref<{ id: string; url: string; caption: string }[]>([])
const viewer = ref<{ id: string; url: string; caption: string } | null>(null)
const urls: string[] = []
const districts = game.city.config.districts as Record<string, { name: string } | undefined>

const caption = (landmarks: string[], gameTime: number) => {
  const day = Math.floor(gameTime / 86400) + 1
  const names = landmarks.map((id) => game.landmarkName(id)).join('、')
  return `第 ${day} 天 ${formatClock(gameTime % 86400)}${names ? ' · ' + names : ''}`
}

// 图鉴条目：景点 + 子景点，拍到的显示照片缩略图
const thumbs = ref(new Map<string, string>())
const entries = computed(() =>
  (game.landmarks?.placed ?? []).map(({ def }) => ({
    id: def.id,
    name: def.name,
    grade: def.grade,
    district: districts[def.district]?.name ?? '',
    desc: def.desc,
    tip: def.tip ?? '',
    found: game.landmarks!.found.has(def.id),
    shot: !!game.codexShot[def.id],
    thumb: thumbs.value.get(game.codexShot[def.id] ?? ''),
    subs: (def.subs ?? []).map((s) => ({ id: s.id, name: s.name, shot: !!game.codexShot[s.id] }))
  }))
)
const total = computed(() => entries.value.reduce((n, e) => n + 1 + e.subs.length, 0))
const shotCount = computed(() => entries.value.reduce((n, e) => n + (e.shot ? 1 : 0) + e.subs.filter((s) => s.shot).length, 0))
const grades = computed(() =>
  (['S', 'A', 'B'] as const)
    .map((grade) => ({ grade, title: { S: 'S 级 · 高度还原', A: 'A 级 · 主要建筑', B: 'B 级 · 区域氛围' }[grade], items: entries.value.filter((e) => e.grade === grade) }))
    .filter((g) => g.items.length)
)

async function load() {
  const album = game.album
  if (!album) return
  const list = await album.list(game.city.config.id)
  const map = new Map<string, string>()
  photos.value = list.map((p) => {
    const url = URL.createObjectURL(p.thumb)
    urls.push(url)
    map.set(p.id, url)
    return { id: p.id, url, caption: caption(p.landmarks, p.gameTime) }
  })
  thumbs.value = map
}

async function view(id: string) {
  const p = await game.album?.get(id)
  if (!p) return
  closeViewer()
  viewer.value = { id, url: URL.createObjectURL(p.image), caption: caption(p.landmarks, p.gameTime) }
}

function closeViewer() {
  if (viewer.value) URL.revokeObjectURL(viewer.value.url)
  viewer.value = null
}

async function remove(id: string) {
  if (!confirm('删除这张照片？图鉴不会因此重新上锁。')) return
  await game.album?.delete(id)
  closeViewer()
  await load()
}

function onKey(e: KeyboardEvent) {
  if (e.code !== 'Escape') return
  if (viewer.value) closeViewer()
  else emit('close')
}

onMounted(() => {
  addEventListener('keydown', onKey)
  void load()
})

onBeforeUnmount(() => {
  removeEventListener('keydown', onKey)
  closeViewer()
  for (const u of urls) URL.revokeObjectURL(u)
})
</script>

<style scoped>
.codex {
  position: fixed;
  inset: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  background: #f4f1ea;
  font-size: 14px;
}

.top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) 8px max(12px, env(safe-area-inset-left));
}

.tabs {
  display: flex;
  gap: 6px;
}

.tabs button,
.close {
  padding: 8px 14px;
  border: none;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
  font-family: inherit;
  font-size: 14px;
  cursor: pointer;
}

.tabs button.on {
  background: #2a2a2a;
  color: #fff;
  font-weight: 700;
}

.body {
  flex: 1;
  overflow: auto;
  padding: 0 max(12px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
}

.intro {
  color: #777;
  font-size: 13px;
  margin: 4px 0 8px;
}

h3 {
  margin: 14px 0 8px;
  font-size: 15px;
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 10px;
}

.card {
  display: flex;
  gap: 10px;
  padding: 8px;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
  cursor: pointer;
}

.card.locked {
  opacity: 0.7;
}

.pic {
  width: 96px;
  height: 72px;
  flex: none;
  border-radius: 8px;
  overflow: hidden;
  background: #e2ddd2;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #888;
  font-size: 12px;
}

.pic img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.q {
  font-size: 30px;
  font-weight: 800;
  color: #bbb;
}

.info {
  min-width: 0;
}

.name {
  font-weight: 700;
  font-size: 15px;
}

.grade {
  display: inline-block;
  padding: 0 5px;
  margin-right: 2px;
  border-radius: 4px;
  font-size: 12px;
  background: #ddd;
}

.grade.S {
  background: #ffd23a;
}

.grade.A {
  background: #9fd8ff;
}

.meta {
  color: #888;
  font-size: 12px;
}

.subs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

.subs span {
  padding: 1px 6px;
  border-radius: 4px;
  background: #eee;
  color: #888;
  font-size: 12px;
}

.subs span.done {
  background: #dff3e0;
  color: #2e7d32;
}

.desc {
  margin-top: 6px;
  font-size: 13px;
  line-height: 1.55;
}

.tip {
  margin-top: 4px;
  color: #a0682a;
  font-size: 12px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 8px;
}

.ph {
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
  cursor: pointer;
}

.ph img {
  width: 100%;
  display: block;
  aspect-ratio: 16 / 10;
  object-fit: cover;
}

.cap {
  padding: 4px 6px;
  font-size: 12px;
  color: #555;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.viewer {
  position: fixed;
  inset: 0;
  z-index: 11;
  background: rgba(0, 0, 0, 0.88);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 16px;
}

.viewer img {
  max-width: 100%;
  max-height: calc(100% - 60px);
  border-radius: 6px;
}

.bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 13px;
}

.bar a,
.bar button {
  padding: 6px 14px;
  border: none;
  border-radius: 8px;
  background: #fff;
  color: #000;
  font-family: inherit;
  font-size: 13px;
  text-decoration: none;
  cursor: pointer;
}
</style>

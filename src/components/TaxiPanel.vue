<template>
  <div class="taxi" @click.self="emit('close')">
    <div class="card">
      <div class="head">
        <b>{{ t('🚕 打车') }}</b>
        <button class="close" :title="t('关闭（Esc）')" @click="emit('close')">✕</button>
      </div>
      <p class="intro">{{ t('起步价 14 元（3 公里），之后每公里 2.5 元，15 公里以上 3.6 元；夜里 23 点到 5 点加三成。在景点旁边的马路上下车。') }}</p>
      <input v-model="q" class="search" :placeholder="t('搜景点或区名')" />
      <div class="list">
        <div v-for="r in rows" :key="r.id" class="row">
          <div class="info">
            <div class="name">{{ r.found ? r.name : '？？？' }} <small>{{ r.district }}</small></div>
            <div class="meta">{{ t('{km} 公里 · 约 {m} 分钟', { km: r.km, m: r.minutes }) }}</div>
          </div>
          <button class="go" :disabled="money < r.fare" @click="emit('go', r.id)">¥{{ r.fare }}</button>
        </div>
      </div>
      <div class="hint">{{ t('钱包 ¥{money} · 还没发现的景点也能去，到了才知道是哪儿', { money }) }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Game } from '../engine/Game.ts'
import { t } from '../i18n/index.ts'

const props = defineProps<{ game: Game }>()
const emit = defineEmits<{ close: []; go: [id: string] }>()
const game = props.game
const money = game.money
const q = ref('')
const districts = game.city.config.districts as Record<string, { name: string } | undefined>

// 所有景点按离这里的远近排；没发现的显示问号，但能搜区名
const all = (game.landmarks?.placed ?? [])
  .map((p) => {
    const quote = game.taxiQuote(p.x, p.z)
    return { id: p.def.id, name: p.def.name, district: districts[p.def.district]?.name ?? '', found: game.landmarks!.found.has(p.def.id), ...quote }
  })
  .filter((r) => r.km > 0.3)
  .sort((a, b) => a.km - b.km)
const rows = computed(() => {
  const s = q.value.trim()
  const low = s.toLowerCase()
  return s ? all.filter((r) => r.district.toLowerCase().includes(low) || (r.found && r.name.toLowerCase().includes(low))) : all
})

function onKey(e: KeyboardEvent) {
  if (e.code === 'Escape') emit('close')
}
onMounted(() => addEventListener('keydown', onKey))
onBeforeUnmount(() => removeEventListener('keydown', onKey))
</script>

<style scoped>
.taxi {
  position: fixed;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
}

.card {
  display: flex;
  flex-direction: column;
  width: min(440px, calc(100% - 24px));
  max-height: calc(100% - 24px);
  padding: 12px 14px;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  font-size: 14px;
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 16px;
}

.close {
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 10px;
  background: #eee;
  cursor: pointer;
}

.intro {
  color: #777;
  font-size: 12px;
  margin: 6px 0;
}

.search {
  padding: 8px 10px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-family: inherit;
  font-size: 14px;
}

.list {
  flex: 1;
  overflow: auto;
  margin-top: 6px;
}

.row {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 8px 0;
  border-top: 1px solid #eee;
}

.info {
  flex: 1;
  min-width: 0;
}

.name {
  font-weight: 700;
}

.name small {
  font-weight: 400;
  color: #888;
}

.meta {
  color: #777;
  font-size: 12px;
}

.go {
  flex: none;
  min-width: 64px;
  padding: 7px 12px;
  border: none;
  border-radius: 10px;
  background: #f2b705;
  color: #222;
  font-size: 14px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
}

.go:disabled {
  background: #ddd;
  color: #999;
  cursor: default;
}

.hint {
  margin-top: 6px;
  color: #888;
  font-size: 12px;
}
</style>

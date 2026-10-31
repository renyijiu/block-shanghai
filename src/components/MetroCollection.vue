<template>
  <div class="metro-col">
    <section>
      <h3>{{ t('每日任务') }} <small>{{ t('（每完成一项 +¥{n}，每天按日期刷新）', { n: DAILY_REWARD }) }}</small></h3>
      <ul class="daily">
        <li v-for="d in daily" :key="d.id" :class="{ done: d.done }">{{ d.done ? '✓' : '○' }} {{ d.title }}<small v-if="d.id === 'lines-2' && !d.done">{{ t('（今天 {n}/2）', { n: todayLines }) }}</small></li>
      </ul>
    </section>

    <section>
      <h3>{{ t('地铁成就') }} {{ unlocked }}/{{ ACHIEVEMENTS.length }}</h3>
      <div class="ach">
        <div v-for="a in ACHIEVEMENTS" :key="a.id" class="a" :class="{ on: progress.achievements[a.id] !== undefined }">
          <b>{{ progress.achievements[a.id] !== undefined ? '🏅' : '🔒' }} {{ a.name }}</b>
          <span>{{ a.desc }}</span>
          <small v-if="progress.achievements[a.id] !== undefined">{{ when(progress.achievements[a.id]!) }}</small>
        </div>
      </div>
    </section>

    <section>
      <h3>{{ t('线路徽章') }} {{ lit }}/{{ lines.length }} <small>{{ t('（坐过一条线的所有区间就点亮）') }}</small></h3>
      <div class="badges">
        <div v-for="b in lines" :key="b.line.id" class="badge" :class="{ lit: b.lit }" :style="{ borderColor: b.line.color }">
          <span class="chip" :style="{ background: b.line.color }">{{ lineShort(b.line) }}</span>
          <span>{{ b.done }}/{{ b.total }}</span>
        </div>
      </div>
    </section>

    <section>
      <h3>{{ t('集站图鉴 · 到访 {n}/{total} 站', { n: visited, total: stations.length }) }}</h3>
      <div class="pick">
        <button v-for="l in data.lines" :key="l.id" :class="{ on: line === l.id }" :style="line === l.id ? { background: l.color, color: '#fff' } : {}" @click="line = l.id">{{ nameOf(l) }}</button>
      </div>
      <ol class="stations">
        <li v-for="s in lineStations" :key="s.id" :class="{ seen: s.time !== null }">
          <span class="dot" :style="{ background: s.time !== null ? currentColor : '#ccc' }"></span>
          <b>{{ isEn ? s.nameEn : s.name }}</b>
          <small>{{ isEn ? s.name : s.nameEn }}</small>
          <span class="meta">{{ s.district }}<template v-if="s.time !== null"> · {{ when(s.time) }}</template><template v-else> · {{ t('未到访') }}</template></span>
        </li>
      </ol>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Game } from '../engine/Game.ts'
import { ACHIEVEMENTS, badges, DAILY_REWARD } from '../engine/metro/collection.ts'
import { formatClock } from '../engine/state/clock.ts'
import { isEn, lineShort, nameOf } from '../i18n/core.ts'
import { t } from '../i18n/index.ts'

// 地铁收集（docs/04 第 8 节）：每日任务、成就、线路徽章、按线路分页的集站图鉴
const props = defineProps<{ game: Game }>()
const game = props.game
const data = game.metro!.data
const progress = game.metroProgress
const stations = data.stations
const districts = game.city.config.districts as Record<string, { name: string } | undefined>

const when = (s: number) => t('第 {day} 天 {time}', { day: Math.floor(s / 86400) + 1, time: formatClock(s % 86400) })
const unlocked = computed(() => ACHIEVEMENTS.filter((a) => progress.achievements[a.id] !== undefined).length)
const visited = computed(() => Object.keys(progress.visits).length)
const todayLines = progress.daily.lines.length
const daily = game.dailyTasks().map((d) => ({ ...d, done: progress.daily.done.includes(d.id) }))

const lines = computed(() => badges(data, progress).map((b) => ({ ...b, line: data.lines.find((l) => l.id === b.line)! })))
const lit = computed(() => lines.value.filter((b) => b.lit).length)

const line = ref(data.lines[0]!.id)
const currentColor = computed(() => data.lines.find((l) => l.id === line.value)!.color)
// 按第一个交路的顺序列出这条线的车站，其他交路（支线）多出来的站接在后面
const lineStations = computed(() => {
  const l = data.lines.find((x) => x.id === line.value)!
  const order: number[] = []
  for (const s of l.services) for (const st of s.stops) if (!order.includes(st)) order.push(st)
  return order.map((i) => {
    const s = stations[i]!
    const d = game.districts?.at(s.pos[0], s.pos[1])?.id
    return { id: s.id, name: s.name, nameEn: s.nameEn, district: (d && districts[d]?.name) || t('市外'), time: progress.visits[s.id] ?? null }
  })
})
</script>

<style scoped>
h3 {
  margin: 14px 0 8px;
  font-size: 15px;
}

h3 small {
  color: #888;
  font-weight: 400;
  font-size: 12px;
}

.daily {
  list-style: none;
  margin: 0;
  padding: 0;
}

.daily li {
  padding: 6px 10px;
  margin-bottom: 4px;
  border-radius: 8px;
  background: #fff;
}

.daily li.done {
  color: #2e7d32;
  background: #e8f5e9;
}

.daily small {
  color: #888;
}

.ach {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
}

.a {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border-radius: 10px;
  background: #fff;
  color: #999;
  font-size: 12px;
}

.a b {
  font-size: 14px;
}

.a.on {
  color: #333;
  box-shadow: inset 0 0 0 2px #ffd23a;
}

.badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.badge {
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 4px 8px;
  border: 2px solid;
  border-radius: 10px;
  background: #fff;
  opacity: 0.55;
  font-size: 12px;
}

.badge.lit {
  opacity: 1;
  box-shadow: 0 0 8px rgba(255, 210, 58, 0.8);
}

.chip {
  min-width: 22px;
  padding: 1px 6px;
  border-radius: 4px;
  color: #fff;
  font-weight: 700;
  text-align: center;
}

.pick {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
}

.pick button {
  padding: 3px 8px;
  border: 1px solid #ccc;
  border-radius: 8px;
  background: #fff;
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}

.stations {
  list-style: none;
  margin: 0;
  padding: 0;
  columns: 260px;
}

.stations li {
  display: flex;
  gap: 6px;
  align-items: baseline;
  padding: 3px 0;
  break-inside: avoid;
  color: #999;
}

.stations li.seen {
  color: #222;
}

.stations small {
  color: #aaa;
  font-size: 11px;
}

.dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex: none;
  align-self: center;
}

.meta {
  margin-left: auto;
  font-size: 11px;
  color: #999;
  white-space: nowrap;
}
</style>

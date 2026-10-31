<template>
  <div class="bus" @click.self="emit('close')">
    <div class="card">
      <div class="head">
        <b>🚌 {{ t('{line} · {stop}站', { line: line.name, stop: here }) }}</b>
        <button class="close" :title="t('关闭（Esc）')" @click="emit('close')">✕</button>
      </div>
      <p class="intro">{{ t('双层敞篷观光巴士，到头掉头往回开；坐在二层能看街景，也可以跳过直接到站。{hours}，每 {m} 分钟一班。', { hours, m: headway }) }}</p>
      <div v-for="r in rows" :key="r.to" class="row">
        <div class="info">
          <div class="name">{{ t('去 {stop}', { stop: r.name }) }} <small>{{ r.dir }}</small></div>
          <div class="meta">{{ t('下一班 {time}', { time: r.next }) }}{{ r.wait > 0 ? t('（{m} 分钟后）', { m: r.wait }) : t('（马上来）') }} · {{ t('车程约 {m} 分钟', { m: r.minutes }) }}</div>
        </div>
        <button class="go" :disabled="money < line.fare" @click="emit('board', line.id, stop, r.to)">{{ t('上车') }} ¥{{ line.fare }}</button>
      </div>
      <div v-if="money < line.fare" class="hint">{{ t('钱包里只有 {money} 元', { money }) }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import type { Game } from '../engine/Game.ts'
import { formatClock } from '../engine/state/clock.ts'
import { nextBus } from '../engine/transport/buses.ts'
import { t } from '../i18n/index.ts'

const props = defineProps<{ game: Game; lineId: string; stop: number }>()
const emit = defineEmits<{ close: []; board: [line: string, from: number, to: number] }>()
const line = props.game.buses!.line(props.lineId)!
const money = props.game.money
const here = line.stops[props.stop]!.name
const hours = `${formatClock(line.first)}–${formatClock(line.last)}`
const headway = Math.round(line.headway / 60)

// 去别的每一站：方向、下一班、车程
const rows = computed(() => {
  const now = props.game.clock.seconds
  return line.stops.flatMap((s, i) => {
    if (i === props.stop) return []
    const n = nextBus(line, props.stop, i, now)
    const end = line.stops[n.dir === 0 ? line.stops.length - 1 : 0]!.name
    return [{ to: i, name: s.name, dir: t('往{end}方向', { end }), next: formatClock(n.board % 86400), wait: Math.round((n.board - now) / 60), minutes: Math.round((n.arrive - n.board) / 60) }]
  })
})

function onKey(e: KeyboardEvent) {
  if (e.code === 'Escape') emit('close')
}
onMounted(() => addEventListener('keydown', onKey))
onBeforeUnmount(() => removeEventListener('keydown', onKey))
</script>

<style scoped>
.bus {
  position: fixed;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
}

.card {
  width: min(440px, calc(100% - 24px));
  max-height: calc(100% - 24px);
  overflow: auto;
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
  margin: 6px 0 4px;
}

.row {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 10px 0;
  border-top: 1px solid #eee;
}

.info {
  flex: 1;
  min-width: 0;
}

.name {
  font-weight: 700;
  font-size: 15px;
}

.name small {
  font-weight: 400;
  color: #666;
}

.meta {
  color: #777;
  font-size: 12px;
}

.go {
  flex: none;
  padding: 8px 14px;
  border: none;
  border-radius: 10px;
  background: #c8282a;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
}

.go:disabled {
  background: #bbb;
  cursor: default;
}

.hint {
  margin-top: 6px;
  color: #c8282a;
  font-size: 12px;
}
</style>

<template>
  <div class="boat" @click.self="emit('close')">
    <div class="card">
      <div class="head">
        <b>⛴ {{ pier }}</b>
        <button class="close" title="关闭（Esc）" @click="emit('close')">✕</button>
      </div>
      <div v-for="r in rows" :key="r.id" class="row">
        <div class="info">
          <div class="name">{{ r.name }} <small>{{ r.to }}</small></div>
          <div class="meta">下一班 {{ r.next }}{{ r.wait > 0 ? `（${r.wait} 分钟后）` : '（马上开）' }} · 航程约 {{ r.minutes }} 分钟 · {{ r.hours }}</div>
          <div v-if="r.note" class="note">{{ r.note }}</div>
        </div>
        <button class="go" :disabled="money < r.fare" @click="emit('board', r.berth)">上船 ¥{{ r.fare }}</button>
      </div>
      <div v-if="rows.some((r) => money < r.fare)" class="hint">钱包里只有 {{ money }} 元</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import type { Game } from '../engine/Game.ts'
import { formatClock } from '../engine/state/clock.ts'
import { arrivalOf, nextDeparture } from '../engine/transport/boats.ts'
import type { Pier } from '../engine/transport/BoatSystem.ts'

const props = defineProps<{ game: Game; pier: string }>()
const emit = defineEmits<{ close: []; board: [berth: Pier] }>()
const money = props.game.money

// 打开面板这一刻的时刻表（游戏时间）
const rows = computed(() => {
  const g = props.game
  const t = g.clock.seconds
  return (g.boats?.linesAt(props.pier) ?? []).map((berth) => {
    const l = berth.line
    const dep = nextDeparture(l, berth.index, t)
    const to = l.kind === 'ferry' ? `开往${l.piers[1 - berth.index]}` : '黄浦江往返（外滩 · 陆家嘴 · 北外滩）'
    return {
      id: `${l.id}-${berth.index}`,
      berth,
      name: l.name,
      to,
      fare: l.fare,
      next: formatClock(dep % 86400),
      wait: Math.round((dep - t) / 60),
      minutes: Math.round((arrivalOf(l, dep) - dep) / 60),
      hours: `${formatClock(l.first)}–${formatClock(l.last)}`,
      note: l.kind === 'cruise' ? '18:30 以后两岸亮灯，夜游最好看；船上可以按 P 拍照' : ''
    }
  })
})

function onKey(e: KeyboardEvent) {
  if (e.code === 'Escape') emit('close')
}
onMounted(() => addEventListener('keydown', onKey))
onBeforeUnmount(() => removeEventListener('keydown', onKey))
</script>

<style scoped>
.boat {
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
  margin-bottom: 8px;
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

.note {
  color: #a0682a;
  font-size: 12px;
}

.go {
  flex: none;
  padding: 8px 14px;
  border: none;
  border-radius: 10px;
  background: #2a6fb5;
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

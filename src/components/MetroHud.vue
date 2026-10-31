<template>
  <div class="metro-hud">
    <div class="where">
      <span v-if="status.color" class="chip" :style="{ background: status.color }"></span>
      {{ status.where }}
    </div>
    <div v-if="status.sides.length" class="sides">
      <div v-for="(s, i) in status.sides" :key="i">{{ t('往 {to}', { to: s.toward }) }} · {{ s.text }}</div>
      <button v-if="status.canSkipWait" @click="emit('skipWait')">{{ t('跳过等车') }}</button>
    </div>
    <div v-if="status.ride" class="ride">
      <div class="next">
        <template v-if="status.ride.terminal">{{ t('终点站 {name} · 请下车', { name: status.ride.next }) }}</template>
        <template v-else-if="status.ride.atStation">{{ t('本站 {name} · 车门已开，走到门边按 E 下车', { name: status.ride.next }) }}</template>
        <template v-else>{{ t('下一站 {name}', { name: status.ride.next }) }}</template>
      </div>
      <div v-if="!status.ride.terminal" class="buttons">
        <button @click="emit('skipNext')">{{ t('跳到下一站') }}</button>
        <select v-model="target" @change="go">
          <option :value="-1">{{ t('直达…') }}</option>
          <option v-for="s in status.ride.stops" :key="s.index" :value="s.index">{{ s.name }}</option>
        </select>
      </div>
    </div>
    <Transition name="say">
      <div v-if="shown" :key="shown.id" class="say">
        <!-- 报站中英双语，跟真实的上海地铁一样；英文界面英文在前 -->
        <div>{{ isEn ? shown.en : shown.zh }}</div>
        <div class="en">{{ isEn ? shown.zh : shown.en }}</div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import type { StationStatus } from '../engine/interior/InteriorManager.ts'
import type { Announcement } from '../engine/interior/trip.ts'
import { isEn } from '../i18n/core.ts'
import { t } from '../i18n/index.ts'

// 地铁站内的界面：在哪儿、站台两侧下一班、车厢里的下一站和跳过按钮、报站气泡（docs/04 第 7 节）
const props = defineProps<{ status: StationStatus; announce: (Announcement & { id: number }) | null }>()
const emit = defineEmits<{ skipWait: []; skipNext: []; skipTo: [index: number] }>()
const target = ref(-1)
const shown = ref<(Announcement & { id: number }) | null>(null)
let timer = 0

function go() {
  if (target.value >= 0) emit('skipTo', target.value)
  target.value = -1
}

// 新的报站弹出 6 秒
watch(
  () => props.announce?.id,
  () => {
    if (!props.announce) return
    shown.value = props.announce
    clearTimeout(timer)
    timer = window.setTimeout(() => (shown.value = null), 6000)
  },
  { immediate: true }
)
onBeforeUnmount(() => clearTimeout(timer))
</script>

<style scoped>
.metro-hud {
  position: fixed;
  top: max(12px, env(safe-area-inset-top));
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  max-width: min(520px, calc(100% - 24px));
  pointer-events: none;
  font-size: 13px;
  color: #fff;
}

.where,
.sides,
.ride {
  padding: 6px 12px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.65);
  text-align: center;
}

.where {
  font-weight: 700;
  font-size: 14px;
}

.chip {
  display: inline-block;
  width: 10px;
  height: 10px;
  margin-right: 4px;
  border-radius: 2px;
}

.sides button,
.buttons button,
.buttons select {
  margin-top: 4px;
  padding: 3px 10px;
  border: none;
  border-radius: 8px;
  background: #fff;
  color: #000;
  font-size: 12px;
  font-family: inherit;
  pointer-events: auto;
  cursor: pointer;
}

.buttons {
  display: flex;
  gap: 6px;
  justify-content: center;
}

.next {
  font-weight: 700;
}

.say {
  margin-top: 4px;
  padding: 8px 14px;
  border-radius: 12px;
  background: rgba(20, 30, 45, 0.85);
  border-left: 4px solid #ffb000;
  font-size: 14px;
  line-height: 1.5;
}

.en {
  font-size: 12px;
  opacity: 0.8;
}

.say-enter-active,
.say-leave-active {
  transition: opacity 0.4s;
}

.say-enter-from,
.say-leave-to {
  opacity: 0;
}
</style>

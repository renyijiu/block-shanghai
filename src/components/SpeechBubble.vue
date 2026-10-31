<template>
  <Transition name="say">
    <div v-if="shown" :key="shown.key" class="bubble">
      <div class="who">
        {{ shown.talk.name }}<span class="tag">{{ t(SPEECH[shown.talk.speech]) }}</span>
      </div>
      <div class="text">{{ shown.talk.line.text }}</div>
      <div v-if="shown.talk.line.gloss" class="gloss">{{ t('（{gloss}）', { gloss: shown.talk.line.gloss }) }}</div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import type { Talk } from '../engine/actors/NPCManager.ts'
import { t } from '../i18n/index.ts'

// 路人说的话：上海话下面带普通话意思，5 秒后消失
const props = defineProps<{ talk: { talk: Talk; key: number } | null }>()
const SPEECH = { wu: '上海话', mandarin: '普通话', english: 'English' } as const
const shown = ref(props.talk)
let timer = 0
watch(
  () => props.talk?.key,
  () => {
    shown.value = props.talk
    clearTimeout(timer)
    timer = window.setTimeout(() => (shown.value = null), 5000)
  }
)
onBeforeUnmount(() => clearTimeout(timer))
</script>

<style scoped>
.bubble {
  position: fixed;
  left: 50%;
  bottom: max(160px, calc(env(safe-area-inset-bottom) + 160px));
  transform: translateX(-50%);
  max-width: min(440px, calc(100% - 32px));
  padding: 10px 16px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.96);
  color: #222;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
  font-size: 15px;
  line-height: 1.5;
  pointer-events: none;
}

.who {
  font-size: 12px;
  color: #777;
}

.tag {
  margin-left: 6px;
  padding: 0 5px;
  border-radius: 4px;
  background: #eee;
}

.text {
  font-weight: 700;
}

.gloss {
  color: #666;
  font-size: 13px;
}

.say-enter-active,
.say-leave-active {
  transition: opacity 0.3s;
}

.say-enter-from,
.say-leave-to {
  opacity: 0;
}
</style>

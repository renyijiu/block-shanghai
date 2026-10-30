<template>
  <Transition name="discover">
    <div v-if="visible && landmark" :key="landmark.id" class="card">
      <div class="kicker">发现景点 <span class="grade" :class="landmark.grade">{{ landmark.grade }}</span></div>
      <div class="name">{{ landmark.name }}</div>
      <div v-if="landmark.district" class="district">{{ landmark.district }}</div>
      <div class="desc">{{ landmark.desc }}</div>
      <div v-if="landmark.tip" class="tip">{{ landmark.tip }}</div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'

export interface DiscoverInfo {
  id: string
  name: string
  grade: 'S' | 'A' | 'B'
  district: string
  desc: string
  tip: string
}

// 走近新景点时在屏幕左侧弹出景点卡片，4 秒后淡出（排队由 App 管）
const props = defineProps<{ landmark: DiscoverInfo | null }>()
const visible = ref(false)
let timer = 0

watch(
  () => props.landmark?.id,
  (id) => {
    if (!id) return
    visible.value = true
    clearTimeout(timer)
    timer = window.setTimeout(() => (visible.value = false), 4000)
  }
)

onBeforeUnmount(() => clearTimeout(timer))
</script>

<style scoped>
.card {
  position: fixed;
  left: max(12px, env(safe-area-inset-left));
  top: 42%;
  width: min(300px, calc(100% - 24px));
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.72);
  color: #fff;
  font-size: 13px;
  line-height: 1.55;
  pointer-events: none;
}

.kicker {
  font-size: 12px;
  opacity: 0.8;
  letter-spacing: 2px;
}

.grade {
  display: inline-block;
  margin-left: 4px;
  padding: 0 6px;
  border-radius: 4px;
  font-weight: 800;
  letter-spacing: 0;
  color: #000;
  background: #ddd;
}

.grade.S {
  background: #ffd23a;
}

.grade.A {
  background: #9fd8ff;
}

.name {
  margin-top: 2px;
  font-size: 22px;
  font-weight: 800;
}

.district {
  opacity: 0.75;
  margin-bottom: 4px;
}

.tip {
  margin-top: 6px;
  color: #ffe9a8;
}

/* 矮屏（手机横屏）只留名字，免得挡住摇杆 */
@media (max-height: 500px) {
  .card {
    top: 30%;
    width: auto;
    max-width: 50%;
  }

  .desc,
  .tip {
    display: none;
  }
}

.discover-enter-active,
.discover-leave-active {
  transition: opacity 0.6s, transform 0.6s;
}

.discover-enter-from,
.discover-leave-to {
  opacity: 0;
  transform: translateX(-16px);
}
</style>

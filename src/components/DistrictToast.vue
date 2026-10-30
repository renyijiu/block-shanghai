<template>
  <Transition name="toast">
    <div v-if="visible" :key="name" class="toast">
      <div class="name">{{ name }}</div>
      <div class="theme">{{ theme }}</div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'

// 进入新的区时在屏幕上方弹出区名和区主题，3 秒后淡出
const props = defineProps<{ name: string; theme: string }>()
const visible = ref(false)
let timer = 0

watch(
  () => props.name,
  (n) => {
    if (!n) return
    visible.value = true
    clearTimeout(timer)
    timer = window.setTimeout(() => (visible.value = false), 3000)
  },
  { immediate: true }
)

onBeforeUnmount(() => clearTimeout(timer))
</script>

<style scoped>
.toast {
  position: fixed;
  top: 18%;
  left: 50%;
  transform: translateX(-50%);
  text-align: center;
  color: #fff;
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.6);
  pointer-events: none;
}

.name {
  font-size: 34px;
  font-weight: 800;
  letter-spacing: 4px;
}

.theme {
  margin-top: 4px;
  font-size: 16px;
  opacity: 0.9;
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.6s, transform 0.6s;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, -12px);
}
</style>

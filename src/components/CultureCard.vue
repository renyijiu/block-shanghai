<template>
  <div class="culture" @click.self="emit('close')">
    <div class="card">
      <div class="head">
        <b>📜 {{ entry.name }}</b>
        <button class="close" title="关闭（Esc）" @click="emit('close')">✕</button>
      </div>
      <p>{{ entry.text }}</p>
      <div class="hint">已收进“收藏 · 文化图鉴”</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import type { CultureDef } from '../engine/city.ts'

// 文化牌：读一段介绍，第一次读解锁文化图鉴
defineProps<{ entry: CultureDef }>()
const emit = defineEmits<{ close: [] }>()
function onKey(e: KeyboardEvent) {
  if (e.code === 'Escape' || e.code === 'KeyE') emit('close')
}
onMounted(() => addEventListener('keydown', onKey))
onBeforeUnmount(() => removeEventListener('keydown', onKey))
</script>

<style scoped>
.culture {
  position: fixed;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
}

.card {
  width: min(420px, calc(100% - 24px));
  max-height: calc(100% - 24px);
  overflow: auto;
  padding: 12px 16px 14px;
  border-radius: 14px;
  background: #fbf6ea;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  font-size: 14px;
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 17px;
}

.close {
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 10px;
  background: #ece4d2;
  cursor: pointer;
}

p {
  margin: 10px 0 8px;
  line-height: 1.7;
}

.hint {
  color: #a0682a;
  font-size: 12px;
}
</style>

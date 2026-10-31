<template>
  <div class="menu" @click.self="emit('close')">
    <div class="card">
      <div class="head">
        <b>☰ 菜单</b>
        <button class="close" title="关闭（Esc）" @click="emit('close')">✕</button>
      </div>
      <button class="item" @click="emit('open', 'character')">👤 形象<small>颜色、发型、帽子，或者上传皮肤</small></button>
      <button class="item" @click="emit('quality')">⚙️ 画质：{{ qualityLabel }}<small>低 / 中 / 高，手机默认低</small></button>
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

defineProps<{ qualityLabel: string }>()
const emit = defineEmits<{ close: []; open: [what: string]; quality: [] }>()
function onKey(e: KeyboardEvent) {
  if (e.code === 'Escape') emit('close')
}
onMounted(() => addEventListener('keydown', onKey))
onBeforeUnmount(() => removeEventListener('keydown', onKey))
</script>

<style scoped>
.menu {
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
  gap: 6px;
  width: min(360px, calc(100% - 24px));
  max-height: calc(100% - 24px);
  overflow: auto;
  padding: 12px 14px 14px;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  font-size: 14px;
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
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

.item,
:slotted(.item) {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 10px 12px;
  border: none;
  border-radius: 10px;
  background: #f4f1ea;
  font-family: inherit;
  font-size: 15px;
  text-align: left;
  cursor: pointer;
}

.item small,
:slotted(.item small) {
  color: #888;
  font-size: 12px;
}
</style>

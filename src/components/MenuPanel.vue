<template>
  <div class="menu" @click.self="emit('close')">
    <div class="card">
      <div class="head">
        <b>{{ t('☰ 菜单') }}</b>
        <button class="close" :title="t('关闭')" @click="emit('close')">✕</button>
      </div>
      <button class="item" @click="emit('open', 'character')">{{ t('👤 形象') }}<small>{{ t('颜色、发型、帽子，或者上传皮肤') }}</small></button>
      <button class="item" @click="emit('quality')">{{ t('⚙️ 画质：{q}', { q: qualityLabel }) }}<small>{{ t('低 / 中 / 高，手机默认低；太卡会自动调低') }}</small></button>
      <button class="item" @click="emit('fullscreen')">{{ t(fullscreen ? '⛶ 退出全屏' : '⛶ 全屏') }}<small>{{ t('手机上会同时锁成横屏') }}</small></button>
      <button class="item" @click="setLocale(locale === 'zh' ? 'en' : 'zh')">{{ locale === 'zh' ? t('🌐 语言：中文') : t('🌐 语言：English') }}<small>{{ t('英文模式下景点介绍、对白暂时还是中文') }}</small></button>
      <button class="item" @click="emit('open', 'about')">{{ t('ℹ️ 关于') }}<small>{{ t('数据来源、致谢') }}</small></button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { locale, setLocale, t } from '../i18n/index.ts'

defineProps<{ qualityLabel: string; fullscreen: boolean }>()
const emit = defineEmits<{ close: []; open: [what: string]; quality: []; fullscreen: [] }>()
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

.item {
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

.item small {
  color: #888;
  font-size: 12px;
}
</style>

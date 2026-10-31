<template>
  <div class="photo">
    <!-- 取景框：四个角 + 识别范围 -->
    <div class="frame">
      <i class="c tl"></i><i class="c tr"></i><i class="c bl"></i><i class="c br"></i>
    </div>
    <div class="filters">
      <button v-for="(f, i) in filters" :key="f.id" :class="{ on: f.id === filter }" @click="choose(f)"><small v-if="!touch">{{ i + 1 }}</small>{{ f.name }}</button>
    </div>
    <div class="side">
      <button class="close" title="退出拍照（Esc）" @click="emit('close')">✕</button>
      <button class="shutter" :disabled="busy" title="拍照（空格）" @click="shoot"></button>
      <button class="view" title="切换视角（V）" @click="game.input.press('view')">{{ view }}</button>
    </div>
    <div v-if="!touch" class="keys">空格 拍照 · 1–{{ filters.length }} 滤镜 · V 视角（含自拍）· 拖动取景 · Esc 退出</div>
    <div v-if="flash" class="flash"></div>
    <Transition name="pop">
      <div v-if="result" class="result" @click="emit('album')">
        <img :src="result.url" alt="" />
        <div>
          <div v-if="result.names.length" class="names">拍到：{{ result.names.join('、') }}</div>
          <div v-else class="names dim">画面里没有认出景点</div>
          <div v-if="result.people" class="people">和 {{ result.people }} 位路人合影</div>
          <div v-if="result.newly.length" class="newly">图鉴新解锁 {{ result.newly.length }} 项：{{ result.newly.join('、') }}</div>
          <div class="hint">{{ result.saved ? '已存进相册 · 点这里查看' : '照片没能保存（浏览器不允许本地存储）' }}</div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { Game } from '../engine/Game.ts'
import type { PhotoFilter } from '../engine/photo/filters.ts'

const props = defineProps<{ game: Game; touch: boolean }>()
const emit = defineEmits<{ close: []; album: []; shot: [newly: number] }>()
const game = props.game
const filters = game.city.config.photoFilters
const filter = ref(game.photoFilter.id)
const view = ref(game.rig.viewName)
const busy = ref(false)
const flash = ref(false)
const result = ref<{ url: string; names: string[]; newly: string[]; saved: boolean; people: number } | null>(null)
let resultTimer = 0
let viewTimer = 0

function choose(f: PhotoFilter) {
  filter.value = f.id
  game.setPhotoFilter(f)
}

async function shoot() {
  if (busy.value) return
  busy.value = true
  flash.value = true
  setTimeout(() => (flash.value = false), 160)
  try {
    const r = await game.takePhoto()
    if (result.value) URL.revokeObjectURL(result.value.url)
    result.value = { url: URL.createObjectURL(r.thumb), names: r.recognized.map((id) => game.landmarkName(id)), newly: r.newly.map((id) => game.landmarkName(id)), saved: r.saved, people: r.people }
    emit('shot', r.newly.length)
    clearTimeout(resultTimer)
    resultTimer = window.setTimeout(() => (result.value = null), 4500)
  } catch (e) {
    console.error(e)
  } finally {
    busy.value = false
  }
}

function onKey(e: KeyboardEvent) {
  if (e.repeat) return
  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault()
    void shoot()
  } else if (e.code === 'Escape' || e.code === 'KeyP') emit('close')
  else if (/^Digit[1-9]$/.test(e.code)) {
    const f = filters[Number(e.code.slice(5)) - 1]
    if (f) choose(f)
  }
}

onMounted(() => {
  game.setPhotoMode(true)
  addEventListener('keydown', onKey)
  // 视角名字跟着 V 键 / 按钮变
  viewTimer = window.setInterval(() => (view.value = game.rig.viewName), 150)
  Object.assign(window, { __shoot: shoot, __photoResult: () => result.value })
})

onBeforeUnmount(() => {
  removeEventListener('keydown', onKey)
  clearInterval(viewTimer)
  clearTimeout(resultTimer)
  if (result.value) URL.revokeObjectURL(result.value.url)
  game.setPhotoMode(false)
})
</script>

<style scoped>
.photo {
  position: fixed;
  inset: 0;
  pointer-events: none;
}

.frame {
  position: absolute;
  inset: 5% 5%;
}

.c {
  position: absolute;
  width: 28px;
  height: 28px;
  border: 3px solid rgba(255, 255, 255, 0.9);
  filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.6));
}

.tl {
  left: 0;
  top: 0;
  border-right: none;
  border-bottom: none;
}

.tr {
  right: 0;
  top: 0;
  border-left: none;
  border-bottom: none;
}

.bl {
  left: 0;
  bottom: 0;
  border-right: none;
  border-top: none;
}

.br {
  right: 0;
  bottom: 0;
  border-left: none;
  border-top: none;
}

.filters {
  position: absolute;
  top: max(12px, env(safe-area-inset-top));
  left: 50%;
  transform: translateX(-50%);
  max-width: calc(100% - 24px);
  display: flex;
  gap: 6px;
  overflow-x: auto;
  pointer-events: auto;
}

.filters button {
  flex: none;
  padding: 6px 12px;
  border: none;
  border-radius: 16px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
}

.filters button.on {
  background: #fff;
  color: #000;
  font-weight: 700;
}

.filters small {
  margin-right: 4px;
  opacity: 0.6;
}

.side {
  position: absolute;
  right: max(16px, env(safe-area-inset-right));
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  pointer-events: auto;
}

.side button {
  border: none;
  font-family: inherit;
  cursor: pointer;
}

.shutter {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 0 0 4px rgba(0, 0, 0, 0.35), inset 0 0 0 4px #fff, inset 0 0 0 7px #222;
}

.shutter:active,
.shutter:disabled {
  transform: scale(0.94);
}

.close,
.view {
  min-width: 44px;
  height: 36px;
  padding: 0 10px;
  border-radius: 18px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 13px;
}

.keys {
  position: absolute;
  left: 50%;
  bottom: 14px;
  transform: translateX(-50%);
  padding: 6px 14px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  font-size: 12px;
  white-space: nowrap;
}

.flash {
  position: absolute;
  inset: 0;
  background: #fff;
  opacity: 0.85;
}

.result {
  position: absolute;
  left: 50%;
  bottom: max(70px, calc(env(safe-area-inset-bottom) + 70px));
  transform: translateX(-50%);
  display: flex;
  gap: 10px;
  align-items: center;
  max-width: min(460px, calc(100% - 120px));
  padding: 8px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.75);
  color: #fff;
  font-size: 13px;
  line-height: 1.5;
  pointer-events: auto;
  cursor: pointer;
}

.result img {
  width: 120px;
  border-radius: 6px;
  flex: none;
}

.names {
  font-weight: 700;
}

.dim {
  opacity: 0.75;
  font-weight: 400;
}

.people {
  color: #9fd8ff;
}

.newly {
  color: #ffd23a;
}

.hint {
  opacity: 0.7;
  font-size: 12px;
}

.pop-enter-active,
.pop-leave-active {
  transition: opacity 0.4s, transform 0.4s;
}

.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: translate(-50%, 12px);
}
</style>

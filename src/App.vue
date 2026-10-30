<template>
  <div ref="container" class="stage"></div>
  <div class="hud">
    <div class="title">{{ city.name }} · {{ city.nameEn }}</div>
    <div>P0 · 项目骨架</div>
    <div>原点：人民广场（{{ city.projection.origin.lat }}, {{ city.projection.origin.lon }}）</div>
    <div>黄圈：核心区 {{ city.projection.coreRadiusKm }} km（1:1）· 网格：{{ CHUNK_SIZE }} 格分块</div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { Game, CHUNK_SIZE } from './engine/Game.js'
import { CITIES, DEFAULT_CITY } from './cities/index.js'

const city = CITIES[DEFAULT_CITY]
const container = ref(null)
let game = null

onMounted(() => {
  game = new Game(container.value, city)
  game.start()
})

onBeforeUnmount(() => {
  if (game) game.dispose()
})
</script>

<style scoped>
.stage {
  position: fixed;
  inset: 0;
}

.hud {
  position: fixed;
  top: 12px;
  left: 12px;
  padding: 10px 14px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 13px;
  line-height: 1.6;
  pointer-events: none;
}

.title {
  font-size: 16px;
  font-weight: 700;
}
</style>

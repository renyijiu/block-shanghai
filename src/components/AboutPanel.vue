<template>
  <div class="about" @click.self="emit('close')">
    <div class="card">
      <div class="head">
        <b>{{ city }} · {{ cityEn }}</b>
        <button class="close" :title="t('关闭')" @click="emit('close')">✕</button>
      </div>
      <p class="ver">v{{ version }} · {{ built }}</p>
      <template v-if="locale === 'en'">
        <p>A blocky open world of Shanghai: walk real streets built from map data, ride the metro, ferries, the sightseeing bus and shared bikes, take photos of landmarks, eat local food and collect everything along the way.</p>
        <h4>Data</h4>
        <p>Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>, available under the Open Database License (ODbL). Rivers, roads, parks, districts, the metro network and landmark positions all come from OpenStreetMap.</p>
        <h4>Credits</h4>
        <p>Built with Vue, three.js (WebGPU) and Vite. Inspired by <a href="https://github.com/ns2250225/guangzhou" target="_blank" rel="noopener">Block Guangzhou</a> (ideas only, no code reused).</p>
        <h4>Notes</h4>
        <p>Landmarks are blocky reinterpretations, not exact replicas. Shops and goods use generic names. The Shanghainese lines have not been proofread by native speakers yet. The code is released under the MIT License; map data is used under the ODbL.</p>
      </template>
      <template v-else>
        <p>方块风格的上海开放世界：在按地图数据生成的真实街道上走路，坐地铁、轮渡、观光巴士、共享单车，拍景点、吃小吃，一路收集。</p>
        <h4>数据</h4>
        <p>地图数据 © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>，按开放数据库许可（ODbL）使用。河流、道路、公园、区界、地铁线网和景点的位置都来自 OpenStreetMap。</p>
        <h4>致谢</h4>
        <p>用 Vue、three.js（WebGPU）和 Vite 搭建。玩法参考了<a href="https://github.com/ns2250225/guangzhou" target="_blank" rel="noopener">方块羊城</a>（只借鉴思路，没有复制代码）。</p>
        <h4>说明</h4>
        <p>景点是方块风格的再创作，不是精确复原；店铺和商品用通用名，不用品牌。路人的沪语对白还没请上海话母语者校对。代码按 MIT 许可证开源，地图数据按 ODbL 许可使用。</p>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { locale, t } from '../i18n/index.ts'

defineProps<{ city: string; cityEn: string }>()
const emit = defineEmits<{ close: [] }>()
const version = __APP_VERSION__
const built = __BUILD_DATE__
function onKey(e: KeyboardEvent) {
  if (e.code === 'Escape') emit('close')
}
onMounted(() => addEventListener('keydown', onKey))
onBeforeUnmount(() => removeEventListener('keydown', onKey))
</script>

<style scoped>
.about {
  position: fixed;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
}

.card {
  width: min(480px, calc(100% - 24px));
  max-height: calc(100% - 24px);
  overflow: auto;
  padding: 12px 16px 16px;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  font-size: 14px;
  line-height: 1.6;
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
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

.ver {
  margin: 0;
  color: #999;
  font-size: 12px;
}

h4 {
  margin: 12px 0 2px;
  font-size: 14px;
}

p {
  margin: 4px 0;
}

a {
  color: #2a6fb5;
}
</style>

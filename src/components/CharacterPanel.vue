<template>
  <div class="sheet">
    <div class="head">
      <b>👤 形象</b>
      <button class="close" title="完成（Esc）" @click="close">完成</button>
    </div>
    <div class="body">
      <template v-if="!look.skinImage">
        <section v-for="k in colorKeys" :key="k.key">
          <h4>{{ k.name }}</h4>
          <div class="swatches">
            <button v-for="c in LOOK_PALETTE[k.key]" :key="c" class="sw" :class="{ on: look[k.key] === c }" :style="{ background: hex(c) }" :title="hex(c)" @click="set(k.key, c)"></button>
            <label v-if="k.key === 'shirt' || k.key === 'pants'" class="sw pick" title="自选颜色">
              <input type="color" :value="hex(look[k.key])" @input="set(k.key, parseInt(($event.target as HTMLInputElement).value.slice(1), 16))" />
            </label>
          </div>
        </section>
        <section>
          <h4>发型</h4>
          <div class="opts">
            <button v-for="o in HAIR" :key="o.v" :class="{ on: look.hairStyle === o.v }" @click="set('hairStyle', o.v)">{{ o.name }}</button>
          </div>
        </section>
        <section>
          <h4>帽子和眼镜</h4>
          <div class="opts">
            <button v-for="o in HATS" :key="o.v" :class="{ on: look.hat === o.v }" @click="set('hat', o.v)">{{ o.name }}</button>
            <button :class="{ on: look.glasses }" @click="set('glasses', !look.glasses)">眼镜</button>
          </div>
        </section>
      </template>
      <section>
        <h4>皮肤</h4>
        <p class="note">可以上传一张 64×64 的方块人皮肤（PNG，常见方块游戏的皮肤格式，老的 64×32 也行）。用了皮肤，上面的颜色设置就不生效。</p>
        <div class="opts">
          <label class="upload">
            上传皮肤
            <input type="file" accept="image/png" @change="upload" />
          </label>
          <button @click="sample">示例皮肤</button>
          <button v-if="look.skinImage" @click="set('skinImage', null)">去掉皮肤</button>
        </div>
        <img v-if="look.skinImage" class="skin" :src="look.skinImage" alt="皮肤" />
        <p v-if="error" class="error">{{ error }}</p>
      </section>
      <button class="reset" @click="reset">恢复默认</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { DEFAULT_LOOK, LOOK_PALETTE, type Look } from '../engine/actors/look.ts'
import type { Game } from '../engine/Game.ts'

const props = defineProps<{ game: Game }>()
const emit = defineEmits<{ close: [] }>()
const game = props.game
const look = reactive<Look>({ ...game.player.look })
const error = ref('')
const colorKeys = [
  { key: 'skin', name: '肤色' },
  { key: 'hair', name: '发色' },
  { key: 'shirt', name: '上衣' },
  { key: 'pants', name: '裤子' }
] as const
const HAIR = [
  { v: 'short', name: '短发' },
  { v: 'long', name: '长发' },
  { v: 'buzz', name: '寸头' }
] as const
const HATS = [
  { v: 'none', name: '不戴帽子' },
  { v: 'cap', name: '鸭舌帽' },
  { v: 'beret', name: '贝雷帽' }
] as const
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0')

function set<K extends keyof Look>(k: K, v: Look[K]) {
  look[k] = v
  error.value = ''
  game.player.setLook({ ...look })
}

function reset() {
  Object.assign(look, DEFAULT_LOOK)
  game.player.setLook({ ...look })
}

// 上传：读成图片，检查尺寸，统一画成 64×64（老格式没有左臂左腿，照右边的抄过去）
function upload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!file) return
  if (file.size > 100_000) return void (error.value = '图片太大了，皮肤一般只有几 KB')
  const img = new Image()
  img.onload = () => {
    URL.revokeObjectURL(img.src)
    if (img.width !== 64 || (img.height !== 64 && img.height !== 32)) return void (error.value = `尺寸不对：需要 64×64 或 64×32，这张是 ${img.width}×${img.height}`)
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const ctx = c.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    if (img.height === 32) {
      ctx.drawImage(c, 40, 16, 16, 16, 32, 48, 16, 16)
      ctx.drawImage(c, 0, 16, 16, 16, 16, 48, 16, 16)
    }
    set('skinImage', c.toDataURL('image/png'))
  }
  img.onerror = () => (error.value = '读不出这张图片')
  img.src = URL.createObjectURL(file)
}

// 示例皮肤：画一个穿红色对襟上衣的方块人（顺便验证贴图方向：正面有眼睛和纽扣）
function sample() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const fill = (col: string, x: number, y: number, w: number, h: number) => {
    g.fillStyle = col
    g.fillRect(x, y, w, h)
  }
  const SKIN = '#f0c8a0'
  const HAIR = '#2a2220'
  const RED = '#b8282a'
  const GOLD = '#e8c547'
  const PANTS = '#2f3440'
  // 头：四周和顶上是头发，正面下半是脸
  fill(HAIR, 0, 0, 32, 16)
  fill(SKIN, 8, 11, 8, 5)
  fill(SKIN, 0, 12, 8, 4)
  fill(SKIN, 16, 12, 8, 4)
  fill('#ffffff', 9, 12, 2, 1)
  fill('#ffffff', 13, 12, 2, 1)
  fill('#222222', 10, 12, 1, 1)
  fill('#222222', 13, 12, 1, 1)
  fill('#c86a5a', 11, 14, 2, 1)
  // 身体：红色对襟上衣，中间一排盘扣
  fill(RED, 16, 16, 24, 16)
  for (let y = 21; y < 32; y += 3) fill(GOLD, 23, y, 2, 1)
  fill(GOLD, 20, 20, 8, 1)
  // 手臂：红袖子，袖口露手
  fill(RED, 40, 16, 16, 16)
  fill(SKIN, 40, 29, 16, 3)
  fill(RED, 32, 48, 16, 16)
  fill(SKIN, 32, 61, 16, 3)
  // 腿
  fill(PANTS, 0, 16, 16, 16)
  fill('#111111', 0, 29, 16, 3)
  fill(PANTS, 16, 48, 16, 16)
  fill('#111111', 16, 61, 16, 3)
  set('skinImage', c.toDataURL('image/png'))
}

function close() {
  emit('close')
}

function onKey(e: KeyboardEvent) {
  if (e.code === 'Escape') close()
}

// 打开时镜头转到人前面（自拍机位），关的时候恢复并存档
onMounted(() => {
  addEventListener('keydown', onKey)
  game.rig.photo = true
  game.rig.selfie = true
  game.rig.selfieDistance = 3.2
  game.rig.pitch = 0.1
})
onBeforeUnmount(() => {
  removeEventListener('keydown', onKey)
  game.rig.selfie = false
  game.rig.photo = game.photoMode
  game.saveNow()
})
</script>

<style scoped>
.sheet {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  width: min(360px, 100%);
  background: rgba(250, 248, 243, 0.96);
  box-shadow: -4px 0 20px rgba(0, 0, 0, 0.2);
  font-size: 14px;
}

@media (max-width: 600px) {
  .sheet {
    top: 45%;
    width: 100%;
    box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.2);
  }
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: max(12px, env(safe-area-inset-top)) 14px 8px;
  font-size: 16px;
}

.close {
  padding: 6px 14px;
  border: none;
  border-radius: 10px;
  background: #2a2a2a;
  color: #fff;
  font-family: inherit;
  cursor: pointer;
}

.body {
  flex: 1;
  overflow: auto;
  padding: 0 14px max(16px, env(safe-area-inset-bottom));
}

h4 {
  margin: 12px 0 6px;
  font-size: 13px;
  color: #555;
}

.swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.sw {
  width: 30px;
  height: 30px;
  border: 2px solid #fff;
  border-radius: 8px;
  box-shadow: 0 0 0 1px #ccc;
  cursor: pointer;
  padding: 0;
}

.sw.on {
  box-shadow: 0 0 0 2px #2a2a2a;
}

.pick {
  position: relative;
  overflow: hidden;
  background: conic-gradient(red, yellow, lime, cyan, blue, magenta, red);
}

.pick input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.opts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.opts button,
.upload,
.reset {
  padding: 6px 12px;
  border: none;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
}

.opts button.on {
  background: #2a2a2a;
  color: #fff;
}

.upload input {
  display: none;
}

.note {
  margin: 0 0 6px;
  color: #777;
  font-size: 12px;
}

.skin {
  display: block;
  width: 128px;
  height: 128px;
  margin-top: 8px;
  image-rendering: pixelated;
  border: 1px solid #ddd;
  background: repeating-conic-gradient(#eee 0 25%, #fff 0 50%) 0 0 / 16px 16px;
}

.error {
  color: #c8282a;
  font-size: 12px;
}

.reset {
  margin-top: 16px;
}
</style>

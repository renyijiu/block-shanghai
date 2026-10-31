<template>
  <div class="shop" @click.self="emit('close')">
    <div class="card">
      <div class="head">
        <b>{{ icon }} {{ shop.name }}</b>
        <button class="close" title="关闭（Esc）" @click="emit('close')">✕</button>
      </div>
      <div v-for="r in rows" :key="r.id" class="row">
        <div class="info">
          <div class="name">
            {{ r.name }}
            <span v-if="r.when" class="tag" :class="{ off: !r.open }">{{ r.when }}</span>
            <span v-if="r.have" class="tag have">{{ r.have }}</span>
          </div>
          <div class="meta">{{ r.desc }}</div>
        </div>
        <button class="go" :disabled="!r.open || money < r.price" @click="buy(r.id)">{{ r.open ? `${r.verb} ¥${r.price}` : '没到季节' }}</button>
      </div>
      <div class="foot">
        <span>钱包 ¥{{ money }}</span>
        <span v-if="message" :class="{ bad: !ok }">{{ message }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Game } from '../engine/Game.ts'
import { foodAvailable, foodWhen } from '../engine/life/progress.ts'

const props = defineProps<{ game: Game; shopId: string }>()
const emit = defineEmits<{ close: []; bought: [message: string] }>()
const game = props.game
const content = game.city.content
const shop = content.shops.find((s) => s.id === props.shopId)!
const icon = { food: '🥟', gift: '🎁', coffee: '☕' }[shop.kind]
const money = ref(game.money)
const message = ref('')
const ok = ref(true)
// 买了东西以后刷新“吃过 / 背包里有几个”
const tick = ref(0)

const rows = computed(() => {
  void tick.value
  const now = new Date()
  const hour = game.clock.daySeconds / 3600
  return shop.items.flatMap((id) => {
    const f = content.foods.find((x) => x.id === id)
    if (f) return [{ id, name: f.name, desc: f.desc, price: f.price, verb: f.id === 'coffee' ? '来一杯' : '吃', when: foodWhen(f), open: foodAvailable(f, now, hour), have: game.life.foods[id] !== undefined ? '吃过' : '' }]
    const s = content.souvenirs.find((x) => x.id === id)
    if (!s || s.price === undefined) return []
    const n = game.life.items[id] ?? 0
    return [{ id, name: s.name, desc: s.desc, price: s.price, verb: '买', when: '', open: true, have: n ? `背包里有 ${n} 个` : '' }]
  })
})

function buy(id: string) {
  const r = game.buy(shop.id, id)
  ok.value = r.ok
  message.value = r.message
  money.value = game.money
  tick.value++
  if (r.ok) emit('bought', r.message)
}

function onKey(e: KeyboardEvent) {
  if (e.code === 'Escape') emit('close')
}
onMounted(() => addEventListener('keydown', onKey))
onBeforeUnmount(() => removeEventListener('keydown', onKey))
</script>

<style scoped>
.shop {
  position: fixed;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
}

.card {
  width: min(440px, calc(100% - 24px));
  max-height: calc(100% - 24px);
  overflow: auto;
  padding: 12px 14px;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  font-size: 14px;
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
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

.row {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 10px 0;
  border-top: 1px solid #eee;
}

.info {
  flex: 1;
  min-width: 0;
}

.name {
  font-weight: 700;
  font-size: 15px;
}

.tag {
  margin-left: 4px;
  padding: 0 5px;
  border-radius: 4px;
  background: #e5f3e6;
  color: #2e7d32;
  font-size: 11px;
  font-weight: 400;
}

.tag.off {
  background: #eee;
  color: #888;
}

.tag.have {
  background: #fff3d6;
  color: #a0682a;
}

.meta {
  color: #777;
  font-size: 12px;
}

.go {
  flex: none;
  min-width: 84px;
  padding: 8px 12px;
  border: none;
  border-radius: 10px;
  background: #c8452f;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
}

.go:disabled {
  background: #bbb;
  cursor: default;
}

.foot {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-top: 6px;
  padding-top: 8px;
  border-top: 1px solid #eee;
  color: #555;
  font-size: 13px;
}

.foot .bad {
  color: #c8282a;
}
</style>

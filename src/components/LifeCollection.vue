<template>
  <div class="life">
    <section>
      <h3>{{ t('🎒 背包 · 纪念品') }} {{ items.filter((i) => i.n).length }}/{{ items.length }}</h3>
      <div class="cards">
        <div v-for="i in items" :key="i.id" class="card" :class="{ locked: !i.n }">
          <div class="name">{{ i.n ? i.name : '？？？' }}<span v-if="i.n > 1" class="count">× {{ i.n }}</span></div>
          <div class="meta">{{ i.n ? i.desc : i.how }}</div>
        </div>
      </div>
    </section>

    <section>
      <h3>{{ t('🥢 美食图鉴') }} {{ foods.filter((f) => f.eaten).length }}/{{ foods.length }}</h3>
      <div class="cards">
        <div v-for="f in foods" :key="f.id" class="card" :class="{ locked: !f.eaten }">
          <div class="name">
            {{ f.name }}
            <span v-if="f.when" class="tag">{{ f.when }}</span>
            <span v-if="f.eaten" class="tag done">{{ t('吃过') }}</span>
          </div>
          <div class="meta">{{ f.desc }}</div>
          <div class="where">{{ f.where }}</div>
        </div>
      </div>
    </section>

    <section>
      <h3>🚶 Citywalk {{ walks.filter((w) => w.done).length }}/{{ walks.length }}</h3>
      <p class="intro">{{ t('走到起点自动开始，按顺序走过每个打卡点（地上有浅色步道，下一站头顶有绿色标记），走完得徽章。') }}</p>
      <div class="cards">
        <div v-for="w in walks" :key="w.id" class="card" :class="{ locked: !w.started }">
          <div class="name">
            {{ w.name }}
            <span v-if="w.done" class="tag done">🏅 {{ w.badge }}</span>
            <span v-else-if="w.started" class="tag">{{ w.next }}/{{ w.stops.length }}</span>
          </div>
          <div class="meta">{{ w.area }} · {{ w.desc }}</div>
          <div class="stops">
            <span v-for="(s, i) in w.stops" :key="s" :class="{ done: w.done || i < w.next }">{{ w.done || i < w.next ? '✓ ' : '' }}{{ s }}</span>
          </div>
        </div>
      </div>
    </section>

    <section>
      <h3>{{ t('☕ 咖啡地图') }} {{ coffee.filter((c) => c.visited).length }}/{{ coffee.length }}</h3>
      <p class="intro">{{ t('在咖啡馆点一杯就算去过；大地图上的 ☕ 是咖啡馆的位置。') }}</p>
      <div class="cards">
        <div v-for="c in coffee" :key="c.id" class="card" :class="{ locked: !c.visited }">
          <div class="name">{{ c.name }}<span v-if="c.visited" class="tag done">{{ t('去过') }}</span></div>
          <div class="meta">{{ c.area }}</div>
        </div>
      </div>
    </section>

    <section>
      <h3>{{ t('📜 文化图鉴') }} {{ culture.filter((c) => c.unlocked).length }}/{{ culture.length }}</h3>
      <div class="cards">
        <div v-for="c in culture" :key="c.id" class="card" :class="{ locked: !c.unlocked, open: openId === c.id }" @click="openId = openId === c.id ? null : c.id">
          <div class="name">{{ c.unlocked ? c.name : '？？？' }}</div>
          <div v-if="!c.unlocked" class="meta">{{ c.how }}</div>
          <div v-else-if="openId === c.id" class="text">{{ c.text }}</div>
          <div v-else class="meta">{{ t('点开阅读') }}</div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { CultureDef, SouvenirDef } from '../engine/city.ts'
import type { Game } from '../engine/Game.ts'
import { foodWhen } from '../engine/life/progress.ts'
import { t } from '../i18n/index.ts'

const props = defineProps<{ game: Game }>()
const game = props.game
const c = game.city.content
const openId = ref<string | null>(null)
const shopName = (id: string) => c.shops.filter((s) => s.items.includes(id)).map((s) => s.name)
const npcName = (id: string) => game.city.people.types.find((p) => p.id === id)?.name ?? id

// 还没得到时的提示：去哪里、做什么
function howItem(s: SouvenirDef) {
  if (s.auto === 'metro') return t('第一次坐地铁时得到')
  if (s.auto === 'maglev') return t('第一次坐磁浮时得到')
  if (s.auto === 'cruise') return t('坐一趟浦江游览')
  if (s.auto?.startsWith('deck:')) return t('登上{name}的观光层', { name: game.landmarkName(s.auto.slice(5)) })
  const where = shopName(s.id)
  return where.length ? t('在{where}买 ¥{price}', { where: where.join(t('、')), price: s.price ?? '' }) : ''
}

function howCulture(d: CultureDef) {
  const u = d.unlock
  if ('plaque' in u) return t('去{name}找文化牌', { name: game.landmarkName(u.plaque.landmark) })
  if ('talk' in u) return u.talk === 'wu' ? t('和说上海话的路人聊聊') : t('和{name}聊聊', { name: npcName(u.talk) })
  if ('filter' in u) return t('用“{name}”滤镜拍一张', { name: game.city.config.photoFilters.find((f) => f.id === u.filter)?.name ?? u.filter })
  if ('photo' in u) return t('拍到{name}', { name: game.landmarkName(u.photo) })
  if ('item' in u) return t('得到纪念品“{name}”', { name: c.souvenirs.find((s) => s.id === u.item)?.name ?? u.item })
  return t('走完一条 Citywalk 路线')
}

const items = computed(() => c.souvenirs.map((s) => ({ id: s.id, name: s.name, desc: s.desc, n: game.life.items[s.id] ?? 0, how: howItem(s) })))
const foods = computed(() =>
  c.foods.map((f) => ({ id: f.id, name: f.name, desc: f.desc, when: foodWhen(f), eaten: game.life.foods[f.id] !== undefined, where: shopName(f.id).join(t('、')) }))
)
const walks = computed(() =>
  c.walks.map((w) => {
    const p = game.life.walks[w.id]
    return { id: w.id, name: w.name, area: w.area, desc: w.desc, badge: w.badge, stops: w.stops.map((s) => s.name), started: !!p, next: p?.next ?? 0, done: p?.done !== undefined }
  })
)
const coffee = computed(() => game.coffeeSpots())
const culture = computed(() => c.culture.map((d) => ({ id: d.id, name: d.name, text: d.text, unlocked: game.life.culture[d.id] !== undefined, how: howCulture(d) })))
</script>

<style scoped>
h3 {
  margin: 14px 0 8px;
  font-size: 15px;
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
}

.card {
  padding: 8px 10px;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
}

.card.locked {
  opacity: 0.7;
}

.card.open {
  grid-column: 1 / -1;
}

.name {
  font-weight: 700;
}

.count {
  margin-left: 4px;
  color: #a0682a;
  font-weight: 400;
  font-size: 12px;
}

.tag {
  margin-left: 4px;
  padding: 0 5px;
  border-radius: 4px;
  background: #eee;
  color: #777;
  font-size: 11px;
  font-weight: 400;
}

.tag.done {
  background: #dff3e0;
  color: #2e7d32;
}

.meta,
.where {
  color: #888;
  font-size: 12px;
}

.where {
  color: #a0682a;
}

.intro {
  color: #777;
  font-size: 13px;
  margin: 0 0 8px;
}

.stops {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

.stops span {
  padding: 1px 6px;
  border-radius: 4px;
  background: #eee;
  color: #888;
  font-size: 12px;
}

.stops span.done {
  background: #dff3e0;
  color: #2e7d32;
}

.text {
  margin-top: 4px;
  font-size: 13px;
  line-height: 1.6;
}
</style>

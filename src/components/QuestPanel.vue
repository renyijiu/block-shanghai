<template>
  <div class="quests">
    <div v-if="badges.length" class="badges">
      <span v-for="b in badges" :key="b">🏅 {{ b }}</span>
    </div>

    <section v-for="g in groups" :key="g.kind">
      <h3>{{ g.title }}</h3>
      <p v-if="g.intro" class="intro">{{ g.intro }}</p>
      <div class="cards">
        <div v-for="q in g.items" :key="q.id" class="card" :class="{ done: q.done }">
          <div class="name">
            {{ q.name }}
            <span v-if="q.area" class="area">{{ q.area }}</span>
            <span class="tag" :class="{ ok: q.done }">{{ q.done ? '完成' : `${q.k}/${q.steps.length}` }}</span>
          </div>
          <ul>
            <li v-for="(s, i) in q.steps" :key="i" :class="{ ok: s.done, now: q.kind === 'novice' && !q.done && i === q.k }">
              {{ s.done ? '✓' : q.kind === 'novice' ? `${i + 1}.` : '·' }} {{ s.text }}<small v-if="s.need > 1 && !s.done">（{{ s.have }}/{{ s.need }}）</small>
            </li>
          </ul>
          <div class="reward">奖励 ¥{{ q.reward }}<template v-if="q.badge"> · 徽章“{{ q.badge }}”</template></div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { QuestDef } from '../engine/city.ts'
import type { Game } from '../engine/Game.ts'
import { goalProgress, rollDaily } from '../engine/life/quests.ts'

const props = defineProps<{ game: Game }>()
const game = props.game
const defs = game.city.content.quests

const view = (q: QuestDef, base?: Record<string, number>, doneToday?: boolean) => {
  const w = game.questWorld
  const steps = q.steps.map((s) => {
    const [have, need] = goalProgress(s.goal, game.life, w, base)
    return { text: s.text, have, need, done: doneToday || have >= need }
  })
  const done = doneToday ?? game.life.quests[q.id]?.done !== undefined
  const k = q.kind === 'novice' ? Math.max(0, steps.findIndex((s) => !s.done)) : steps.filter((s) => s.done).length
  return { id: q.id, kind: q.kind, name: q.name, area: q.area ?? '', reward: q.reward, badge: q.badge ?? '', steps, done, k: done ? steps.length : k }
}

const groups = computed(() => {
  const daily = rollDaily(defs, game.life, today())
  return [
    { kind: 'novice', title: '🧭 新手任务', intro: '按顺序一步一步做，做完正式开始上海之旅。', items: defs.filter((q) => q.kind === 'novice').map((q) => view(q)) },
    {
      kind: 'daily',
      title: '📅 今日生活任务',
      intro: '每天换 3 个，按真实日期刷新；从今天开始算。',
      items: daily.ids.flatMap((id) => {
        const q = defs.find((d) => d.id === id)
        return q ? [view(q, daily.base, daily.done.includes(id))] : []
      })
    },
    { kind: 'area', title: '🗺 区域任务', intro: '每个区一组，步骤不分先后，做完得这个区的徽章。', items: defs.filter((q) => q.kind === 'area').map((q) => view(q)) },
    { kind: 'theme', title: '🎯 主题任务', intro: '', items: defs.filter((q) => q.kind === 'theme').map((q) => view(q)) }
  ]
})

const badges = computed(() => defs.filter((q) => q.badge && game.life.quests[q.id]?.done !== undefined).map((q) => q.badge!))

function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
</script>

<style scoped>
.badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 6px 0 4px;
}

.badges span {
  padding: 3px 8px;
  border-radius: 8px;
  background: #fff3d6;
  color: #a0682a;
  font-size: 13px;
}

h3 {
  margin: 14px 0 6px;
  font-size: 15px;
}

.intro {
  color: #777;
  font-size: 13px;
  margin: 0 0 8px;
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 8px;
}

.card {
  padding: 8px 10px;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
}

.card.done {
  opacity: 0.75;
}

.name {
  font-weight: 700;
}

.area {
  margin-left: 4px;
  color: #888;
  font-size: 12px;
  font-weight: 400;
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

.tag.ok {
  background: #dff3e0;
  color: #2e7d32;
}

ul {
  margin: 6px 0 4px;
  padding: 0;
  list-style: none;
  font-size: 13px;
  line-height: 1.6;
  color: #555;
}

li.ok {
  color: #2e7d32;
}

li.now {
  color: #000;
  font-weight: 700;
}

small {
  color: #999;
}

.reward {
  color: #a0682a;
  font-size: 12px;
}
</style>

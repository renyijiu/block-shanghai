// 上海的路人（docs/05 第 8 节）：类型、穿着、说话方式和对白。
// 沪语句子按 docs/05 的清单写，书写形式不统一，正式上线前要请母语者校对；括号里的普通话意思随对白一起显示
import type { NpcContent } from '../../engine/city.ts'

const SHIRT_OFFICE = [0xf2f2f2, 0xdfe8f2, 0x3a4a6a, 0x2a2a2a, 0x8aa6c8]
const SHIRT_CASUAL = [0xd5573a, 0x2f8f5b, 0xf2c14e, 0x5b8fa8, 0xc94f7c, 0x8e5bd5, 0xe8e2d6]
const PANTS = [0x2f3440, 0x1d2a44, 0x4a4036, 0x6b6b6b, 0x23262b]

export const people: NpcContent = {
  types: [
    {
      id: 'office',
      name: '白领',
      speech: 'mandarin',
      shirts: SHIRT_OFFICE,
      pants: [0x23262b, 0x2f3440, 0x4a4a52],
      hair: [0x1a1614, 0x2a2220],
      lines: [{ text: '早高峰的 2 号线挤得要命，我宁可早点出门。' }, { text: '中午去楼下买杯咖啡，下午还有三个会。' }, { text: '下班去武康路走走？听说梧桐叶子黄了。' }]
    },
    {
      id: 'uncle',
      name: '爷叔',
      speech: 'wu',
      shirts: [0x8a7a5e, 0x6b6b6b, 0xe8e2d6, 0x4a5a6a],
      pants: [0x23262b, 0x4a4036],
      hair: [0x9a9a9a, 0x6b6b6b],
      old: true,
      lines: [
        { text: '侬好！', gloss: '你好！' },
        { text: '侬吃过了伐？', gloss: '你吃过了吗？' },
        { text: '阿拉弄堂里向老早邪气闹猛。', gloss: '我们弄堂里以前非常热闹。' },
        { text: '侬晓得伐？迭搭老早是石库门。', gloss: '你知道吗？这里以前是石库门。' }
      ]
    },
    {
      id: 'auntie',
      name: '阿姨',
      speech: 'wu',
      shirts: [0xc94f7c, 0xd5573a, 0x8e5bd5, 0xe8c330, 0x5b8fa8],
      pants: [0x23262b, 0x2f3440, 0x6b6b6b],
      hair: [0x2a2220, 0x5a3a28],
      lines: [
        { text: '侬好！', gloss: '你好！' },
        { text: '迭只小笼老灵额！', gloss: '这个小笼包很棒！' },
        { text: '到豫园去白相白相。', gloss: '去豫园玩玩。' },
        { text: '谢谢侬，再会！', gloss: '谢谢你，再见！' }
      ]
    },
    {
      id: 'student',
      name: '学生',
      speech: 'mandarin',
      shirts: [0x3a7bd5, 0xf2f2f2, 0x2f8f5b, 0xd5573a],
      pants: [0x1d2a44, 0x2f3440],
      hair: [0x1a1614],
      lines: [{ text: '周末去 M50 看展，你要一起吗？' }, { text: '我在集地铁站，已经打卡五十多个了！' }, { text: '坐地铁去，快来西——这句上海话我刚学会。' }]
    },
    {
      id: 'tourist',
      name: '外地游客',
      speech: 'mandarin',
      shirts: SHIRT_CASUAL,
      pants: PANTS,
      hair: [0x1a1614, 0x2a2220, 0x5a3a28],
      lines: [{ text: '第一次来上海，外滩比照片上还好看！' }, { text: '请问南京路步行街怎么走？' }, { text: '晚上要去坐浦江游船，听说灯一亮特别美。' }]
    },
    {
      id: 'foreigner',
      name: '外国游客',
      speech: 'english',
      shirts: SHIRT_CASUAL,
      pants: [0x8a7a5e, 0x2f3440, 0x6b6b6b],
      hair: [0xc9a050, 0x8a5a30, 0x2a2220],
      lines: [{ text: 'The view of the Bund at night is amazing!' }, { text: 'Is the metro the fastest way to the airport?' }, { text: 'I love the plane trees on these old streets.' }]
    },
    {
      id: 'rider',
      name: '外卖骑手',
      speech: 'mandarin',
      shirts: [0xf2c14e, 0x3a7bd5],
      pants: [0x23262b],
      hair: [0x1a1614],
      kind: 'ride',
      lines: [{ text: '不好意思让一让，这单要超时了！' }, { text: '下雨天单子多，跑都跑不过来。' }]
    },
    {
      id: 'dogwalker',
      name: '遛狗市民',
      speech: 'wu',
      shirts: SHIRT_CASUAL,
      pants: PANTS,
      hair: [0x2a2220, 0x6b6b6b],
      kind: 'dog',
      lines: [
        { text: '今朝天气老好额。', gloss: '今天天气很好。' },
        { text: '阿拉囡囡欢喜到公园里去。', gloss: '我家小宝贝喜欢去公园。' }
      ]
    },
    {
      id: 'klaoke',
      name: '老克勒',
      speech: 'wu',
      shirts: [0x6b5a45, 0x2a2a2a, 0x8a7a5e],
      pants: [0x2a2a2a, 0x4a4036],
      hair: [0xb5b5b5],
      old: true,
      lines: [
        { text: '迭条马路，阿拉年轻辰光老有腔调额。', gloss: '这条马路，我们年轻时很有格调。' },
        { text: '咖啡要慢慢叫吃，急啥。', gloss: '咖啡要慢慢喝，急什么。' }
      ]
    },
    {
      id: 'dancer',
      name: '广场舞阿姨',
      speech: 'wu',
      shirts: [0xd5573a, 0xc94f7c, 0xe8c330, 0x8e5bd5],
      pants: [0x23262b],
      hair: [0x2a2220, 0x5a3a28],
      kind: 'dance',
      lines: [
        { text: '一道来跳呀，老开心额！', gloss: '一起来跳啊，很开心的！' },
        { text: '吃好夜饭跳一跳，身体好。', gloss: '吃完晚饭跳一跳，身体好。' }
      ]
    },
    {
      id: 'matchmaker',
      name: '相亲角家长',
      speech: 'wu',
      shirts: [0x8a7a5e, 0x5b8fa8, 0x6b6b6b],
      pants: [0x23262b, 0x4a4036],
      hair: [0x9a9a9a, 0x2a2220],
      old: true,
      kind: 'stand',
      lines: [
        { text: '阿拉囡囡三十岁，名牌大学毕业额。', gloss: '我女儿三十岁，名牌大学毕业的。' },
        { text: '侬屋里厢有房子伐？', gloss: '你家里有房子吗？' }
      ]
    }
  ],
  /** 天气、时段相关的对白（本地人说） */
  weatherLines: {
    rain: [{ text: '落雨了，覅忘记带伞。', gloss: '下雨了，别忘了带伞。' }],
    plum: [{ text: '黄梅天，衣裳晒勿干。', gloss: '梅雨天，衣服晒不干。' }],
    typhoon: [{ text: '台风来了，早点转去。', gloss: '台风来了，早点回去。' }],
    snow: [{ text: '上海难得落雪，快点拍照！', gloss: '上海难得下雪，快拍照！' }]
  },
  /** 晚上在外滩、陆家嘴附近说的 */
  nightLines: [{ text: '外滩夜里向交关好看。', gloss: '外滩晚上非常好看。' }],
  /** 相亲角：人民公园东侧（OSM） */
  matchmaking: { lat: 31.23418, lon: 121.46817 }
}

// 上海的美食、纪念品、商店、文化图鉴（docs/05 第 5–7 节）。店铺和商品用通用名，不用品牌（docs/05 第 12 节）
import type { LifeContent } from '../../engine/city.ts'

export const content: LifeContent = {
  foods: [
    { id: 'xiaolongbao', name: '小笼包', price: 25, desc: '皮薄汤多，先咬小口吸汤' },
    { id: 'shengjian', name: '生煎包', price: 12, desc: '底部焦脆，撒芝麻葱花' },
    { id: 'scallionnoodle', name: '葱油拌面', price: 15, desc: '熬透的葱油配酱油，最家常的一碗' },
    { id: 'porkchop', name: '排骨年糕', price: 18, desc: '炸猪排配软糯年糕，淋甜面酱' },
    { id: 'xiekehuang', name: '蟹壳黄', price: 6, desc: '酥皮烧饼，颜色像煮熟的蟹壳' },
    { id: 'cifantuan', name: '粢饭团', price: 8, desc: '糯米包油条、肉松，经典早餐', hours: [5, 11] },
    { id: 'youdunzi', name: '油墩子', price: 5, desc: '萝卜丝面糊炸成的街头小吃' },
    { id: 'hongshaorou', name: '本帮红烧肉', price: 48, desc: '浓油赤酱，本帮菜代表' },
    { id: 'baizhanji', name: '白斩鸡', price: 38, desc: '皮爽肉嫩，蘸酱油' },
    { id: 'coffee', name: '咖啡', price: 28, desc: '上海是咖啡馆最多的城市之一' },
    { id: 'qingtuan', name: '青团', price: 6, desc: '艾草糯米皮，豆沙或咸蛋黄肉松馅', months: [3, 4] },
    { id: 'yanduxian', name: '腌笃鲜', price: 58, desc: '咸肉、鲜肉、春笋同炖', months: [3, 4, 5] },
    { id: 'hairycrab', name: '大闸蟹', price: 88, desc: '秋风起，蟹脚痒', months: [9, 10, 11] },
    { id: 'mooncake', name: '鲜肉月饼', price: 5, desc: '现烤现卖，排队也要买', months: [9, 10] },
    { id: 'chestnut', name: '糖炒栗子', price: 15, desc: '街边飘香', months: [10, 11, 12, 1, 2] }
  ],
  souvenirs: [
    { id: 'metrocard', name: '纪念交通卡', desc: '第一次坐地铁得到的纪念卡', auto: 'metro' },
    { id: 'maglevticket', name: '磁浮车票', desc: '第一次坐磁浮的车票', auto: 'maglev' },
    { id: 'cruiseticket', name: '浦江游船票', desc: '完成一次浦江游览', auto: 'cruise' },
    { id: 'pearlmodel', name: '东方明珠模型', desc: '登上东方明珠观光层', auto: 'deck:orientalpearl' },
    { id: 'towerbadge', name: '“上海之巅”纪念章', desc: '登上上海中心顶层观光厅', auto: 'deck:shanghaitower' },
    { id: 'postcards', name: '外滩明信片套装', desc: '一套十张，外滩的白天和夜晚', price: 20 },
    { id: 'shikumen', name: '石库门门头摆件', desc: '乌漆木门配石门框的小摆件', price: 68 },
    { id: 'qipaobookmark', name: '旗袍书签', desc: '印着海派旗袍纹样的书签', price: 25 },
    { id: 'candybox', name: '奶糖礼盒', desc: '老上海味道的奶糖，送人正好', price: 45 }
  ],
  shops: [
    // 南京路步行街中间的几个亭子（按南京路景点的局部坐标，局部 x 自东向西）
    { id: 'njxiaolong', name: '老字号小笼馆', kind: 'food', at: { landmark: 'nanjingroad', x: -10, z: 0 }, items: ['xiaolongbao', 'shengjian', 'xiekehuang'] },
    { id: 'njgift', name: '外滩手信店', kind: 'gift', at: { landmark: 'nanjingroad', x: 14, z: 0 }, items: ['postcards', 'qipaobookmark', 'shikumen'] },
    { id: 'njseason', name: '季节点心铺', kind: 'food', at: { landmark: 'nanjingroad', x: 26, z: 0 }, items: ['qingtuan', 'mooncake', 'chestnut', 'youdunzi'] },
    { id: 'njdept', name: '南京路百货', kind: 'gift', at: { landmark: 'nanjingroad', x: 38, z: 0 }, items: ['candybox', 'qipaobookmark'] },
    // 豫园九曲桥广场、城隍庙门口
    { id: 'yysnack', name: '城隍庙小吃', kind: 'food', at: { landmark: 'yuyuan', x: -14, z: 14.5 }, items: ['xiaolongbao', 'shengjian', 'xiekehuang', 'youdunzi'] },
    { id: 'yybenbang', name: '本帮菜馆', kind: 'food', at: { landmark: 'yuyuan', x: -3, z: 14 }, items: ['hongshaorou', 'baizhanji', 'yanduxian', 'hairycrab'] },
    // 人民广场的早餐摊
    { id: 'psbreakfast', name: '早餐摊', kind: 'food', at: { landmark: 'peoplessquare', x: -28, z: 4 }, items: ['cifantuan', 'youdunzi', 'scallionnoodle'] },
    // 东方明珠下的面馆和咖啡
    { id: 'ljznoodle', name: '陆家嘴面馆', kind: 'food', at: { landmark: 'orientalpearl', x: -9, z: 24 }, items: ['scallionnoodle', 'porkchop'] },
    { id: 'ljzcoffee', name: '江景咖啡', kind: 'coffee', at: { landmark: 'orientalpearl', x: 9, z: 24 }, items: ['coffee'] },
    // 新天地北里的小广场、田子坊弄堂中间的小广场
    { id: 'xtdcoffee', name: '弄堂咖啡', kind: 'coffee', at: { landmark: 'xintiandi', x: -2.9, z: -1.2, face: Math.PI }, items: ['coffee'] },
    { id: 'xtdgift', name: '石库门礼品店', kind: 'gift', at: { landmark: 'xintiandi', x: 2.9, z: -1.2, face: Math.PI }, items: ['shikumen', 'postcards'] },
    { id: 'tzfcoffee', name: '老厂房咖啡', kind: 'coffee', at: { landmark: 'tianzifang', x: 3.2, z: 7.8, face: Math.PI }, items: ['coffee'] },
    { id: 'tzfgift', name: '田子坊小店', kind: 'gift', at: { landmark: 'tianzifang', x: 7.6, z: 7.8, face: Math.PI }, items: ['shikumen', 'qipaobookmark', 'candybox'] }
  ],
  culture: [
    {
      id: 'haipai',
      name: '海派文化',
      text: '上海开埠后，江南传统和西方文化在这里交汇，形成了兼容并蓄、精致务实的“海派”风格。建筑、戏曲、绘画、饮食到生活方式，处处都看得到中西合璧的味道。',
      unlock: { plaque: { landmark: 'bund', x: -2, z: -14, y: 0.45 } }
    },
    {
      id: 'shikumen',
      name: '石库门',
      text: '石库门是上海特有的里弄住宅，兴起于十九世纪后半叶：石料做门框，乌漆实木做门扇，融合了江南民居和西式联排房屋。新天地就是由老石库门街区改造来的。',
      unlock: { item: 'shikumen' }
    },
    {
      id: 'longtang',
      name: '弄堂生活',
      text: '弄堂是上海人对里弄的叫法。过去一条弄堂住着几十户人家，早上生煤炉、买早点，傍晚在门口乘风凉、聊家常，邻里关系亲密，是老上海最有烟火气的日常。',
      unlock: { talk: 'uncle' }
    },
    {
      id: 'huyu',
      name: '沪语',
      text: '上海话属于吴语太湖片，是上海的本地方言，音调软糯。“侬好”“谢谢侬”“阿拉”都是常用词，不少词汇来自宁波话、苏州话，还有从英语借来的外来词。',
      unlock: { talk: 'wu' }
    },
    {
      id: 'huju',
      name: '沪剧',
      text: '沪剧是上海的地方戏曲，源自浦东一带的田头山歌和东乡调，用上海话演唱，擅长表现都市生活和家长里短，代表剧目有《罗汉钱》《芦荡火种》等。',
      unlock: { plaque: { landmark: 'peoplessquare', x: -50, z: -6 } }
    },
    {
      id: 'pingtan',
      name: '评弹',
      text: '评弹是苏州评话和弹词的合称，用吴语说唱，一把三弦、一把琵琶就能演一台戏。上海曾是评弹最繁荣的码头，老城厢的茶楼里常能听到“说噱弹唱”。',
      unlock: { plaque: { landmark: 'yuyuan', x: -10, z: -10.5 } }
    },
    {
      id: 'yuefenpai',
      name: '月份牌',
      text: '月份牌是二十世纪初在上海流行的广告画，把日历和美人画印在一起，用擦笔水彩画法，色彩柔和，多画时装女性，是老上海摩登生活的缩影。',
      unlock: { filter: 'yuefenpai' }
    },
    {
      id: 'qipao',
      name: '旗袍',
      text: '现代旗袍在二十世纪二三十年代的上海定型，吸收了西式剪裁，腰身收紧、开衩讲究，面料从丝绸到布料都有，是海派时尚的代表。',
      unlock: { item: 'qipaobookmark' }
    },
    {
      id: 'bundarch',
      name: '外滩建筑博览',
      text: '外滩沿黄浦江排开二十多栋历史建筑，哥特、巴洛克、古典主义、装饰艺术风格都有，大多建于二十世纪初，被称为“万国建筑博览群”。',
      unlock: { photo: 'bund' }
    },
    {
      id: 'lantern',
      name: '豫园灯会',
      text: '每年春节到元宵节，豫园一带挂起各式彩灯，九曲桥、湖心亭灯火通明，市民和游客赏灯、猜灯谜，是上海最热闹的民俗灯会之一。',
      unlock: { photo: 'huxinting' }
    },
    {
      id: 'magnolia',
      name: '白玉兰（市花）',
      text: '白玉兰是上海市花，早春先开花后长叶，花朵洁白、清香，象征开路先锋、奋发向上的城市精神。每年三月，街头和公园里都能看到它。',
      unlock: { plaque: { landmark: 'peoplessquare', x: -36, z: 10 } }
    },
    {
      id: 'klaoke',
      name: '老克勒',
      text: '“老克勒”指讲究生活品位的老上海绅士，一般认为“克勒”来自英文的 class 或 colour：西装笔挺、皮鞋锃亮，懂咖啡、爱跳舞，代表一种精致讲究的生活态度。',
      unlock: { talk: 'klaoke' }
    },
    {
      id: 'citywalk',
      name: 'Citywalk',
      text: 'Citywalk 是在城市里慢慢步行、深度游览。上海的梧桐区、外滩源、北外滩等老街区特别适合，边走边看历史建筑、小店和咖啡馆。',
      unlock: { citywalk: true }
    }
  ]
}

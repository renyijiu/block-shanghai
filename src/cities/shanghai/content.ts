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
    { id: 'tzfgift', name: '田子坊小店', kind: 'gift', at: { landmark: 'tianzifang', x: 7.6, z: 7.8, face: Math.PI }, items: ['shikumen', 'qipaobookmark', 'candybox'] },
    // Citywalk 沿途的咖啡馆（咖啡地图）
    { id: 'wkcoffee', name: '梧桐树下咖啡', kind: 'coffee', area: '武康路', at: { lat: 31.212674, lon: 121.436616, face: Math.PI / 2 }, items: ['coffee'] },
    { id: 'afcoffee', name: '安福路咖啡', kind: 'coffee', area: '安福路', at: { lat: 31.216043, lon: 121.439295 }, items: ['coffee'] },
    { id: 'wtycoffee', name: '外滩源咖啡', kind: 'coffee', area: '圆明园路', at: { lat: 31.24392, lon: 121.483943, face: Math.PI / 2 }, items: ['coffee'] },
    { id: 'dlcoffee', name: '老洋房咖啡', kind: 'coffee', area: '多伦路', at: { lat: 31.264404, lon: 121.477482, face: Math.PI / 2 }, items: ['coffee'] }
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
  ],
  // Citywalk 路线：沿真实街道（OSM），打卡点在路口和老建筑前；路线经纬度由游戏里的街道位置换算
  walks: [
    {
      id: 'wukang',
      name: '武康路—安福路',
      area: '徐汇 · 梧桐区',
      desc: '从武康大楼出发，沿着梧桐树下的武康路往北，再拐进安福路。',
      badge: '梧桐区漫步',
      path: [
        [31.205846, 121.433254], [31.206118, 121.433096], [31.206705, 121.433359], [31.208017, 121.43462], [31.208559, 121.434987], [31.209057, 121.435355],
        [31.209464, 121.435513], [31.210187, 121.435723], [31.211499, 121.43609], [31.212222, 121.436301], [31.212629, 121.436406], [31.213217, 121.436458],
        [31.213533, 121.436353], [31.214076, 121.436038], [31.2148, 121.435565], [31.214935, 121.435408], [31.215161, 121.43609], [31.215433, 121.437036],
        [31.215885, 121.439347], [31.216066, 121.440188], [31.216247, 121.441028], [31.216608, 121.442184], [31.217241, 121.443864]
      ],
      stops: [
        { name: '武康大楼', lat: 31.205846, lon: 121.433254, text: '船头一样的武康大楼正对着路口。从这里沿武康路往北走，是上海最有味道的梧桐街区。' },
        { name: '武康路 · 湖南路口', lat: 31.210187, lon: 121.435723, text: '武康路两边是一栋栋老洋房，门口的铭牌写着建筑年代和住过的名人，不少作家、艺术家在这一带生活过。' },
        { name: '武康路 · 复兴西路口', lat: 31.212629, lon: 121.436406, text: '梧桐树把马路遮成一条绿色隧道：夏天浓荫，秋天落叶铺满人行道，冬天能看到洋房的坡屋顶和老虎窗。' },
        { name: '武康路北口', lat: 31.214935, lon: 121.435408, text: '武康路在这里接上安福路。老洋房的围墙不高，能看到院子里的树和红砖墙。' },
        { name: '安福路', lat: 31.215885, lon: 121.439347, text: '安福路有小剧场、买手店和咖啡馆，周末很热闹，路边的话剧艺术中心常年有演出。' },
        { name: '安福路东头', lat: 31.217241, lon: 121.443864, text: '走完了梧桐区的 Citywalk。附近还有好几条适合慢慢逛的小马路。' }
      ]
    },
    {
      id: 'waitanyuan',
      name: '外滩源—圆明园路—外白渡桥',
      area: '黄浦 · 外滩源',
      desc: '从外滩背后的圆明园路往北，看一排老大楼，走到苏州河边上外白渡桥。',
      badge: '外滩源寻访',
      path: [
        [31.241479, 121.483575], [31.242021, 121.48368], [31.242292, 121.48368], [31.242654, 121.483785], [31.243287, 121.483838], [31.243649, 121.483733],
        [31.244101, 121.48368], [31.244644, 121.483575], [31.245096, 121.483575], [31.245413, 121.48368], [31.245458, 121.484468], [31.245322, 121.485151],
        [31.245381, 121.48576]
      ],
      stops: [
        { name: '外滩源（北京东路口）', lat: 31.241705, lon: 121.483628, text: '外滩源是外滩最北头的老街区。一百多年前这里扎堆着领事馆、洋行和教会建筑，修缮后成了安静的漫步区。' },
        { name: '圆明园路', lat: 31.243649, lon: 121.483733, text: '圆明园路两边是一排二三十年代的老大楼，女青年会大楼、真光大楼的装饰艺术风格立面都在这一段。' },
        { name: '新天安堂（苏州河边）', lat: 31.245277, lon: 121.48368, text: '苏州河南岸的新天安堂是一座哥特式小教堂，旁边是原英国领事馆的草坪，抬头就能看到外白渡桥。' },
        { name: '外白渡桥', lat: 31.245381, lon: 121.48576, text: '走上外白渡桥，看苏州河汇入黄浦江。桥北是上海大厦，回头是整条外滩的天际线。' }
      ]
    },
    {
      id: 'duolun',
      name: '多伦路—鲁迅公园',
      area: '虹口 · 北外滩',
      desc: '走一遍弯弯的多伦路文化名人街，穿过甜爱路，到鲁迅公园。',
      badge: '虹口文化行',
      path: [
        [31.263952, 121.479425], [31.263952, 121.479163], [31.264088, 121.477482], [31.264133, 121.477272], [31.264359, 121.477219], [31.264766, 121.477324],
        [31.265173, 121.477324], [31.265761, 121.477167], [31.266304, 121.477167], [31.266846, 121.477272], [31.266982, 121.477534], [31.266756, 121.478165],
        [31.26662, 121.478795], [31.267931, 121.47911], [31.269831, 121.479478], [31.270192, 121.479583], [31.271368, 121.479846]
      ],
      stops: [
        { name: '多伦路南口', lat: 31.263952, lon: 121.479268, text: '多伦路文化名人街是一条弯弯的小马路，三十年代鲁迅、茅盾、郭沫若等文化名人都在这一带住过。' },
        { name: '多伦路拐角', lat: 31.264178, lon: 121.477272, text: '多伦路在这里拐了个弯，两边是石库门、老洋房和中西合璧的老建筑，路边立着文化名人的雕像。' },
        { name: '多伦路北口', lat: 31.266846, lon: 121.477272, text: '从多伦路出来就是四川北路，往东北走几步是甜爱路。' },
        { name: '甜爱路', lat: 31.267931, lon: 121.47911, text: '甜爱路不长，两旁种满梧桐，围墙上写着情诗，被叫作“上海最浪漫的马路”。' },
        { name: '鲁迅公园', lat: 31.271278, lon: 121.479819, text: '鲁迅公园原名虹口公园，园里有鲁迅墓和鲁迅纪念馆。走完了虹口的 Citywalk。' }
      ]
    }
  ],
  // 任务（docs/05 第 11 节）
  quests: [
    {
      id: 'novice',
      kind: 'novice',
      name: '初到上海',
      reward: 100,
      badge: '上海新游客',
      steps: [
        { text: '拍下东方明珠', goal: { shot: ['orientalpearl'] } },
        { text: '在南京路步行街的小笼馆吃一份小笼包', goal: { stat: 'eat:xiaolongbao@njxiaolong' } },
        { text: '坐一次地铁', goal: { metro: 1 } },
        { text: '登上上海中心顶层观光厅', goal: { item: 'towerbadge' } }
      ]
    },
    {
      id: 'area-bund',
      kind: 'area',
      name: '万国建筑',
      area: '黄浦 · 外滩',
      reward: 30,
      badge: '外滩徽章',
      steps: [
        { text: '拍下外滩万国建筑群', goal: { shot: ['bund'] } },
        { text: '拍下海关大楼、和平饭店、原汇丰银行大楼', goal: { shot: ['customshouse', 'peacehotel', 'hsbc'] } },
        { text: '读一读外滩观景平台上的文化牌', goal: { culture: 'haipai' } },
        { text: '走过外白渡桥', goal: { found: ['waibaidu'] } }
      ]
    },
    {
      id: 'area-oldtown',
      kind: 'area',
      name: '老城厢',
      area: '黄浦 · 老城厢',
      reward: 30,
      badge: '老城厢徽章',
      steps: [
        { text: '游览豫园', goal: { found: ['yuyuan'] } },
        { text: '在城隍庙吃一份小吃', goal: { stat: 'eat@yysnack' } },
        { text: '逛逛新天地', goal: { found: ['xintiandi'] } },
        { text: '逛逛田子坊', goal: { found: ['tianzifang'] } }
      ]
    },
    {
      id: 'area-lujiazui',
      kind: 'area',
      name: '陆家嘴天际线',
      area: '浦东 · 陆家嘴',
      reward: 30,
      badge: '陆家嘴徽章',
      steps: [
        { text: '站在环形天桥上拍下“三件套”', goal: { stat: ['shot@ljzbridge:shanghaitower', 'shot@ljzbridge:swfc', 'shot@ljzbridge:jinmao'] } },
        { text: '夜里拍下东方明珠的灯光', goal: { stat: 'shot:orientalpearl:night' } },
        { text: '登上东方明珠观光层', goal: { item: 'pearlmodel' } }
      ]
    },
    {
      id: 'area-wutong',
      kind: 'area',
      name: '梧桐区',
      area: '徐汇 · 梧桐区',
      reward: 30,
      badge: '梧桐区徽章',
      steps: [
        { text: '在武康大楼前拍一张', goal: { shot: ['wukang'] } },
        { text: '走完武康路—安福路 Citywalk', goal: { walk: 'wukang' } },
        { text: '看看徐家汇天主堂', goal: { found: ['xjhcathedral'] } }
      ]
    },
    {
      id: 'area-jingan',
      kind: 'area',
      name: '静安寺和苏州河',
      area: '静安 · 苏州河',
      reward: 30,
      badge: '静安徽章',
      steps: [
        { text: '游览静安寺', goal: { found: ['jingansi'] } },
        { text: '拍下金顶和高楼同框', goal: { shot: ['jingansi'] } },
        { text: '沿苏州河步道走到四行仓库', goal: { found: ['suzhoucreek'] } }
      ]
    },
    {
      id: 'area-hongkou',
      kind: 'area',
      name: '北外滩',
      area: '虹口 · 北外滩',
      reward: 30,
      badge: '虹口徽章',
      steps: [
        { text: '走过外白渡桥', goal: { found: ['waibaidu'] } },
        { text: '走完多伦路—鲁迅公园 Citywalk', goal: { walk: 'duolun' } },
        { text: '逛逛 1933 老场坊', goal: { found: ['laochangfang'] } }
      ]
    },
    {
      id: 'area-yangpu',
      kind: 'area',
      name: '工业滨江',
      area: '杨浦 · 工业滨江',
      reward: 30,
      badge: '杨浦徽章',
      steps: [
        { text: '沿杨浦滨江走走，看看老码头的吊车', goal: { found: ['yangpuriverside'] } },
        { text: '拍下杨浦大桥', goal: { shot: ['yangpubridge'] } }
      ]
    },
    {
      id: 'area-qingpu',
      kind: 'area',
      name: '水乡',
      area: '青浦 · 朱家角',
      reward: 30,
      badge: '水乡徽章',
      steps: [
        { text: '到朱家角看放生桥', goal: { found: ['zhujiajiao'] } },
        { text: '拍一张水乡照片', goal: { shot: ['zhujiajiao'] } }
      ]
    },
    { id: 'theme-food', kind: 'theme', name: '食在上海', reward: 50, badge: '食在上海', steps: [{ text: '吃过 6 种上海美食', goal: { count: 'foods', n: 6 } }] },
    { id: 'theme-culture', kind: 'theme', name: '海派文化达人', reward: 50, badge: '海派文化达人', steps: [{ text: '解锁 6 项文化图鉴', goal: { count: 'culture', n: 6 } }] },
    { id: 'theme-coffee', kind: 'theme', name: '咖啡漫游', reward: 30, badge: '咖啡地图', steps: [{ text: '去过 5 家咖啡馆', goal: { count: 'coffee', n: 5 } }] },
    { id: 'theme-citywalk', kind: 'theme', name: '城市漫步者', reward: 50, badge: '城市漫步者', steps: [{ text: '走完 3 条 Citywalk', goal: { count: 'walks', n: 3 } }] },
    // 每日生活任务：每天挑 3 个，各 10 元
    { id: 'daily-talk', kind: 'daily', name: '和路人聊天', reward: 10, steps: [{ text: '和 3 位路人聊天', goal: { stat: 'talk', n: 3 } }] },
    { id: 'daily-eat', kind: 'daily', name: '吃点东西', reward: 10, steps: [{ text: '在小店吃一样东西', goal: { stat: 'eat' } }] },
    { id: 'daily-photo', kind: 'daily', name: '随手拍', reward: 10, steps: [{ text: '拍 2 张照片', goal: { stat: 'photo', n: 2 } }] },
    { id: 'daily-group', kind: 'daily', name: '合个影', reward: 10, steps: [{ text: '和路人合影一次', goal: { stat: 'groupPhoto' } }] },
    { id: 'daily-coffee', kind: 'daily', name: '喝杯咖啡', reward: 10, steps: [{ text: '在咖啡馆喝一杯咖啡', goal: { stat: 'eat:coffee' } }] },
    { id: 'daily-plaque', kind: 'daily', name: '读文化牌', reward: 10, steps: [{ text: '读一块文化牌', goal: { stat: 'plaque' } }] }
  ]
}

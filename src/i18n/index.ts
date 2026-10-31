// 界面语言（docs/06 P6 多语言）：中文为源文字，英文按中文原文查表，查不到就显示中文。
// 目前英文覆盖界面框架（HUD、按钮、菜单、关于、形象、地名）；景点介绍、对白、提示消息等长文字暂时只有中文
import { ref } from 'vue'

export type Locale = 'zh' | 'en'
const KEY = 'block-shanghai:locale'

function load(): Locale {
  try {
    return localStorage.getItem(KEY) === 'en' ? 'en' : 'zh'
  } catch {
    return 'zh'
  }
}

export const locale = ref<Locale>(load())
document.documentElement.lang = locale.value === 'en' ? 'en' : 'zh-CN'

export function setLocale(l: Locale) {
  locale.value = l
  document.documentElement.lang = l === 'en' ? 'en' : 'zh-CN'
  try {
    localStorage.setItem(KEY, l)
  } catch {
    // 隐私模式下存不了，就只对这次有效
  }
}

const EN: Record<string, string> = {
  // HUD
  景点: 'Sights',
  '骑行 {m} 分钟': 'Riding {m} min',
  '（B 还车）': ' (B to return)',
  下一站: 'next',
  '约 {m} 米': 'about {m} m',
  次绘制: 'draw calls',
  三角形: 'triangles',
  分块: 'Chunks',
  待建: 'queued',
  位置: 'Position',
  格: 'cells',
  'WASD 移动 · Q/E 升降 · Shift 加速 · 拖动旋转 · 滚轮缩放': 'WASD move · Q/E up/down · Shift faster · drag to rotate · wheel to zoom',
  'WASD 移动 · Shift 奔跑 · 空格跳 · 拖动转视角 · 滚轮远近 · V 切换视角 · M 地图 · E 交互 · P 拍照 · C 图鉴 · B 单车 · T 打车':
    'WASD move · Shift run · Space jump · drag to look · wheel zoom · V view · M map · E interact · P photo · C collection · B bike · T taxi',
  // 天气、季节
  晴: 'Sunny',
  多云: 'Cloudy',
  雨: 'Rain',
  梅雨: 'Plum rain',
  台风: 'Typhoon',
  雪: 'Snow',
  雾: 'Fog',
  春: 'Spring',
  夏: 'Summer',
  秋: 'Autumn',
  冬: 'Winter',
  // 侧栏
  '📷 拍照': '📷 Photo',
  '📖 图鉴': '📖 Collection',
  '🚇 地铁': '🚇 Metro',
  '🚲 单车': '🚲 Bike',
  '🚲 还车': '🚲 Return bike',
  '🚕 打车': '🚕 Taxi',
  '☰ 菜单': '☰ Menu',
  '拍照（P）': 'Photo (P)',
  '图鉴和相册（C）': 'Collection & album (C)',
  地铁线路图: 'Metro map',
  '还车（B）': 'Return the bike (B)',
  '扫一辆共享单车（B）': 'Unlock a shared bike (B)',
  '打车（T）': 'Taxi (T)',
  '菜单：形象、画质…': 'Menu: look, graphics…',
  '打开地图（M）': 'Open map (M)',
  北: 'N',
  // 坐船、坐车
  '还有 {m} 分钟': '{m} min to go',
  车马上到: 'bus arriving',
  马上开船: 'departing soon',
  跳过: 'Skip',
  // 交互
  进站: 'Enter',
  出站: 'Exit',
  乘电梯: 'Elevator',
  上楼: 'Go up',
  下楼: 'Go down',
  上车: 'Board',
  下车: 'Get off',
  前往: 'Go',
  坐船: 'Take boat',
  坐车: 'Take bus',
  换乘: 'Transfer',
  查看: 'View',
  聊天: 'Chat',
  返回: 'Back',
  逛逛: 'Browse',
  阅读: 'Read',
  // 触屏按钮
  跑: 'Run',
  视角: 'View',
  跳: 'Jump',
  // 提示卡片、地图
  发现景点: 'Discovered',
  你在: 'You are in',
  // 菜单
  '👤 形象': '👤 Look',
  '颜色、发型、帽子，或者上传皮肤': 'Colors, hair, hats, or upload a skin',
  '⚙️ 画质：{q}': '⚙️ Graphics: {q}',
  '低 / 中 / 高，手机默认低；太卡会自动调低': 'Low / mid / high; phones start low and drop automatically when slow',
  低: 'Low',
  中: 'Mid',
  高: 'High',
  '⛶ 全屏': '⛶ Full screen',
  '⛶ 退出全屏': '⛶ Exit full screen',
  '手机上会同时锁成横屏': 'Locks to landscape on phones',
  '🌐 语言：中文': '🌐 Language: 中文',
  '🌐 语言：English': '🌐 Language: English',
  '英文模式下景点介绍、对白暂时还是中文': 'Descriptions and dialog are still in Chinese for now',
  'ℹ️ 关于': 'ℹ️ About',
  '数据来源、致谢': 'Data sources and credits',
  '这个浏览器不能全屏，可以用“添加到主屏幕”打开': "This browser can't go full screen; try “Add to Home Screen”",
  '画质自动调到“{q}”（帧率太低）': 'Graphics lowered to “{q}” automatically (low frame rate)',
  // 横屏提示
  '横过来玩，视野更大': 'Turn your phone sideways for a wider view',
  知道了: 'Got it',
  // 形象
  形象: 'Look',
  完成: 'Done',
  肤色: 'Skin',
  发色: 'Hair color',
  上衣: 'Top',
  裤子: 'Trousers',
  发型: 'Hairstyle',
  短发: 'Short',
  长发: 'Long',
  寸头: 'Buzz cut',
  帽子和眼镜: 'Hats & glasses',
  不戴帽子: 'No hat',
  鸭舌帽: 'Cap',
  贝雷帽: 'Beret',
  眼镜: 'Glasses',
  皮肤: 'Skin image',
  '可以上传一张 64×64 的方块人皮肤（PNG，常见方块游戏的皮肤格式，老的 64×32 也行）。用了皮肤，上面的颜色设置就不生效。':
    'Upload a 64×64 block-character skin (PNG, the common block-game layout; old 64×32 skins work too). The color settings above are ignored while a skin is used.',
  上传皮肤: 'Upload skin',
  示例皮肤: 'Sample skin',
  去掉皮肤: 'Remove skin',
  恢复默认: 'Reset',
  自选颜色: 'Custom color',
  // 关于
  关于: 'About',
  关闭: 'Close'
}

/** 界面文字：中文原文 → 当前语言；vars 填 {名字} 占位 */
export function t(zh: string, vars?: Record<string, string | number>): string {
  let s = locale.value === 'en' ? (EN[zh] ?? zh) : zh
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v))
  return s
}

/** “⛅ 多云 · 秋”这类用 · 和空格分开的短语，逐段翻译 */
export function tPhrase(text: string) {
  return locale.value === 'en' ? text.split(' · ').map((seg) => seg.split(' ').map((w) => EN[w] ?? w).join(' ')).join(' · ') : text
}

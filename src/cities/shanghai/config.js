// 上海城市包配置。引擎只读这里和 ./data/ 下的烘焙数据，不直接写死任何上海内容。
// 字段说明见 docs/02-architecture.md「城市包契约」。

export default {
  id: 'shanghai',
  name: '方块上海',
  nameEn: 'Block Shanghai',

  // 坐标投影（docs/03-coordinates-and-data.md）
  projection: {
    // 人民广场附近，WGS-84。原点只是参照点，取到小数点后 4 位即可
    origin: { lat: 31.2304, lon: 121.4737 },
    unitsPerKm: 200, // 核心区 1 格 ≈ 5 米
    coreRadiusKm: 12, // 约覆盖到中环
    outerCompress: 0.35 // 核心区外距离按 0.35 压缩
  },

  // 尺度约定：地图水平 1 格≈5m；建筑高度 1 格≈2.5m；人物、车辆、室内 1 格≈1m
  scale: {
    mapMetersPerUnit: 5,
    buildingMetersPerUnit: 2.5,
    actorMetersPerUnit: 1
  },

  // OSM 拉取范围 [south, west, north, east]，覆盖全市及地铁延伸段（11 号线花桥等）
  osm: {
    bbox: [30.67, 120.85, 31.88, 122.05]
  },

  // 16 个区；color 为地图底色占位，theme 为区域任务主题（docs/05-shanghai-content.md）
  districts: {
    huangpu: { name: '黄浦区', color: '#e0a84a', theme: '外滩 · 老城厢' },
    jingan: { name: '静安区', color: '#c9785b', theme: '摩登静安 · 苏州河' },
    xuhui: { name: '徐汇区', color: '#7aa85b', theme: '梧桐区 · 西岸' },
    changning: { name: '长宁区', color: '#5ba89a', theme: '马路生活' },
    putuo: { name: '普陀区', color: '#8a9ad1', theme: '苏州河工业遗存' },
    hongkou: { name: '虹口区', color: '#b07ad1', theme: '北外滩 · 文化名人' },
    yangpu: { name: '杨浦区', color: '#6b8fd9', theme: '工业滨江' },
    pudong: { name: '浦东新区', color: '#4f9fd9', theme: '陆家嘴天际线' },
    minhang: { name: '闵行区', color: '#a8a05b', theme: '古镇与枢纽' },
    baoshan: { name: '宝山区', color: '#5b8aa8', theme: '吴淞口' },
    jiading: { name: '嘉定区', color: '#a87a5b', theme: '教化嘉定' },
    songjiang: { name: '松江区', color: '#6bae6b', theme: '佘山' },
    qingpu: { name: '青浦区', color: '#5bb0b8', theme: '江南水乡' },
    jinshan: { name: '金山区', color: '#b8a05b', theme: '渔村海湾' },
    fengxian: { name: '奉贤区', color: '#b88a6b', theme: '滨海' },
    chongming: { name: '崇明区', color: '#5fae7a', theme: '湿地生态岛' }
  }
}

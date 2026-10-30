// 城市分块：世界按 CHUNK_SIZE × CHUNK_SIZE 格切块，流式加载和烘焙数据的索引都以分块为单位
export const CHUNK_SIZE = 240

/** 分块键："cx,cz" */
export const chunkKey = (cx: number, cz: number) => `${cx},${cz}`

/** 游戏坐标（格）所在的分块序号 */
export const chunkOf = (v: number) => Math.floor(v / CHUNK_SIZE)

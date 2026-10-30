// 游戏时钟：天空、列车时刻表都跟着它走。1 秒现实时间 = CLOCK_SCALE 秒游戏时间。
// 倍率按列车看起来的速度定：地铁平均 35 km/h，核心区换算成画面上约 39 格/秒；
// 快速到达、乘车按真实运行分钟推进（docs/04 第 5、7 节）
export const CLOCK_SCALE = 20
export const DAY_SEC = 86400
/** 新游戏从早上 8:30 开始 */
export const START_TIME = 8.5 * 3600

export class GameClock {
  /** 游戏时间（秒），从第 0 天 0 点起算 */
  seconds: number

  constructor(seconds = START_TIME) {
    this.seconds = seconds
  }

  tick(realDt: number) {
    this.seconds += realDt * CLOCK_SCALE
  }

  addMinutes(m: number) {
    this.seconds += m * 60
  }

  /** 当天的秒 */
  get daySeconds() {
    return ((this.seconds % DAY_SEC) + DAY_SEC) % DAY_SEC
  }

  get day() {
    return Math.floor(this.seconds / DAY_SEC)
  }

  format() {
    return formatClock(this.daySeconds)
  }
}

/** 当天的秒 → “08:30” */
export function formatClock(daySec: number) {
  const m = Math.floor(daySec / 60) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

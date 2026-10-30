// 开发调试面板（?debug=1 时按需加载，不进正式包的主文件）：stats-gl 帧率 / GPU 耗时、lil-gui 调参数
import GUI from 'lil-gui'
import Stats from 'stats-gl'
import { PLAYER } from './actors/Player.ts'
import type { Game } from './Game.ts'
import { QUALITY_ORDER, type QualityLevel } from './quality.ts'
import { saveKey } from './state/save.ts'

export async function attachDebug(game: Game) {
  const stats = new Stats({ trackGPU: true, horizontal: false })
  await stats.init(game.renderer)
  stats.dom.style.cssText += ';left:auto;right:0;top:auto;bottom:0'
  document.body.appendChild(stats.dom)
  game.afterRender = () => stats.update()

  const gui = new GUI({ title: '调试' })
  gui.domElement.style.top = '230px'
  const state = { quality: game.quality }
  gui
    .add(state, 'quality', QUALITY_ORDER)
    .name('画质')
    .onChange((q: QualityLevel) => game.setQuality(q))
  const p = gui.addFolder('玩家')
  p.add(PLAYER, 'walk', 2, 40, 0.5).name('步行速度')
  p.add(PLAYER, 'run', 4, 80, 1).name('奔跑速度')
  p.add(PLAYER, 'jump', 4, 20, 0.5).name('起跳速度')
  p.add(game.rig, 'distance', 2.5, 16, 0.1).name('相机距离').listen()
  p.add(game.rig, 'mode', ['third', 'first']).name('视角').listen()
  const actions = {
    save: () => game.saveNow(),
    clear: () => {
      localStorage.removeItem(saveKey())
      location.reload()
    }
  }
  gui.add(actions, 'save').name('立即存档')
  gui.add(actions, 'clear').name('清除存档并刷新')
}

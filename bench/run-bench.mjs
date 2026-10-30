// 用本机 Chrome（临时配置目录、无头、启用 GPU）依次跑三种渲染路径，打印结果
// 用法：先 npm run dev，再 node bench/run-bench.mjs [chunks=15] [shadows=1] [split=0]
// 关闭了垂直同步和帧率上限，fps 反映的是吞吐能力而不是显示器刷新率
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = process.env.BENCH_URL || 'http://localhost:5173/bench/'
const chunks = process.argv[2] || '15'
const shadows = process.argv[3] || '1'
const split = process.argv[4] || '0'
const PORT = 9333

const profile = mkdtempSync(join(tmpdir(), 'bench-chrome-'))
const chrome = spawn(CHROME, [
  `--user-data-dir=${profile}`,
  `--remote-debugging-port=${PORT}`,
  '--headless=new',
  '--enable-gpu',
  '--use-angle=metal',
  '--enable-unsafe-webgpu',
  '--ignore-gpu-blocklist',
  '--window-size=1280,800',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  '--disable-gpu-vsync',
  '--disable-frame-rate-limit',
  '--no-first-run',
  'about:blank'
], { stdio: 'ignore' })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitForChrome() {
  for (let i = 0; i < 50; i++) {
    try {
      return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()
    } catch {
      await sleep(200)
    }
  }
  throw new Error('Chrome 没有启动')
}

async function runOne(mode) {
  const url = `${BASE}?r=${mode}&chunks=${chunks}&shadows=${shadows}&split=${split}`
  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json()
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((r) => ws.addEventListener('open', r, { once: true }))
  let id = 0
  const pending = new Map()
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data)
    if (pending.has(msg.id)) pending.get(msg.id)(msg.result)
  })
  const evaluate = (expression) =>
    new Promise((r) => {
      pending.set(++id, (res) => r(res?.result?.value))
      ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }))
    })
  let result = null
  for (let i = 0; i < 120 && !result; i++) {
    await sleep(500)
    result = await evaluate('window.__bench || null')
  }
  ws.close()
  await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`)
  return result || { mode, error: 'timeout' }
}

try {
  const v = await waitForChrome()
  console.log(`# ${v.Browser} · chunks=${chunks} shadows=${shadows} split=${split}`)
  const rows = []
  for (const mode of ['webgpu', 'fallback', 'webgl']) rows.push(await runOne(mode))
  console.log(`# GPU: ${rows[0].gpu?.webgpu} / ${rows[0].gpu?.webgl} · ${rows[0].viewport}`)
  console.log('| 渲染路径 | 后端 | draw calls | 三角形 | fps | p95 帧时间 | 初始化 | 建城 | 首帧 |')
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |')
  for (const r of rows) {
    if (r.error) console.log(`| ${r.mode} | 出错：${r.error} |`)
    else console.log(`| ${r.mode} | ${r.backend} | ${r.drawCalls} | ${(r.triangles / 1e6).toFixed(2)}M | ${r.fps} | ${r.p95ms} ms | ${r.initMs} ms | ${r.buildMs} ms | ${r.firstFrameMs} ms |`)
  }
} finally {
  chrome.kill()
  await sleep(300)
  rmSync(profile, { recursive: true, force: true })
}

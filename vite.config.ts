import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  // 相对路径打包，dist/ 可直接放到任意静态托管
  base: './',
  server: { host: true, port: 5173 },
  // three.js 的 WebGPU 构建本身压缩后约 600 KB
  build: { chunkSizeWarningLimit: 1000 },
  test: { include: ['tests/**/*.test.ts'] }
})

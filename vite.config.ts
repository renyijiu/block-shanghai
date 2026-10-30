import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  // 相对路径打包，dist/ 可直接放到任意静态托管
  base: './',
  server: { host: true, port: 5173 },
  build: {
    // three.js 单独成一个文件：体积最大（WebGPU 构建压缩后约 900 KB）又很少变，浏览器可以长期缓存
    rolldownOptions: { output: { codeSplitting: { groups: [{ name: 'three', test: /node_modules[\\/]three[\\/]/ }] } } },
    // three 这个文件本身就超过默认的 500 KB 提示线，是预期的
    chunkSizeWarningLimit: 1000
  },
  test: { include: ['tests/**/*.test.ts'] }
})

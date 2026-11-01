# 参与贡献

谢谢你愿意帮忙！欢迎提 issue 和 PR。特别需要的帮助：

- **上海话对白**：`src/cities/shanghai/people.ts` 里路人的沪语句子还没请母语者校对，写法也不统一
- **英文**：界面和提示在 `src/i18n/en-ui.ts`，城市内容（景点介绍、美食、任务、对白）在 `src/cities/shanghai/en.ts`，都是“中文原文 → 英文”的对照表
- **景点和城市细节**：哪里和真实的上海对不上，附上位置（经纬度或游戏里左上角的坐标）和照片 / 地图链接
- **真机性能**：机型、浏览器、画质档位、帧率，以及左上角显示的渲染后端（WebGPU / WebGL 2）

> English speakers: issues and PRs in English are welcome too. Setup and checks are below; the design docs in `docs/` are in Chinese.

## 开发

需要 Node 22.18+、24 或 26+。

```bash
npm install
npm run dev        # http://localhost:5173
```

提交前跑一遍（CI 也会跑同样的检查）：

```bash
npm run typecheck  # 类型检查
npm test           # 单元测试
npm run build      # 打包
```

## 约定

- 先读 [docs/](./docs/)：[02 架构](./docs/02-architecture.md)讲分层和城市包契约，代码约定在 [第 8 节](./docs/02-architecture.md#8-代码约定)
- 引擎（`src/engine/`）不能引用城市包（`src/cities/`）里的任何东西；上海特有的内容都放在城市包里
- 纯函数模块（投影、路线规划、票价、时刻表、任务判断等）改动要带单元测试（`tests/`）
- 中文是源文字：新增给玩家看的文字时，界面和引擎的写进 `src/i18n/en-ui.ts`，城市内容的写进 `src/cities/shanghai/en.ts`。`tests/i18n.test.ts` 会检查城市内容有没有漏翻
- 存档结构有变化时提升 `SAVE_SCHEMA` 并写迁移（见 docs/02 第 6 节）
- 提交信息用中文写清楚改了什么、为什么改

## 地图数据

`src/cities/shanghai/data/` 是从 OpenStreetMap 烘焙出来的，不要手改。要更新：装好 `osmium-tool` 后运行 `npm run fetch-osm && npm run bake`，详见 [tools/README.md](./tools/README.md)。这些数据按 ODbL 提供（不是 MIT），见[数据说明](./src/cities/shanghai/data/README.md)。

## 许可

提交的代码按 [MIT 许可证](./LICENSE) 发布；对 `src/cities/shanghai/data/` 的修改按 ODbL 发布。

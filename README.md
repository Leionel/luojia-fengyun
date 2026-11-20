# 珞珈社团风云

学年版从九月招新走到六月交接。打开 [学年版](http://localhost:3000/campus-chaos/year) 或 [固定种子学年版](http://localhost:3000/campus-chaos/year?mode=demo)，选背景后点击「开始学年」。首场选择会影响后续社团关系和场地安排。人物、社团、周历、谈判、带教和账本都能从场景打开。[学年 A、B 批次实测](docs/CAMPUS_CHAOS_3_EXECUTION_NOTES.md) · [C、D 执行与验收](docs/CAMPUS_CHAOS_3_CD_RELEASE.md)

- 打开学年版即可用 WASD 或方向键移动。走进门口换场，到广场的展台选做法可直接开局。手机可点触屏方向键。全屏时可拖动决策卡让开场景。[校园探索与场景素材](docs/CAMPUS_WALKTHROUGH.md)
- 「谈判」支持把一句计划拆成可编辑条款，标记缺少的条件，收到报价后勾选要签的组。签署会锁定费用和资源，结算后可在账本查履约。
- 「带教」在两个不同窗口做练习并复盘后授予认证。六月可以查看票数和路线依据，下载公开年鉴，再以继任身份进入下一届。
- 旧学年进行中可用「在副本中解锁谈判与带教」继续已有进度。

## 五日挑战

接手一家只剩 ¥500 和三位部长的校园社团，用五天筹备樱花市集。樱花常场要能接待 30 人，准备度达到 65、凝聚力达到 40。雨备场预算更紧，第一场雨会迫使你在侧门和连廊之间做选择。

## 本地试玩

在 `campus` 目录下运行以下命令。安装依赖后，打开 [试玩入口](http://localhost:3000/campus-chaos)，点击「接手社团」。

```powershell
npm ci
npm run dev
```

生产构建使用 `npm run build`，随后运行 `npm start`。`/` 默认进入学年版。五日挑战仍可从 `/campus-chaos` 或 `/?legacy=1` 直接进入。

## 一局怎么玩

- 点击「全屏游玩」进入铺满视窗的广场，保留资源、局势和全部行动。Esc 或右上角按钮可退出。
- 每天从六项行动中选一个。报名与接待上限较小的数值决定能入场的人数。搭建、彩排和联动能扩容，重复同一行动的边际收益会下降。
- 第二天起，部长带来局势。当天提案会改变一项行动的成本或效果，勾选状态直接反映在卡片上。局势可能留下后续权益，例如共同署名带来一次搭建折扣。
- 广场会出现候补队伍、雨天入口标记和正在说话的角色。开场点亮市集。日志记录行动、真实数值、使用的提案与导演出处。
- 游戏保存在当前浏览器，刷新可继续。结局可以换场次，或用同一种子进入演示模式练另一条路线。

默认种子为 `sakura-01`。加上 `?seed=sakura-01&mode=demo` 可明确开始固定种子的预设局。场次、种子、主行动、局势选项及是否采用提案相同，结果就相同。以下路线都用默认种子，遇到局势选择第一项，保留提案勾选。

| 策略 | 五天主行动 |
| --- | --- |
| 先把声势做起来 | 宣传造势 → 宣传造势 → 搭建摊位 → 彩排与分工 → 协调矛盾 |
| 先找合作方 | 社团联动 → 彩排与分工 → 社团联动 → 搭建摊位 → 社团联动 |
| 低开销扩容，可用于雨备场 | 社团联动 → 彩排与分工 → 宣传造势 → 彩排与分工 → 社团联动 |

## 导演模式

没有配置密钥时，游戏在浏览器里用固定规则运行。要启用**实时 AI**，把 `.env.example` 复制为 `.env.local`，填入服务端变量 `AI_API_KEY`、`AI_MODEL`。使用兼容服务时，将 `AI_API_BASE_URL` 设为服务的 API 前缀，再重启应用。配置后新开场可选择实时 AI 或固定种子。

主行动先结算。导演随后从目前可触发的事件和部长提案中选择一个组合。提案影响一次主行动。模型只选择编号并可补充短台词，费用与增减由程序计算。只有一个组合时直接用规则推进。模型不可用或玩家跳过等待时，切换到**降级模式**。日志记录出处和请求 ID。

本地配置使用武大 MaaS 的 `deepseek-v4-flash`。完整五天实测有四次真实提案，首条约 1 秒到达界面。[实测记录](docs/P1-验收结果.md)

## 验证与截图

```powershell
npm test
npx playwright install chromium
npm run test:e2e
```

Windows 也可先运行 `$env:CAMPUS_TEST_BROWSER_CHANNEL = 'msedge'`，复用已安装的 Edge。

| 检查 | 覆盖 |
| --- | --- |
| 规则与接口测试 | 预算与边际收益、容量瓶颈、同事件不同提案、过期响应、存档重放、模型异常 |
| 480 局固定种子模拟 | 两个场次各 240 局，覆盖全部 11 种事件和 6 种结局 |
| 桌面与移动端 E2E | 五天开场、候补结局、按钮兑现提案代价、雨备全屏、刷新恢复、降级和 375px 触屏 |

[P0 现状审计](docs/P0-审计.md) · [P1 任务优先级](docs/P1-任务与验收.md) · [P1 验收结果](docs/P1-验收结果.md)

[部长提案](docs/evidence/p1/02-部长提案.png) · [灯火开场](docs/evidence/p1/03-灯火开场.png) · [雨备场全屏](docs/evidence/p1/06-雨备场全屏.png) · [候补结局](docs/evidence/p1/07-候补结局.png)

自动化结果验证玩法可达性。首次上手时间与自发复玩意愿仍待真人试玩。

## 场景素材

广场背景由内置 imagegen 生成，日常、雨天与开场图分别为 [樱坡广场](public/art/sakura-courtyard.webp)、[雨备场](public/art/sakura-rain.webp)、[灯火市集](public/art/sakura-festival.webp)。人物和场地标记在运行时叠加。

<details>
<summary>广场背景生成提示词</summary>

> Use case: stylized-concept. Asset type: background level art for an original Chinese university club management game, full bleed, landscape 16:9. A charming hand-crafted 32-bit pixel art campus courtyard in Wuhan during spring, framing a comfortably spacious empty pale honey-colored paved commons that fills the middle and bottom two-thirds for in-game characters and a booth to be composited later. Mostly top-down three-quarter 2D orthographic village game camera, aligned horizontally, no tilted frame. A small traditional dark teal tiled roof academic building with cream plaster and wood at the top center, low stone wall, a large blush pink cherry blossom tree at each upper corner with some petals on the flagstone, side slopes of soft grass, moss, and small greenery. A few steps lead out at bottom center. Cozy late afternoon sunlight with crisp controlled pixel art shapes, fine discrete pixel-level textures, subtle plum shadows, colorful and readable like a premium original sprite game environment. Keep the center and bottom-middle empty, with very few details where the player booth will sit. No people, no tents, no tables, no signs, no text, no interface, no logos, no watermarks. Finished game environment art, not a concept sheet. Edge to edge.

</details>

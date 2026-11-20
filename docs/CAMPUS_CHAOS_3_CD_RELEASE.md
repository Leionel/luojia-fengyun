# Campus Chaos 3.0 四季场景与 C、D 批次

2026-11-20 · 本地生产构建

[试玩](http://127.0.0.1:3062/) · [固定种子模式](http://127.0.0.1:3062/?mode=demo) · [五日挑战](http://127.0.0.1:3062/campus-chaos)

## 四季与全屏

秋季银杏和红叶、冬季薄雪和室内灯光、六月树荫和湿石板使用三张新背景。春季沿用樱花广场。三月雨况和五月庆典各有自己的场景。画面跟随世界窗期切换，角色和场地标记基于当前状态绘制。

全屏地图铺到四边，完整画幅、角色和点击区保持对齐。屏幕比例不同时，用场景延展填充周围。决策面板可收起。人物、谈判、带教和账本仍能从底部打开。键盘与触屏均可用。

[秋季全屏](evidence/year-cd/01-秋季全屏.png) · [冬季](evidence/year-cd/03-冬季.png) · [樱花季](evidence/year-cd/04-春季.png) · [雨天](evidence/year-cd/05-雨天.png) · [六月](evidence/year-cd/07-六月暖夏.png) · [375px 全屏触屏](evidence/year-cd/mobile-fullscreen.png)

## 玩法交付

| 批次 | 可玩内容 | 验证 |
| --- | --- | --- |
| C1 策略草案 | 在「谈判」输入计划，拆为至多四组。确认活动、外社、负责人、场地、档期、工时、费用、份额和署名。现场提示缺项与预约冲突。手工填写和本地解析均可用。 | 浏览器验证缺项阻止询价、手动改金额、未签署前余额不变。武大 MaaS 实测解析同一段自然语言。 |
| C2 条款往返 | 外社按目标、信任、争端与可用资源报价。可反提案、接受或拒绝任意组。签署、预留及预约在同一事务完成。 | 组合场地冲突时不产生半份合同。旧版报价不能重复签。真实模型选择共同署名反价，最终接受并进入周历。 |
| C3 履约 | 合同到场前核对准备单。项目完成后结算固定费用、票款和分成。未完成可更换负责人、顺延、缩场或取消赔付。已经准备的取消项目可产生留给下一届的应付款。 | 规则测试检查费用冻结、退款与账目、状态保留和实际履约。真实线路完成签约到付款，账本能追到原报价。 |
| C4 带教 | 本社成员占用真实课外班次练习。两次在不同窗口完成且复盘才发证。入口、协调、财务三项认证分别改变候补容量、可同时谈判的伙伴数、退款或赔付成本。 | 两次练习、重复复盘拒绝、认证前后三社询价对照通过。 |
| C5 候补 | 活动超容量后有倒计时。可增开入口、分时入场或退款缩场。延期产生声誉、精力和关系代价。 | 同一开局逐窗对照处理与未处理，检查分流人数、退款和争议。 |
| D1 多开局 | 濒临解散、老牌衰落、技术新秀、文化社团可从首页比较选择。共用六章日历，初始资金、工时、关系和应付义务不同。 | 规则模拟遍历四种背景和 24 个时间窗口。 |
| D2 年鉴与交接 | 玩家提名和投票。候选经历、成员自己的票和证据可见。四种路线各按真实履约或成长达成，也可混合。票不足轮值，无可用轮值组时托管。下一届继承资金、关系、岗位、认证和应付款，六月原档继续可回看。 | 规则验证四种路线、混合、托管和取消赔付跨年。浏览器验证实际投票、可公开分享的年鉴、回档和开启下一届。 |
| D3 场景 | 四季全屏、雨天与节庆、项目标记、角色位移、新旧预约反馈。晨报可直达所引用的账本事件。 | 1440×900 和 375×812 下，地图区域都覆盖完整视口。收起面板后可继续点地图，打开后可继续决策。 |
| D4 验证 | 固定规则重放、真实 AI 的九月至六月整年、浏览器移动视口及旧档兼容。 | 汇总见下。实体手机、公开压力测试和多名试玩者的体验评审仍是发布验收项。 |
| D5 首页 | `/` 优先进入学年版，五日挑战仍可通过页头、`/campus-chaos` 或 `/?legacy=1` 访问。旧年度进行中可复制升级。 | 首页兼容入口、原五日的成功失败回归、旧档及升级副本重新打开均可检查。 |

## 实测记录

- `npm test` · 34 项通过。生产构建与类型检查通过。
- `$env:CAMPUS_TEST_BROWSER_CHANNEL='msedge'; npx playwright test` · 15 项，覆盖五日回归、入口、档案、双页签、回放、全屏触屏、自由草案签约与六月交接。
- 完整真实浏览器学年使用武大 MaaS 的 `deepseek-v4-flash`，24 个结算窗口全部采纳真实模型选择，另外 3 次调用用于拆解草案、外社反价和年鉴选编。单次服务侧耗时 526–802 ms，中位数 636 ms，27 次合计返回 11,404 tokens。实际流程从音乐社要求共同署名与 30% 分成开始，签约后履约，六月江一当选，再进入下一届。账本、年鉴和下一届应付款都现场检查。[结构化运行记录](evidence/year-cd/live-cd.json) · [反价签约](evidence/year-cd/02-真实反价签署.png) · [年鉴](evidence/year-cd/08-年度年鉴.png) · [下一届](evidence/year-cd/09-下一届.png)

1,000 个固定规则种子与策略组合均完成 24 窗口，导出再导入后逐局对照世界数据一致。共耗时 260 秒，四种达标路线都出现，另有多路线混合。组合包括特定目标策略，结局分布用于验证可达性。

| 路线组合 | 局数 |
| --- | --- |
| 明星社团 × 校园联盟型 | 251 |
| 精英成果型 | 167 |
| 校园联盟型 | 416 |
| 温暖共同体型 × 明星社团 × 校园联盟型 | 83 |
| 温暖共同体型 × 校园联盟型 | 83 |

独立复跑命令

```powershell
$env:CAMPUS_YEAR_SIM_COUNT='1000'
npx vitest run src/year/engine/campaign.test.ts -t 'closes and replays' --reporter=verbose --silent=false
```

## 实施边界

- 报价来自受约束的候选条款。玩家仍可随意写策略、逐项改方案、回价；主持人、日期、资源与钱均由演算校验。联办融资与份额集中在四类活动。跨项目联盟章程、独立资产所有权和毕业校友的长期回访仍需后续串联。
- 六章节点和 C/D 系统共用同一世界。四种开局共享关键事件，差异由初始资源、身份与后续选择产生。原 A、B 规则档可按原样继续，也可从当前窗口复制解锁。新版跨届从继承的公开账目、岗位、技能与关系开局，自然到期的预约重新排。
- 线上验收包含一局完整真实 AI 流程。独立真人试玩、实体手机、24 对局面人工标注和正式采用率报告仍待验收。

## 场景素材与提示词

秋、冬、夏使用内置 ImageGen，以 `public/art/sakura-courtyard.webp` 为季节编辑参考。源图为 1672×941，发布编码为 WebP。

共用提示词

> Use case: lighting-weather. Asset type: full-screen landscape background for an original campus club strategy game. Edit this exact reference scene's season. Preserve the exact nearly symmetric orthographic camera, roof line, wide beige stone courtyard, centrally placed door and stairs, side walls, all terrain coordinates, and the open playable paving in the center. Pixel art with the same densely painted 1990s game tiles and subtle fidelity. Designed to take 16:9 screen space edge to edge. No people, no UI, no text, no watermark, no props occupying the central stone plaza.

| 资产 | 追加描述 |
| --- | --- |
| [year-autumn.webp](../public/art/year-autumn.webp) | October in Wuhan. Large ginkgo trees and rusty maple framing both sides, lively ochre leaves carpeting the edges and a few across the pale dry stone. Clear low golden sunshine. Seasonal change only. Hazelnut, gold, amber, evergreen roof. |
| [year-winter.webp](../public/art/year-winter.webp) | Early January in Wuhan. Deciduous trees mostly bare and a faint dusting of melting snow along low walls, window ledges, roof edges and flower beds, mostly clear courtyard paving passable. Pale lilac-blue dusk, several warm amber windows, quiet exam season. Slate and soft blue. |
| [year-summer.webp](../public/art/year-summer.webp) | June in Wuhan just after a sunny shower. Lush deep green ornamental trees and thick bright summer foliage replace the spring blossoms, smooth soft green leafy shadows on mostly open warm courtyard stone, traces of sunlit damp pavement near the edge and a few white hydrangeas in beds. Warm late afternoon light. |

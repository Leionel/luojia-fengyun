# 学年版校园探索

[本地试玩](http://127.0.0.1:3062/campus-chaos/year)

- 打开页面即可逛校园。WASD 或方向键移动，走进门口切换地点。按 E 和靠近的人物交谈、操作物件，点击地面、人物或入口也可自动走过去。
- 广场的联摆桌和竞位台可以直接开局。其他关键做法摆在对应现场，当期入口有金色边框提示。该处理的抉择完成后，可以在地图上收工结算。
- 全屏时拖动决策卡顶边的「拖动」把手。键盘可聚焦把手后用方向键调整，点旁边的回转箭头回到默认位置。
- 375px 可触屏用方向键盘和可点的地面、人物及入口。打开表单时暂停地图走动，系统的减少动态效果选项会停用待机巡走与转场动画。

## 场景与任务

广场连通活动室、工坊展廊、湖畔舞台和图书馆外廊。人物按当前世界的地点和活动出现。在广场和陈岚谈九月展位，在工坊操作带教工作台，在舞台查看排班，在外廊打开账本。

招新确定场地后，可从活动室拿海报增加 6 人报名，也可拿引导牌按场地许可增加最多 6 个接待名额。物资点显示预计接待和候补，送到现场前可以返回换物资。同一摊位只结算一种。筹备中的其他项目可到举办地点检查设备、确认入口，按场地许可提高最多 6 人接待上限。完成的效果随年度档保存，行走和未交付物资留在当前会话。

## 验证

- `npm test` 36 项通过，`npm run typecheck` 和生产构建通过。
- Edge 端到端 19 项通过。810×871 视口覆盖未开局时走进门口、现场开局和物资更换。联摆的海报方案预计接待 40 人、候补 5 人，引导牌方案结算接待 39 人、候补 0 人。规则测试另覆盖人多时引导牌实际将到场人数从 40 提到 46。已有 WASD、四地互动、面板拖动、触屏和存档回归。
- 另在 3062 的生产服务完成舞台两步检查，容量 55 → 61。刷新继续后仍为 61，可查到结算收据，浏览器未报告运行错误。

[广场开局](evidence/year-explore/opening-booths-810.png) · [两种招新物资](evidence/year-explore/recruitment-choice-810.png) · [拖动决策卡](evidence/year-explore/dragged-decision.png) · [活动室拿海报](evidence/year-explore/room-supplies.png) · [湖畔舞台](evidence/year-explore/stage-walk.png) · [375px 触屏](evidence/year-explore/touch-campus.png)

## 场景资产和提示词

四张素材均用内置 ImageGen 生成并转为 1672×941 的 WebP。各图共用下面的构图提示，地点细节分别追加。

> Use case: stylized-concept. Create a new single 1672:941 landscape background for an original Chinese university RPG set in Wuhan. True carefully crafted 16-bit painted pixel art, hard detailed pixel clusters and controlled earthy palette, moderately overhead orthographic view and almost flat horizon, attention to walkable geometry. Rich rear architecture occupies top 35%, left and right edges may have furniture, but central horizontal rectangle from x=15–85% y=40–85% stays openly walkable for player sprites. An obvious entry or walkway at the bottom center. Fill the entire image with a single scene, natural consistent lighting, no perspective zoom effect, no people, text, UI, frame, RPG sprites or labels.

| 资产 | 地点描述 |
| --- | --- |
| [walk-room.webp](../public/art/walk-room.webp) | Traditional student club room in a university building, recurring moss-teal windows and red wood trims, old desks and a club notice wall at the back, community tabletop and supplies at the edges, soft warm afternoon light and calm amber wood flooring, small paper lantern near door. Mood of a space shared by students. |
| [walk-workshop.webp](../public/art/walk-workshop.webp) | Campus makerspace and art studio in a converted heritage classroom, teal window frames, workbenches, an old projector and layered mat board against the top and walls. Patches of sun on a well-used ochre cement floor. Gentle olive and slate with coral accents. Leave middle open. |
| [walk-stage.webp](../public/art/walk-stage.webp) | Outdoor lakeside student performance stage, seen looking toward a shallow timber stage facing calm Hubei lake with mist and willows, small speakers and fabric banners with no markings around the stage edges, wood roof at top, stone audience forecourt spanning the walkable middle and lower areas. Crisp blue-green and indigo with warm lamp gold. No stairs dividing the walkable forecourt. |
| [walk-library.webp](../public/art/walk-library.webp) | Sheltered campus library exterior corridor opening toward a garden, 1930s Wuhan campus architecture with red timber columns and gray stone balustrade, book exchange tables along edges only, teal shadows, a warm reading lamp and soft afternoon sunlight. Quiet and recognizable stone floor to move on. No written characters. |

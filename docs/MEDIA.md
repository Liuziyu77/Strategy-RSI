# 展示素材与品牌设计

[文档导航](README.md) · [页面主题](VISUAL_DESIGN.md)

项目首页展示大厅和四款游戏的截图，本页保存三国杀历史动图、视频及素材的制作方法。Logo 沿用深绿、暖金和玉色，大厅与各游戏则使用各自的主题。配色和代码组织见[视觉设计说明](VISUAL_DESIGN.md)。

## 当前多游戏预览

当前截图由实际应用和规则引擎生成，使用独立临时 SQLite、本地策略 Agent 和固定种子，RSI 关闭。场地截图展示推进后的对局及实录，不包含测试输入草稿。它们用于说明界面与玩法，不代表真实模型能力或 RSI 实验结果。截图日期、代码版本、脚本校验值和各图片来源见 [ui-preview-provenance.json](assets/ui-preview-provenance.json)。

| 页面     | 中文截图                                          | English                                               |
| -------- | ------------------------------------------------- | ----------------------------------------------------- |
| 游戏大厅 | [game-lobby.png](assets/game-lobby.png)           | 共享大厅目前为中文                                    |
| 三国杀   | [sanguosha-arena.png](assets/sanguosha-arena.png) | 中文游戏                                              |
| 狼人杀   | [werewolf-arena.png](assets/werewolf-arena.png)   | [werewolf-arena.en.png](assets/werewolf-arena.en.png) |
| 国际象棋 | [chess-arena.png](assets/chess-arena.png)         | [chess-arena.en.png](assets/chess-arena.en.png)       |
| 中国象棋 | [xiangqi-arena.png](assets/xiangqi-arena.png)     | 中文游戏                                              |

重新截取全部七张图片：

```bash
npm run build
npx playwright install chromium
npm run docs:previews
# 已安装浏览器时：
CHROMIUM_PATH=/path/to/chrome npm run docs:previews
```

[`scripts/capture-game-previews.ts`](../scripts/capture-game-previews.ts) 不读取 `.env`，不配置模型服务，浏览器仅访问临时本地服务。脚本通过规则引擎推进对局，等待场地和字体加载，检查浏览器错误，直接保存截图及来源记录；结束后关闭服务并移除临时数据库。运行前需要重新构建前端；脚本会覆盖本节图片。

四款游戏的中英文场地截图统一使用 **2000 × 1500 px（4:3）** 视口，README 中因此可以等宽等高排列。脚本会检查棋盘、角色席位和回放控件是否完整显示，再直接截取页面，不修改样式或拉伸、拼接图片。大厅以 1600 px 宽度截取完整页面。各图的视口与截取方式记录在来源文件中。

界面交互、对比度和移动端验证仍由 `tests/e2e/navigation.spec.ts`、`tests/e2e/themes.spec.ts` 等浏览器用例负责，测试产物保存在 `artifacts/`。

<a id="sanguosha-demos"></a>

## 三国杀历史演示 / Sanguosha recordings

以下素材来自三国杀阶段的功能录制与真实存档，保留原始范围。当前四游戏界面以上方截图为准。

**本地功能演示 / Local feature demos**

<table>
  <tr>
    <td width="50%" align="center" valign="top">
      <h4>对战观测 / Live spectating</h4>
      <a href="assets/arena-demo.mp4?raw=true"><img src="assets/arena-demo.gif" alt="五人局出牌动画、聊天与并行切局演示" width="100%" /></a>
      <p><sub>出牌动画 · 并行观测</sub></p>
      <p><a href="assets/arena-demo.mp4?raw=true">▶ 高清视频</a> · <a href="assets/arena.png">截图</a></p>
    </td>
    <td width="50%" align="center" valign="top">
      <h4>经验归纳 / Experience</h4>
      <a href="assets/experience-demo.mp4?raw=true"><img src="assets/experience-demo.gif" alt="玩家档案、经验分类与归纳流程演示" width="100%" /></a>
      <p><sub>玩家档案 · 经验归纳</sub></p>
      <p><a href="assets/experience-demo.mp4?raw=true">▶ 高清视频</a> · <a href="assets/experience.png">截图</a></p>
    </td>
  </tr>
</table>

**真实牌局回放 / Recorded model games** · 选自已有「对话测试」对局

<table>
  <tr>
    <td width="50%" align="center" valign="top">
      <h4>牌局动态 / Battle replay</h4>
      <a href="assets/battle-highlight.mp4?raw=true"><img src="assets/battle-highlight.gif" alt="真实牌局回放：主公与反贼连续决斗、武圣转化和伤害结算" width="100%" /></a>
      <p><sub>决斗交锋 · 连续出杀</sub></p>
      <p><a href="assets/battle-highlight.mp4?raw=true">▶ 高清视频</a> · <a href="assets/battle-highlight.png">截图</a></p>
    </td>
    <td width="50%" align="center" valign="top">
      <h4>Agent 聊天 / Agent chat</h4>
      <a href="assets/chat-highlight.mp4?raw=true"><img src="assets/chat-highlight.gif" alt="真实 Agent 聊天：试探身份、质疑行动，RSI 关羽公开反驳" width="100%" /></a>
      <p><sub>身份试探 · 公开反驳</sub></p>
      <p><a href="assets/chat-highlight.mp4?raw=true">▶ 高清视频</a> · <a href="assets/chat-highlight.png">截图</a></p>
    </td>
  </tr>
</table>

上排使用本地策略和模拟 API 展示功能；下排取自真实模型存档，保留原始行动与公开发言，按历史帧回放时缩短了等待时间。点击动图可打开 1920 × 1280 MP4。[来源、片段说明与重新录制 →](#演示的来源)

## 三国杀历史素材与品牌文件

| 文件                                                                                     | 用途                                           |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------- |
| [logo.png](assets/logo.png)                                                              | 项目 Logo，透明 PNG，适合仓库首页与演示材料。  |
| [arena-demo.gif](assets/arena-demo.gif)                                                  | 五人局动态出牌、公开聊天和并行切局预览。       |
| [arena-demo.mp4](assets/arena-demo.mp4)                                                  | 对应视频，适合下载与汇报播放。                 |
| [experience-demo.gif](assets/experience-demo.gif)                                        | 玩家档案、经验分类与归纳流程预览。             |
| [experience-demo.mp4](assets/experience-demo.mp4)                                        | 对应视频。                                     |
| [battle-highlight.gif](assets/battle-highlight.gif) / [MP4](assets/battle-highlight.mp4) | 真实存档：主公与反贼决斗、连续响应和伤害结算。 |
| [chat-highlight.gif](assets/chat-highlight.gif) / [MP4](assets/chat-highlight.mp4)       | 真实存档：身份试探与 RSI 关羽的公开反驳。      |
| [recorded-highlights.json](assets/recorded-highlights.json)                              | 两段真实回放的截取帧、公开事件与原始聊天。     |
| [highlights-provenance.json](assets/highlights-provenance.json)                          | 真实回放来源、事件区间、数据校验与录制记录。   |
| [arena.png](assets/arena.png)                                                            | 实时牌桌截图。                                 |
| [player-library.png](assets/player-library.png)                                          | 玩家库与参战历史截图。                         |
| [experience.png](assets/experience.png)                                                  | 经验归纳结果截图。                             |
| [experience-loop.svg](assets/experience-loop.svg)                                        | 可编辑的经验流程矢量图。                       |

## 演示的来源

Logo 的可编辑源文件为 [logo.svg](assets/logo.svg)，由交叠卡牌、折线 S、回转箭头和三个节点组成。深绿、暖金和玉色沿用早期三国杀界面的配色，透明 PNG 由浏览器从 SVG 导出。

本页“三国杀历史演示”部分的第一行是**本地功能演示**：`arena-demo` 和 `experience-demo` 来自实际前端和规则引擎。脚本创建独立临时数据库和本地 HTTP 模拟服务，通过正常模型协议驱动 Agent。决策采用本地策略，聊天与反思使用脚本示例，牌局由规则引擎实际推进、结算并保存历史。

该历史演示部分的第二行是**真实模型牌局的历史回放**，来源为 `sanguosha/data/api-validation/arena.sqlite` 中的「对话测试」第 1 局。录制当时数据库由游戏服务使用，因此通过该服务的只读 HTTP 接口提取已保存的历史帧，没有暂停或修改原始牌局。

| 片段         | 原始事件与时间（香港时间）              | 展示内容                                                                 |
| :----------- | :-------------------------------------- | :----------------------------------------------------------------------- |
| **决斗交锋** | #213–#255，2026-09-11 15:27:30–15:29:46 | 决斗中连续打出杀、武圣将红牌转化为杀、决斗与杀的伤害结算。               |
| **身份交锋** | #86–#159，2026-09-11 15:21–15:25        | 试探、偷牌与决斗引发身份争论；RSI 关羽质疑对手行为，对方继续解释与施压。 |

两段素材来自同一局：`e0fbc943-68f7-41fc-9e8c-dc399da7903d`。参与模型包括 `glm-5.2` 与 `bailian/deepseek-v4-flash`。聊天逐字保留，原始时间和座位信息随发言呈现；模型发言中的身份判断、座位称呼与规则理解也按原文保留。

回放按原事件顺序重新呈现项目的牌桌、动画与聊天室组件，并为视频放大文字。画面标注「历史回放」，压缩了模型等待时间，未重新调用模型。可复用数据只包含截取的观测帧、公开事件、聊天与玩家显示信息，不包含 API 密钥、连接地址、模型提示词或个人经验。记录中的「RSI-关羽」是原玩家名称，该场新增 RSI 处于关闭状态。

这些素材用于展示交互与具体行为，不是模型能力或 RSI 收益的对照评测结果。

## 画质与文字

- MP4 使用 1920 × 1280、30 fps 和 100% 浏览器缩放，无损 PNG 帧直接编码为 H.264（CRF 16），减少文字细节损失。
- GIF 使用同一组画面，输出为 1440 × 960、12 fps、256 色，可在本页自动播放；完整视频通过链接打开。
- 卡牌文字逐字排列，按牌名长度调整字号，避免中文备用字体的竖排字距导致重叠或溢出。
- 录制前等待系统字体加载完成，不依赖远程字体服务。Linux 需要安装 Noto CJK 或文泉驿等中文字体。

## 重新录制

需要 Node.js ≥ 22.13、Chromium 和系统 `ffmpeg`。

```bash
npm ci
npm run build
npx playwright install chromium
npm run docs:media
```

已有 Chromium 时可指定路径：

```bash
CHROMIUM_PATH=/path/to/chrome npm run docs:media
```

`docs:media` 重新生成第一行本地演示，更新截图、GIF、MP4 和 `demo-provenance.json`。只使用本地模拟服务，不读取 `.env`，也不调用真实模型。

第二行真实牌局回放可直接从仓库内的截取数据重新录制，无需访问原数据库或连接模型：

```bash
npm run build
npm run docs:highlights
# 或指定已有浏览器
CHROMIUM_PATH=/path/to/chrome npm run docs:highlights
```

`docs:highlights` 读取 `recorded-highlights.json`，启动只读本地展示服务，输出 `battle-highlight` / `chat-highlight` 的 GIF、MP4、截图及 `highlights-provenance.json`。录制时核对页面聊天与存档原文、检查出牌动画及浏览器错误。两个脚本共用无损录制与编码工具，临时帧在完成后清理。重新录制会覆盖对应素材。

本页直接嵌入 GIF；MP4 通过带 `?raw=true` 的相对链接提供，便于打开原始视频与下载播放。流程图为仓库原生 SVG，可直接编辑文字、布局与色彩。

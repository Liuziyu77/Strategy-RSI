# 展示素材与品牌设计

README 使用深绿、暖金与玉色作为主色，与应用中的牌桌和玩家档案保持一致。Logo 以策略印记、卡牌与循环经验为设计意象；首页以真实界面的动图呈现项目的工作过程。

## 素材索引

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

Logo 的可编辑源文件为 [logo.svg](assets/logo.svg)。它延续应用的深绿、暖金和玉色：两张交叠卡牌代表策略环境，中心折线 S 对应 Strategy，回转箭头代表反思与经验反馈，三个节点代表多 Agent 交互。透明 PNG 由浏览器从矢量源文件导出。

README 第一行是**本地功能演示**：`arena-demo` 和 `experience-demo` 来自实际前端和规则引擎。脚本创建独立临时数据库和本地 HTTP 模拟服务，通过正常模型协议驱动 Agent。决策采用本地策略，聊天与反思使用脚本示例，牌局由规则引擎实际推进、结算并保存历史。

README 第二行是**真实模型牌局的历史回放**，来源为 `sanguosha/data/api-validation/arena.sqlite` 中的「对话测试」第 1 局。数据库正被游戏服务使用，因此通过该服务的只读 HTTP 接口提取已保存的历史帧，没有暂停或修改原始牌局。

| 片段         | 原始事件与时间（香港时间）              | 展示内容                                                                 |
| :----------- | :-------------------------------------- | :----------------------------------------------------------------------- |
| **决斗交锋** | #213–#255，2026-09-11 15:27:30–15:29:46 | 决斗中连续打出杀、武圣将红牌转化为杀、决斗与杀的伤害结算。               |
| **身份交锋** | #86–#159，2026-09-11 15:21–15:25        | 试探、偷牌与决斗引发身份争论；RSI 关羽质疑对手行为，对方继续解释与施压。 |

两段素材来自同一局：`e0fbc943-68f7-41fc-9e8c-dc399da7903d`。参与模型包括 `glm-5.2` 与 `bailian/deepseek-v4-flash`。聊天逐字保留，原始时间和座位信息随发言呈现；模型发言中的身份判断、座位称呼与规则理解也按原文保留。

回放按原事件顺序重新呈现项目的牌桌、动画与聊天室组件，并为视频放大文字。画面标注「历史回放」，压缩了模型等待时间，未重新调用模型。可复用数据只包含截取的观测帧、公开事件、聊天与玩家显示信息，不包含 API 密钥、连接地址、模型提示词或个人经验。记录中的「RSI-关羽」是原玩家名称，该场新增 RSI 处于关闭状态。

这些素材用于展示交互与具体行为，不是模型能力或 RSI 收益的对照评测结果。

## 画质与文字

- **高清 MP4**：1920 × 1280，30 fps，100% 浏览器缩放，以无损 PNG 帧直接编码为 H.264（CRF 16），避免中间低码率录像与多次缩放损失文字细节。
- **动态 GIF**：1440 × 960，12 fps，256 色，从同一组无损画面生成，适合 README 自动播放；点击视频链接可查看完整高清演示。
- **卡牌中文**：按字排列并随牌名长度适配字号，避免备用中文字体的竖排字距异常造成重叠；长牌名保持在牌面内。
- **字体准备**：等待字体加载完成后录制。脚本使用系统中文字体，不依赖远程字体服务；Linux 环境请安装 Noto CJK 或文泉驿等中文字体。

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

GitHub 首页直接嵌入 GIF；MP4 通过带 `?raw=true` 的相对链接提供，便于打开原始视频与下载播放。流程图为仓库原生 SVG，可直接编辑文字、布局与色彩。

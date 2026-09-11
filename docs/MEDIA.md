# 展示素材与品牌设计

README 使用深绿、暖金与玉色作为主色，与应用中的牌桌和玩家档案保持一致。Logo 以策略印记、卡牌与循环经验为设计意象；首页以真实界面的动图呈现项目的工作过程。

## 素材索引

| 文件                                              | 用途                                          |
| ------------------------------------------------- | --------------------------------------------- |
| [logo.png](assets/logo.png)                       | 项目 Logo，透明 PNG，适合仓库首页与演示材料。 |
| [arena-demo.gif](assets/arena-demo.gif)           | 五人局动态出牌、公开聊天和并行切局预览。      |
| [arena-demo.mp4](assets/arena-demo.mp4)           | 对应视频，适合下载与汇报播放。                |
| [experience-demo.gif](assets/experience-demo.gif) | 玩家档案、经验分类与归纳流程预览。            |
| [experience-demo.mp4](assets/experience-demo.mp4) | 对应视频。                                    |
| [arena.png](assets/arena.png)                     | 实时牌桌截图。                                |
| [player-library.png](assets/player-library.png)   | 玩家库与参战历史截图。                        |
| [experience.png](assets/experience.png)           | 经验归纳结果截图。                            |
| [experience-loop.svg](assets/experience-loop.svg) | 可编辑的经验流程矢量图。                      |

## 演示的来源

Logo 的可编辑源文件为 [logo.svg](assets/logo.svg)。它延续应用的深绿、暖金和玉色：两张交叠卡牌代表策略环境，中心折线 S 对应 Strategy，回转箭头代表反思与经验反馈，三个节点代表多 Agent 交互。透明 PNG 由浏览器从矢量源文件导出。

所有界面截图与录像来自本项目实际运行的前端和规则引擎。录制脚本创建独立的临时 SQLite 数据库和本地 HTTP 模拟服务，通过正常的模型接入协议驱动 Agent。决策采用本地策略，聊天与反思使用明确的脚本示例。牌局由规则引擎实际推进、结算并保存历史。

这些素材用于展示交互和数据流程，不是大模型能力或 RSI 收益的实验结果。它们不包含真实 API Key、个人实验存档或生产数据。视频使用 82% 浏览器缩放以展示完整牌桌。录制后的演示局加速完成，以展示实际结算的参战记录和赛后经验。

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

脚本只使用本地模拟服务，不读取 `.env`，也不调用真实模型。生成过程会更新本目录的截图、GIF、MP4 和 `demo-provenance.json`，临时录制文件随后自动清理。请在重新录制前保留需要的旧版素材。

GitHub 首页直接嵌入 GIF；MP4 通过相对链接提供，以兼顾静态 Markdown 展示和下载播放。流程图为仓库原生 SVG，可直接编辑文字、布局与色彩。

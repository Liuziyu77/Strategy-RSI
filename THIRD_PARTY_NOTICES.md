# 上游来源与许可

设计时参考了 [wmzy/sanguosha](https://github.com/wmzy/sanguosha)，查阅版本为 `dbe7744b08bea04a67a8e7241c51aa11c4c907fa`（2026-09-08）。参考内容为标准牌面事实数据、身份模式、回合与响应窗口的功能。项目的规则状态机、协议、调度器与前端均重新实现，未引入上游引擎或测试代码。

没有使用上游图片、音效或武将美术资源。具体规则范围见 `docs/RULES.md`。

## chess.js

国际象棋规则使用 [chess.js](https://github.com/jhlywa/chess.js) **1.4.0**，BSD-2-Clause 许可。依赖通过 npm 安装，其版权与许可文件保留在 `node_modules/chess.js/LICENSE`；未复制或修改上游源代码。

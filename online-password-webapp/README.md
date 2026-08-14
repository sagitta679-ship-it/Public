# Vivien 的技能仓库

存放 Vivien 的自建技能（skill），供 AI 助手复用工作流程。

## 技能列表

### online-password-webapp — 线上密码版工具改造

把本地 HTML 数据工具改造成"线上密码加密版"的完整流程：Netlify 部署、密码解锁、数据加密云同步、手机/电脑多端共用、改密码。

- `SKILL.md`：技能主体（流程、加密体系、踩坑记录）
- `assets/sync-template.js`：**通用云端存储接口模板**——与具体业务无关，任何工具做线上版都复用它（Netlify Blobs HTTP API 读写加密数据）。不是某个业务表的专属模板。

## 使用方式

把技能目录交给 AI 助手（ima.copilot），助手加载后即可按流程执行。

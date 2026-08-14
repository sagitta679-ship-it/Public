---
name: online-password-webapp
description: 将本地 HTML 数据工具改造成"线上密码加密版"——Netlify 部署、密码解锁、数据加密云同步、手机电脑多端共用、支持改密码。当用户说"搞个线上能编辑的密码版""手机也要能用""挂到网上密码打开""做成在线版""云端同步""线上看和编辑"时触发。不适用于：无需密码的公开网页、纯文档在线分享（用在线文档工具更快）、需要多账号权限体系（每人独立密码/只读权限）的场景。
---

# 线上密码版工具改造

把一个本地的 HTML 数据工具（localStorage 存储）升级为部署在 Netlify 的在线版本：访问需密码，数据用密码加密后存云端，手机/电脑打开同一网址共用一份数据。

## 一、动手前必须与用户对齐（缺一不可）

1. **数据上云意愿**：数据存 Netlify 海外服务器，需用户明确接受（涉及公司数据合规时先问清楚）
2. **密码即钥匙**：忘记密码 = 数据永久无法找回；知道密码 = 完整读写权限（能看能改能改密码）。用户有 Bitwarden 等密码管理器记录最好
3. **用户有 Netlify 账号**，且能接受部署后配置一个 Access Token（引导操作，约 2 分钟）
4. 本地版保留照用，线上版是独立新文件

对齐话术要点（用户常问）：
- "给密码=给全部权限"，需要只读权限要账号体系（复杂度上一个台阶，先不做）
- 被改密码锁门的兜底：本地定期导出明文备份 + 数据在用户自己的 Netlify 账号下可从后台清空重来
- 免费计划不会自动扣费，超限只暂停到下月重置

## 二、架构

- **前端 index.html**：本地版全部业务逻辑 + 解锁层 + 加密/解密 + 云同步 save + 改密码入口
- **netlify/functions/sync.js**：云端读写代理（GET 读 / POST 写），数据是密文字符串，函数不接触明文
- **存储**：Netlify Blobs，通过 HTTP API 直连（**不要 require('@netlify/blobs')**，见坑 1）

## 三、加密体系（沿用已验证方案，不要改）

- 库：crypto-js@3.1.9-1（CDN：`https://cdn.jsdelivr.net/npm/crypto-js@3.1.9-1/crypto-js.js`，192KB 单文件可内嵌）。**crypto-js 4.x 的 PBKDF2 输出与标准不一致，必须 3.1.9-1**
- 密钥派生：两轮 PBKDF2——第一轮 1000 次 SHA-1，第二轮 14000 次 SHA-256，keySize 16（64 字节）。**第一轮结果必须 `.toString()` 成 hex 字符串再作为第二轮输入**（传 WordArray 会哈希不同）
- 密钥切分：前 32 字节 = AES-256 密钥，后 32 字节 = HMAC-SHA256 密钥
- 加密：AES-CBC(Pkcs7) + 随机 16 字节 IV
- **payload 格式：`v1|盐(hex)|HMAC(hex)|IV(hex)|密文(base64)`**（HMAC 计算对象 = IV+密文）
- 解密：解析 → 用 payload 里的盐派生密钥 → HMAC 校验（不匹配 = 密码错误）→ AES 解密
- 盐：首次设置密码/改密码时随机生成；解锁时沿用数据自带的盐（`setupEnc(pwd, saltHex)`）
- 会话密钥 `enc = {saltHex, key}` 只存内存，不落盘

## 四、数据层替换步骤（本地版 → 线上版）

1. `let records = load();` → `let records = [];`（解锁时才填充；load() 可改成返回空数组）
2. **save() 重写**：`encryptData(JSON.stringify(records))` 后串行 POST 上传——用 Promise 队列（`saveQueue = saveQueue.then(...)`）防止快速连续操作乱序覆盖；未解锁（enc 为空）不保存；可加"保存中/已保存"指示
3. 初始化：`render()` → `initOnline()`：拉云端 → 有数据 `showUnlock()` / 无数据 `showSetup()`
4. **解锁层**：全屏固定遮罩 + 居中卡片（标题/说明/密码框/确认密码框(仅首次)/错误提示/进入按钮），现代简约黑白灰
5. **改密码**：`prompt` 新密码两次 → 强警示确认（"改密码把所有持有旧密码的人锁在门外"）→ 用新密码重加密**内存中的 records** → 上传 → 成功才生效，失败回滚旧 enc
6. 导出备份/导入备份功能保留（明文 JSON，用户本地留存；换设备/被锁门时兜底）

## 五、Netlify 函数 sync.js 要点

- **端点**（从 @netlify/blobs SDK 源码挖出，文档未公开）：`https://api.netlify.com/api/v1/blobs/{siteID}/{storeName}/{key}`
- 认证：`Authorization: Bearer {token}`，token 从函数环境变量 `process.env.NETLIFY_ACCESS_TOKEN` 读（用户配置），**绝不写死在代码里**
- siteID 用内置环境变量 `process.env.SITE_ID`
- GET：404 = 无数据（返回 `{data:''}`）；成功返回 blob 原文（密文）
- POST：`PUT` 同 URL，body 为原始密文文本（Content-Type: text/plain）
- 单 blob 约 1MB 上限：函数内限制 900KB 并返回友好错误
- 错误返回统一 JSON `{error: '...'}`，前端直接展示

## 六、部署包结构（打包 zip 交付）

```
线上版/
├── index.html
├── netlify.toml          # [build] publish="." + [functions] directory="netlify/functions"
├── 部署说明.txt           # 环境变量配置 + 令牌生成 + 首次使用 + 故障排查
└── netlify/functions/sync.js
```

**关键**：用户必须拖【整个文件夹】到 Netlify Deploys 页——只拖单个 HTML 会导致函数缺失、云端读写 404/502。部署说明里用加粗/醒目方式强调。

## 七、用户操作引导（写进部署说明.txt）

1. 生成 Personal Access Token：Netlify → 头像 → User settings → Applications → New token
2. 站点 → Site configuration → Environment variables → `NETLIFY_ACCESS_TOKEN` = token
3. 解压部署包，整个文件夹拖到 Deploys 页覆盖部署
4. 打开网址 → 首次设置密码 → "导入备份"迁移本地数据
5. 提醒：密码存密码管理器；token 不外传；怀疑泄露可删旧 token 重建

## 八、交付前测试清单

- 加密→解密往返 ✓；错误密码拦截（HMAC 不匹配）✓；改密码后旧密码失效、新密码可开 ✓；随机盐（同数据两次加密 payload 不同）✓
- 首次设置密码后云端出现 `v1|` 开头的密文 ✓
- 模拟重新打开：initOnline 拉云端 → 解锁界面 → 错误密码拦截 → 正确密码进入 ✓
- 部署后从外部 `curl https://站点/.netlify/functions/sync` 返回 `{"data":""}`（HTTP 200），不是 502/404
- 手机端同网址输密码可看可改；电脑刷新后改动同步

## 九、已知的坑（每条都踩过）

1. **@netlify/blobs 模块在 Netlify 函数环境不保证内置**——本项目实测 `Runtime.ImportModuleError: Cannot find module '@netlify/blobs'`；且该包依赖链含 29MB OpenTelemetry 遥测包无法精简。**直接用 HTTP API 直连（见第五节）**
2. HTML 层的注释必须用 `<!-- -->`；JS 注释 `/* */` 写在 HTML 层（如 </head> 前）夸克浏览器会原样显示出来
3. 夸克浏览器渲染复杂表格页面卡：输入匹配类高频事件加防抖（150ms）；夸克对 file:// 页面 localStorage 支持不稳
4. 微信内置浏览器 WebCrypto 不可用：加密必须用纯 JS 实现（crypto-js 3.1.9-1 就是纯 JS）
5. 用户双击本地 HTML 用默认浏览器打开，夸克会显示源码/卡顿——指引用 Chrome/Edge 或直接部署线上版
6. Netlify 免费计划：函数调用/存储都在免费额度内，超限只暂停服务不扣费

## 十、示例

**示例 1：已有本地工具（数据在 localStorage）改线上版**
流程：对齐需求 → 复制本地版为基础 → 替换数据层（records 空数组、save 云同步、初始化 initOnline）→ 加解锁层/加密/改密码 → 写 sync.js → 打包 + 部署说明 → 测试清单全过 → 交付 zip 并引导部署。

**示例 2：从零做一个新工具并直接上线上版**
流程：先按用户需求做出本地版工具（表单+表格+localStorage，可离线试跑）→ 用户验收业务逻辑 → 再套本技能改造成线上版 → 打包交付。避免直接做线上版导致业务逻辑和部署问题混在一起难排查。

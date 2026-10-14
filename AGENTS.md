# 项目备忘

## 开发台账（改完软件必做）

改这个项目之前先看 `docs/开发台账.md`，**改完并验证后必须往里追加记录**，规矩如下：

1. 在台账「台账总表」**最上面加一行**：日期 / 改了什么 / 怎么验证的 / 上线到哪（commit 号或 gh-pages 版本）。
2. 修 bug 的，在「详细记录」里补：现象 → 根因 → 修法 → 验证数字。
3. 踩了新坑就往「踩坑清单」加一条。
4. 没验证通过的写"未验证 / 待验证"，不许写"完成"，也不许编造结果。
5. 部署后更新「上线记录」里的 commit 链。

部署相关：网页版 `bash scripts/deploy-ghpages.sh`（代理常 502，脚本自带重试；被 SIGTERM 就手动分步执行）。桌面端每次都要**重启 .app** 才生效。
构建：`env -u NODE_OPTIONS npm run build`（App 开着时先 `mv dist dist-old-backup` 再构建，否则 EPERM）。

## 坚果云同步

- 2026-08-24 用户明确改用 GitHub 私有仓库同步：仓库 `gagayjj/gaga-study-sync`，手机端使用 GitHub 访问令牌，不再依赖 CORS 代理。
- 以下坚果云内容保留为历史方案与备用说明，除非用户再次明确要求，不再改回坚果云。

### 当前同步配置速查

用户问“怎么同步 / 怎么登录 / 网址 / 令牌”时，直接按以下内容回复：

- 手机公网网址：`https://gagayjj.github.io/gaga-notes-mobile/`
- 同步方式：用户 2026-08-24 同意改用 Gitee 私有仓库同步；Gitee 版已写好并本地验证，等待部署到公网。
- Gitee 用户名：待用户提供。
- Gitee 仓库：`gaga-study-sync`
- Gitee 私人令牌：待用户创建；在 Gitee 设置 → 私人令牌生成，需要 projects 权限。
- 电脑端配置入口：每日英语 → Gitee 同步 → 保存配置 → 生成配对二维码。
- 手机端配置入口：我的 → Gitee 同步 → 扫一扫，或手动填 Gitee 用户名、仓库名、私人令牌。
- 如果问“私人令牌是什么”：说明它是 Gitee 的访问密码，在 gitee.com 设置里生成，不要公开分享。
- GitHub API 在用户网络下报 TypeError，已弃用为历史方案。
- 坚果云 WebDAV 是历史方案，除非用户明确要求，不再改回。
- 遗留临时测试仓库：`gaga-study-sync-test`（私有，含测试数据；当前令牌无 `delete_repo` 权限，未自动删除）。

- 学习笔记的单词本和语句本同步使用坚果云 WebDAV，免费版即可。
- WebDAV 地址：`https://dav.jianguoyun.com/dav/`
- 账号：用户的坚果云登录邮箱；密码：坚果云“安全选项 → 添加应用密码”生成的应用密码，不是登录密码。
- 手机网页版受浏览器 CORS 限制，需要 CORS 代理前缀，例如 `https://corsproxy.io/?url=`
- 配置保存位置：桌面端 `userData/sync-config.json`，手机端 `localStorage` 的 `gaga-sync`。
- 云端同步文件：`gaga-study-words.json`（单词和语句）、`gaga-study-notes.json`（笔记正文）。
- 桌面端启动后会自动拉取云端数据，增删单词/语句后自动上传；手机端打开时自动拉取，增删后自动上传。
- 笔记正文同步入口在桌面端“每日英语 → 我的单词本 → 坚果云同步 → 上传笔记/拉取笔记”；手机端保存或删除笔记后会自动上传。
- 手机版网页可通过 Cloudflare 临时公网隧道或 GitHub Pages 部署公开访问。
- 以后涉及同步或需要取用该配置时，直接使用坚果云方案，不要改选其他网盘，除非用户明确要求。

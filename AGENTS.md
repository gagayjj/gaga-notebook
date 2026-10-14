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

## 手机端同步（Gitee 中转）

- 手机公网网址：`https://gagayjj.github.io/gaga-notebook/`（GitHub Pages，仓库 `gagayjj/gaga-notebook` 的 gh-pages 分支；手机端跑的是桌面 React 应用 + MobileShell 适配，**不是 `mobile/` 那套**——`mobile/` 已于 2026-10-14 删除，是从未上线的死代码）。
- 同步方式：Gitee 私有仓库中转（默认仓库 `gaga-study-sync`），手机/电脑任意网络双向同步。令牌只存本机，不上传。
- 电脑端配置入口：每日英语 → Gitee 同步 → 保存配置 → 生成配对二维码。
- 手机端配置入口：我的 → Gitee 同步（手动填用户名/仓库/令牌，或「复制同步配置」得到 JSON 后「扫一扫」导入）。
- 私人令牌是什么：Gitee 的访问密码，在 gitee.com 设置里生成，不要公开分享。
- **当前局限（2026-10-14）**：同步只覆盖 `notes` + `customWords` + `customSentences`；TED 精听进度、剧有词库与测验状态、问 AI 历史、双语对照历史**都不同步**。手机/电脑「同体验」还需补这一步。
- 历史方案：坚果云 WebDAV、GitHub 私有仓库同步均已弃用（GitHub API 在用户网络下报 TypeError），除非用户明确要求不再改回；`gaga-study-sync-test` 是早期测试仓库，可清理。

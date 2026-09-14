# Voex 目录与编辑器交互约定

来源：本次用户确认的团队方案与边界、`src/service/api/team-api.ts` 和 `src/service/api/workspace-api.ts` 的服务端接口合同。旧创建者隔离规则由本次团队授权规则替代。视觉与 tokens 见 DESIGN.md。

## Canonical UI Map

| Capability         | Canonical owner                                                                | Source of truth              | Allowed variants                        | Verification               |
| ------------------ | ------------------------------------------------------------------------------ | ---------------------------- | --------------------------------------- | -------------------------- |
| Form               | src/components/dialog/InputDialog.vue                                          | API 名称校验                 | 新建 / 重命名                           | 浏览器输入、提交、错误恢复 |
| Auth form          | src/components/auth/AuthField.vue、ProfileFields.vue、LoginForm.vue            | 本次用户确认及 /api/auth API | 登录 / 注册 / 资料 / 重新登录           | Unicode、IME、错误、窄屏   |
| Avator upload      | src/components/auth/AvatorPicker.vue、src/service/api/upload-api.ts            | /api/assets/upload           | 注册后上传 / 资料保存                   | 类型、大小、进度、失败恢复 |
| Toast              | src/components/NotificationBar.vue                                             | src/stores/notification.ts   | success / error / info                  | 可访问提示、创建延时       |
| CRUD               | src/composables/useCreateDocument.ts、src/composables/useDocumentPage.ts       | 后端 API.md                  | 创建后打开 / 删除后返回目录             | 浏览器目录→编辑            |
| Scrollbar          | src/assets/style/main.css                                                      | DESIGN.md 与 theme.styl      | geometry only                           | 浏览器 computed style      |
| Team form / action | src/components/team/team.styl、JoinTeamDialog.vue、ProjectPrivilegesDialog.vue | 本次团队方案、team-api.ts    | 申请 / 权限、沿用 VoexModal             | 错误、IME、焦点、窄屏      |
| Select/Listbox     | 原生 select                                                                    | 浏览器/操作系统              | 团队选择、转让对象；接受平台 popup 外观 | label、键盘、窄屏          |

## 导航与数据

`/` 和 `/home` 最终进入 `/home/project`，未登录先进入 `/login`。目录的 project、folder 标识位于路由参数，团队为 query `team_key`；未指定团队时展示自己的个人团队。直接打开项目时根据服务端返回的所属团队补齐 query。项目首页仅列当前团队可编辑项目，项目列根文件夹，文件夹仅列文件，不能创建子文件夹。编辑文件由 `/edit/:file_key` 唯一定位，不用 localStorage 选择文件。

无项目时展示明确空态，不通过 initialize 自动创建项目。创建项目由用户发起；文件从已授权的文件夹创建，落点及完整路径以后端返回为准。前端显示结果 1 秒后打开文件。离开创建页面后不被过期请求强制跳转。目录加载可重试，失败不能被当作“没有项目”。

## 编辑与删除

编辑器只列当前项目。文件夹展开/收起，文件链接导航，当前文件的祖先自动展开。切换、返回目录、浏览器前进后退均检查未保存内容；真实页面卸载使用 beforeunload。保存失败保留内容，保存期间禁止离开。文档正文与目录元数据分离加载。

删除项目和文件夹仅允许空目录，团队可以没有项目。删除文件显示正文与附件关联的影响。确认按钮使用“删除”，默认焦点放在取消。取消无副作用，失败保留当前视图并反馈错误。

## 权限和异步

权限真源是后端 JWT 身份、团队成员关系与资源授权。creator 由服务器确定，仅保留创建者记录。所有者与管理员自动编辑全部项目；普通团队成员能创建项目，仅对有 write 权限的项目创建文件夹和文件。项目名称、删除与文件夹/文件修改检查 write；项目权限设置检查 manage。项目列表隐藏无 read 权限项目。文件夹没有权限设置入口，固定继承项目。

`/home/teams?team_key=…` 选择团队，`tab` 记录成员/申请/邀请/设置，列表每页 20 条，`page`、`teams_page`、`my_page` 位于 query。该阶段 API 返回已授权完整列表，前端分页有界渲染。成员增删、角色变更、审核、链接撤销、转让、退出、删除均等待服务端确认后更新，危险或授权动作使用 ConfirmDialog。个人团队允许邀请，禁止转让删除；所有者不能退出。普通团队删除仅允许无项目。

项目权限区分 inherit 与 restricted；空名单不会被当作全团队开放。弹窗复用 VoexModal，选择成员使用原生 checkbox；取消或路由离开未保存修改时确认丢弃。文件夹始终继承项目，文件分享不扩展为团队或项目权限。

`/join#TOKEN` 与填写团队编号复用 JoinTeamDialog，要求登录、填写申请信息、等待管理员审核。登录跳转仅把 `/join` 写入 return query，邀请凭证始终位于 hash，不进入 query、日志、通知或本地持久存储。新邀请只在创建后提供一次复制机会，默认遮蔽；Clipboard API 失败时支持显示后手动复制。自己的申请记录在团队管理页面可查询。

`/share#TOKEN` 为公开路由，持链接可只读或编辑指定文件；公开页不强制登录或会话恢复。项目编辑权限优先于只读分享。仅项目成员可创建分享链接，文件独立编辑授权不授予创建文件夹/文件或再次分享能力。

读请求取消或丢弃过期结果。创建/命名表单提交中禁止重复、关闭和再次提交，失败保留输入。错误、加载、空目录、成功均有独立状态。弹窗使用原生 dialog modal 行为，键盘焦点可恢复。通知使用 polite live region；重要加载错误保留页面内重试入口。

## 认证与资料

来源为本次用户明确需求与确认：账号最少 8 位、密码最少 10 位。前后端约定账号 8–64、密码 10–128 个 Unicode codepoint，任意字符，不 trim 或归一化；昵称 trim 后 1–64 个字符且必填，邮箱和手机号可空。账号可用性检查使用 300ms debounce、AbortController 和旧结果防护，IME 组合期间不检查或提交。密码强度仅提示，不增加强制字符种类规则。

`/login`、`/register` 为匿名路由，受保护路由先恢复会话；`/share` 公开路由自行尝试恢复，失败继续按链接权限访问。成功登录回到经校验的站内 return 路径。JWT access token 仅存内存，refresh 和私有资源读取由服务器 HttpOnly cookie 支持。401 仅 singleflight refresh 一次并重试，403 保留当前登录。刷新失败时在受保护页面使用同账号重新登录弹窗，编辑内容保留在原组件中，不清除编辑器与上传状态。

注册成功即锁定创建结果；选填头像在拿到会话后上传至 path=avator，再更新资料。头像失败只重试头像步骤，明确显示账号已创建，可直接进入工作台。头像选择仅接受 JPEG/PNG/WebP，最大 5 MiB，预览采用 object URL 并在替换/卸载时释放。上传资源 creator 由服务端返回。

资料页保存后停留当前页并使用 NotificationBar 提示。加载或保存失败保留字段；离开未保存资料由 ConfirmDialog 确认，真实页面卸载使用 beforeunload。退出必须完成服务端注销后清除内存会话，未保存资料在确认文案中明确说明。账户和密码不在本次资料修改范围。

## 验证范围

不使用单元测试。执行 vue-tsc、ESLint、Vite build 和后端 tsc；浏览器验证网格/列表、路径、嵌套、创建提示和路由、刷新、错误与键盘。真实数据库迁移须单独标明是否已执行，模拟接口不能作为 MySQL 事务或迁移通过的证据。

# Voex 目录与编辑器交互约定

来源：本次用户确认的团队方案与边界、`src/service/api/team-api.ts` 和 `src/service/api/workspace-api.ts` 的服务端接口合同。旧创建者隔离规则由本次团队授权规则替代。视觉与 tokens 见 DESIGN.md。

## Canonical UI Map

| Capability         | Canonical owner                                                                | Source of truth              | Allowed variants                        | Verification                 |
| ------------------ | ------------------------------------------------------------------------------ | ---------------------------- | --------------------------------------- | ---------------------------- |
| Form               | src/components/dialog/InputDialog.vue                                          | API 名称校验                 | 新建 / 重命名                           | 浏览器输入、提交、错误恢复   |
| Auth form          | src/components/auth/AuthField.vue、ProfileFields.vue、LoginForm.vue            | 本次用户确认及 /api/auth API | 登录 / 注册 / 资料 / 重新登录           | Unicode、IME、错误、窄屏     |
| Avator upload      | src/components/auth/AvatorPicker.vue、src/service/api/upload-api.ts            | /api/assets/upload           | 注册后上传 / 资料保存                   | 类型、大小、进度、失败恢复   |
| Toast              | src/components/NotificationBar.vue                                             | src/stores/notification.ts   | success / error / info                  | 可访问提示、创建延时         |
| File list / details | src/components/files/FileList.vue、FileDetailsDialog.vue | 本次文件详情需求、后端 docs/FILE-DETAILS-API.md | 项目目录 / 最近文件，网格 / 列表 | 权限菜单、路径跳转、键盘、窄屏 |
| Resource permission | src/stores/permission.ts | 服务端 permissions 与 access | 项目、继承项目的文件夹、项目文件、分享/最近文件 | 只读、分享、撤销访问 |
| Context menu       | src/plugins/context-menu/VoexContextMenu.vue                                   | 本文菜单交互约定             | 单级 / 多级菜单                         | 键盘、焦点、越界、权限禁用   |
| CRUD               | src/composables/useCreateDocument.ts、src/composables/useDocumentPage.ts       | 后端 API.md                  | 创建后打开 / 删除后返回目录             | 浏览器目录→编辑              |
| Scrollbar          | src/assets/style/main.css                                                      | DESIGN.md 与 theme.styl      | geometry only                           | 浏览器 computed style        |
| Team form / action | src/components/team/team.styl、JoinTeamDialog.vue、ProjectPrivilegesDialog.vue | 本次团队方案、team-api.ts    | 申请 / 权限、沿用 VoexModal             | 错误、IME、焦点、窄屏        |
| Download queue     | src/stores/download.ts、src/components/DownloadQueue.vue                       | 本次下载需求及附件 API       | 普通附件 / 分享附件，附件底部内联区域   | 进度、中止、去重、浏览器保存 |
| Select/Listbox     | 原生 select                                                                    | 浏览器/操作系统              | 团队选择、转让对象、回收站项目与每页条数；接受平台 popup 外观 | label、键盘、窄屏            |
| Trash list | src/views/home/TrashPage.vue、src/service/api/trash-api.ts | ../voex-server-main/docs/trash_doc/frontend-integration.md | 有项目写权限的回收站、服务端分页 | 恢复、彻底删除、失败刷新、分页回退、窄屏 |

## 编辑页手机模式

`src/utils/platform.ts` 的 `isMobile` 是手机模式入口；桌面窄窗口不改变设备判断。`src/components/VoexDrawer.vue` 复用 VoexModal 的原生 dialog、焦点管理、遮罩关闭与滚动锁，`src/stores/drawer.ts` 保存互斥的 documents / attachments 状态。左侧文档目录、右侧文件列表仅在手机模式进入抽屉；关闭保留内容实例及目录展开和滚动状态；标题栏按钮通过 aria-expanded 表达状态。关闭、Escape、遮罩点击恢复入口焦点；抽屉内再次打开确认或预览时沿用原有弹窗栈。切换文档、离开页面关闭抽屉，取消未保存离开确认保留当前页面。

手机隐藏格式工具栏，右侧文件列表保留文件选择上传入口，插入附件后关闭抽屉回到正文。桌面和手机的分享/导出统一使用标题栏右侧圆形图标按钮，有可访问名称、tooltip 和 busy 禁用状态；不改变分享权限与导出流程。

## AI 文档助手

来源：本次用户要求，后端接口见 `../voex-server-main/docs/AI-API.md`。仅桌面启用，配置存储在后端，支持 OpenAI Chat Completions 与 Claude Messages。`AIModelDialog`、`AIReviewDialog` 复用 VoexModal，`ai.styl` 负责该流程表单样式；模型、协议、输出参数和审阅文件复用既有原生 select 约定，接受平台 popup。密钥遮蔽，可主动显示，保存后不回传；修改供应商地址或协议必须重新提供 Key。

`AgentToolRegistry` 是能力注册入口，未注册的能力不能调用。当前文档读取、精确替换、追加、全文修改、特殊内容插入只作用于独立 AgentDraft。创建和重命名由编辑页显式注册并进入同一审阅；导出需要用户勾选本轮导出授权，通过注册回调导出已保存版本。工具参数按声明校验，最多 10 轮调用，支持中止。公式、表情和流程图直接生成原有文档格式，不弹出插入表单。

读取上下文和生成建议均不写文件。当前文档有未保存修改时等待正常自动保存；生成期间允许继续编辑，但旧建议不能覆盖后续内容。每条助手消息保留独立快照，内容冻结，状态单独更新。完成有修改的生成后默认打开只读审阅；取消、Escape 或关闭只关闭弹窗，保留消息中的审阅按钮，不更新文件、名称、版本或目录。再次打开始终展示该消息自己的快照。

点击“应用并保存”先检查本地未保存内容和版本，再由后端在同一事务内检查所有文件权限、revision、原名称和原正文。任一冲突均不应用整批修改；失败保留审阅和错误。成功后更新编辑器与目录，按钮改为“查看已应用修改”。后端按账号、审阅 ID 和内容摘要去重，网络结果不明时重试不会重复新建；收到 `replayed` 时重新获取最新正文，不回填旧快照。刷新目录失败不把已成功保存误报为应用失败。AI 导出生成已保存正文的 Markdown 下载，保留附件引用，不打包附件文件。

对话及每条审阅快照按账号、文档保存到后端 `ai_conversation_turns`。发送前先保存用户指令，生成结束后一次保存回复、操作记录、错误与不可变快照；成功后才显示审阅入口。刷新或重新打开页面读取后端历史，已应用状态从同事务写入的 `ai_review_applications` 获取，客户端不能改写该状态或已完成快照。应用请求只提交审阅 ID，正文取自后端保存的快照，保留原 revision、文件名和正文校验。

Pinia 只缓存当前账号的服务端历史和暂存未保存的回复。接口按轮追加，不用整段历史覆盖；每页 20 轮、按递增序号游标加载，完整快照按需获取。历史加载失败保留错误和重试入口；回复保存失败保留相同 payload 重试，未保存回复不能应用，刷新前使用 beforeunload 保护。重复完成同一轮的相同 payload 返回既有结果，不同 payload 返回 409；多个窗口不能互相覆盖不同轮次，迟到读取不能降级本地已应用状态。中断生成只恢复已保存的指令及未完成提示，不自动重启模型调用。

重新读取历史、完整快照和应用时都校验当前账号及源文档访问权限；应用时重新校验修改目标的写权限。账号切换清除前端缓存并取消旧请求；源文档软删除时历史暂不可访问，彻底删除时对应历史由外键级联删除。浏览器不持久存储正文或 API Key。验收用类型检查、Lint、构建、隔离数据库 HTTP 与浏览器交互，不运行单元测试。

## 导航与数据

`/`、`/home` 与未匹配路由最终进入 `/home/recent`（`recent`），未登录先进入 `/login`。项目列表仅显示在 Home 侧边栏，不设置独立的所有项目页面；旧 `/home/projects` 地址按未匹配路由进入最近文件。具体项目路由为 `/home/project/:projectId/:folderId?`，`projectId` 必填，`folderId` 可选；缺少项目标识的目录跳转返回 `/home/recent`。团队为 query `team_key`；未指定团队时展示自己的个人团队，切换团队进入最近文件并重新加载侧边栏项目列表。直接打开项目时根据服务端返回的所属团队补齐 query。侧边栏列当前团队可访问项目，具体项目页面列根文件夹，文件夹仅列文件，不能创建子文件夹。编辑文件由 `/edit/:file_key` 唯一定位，不用 localStorage 选择文件。

无项目时展示明确空态，不通过 initialize 自动创建项目。创建项目由用户发起；文件从已授权的文件夹创建，落点及完整路径以后端返回为准。前端显示结果 1 秒后打开文件。离开创建页面后不被过期请求强制跳转。目录加载可重试，失败不能被当作“没有项目”。

## 编辑与删除

侧栏项目 item 复用 `VoexContextMenu`，提供创建文件夹、重命名和彻底删除项目；均按项目 `permissions.write` 控制，不以 `manage` 代替编辑权限。三点按钮在 hover、focus-within 或菜单打开时显示，无 hover / 触屏设备常显；按钮、右键、ContextMenu 键和 Shift+F10 打开相同菜单。重命名与创建复用 InputDialog，失败保留输入，成功通过 `teams.projectRevision` 同步侧栏和当前项目内容。所有项目删除先使用 ConfirmDialog，明确正常内容和回收站内容均会彻底删除、项目无法恢复，确认后发送 `cascade=true`。删除当前项目成功后进入当前团队的最近文件，删除其他项目不切换当前页面，已离开原页面的异步结果不强制导航。

`ProjectPage` 的文件夹和文件 item 支持右键、ContextMenu 键和 Shift+F10 打开公共 `VoexContextMenu`。三点按钮、点击或 ArrowDown 展开相同菜单；链接保留，触屏不依赖右键。菜单提供打开、重命名、移入回收站，文件额外提供详细信息，复用 permission store、命名弹窗与 ConfirmDialog。移入回收站先确认保留与恢复语义；文件夹确认同时说明内部内容一并移入回收站，确认后发送 `cascade=true`，不根据任意 409 自动重试。菜单的键盘、关闭、焦点恢复与视口避让仍由 `src/plugins/context-menu/` 负责。

最近文件汇总当前账号查看过的项目文件和分享文件，不按侧栏团队筛选。保留条数由前端通过 `limit` 参数决定，当前页面传 `40`；后端只校验正整数，不设置固定业务上限。传 `40` 则返回、保留最近 40 条，传 `60` 则返回、保留最近 60 条，数据不足时返回现有记录。列表不分页、不统计全部历史；按最后查看时间排序、同一文件去重。后端先返回最多 limit 条，再异步清理该账号多余的记录；清理沿用本次请求的 limit 并重新计算边界，保护并发期间刚查看的记录，失败后在下次请求重试。文件权限由每条记录的服务端结果独立决定：项目访问进入编辑页，分享访问复用 SharedFilePage 的受保护 `recent-file` 变体，不加载项目树。分享凭证不存储到客户端，撤销后禁止阅读、保存和附件读取；无权限的历史项保留名称快照与移除入口。

最近文件与 ProjectPage 复用 `FileList`，共享网格/列表偏好、刷新、状态与菜单交互；仍按查看时间排序，最多 40 条且不分页。菜单提供打开、删除记录、跳转文件目录、详细信息。读权限失效时打开与详情禁用并显示原因；没有项目读取权限时隐藏跳转文件目录。删除记录通过独立的 `recent-api.ts` 调用 `/api/recent-files/:fileKey`，不调用文档删除 API；确认说明原文件与附件保留，成功刷新，失败保留记录与重试入口。跳转目录前重新获取 metadata 并校验权限，防止使用已经失效的列表快照。

详情统一使用 `FileDetailsDialog`，每次打开读取专用 `/api/document/:fileKey/details` 或 `/api/recent-files/:fileKey/details`，不取正文、不增加最近访问记录。显示创建时间、修改时间、修改人；无项目权限时后端 `path=null`，前端完全省略路径一项。有项目权限时路径为 `/项目/文件夹/文件`，项目名跳项目根目录，文件夹名和文件名都跳文件夹目录，并保留真实所属团队。历史未记录修改人显示“未记录”，匿名分享修改显示“匿名用户”；不使用创建者冒充修改人。关闭/切换文件/路由离开时取消旧请求，错误支持重试。字段契约见 `../voex-server-main/docs/FILE-DETAILS-API.md`。

编辑器只列当前项目。文件夹展开/收起，文件链接导航，当前文件的祖先自动展开。切换、返回目录、浏览器前进后退均检查未保存内容；真实页面卸载使用 beforeunload。保存失败保留内容，保存期间禁止离开。文档正文与目录元数据分离加载。

文档和文件夹删除的行为由 `../voex-server-main/docs/trash_doc/frontend-integration.md` 定义：普通 DELETE 表示移入回收站，保留正文和附件关联，分享暂时不可用。删除当前打开文档成功后清空自动保存队列、关闭文档并回到原目录；未保存修改的丢弃在确认中说明。项目 DELETE 仍为彻底删除，确认必须覆盖项目中的正常内容与回收站内容。最近记录移除与附件删除继续沿用各自独立 API。

## 回收站

`/home/trash` 接入工作台主导航。`team_key` 使用当前团队，`project_key` 可选，`limit` 为 20 / 50 / 100（默认 50），`page` 记录页码，均位于 URL；请求始终发送真实团队 key，避免仅传普通团队的 project_key 时误查个人团队。回收站内切换团队仍留在回收站，项目筛选与页码重置；切换项目或每页条数同样重置页码。列表 API 本身按当前项目写权限筛选记录，不依据删除人或创建者控制动作，分享权限不授予管理权。

列表使用独立语义 table，展示名称、类型、所属项目、删除人、移入时间、服务端 expires_at 和操作；文件夹显示 document_count。列表不提供内容预览、关键词搜索、批量操作或清空入口。恢复到原目录，can_restore=false 的文档禁用恢复并提示先恢复原文件夹；文件夹恢复后刷新整页以重读关联文档状态。彻底删除复用 ConfirmDialog，文件夹确认覆盖全部内部文件（包括此前单独移入回收站的文件），默认焦点为取消。每次操作及不确定完成的请求均刷新列表与相关目录、最近文件；删除末页最后一项后按最新 total 回退有效页。加载、失败、空列表独立展示；旧范围请求中止、操作防重复、完成后恢复焦点。业务依据为上述 Trash 对接文档，不承诺到期瞬间完成物理清理。

## 权限和异步

权限真源是后端 JWT 身份、团队成员关系与资源授权。项目、文件夹和文件动作统一由 `src/stores/permission.ts` 解释服务端 DTO；直接读取当前响应，不持久缓存另一份权限，避免账号切换或刷新后残留授权。文件夹继承项目，文件优先使用服务端显式权限；分享编辑权仅允许修改正文，不授予目录、重命名或删除文件权限。删除个人查看记录独立于文件读写权限。creator 由服务器确定，仅保留创建者记录。所有者与管理员自动编辑全部项目；普通团队成员能创建项目，仅对有 write 权限的项目创建文件夹和文件。项目名称、删除与文件夹/文件修改检查 write；项目权限设置检查 manage。项目列表隐藏无 read 权限项目。文件夹没有权限设置入口，固定继承项目。

`/home/teams?team_key=…` 选择团队，`tab` 记录成员/申请/邀请/设置，列表每页 20 条，`page`、`teams_page`、`my_page` 位于 query。该阶段 API 返回已授权完整列表，前端分页有界渲染。成员增删、角色变更、审核、链接撤销、转让、退出、删除均等待服务端确认后更新，危险或授权动作使用 ConfirmDialog。个人团队允许邀请，禁止转让删除；所有者不能退出。普通团队删除仅允许无项目。

项目权限区分 inherit 与 restricted；空名单不会被当作全团队开放。弹窗复用 VoexModal，选择成员使用原生 checkbox；取消或路由离开未保存修改时确认丢弃。文件夹始终继承项目，文件分享不扩展为团队或项目权限。

`/join#TOKEN` 与填写团队编号复用 JoinTeamDialog，要求登录、填写申请信息、等待管理员审核。登录跳转仅把 `/join` 写入 return query，邀请凭证始终位于 hash，不进入 query、日志、通知或本地持久存储。新邀请只在创建后提供一次复制机会，默认遮蔽；Clipboard API 失败时支持显示后手动复制。自己的申请记录在团队管理页面可查询。

`/share#TOKEN` 为公开路由，持链接可只读或编辑指定文件；公开页不强制登录或会话恢复。项目编辑权限优先于只读分享。仅项目成员可创建分享链接，文件独立编辑授权不授予创建文件夹/文件或再次分享能力。

读请求取消或丢弃过期结果。创建/命名表单提交中禁止重复、关闭和再次提交，失败保留输入。错误、加载、空目录、成功均有独立状态。弹窗使用原生 dialog modal 行为，键盘焦点可恢复。通知使用 polite live region；重要加载错误保留页面内重试入口。

## 认证与资料

来源为本次用户明确需求与确认：账号最少 8 位、密码最少 10 位。前后端约定账号 8–64、密码 10–128 个 Unicode codepoint，任意字符，不 trim 或归一化；昵称 trim 后 1–64 个字符且必填，邮箱和手机号可空。账号可用性检查使用 300ms debounce、AbortController 和旧结果防护，IME 组合期间不检查或提交。密码强度仅提示，不增加强制字符种类规则。

`/login`、`/register` 为匿名路由，受保护路由先恢复会话；`/share` 公开路由自行尝试恢复，失败继续按链接权限访问。成功登录回到经校验的站内 return 路径。JWT access token 仅存内存，refresh 和私有资源读取由服务器 HttpOnly cookie 支持。401 仅 singleflight refresh 一次并重试，403 保留当前登录。刷新失败时在受保护页面使用同账号重新登录弹窗，编辑内容保留在原组件中，不清除编辑器与上传状态。

注册成功即锁定创建结果；选填头像在拿到会话后上传至 path=avator，再更新资料。头像失败只重试头像步骤，明确显示账号已创建，可直接进入工作台。头像选择仅接受 JPEG/PNG/WebP，最大 5 MiB，预览采用 object URL 并在替换/卸载时释放。上传资源 creator 由服务端返回。

资料页位于 `/home/profile`，头像置于资料内容第一位，不提供“保存资料”和“返回工作台”按钮。昵称、邮箱、手机号修改后在 blur 时校验并自动保存，仅在 blur 后显示该字段错误；输入时清除旧错误，IME 组合输入完成前不保存。头像选择或移除后立即保存，上传失败保留选择并可重试，上传成功后资料提交失败的重试复用已上传资源。更新请求串行发送，每项基于已保存资料提交，其他字段的未提交输入不随请求发送，旧响应不覆盖新输入。保存状态和错误在字段旁显示；加载或保存失败保留字段。离开、刷新或关闭资料页不检查保存状态、不等待保存请求，也不弹出未保存提示。退出登录保留操作确认，完成服务端注销后清除内存会话，确认文案不检查未保存资料。账户和密码不在本次资料修改范围。

## 图片尺寸与对齐

来源为本次用户确认：保留图片说明，统一支持图库、粘贴与拖入图片的等比例拖动缩放、宽度输入、左对齐/居中/右对齐和持久化。`src/components/milkdown/image-resize.ts` 是 image 节点的 schema、NodeView、HTML/Markdown 尺寸与对齐往返的唯一入口，由 editor-content 注册，编辑页与分享页复用。

选中图片显示缩放手柄与宽度输入（16–10000 整数像素），点击应用或按 Enter 提交；IME 组合期间不提交。拖动仅预览，松开时提交一次可撤销 transaction；Escape、pointercancel、失焦、只读切换、删除和卸载取消未提交的缩放。宽度输入提供非拖动操作，手柄支持左右方向键（10px，Shift 为 50px）。原始尺寸清除 width，按容器显示原图；宽度不覆盖 alt/title，不写 localStorage 或另一套文档元数据，沿用正文自动保存。

未设置 width 和 alignment 的图片沿用普通 Markdown，设置任一值时输出转义 `<img>`；属性仅包含 src、alt、title、可选 width、枚举 data-align 及由枚举生成的固定 display/margin style。读取兼容段落内图片、独立图片、多图换行和原有 Markdown，复制粘贴 HTML 同样保留尺寸与对齐；HTML 恢复只提取已知属性并验证图片 URL，不渲染任意 HTML 或传入的任意 style。对齐只作用于当前图片，修改对齐可独立撤销；原始尺寸只清除 width，保留对齐。只读不提供修改控件，响应式显示不改写保存的宽度。

## Pexels 图库

工具栏“图库”与 `/` 菜单“Pexels 图库”打开同一弹窗。搜索与方向、颜色筛选是本次弹窗的临时状态，不写入路由或持久存储；无关键词时展示精选图，有筛选但无关键词时搜索“自然”，界面明确提示。搜索采用 300ms debounce，Enter 立即提交，IME 组合期间不请求；筛选变化、清空与关闭均中止旧请求并丢弃旧结果。每页 30 张，加载更多失败保留已加载结果并提供重试。选图按打开时的映射选区插入标准 Markdown 图片外链；取消不改正文，关闭回到编辑器。切换只读状态或卸载时取消弹窗，禁止旧弹窗写入。

方向和颜色沿用原生 select，接受浏览器/操作系统的 popup 外观与键盘行为；状态、错误与空结果使用中文。图片署名及来源链接指向 Pexels。Key 从本地 Vite 环境配置读取，通过 Authorization header 发送，不写入日志、URL 或客户端持久存储；当前前端直连会使 Key 可被浏览器请求查看。

## 验证范围

不使用单元测试。执行 vue-tsc、ESLint、Vite build 和后端 tsc；浏览器验证网格/列表、路径、嵌套、创建提示和路由、刷新、错误与键盘。真实数据库迁移须单独标明是否已执行，模拟接口不能作为 MySQL 事务或迁移通过的证据。

## 附件下载

编辑页、分享页和上传调试页的附件下载统一推入全局 download store。下载队列放在各附件区域底部，手机时随右侧文件抽屉显示，新任务自动展开内联下载列表；列表可独立滚动，Tab 可访问，Escape 收起列表并返回队列入口焦点；收起后 Escape 可继续关闭抽屉。已有 NotificationBar 负责重复下载和失败提示，进度与失败原因保留在列表，进行中的任务优先展示。

最多并发 2 个传输，其他任务排队；排队、下载与交给浏览器期间按 hash 去重，结束或中止后可再次下载同一 hash。下载请求 timeout=0，使用独立 AbortController 中止；路由切换继续下载。总大小已知时显示百分比与字节数，未知时显示已接收字节与不定进度，不伪造百分比。

收齐文件后自动触发浏览器保存，待浏览器处理点击后在下一事件循环撤销 object URL，释放文件数据、请求来源和去重项。列表仅保留最多 20 条结束任务的文字/数字元数据，可清除；不保留 Blob、分享凭据或可重复使用的下载 URL。状态“已交给浏览器”表示已发起保存，实际保存结果由浏览器负责。失败或中止后从原附件入口重新下载。

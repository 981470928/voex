---
version: alpha
name: Voex
description: 项目目录与 Markdown 编辑器，experimental 文件工作台。
colors:
  primary: '#1e90ff'
  primaryDark: '#0066cc'
  background: '#f5f5f5'
  surface: '#ffffff'
  text: '#1a1a1a'
  secondaryText: '#666666'
  border: '#dcdcdc'
  danger: '#dc3545'
typography:
  sans:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', Arial, sans-serif"
rounded:
  control: '6px'
  panel: '8px'
spacing:
  desktopGutter: '36px'
  mobileGutter: '16px'
components:
  directoryCard:
    rounded: '8px'
  dialog:
    rounded: '8px'
---

# Voex 设计约定

## Overview

面向整理和编辑 Markdown 文件的使用者。页面采用文件管理器的目录、路径、文件图标和紧凑操作，不引入营销式标题或装饰图。蓝色文件夹、右侧路径导航与编辑器项目树构成统一识别。结构为团队→项目→一层文件夹→文件；中文界面，兼容桌面和手机。

已有 runtime tokens 是唯一来源：`src/assets/style/theme.styl` → CSS variables → 页面及公共组件。本文件记录这些值及使用约定，不生成另一套主题。保留亮/暗主题，字体使用系统字体，无外部字体请求。

## Colors

主色对应 `--voex-primary`，主要操作背景使用 `--voex-primary-dark`；文字使用 `--voex-text-primary` / `--voex-text-secondary` / `--voex-text-inverse`。背景层级对应 `--voex-bg-page`、`--voex-bg-base`、`--voex-bg-overlay`，边框为 `--voex-border-base`。删除与错误使用 `--voex-error`，同时给出动作名称和说明。

暗色主题继续由 theme store 设置 `[data-theme='dark']`，组件消费相同语义变量。目录浏览不修改 theme store 的用户选择。

登录、注册和账户资料是固定深色的认证页面，来自用户提供的近黑背景、居中窄表单参考图。`src/assets/style/auth.styl` 是认证 tokens 的唯一 runtime 来源：背景 `--auth-bg: #09090a`、输入 `--auth-input: #111113`、边框 `--auth-border: #2c2c31`、辅助文字 `--auth-muted: #9b9ba5`、焦点 `--auth-focus: #8c85ef`、按钮 `--auth-button: #222225`。错误 `--auth-error: #f48e95` 与成功 `--auth-success: #86c5a4` 同时配文字说明。局部 `[data-theme='dark']` 不改变工作台主题偏好。

## Typography

目录页标题 22px / 600；文件名与正文提示 14px；控件及面包屑 13px；时间和辅助文字 12px。长文件名在有限空间省略，通过链接可访问全名，重命名输入框展示完整值。路径允许换行。中文输入提交等待 IME 组合完成。

## Layout

Desktop 顶栏左侧创建、右侧面包屑。内容最大宽 1480px，桌面边距 36px，720px 以下边距 16px。目录网格最小卡宽 180px，手机两列；列表在窄屏保留名称和操作。两种模式使用同一数据、排序与动作。

目录用 document 自然滚动，每页 48 项，页码位于 URL。编辑器默认仅展示正文和左侧 64px 操作列，按钮依次为 AI、项目列表、导出、分享、附件、下载列表，统一使用无边框的圆形 `edit-page__icon-button`，以背景与图标颜色区分选中状态。AI、项目列表和附件互斥地在右侧按需展开，AI 宽 380px，其他面板宽 320px；面板与正文分别滚动。编辑页整体使用 `--color-bg-primary`，正文容器透明，不提供纸张底色、边框或阴影；右侧面板用 `--color-bg-panel` 区分，不用分隔线布局。桌面 960px 以下右侧面板覆盖正文并保留左侧按钮；`isMobile` 为真时复用右侧 VoexDrawer。手机隐藏格式工具栏，操作列按钮 44px，长标题省略并保留保存状态。附件底部固定“添加附件”按钮，下载列表从左侧下载按钮旁展开并自动避让视口。文件路由是状态来源，目录上下文通过 `/home/project/:projectId/:folderId?` 恢复，`projectId` 必填；默认入口 `/home` 与未匹配路由进入 `/home/recent`，项目列表仅在侧边栏展示，不提供独立的所有项目页面，团队上下文使用 query `team_key`。

账户资料内容依次为头像、账号、昵称、邮箱和手机号。文本字段在 blur 后校验并逐项自动保存，头像选择或移除后立即保存，不提供手动保存或返回工作台按钮。沿用 AuthField 的 hint 区域显示等待保存、正在保存、已保存及错误，输入时清除旧反馈；头像上传状态、错误、取消和重试位于头像下方。

编辑页加载由数据请求和 Milkdown ready 共同决定。正文等待时使用与正文列宽、内边距一致的骨架屏；首次进入编辑页时，左侧操作列保留占位但隐藏，格式工具栏与右侧面板均在正文就绪后出现；随后切换文件保持左侧按钮栏和格式工具栏显示，等待期间工具栏禁用；已打开的项目文件列表在切换文件时保持固定，保留目录展开和滚动位置，仅正文重新显示骨架屏。AI 的模型区与首次对话读取分别显示骨架屏，加载更早记录保留已有消息。骨架屏统一由 `src/components/LoadingSkeleton.vue` 消费现有 `--color-bg-tertiary`、`--color-bg-translucent` 和圆角变量，不引入新主题。

标题、格式工具栏、正文与正文骨架共用 860px 最大列宽和内边距：桌面 52px、960px 以下 24px、手机 16px。标题从正文左边开始，debugTool（仅开发模式）和返回主页入口位于左侧操作列末尾，统一使用圆形图标按钮；debugTool 菜单从按钮右侧展开。正文滚动容器隐藏滚动条，保留滚轮、触摸和键盘滚动能力；侧栏仍沿用全局滚动条。

编辑页侧栏分两段展开：200ms 展开容器，内容在此期间保持 opacity 0，随后用 100ms 淡入至 1。桌面通过宽度展开，手机保留右侧抽屉的滑入方向并统一为 200ms；内部内容使用相同 200ms 延迟与 100ms 淡入。动画期间内容不可聚焦，结束后恢复交互。prefers-reduced-motion 下立即显示静态骨架与面板，不保留人为等待。

## Elevation & Depth

目录卡片以细边框划分，不用阴影制造层次。仅提示和弹窗使用已有 shadow tokens。加载、空目录、错误状态保留相同内容区域，错误提供重试和主页入口。

## Shapes

控件圆角 6px，目录面板与弹窗 8px。图标统一使用 `src/assets/svg` 中的本地图标，通过 `SvgIcon` 和 SVG sprite 渲染；缺失图标按 `voex-icons` skill 的 16×16、单色圆润风格补齐。文件夹使用蓝色图标，文件使用中性文档图标，尺寸和颜色服从所在组件的样式。

## Components

编辑页的 AI 助手、项目列表与附件共用右侧区域，助手宽 380px，沿用工作台背景、系统字体与 6px 控件圆角。`src/components/ai/ai.styl` 统一配置、对话与审阅按钮和字段，消费 `theme.styl` 与 `main.css` 既有变量。配置弹窗内的模型、协议、输出参数与审阅文件选择使用原生 select，接受系统选项弹层。AI 输入框将模型入口、导出授权和发送图标放在底部同一工具行，不再单列当前文档和快捷键提示。模型入口复用 VoexTrigger，以 top-start 向上展开与入口等宽的浮层，内部使用原生 radio 选择模型，底部提供“配置模型”。导出图标以 active 背景、描边和 aria-pressed 表达本轮授权；发送与停止共用同尺寸图标按钮。配置和审阅复用 VoexModal；审阅用只读 Markdown 双栏对比，以 `+` / `−` / `~` 和现有 `--color-green` / `--color-red` 共同标记新增、删除、修改。长对比分页，保留行号；手机 AI 沿用同一右侧抽屉入口。

AI 对话按账号、文档和会话独立保存；面板顶部提供“当前对话”原生 select 与“新建对话”按钮，接受系统选项弹层，选项显示首条指令摘要与创建时间。会话列表每次读取 20 条，可“加载更多对话”；生成、保存和应用期间禁用切换，切换保留各会话的输入草稿。旧记录归入“历史对话”。每个会话每次读取最近 20 轮，列表顶部提供“加载更早的消息”，追加旧记录时保持当前阅读位置。历史加载、回复保存和审阅读取各有独立状态；保存失败在对应回复下提供“重试保存回复”。未完成的历史轮次明确提示可发送新指令，不显示持续运行的假状态。已应用的审阅按钮保持“查看已应用修改”，完整快照仅在打开时读取。

`*Dialog` 组件统一注册于 `src/stores/modal.ts`，由 App 全局宿主挂载，不在业务组件模板中单独声明。调用方通过 `useDialog` 将显示状态、业务参数与回调接入 store；调用方卸载时只关闭自己持有的会话。Confirm/Input 沿用 `showModal` 与 `useModal`，其他 Dialog 仅在显示期间挂载并在关闭时释放实例。

`InputDialog` 是命名输入和异步提交的公共入口；`ConfirmDialog` 是删除/未保存确认入口；`VoexModal` 负责焦点、Escape、背景隔离和滚动锁；`VoexDrawer` 复用其 right 布局变体，编辑页 `activePanel` 管理互斥的 AI / 项目列表 / 附件，手机切换文档时保留项目文件列表、关闭其他面板，离开编辑页时关闭；`NotificationBar` 与 notification store 负责统一提示。创建文件统一通过 `useCreateDocument`：后台确定落点，展示实际路径 1000ms 后跳转。

编辑器 `PexelsDialog` 复用 VoexModal，沿用工作台主题、系统字体和 6px 控件圆角。图片保持原始比例，以三列瀑布流展示，手机两列、极窄屏一列；筛选和署名固定在列表滚动区域外。方向和颜色使用有 label 的原生 select，接受平台选项弹层。点击图片直接插入，摄影师和 Pexels 来源链接始终可见。

正文图片继续使用 inline image 节点。选中后显示等比例缩放手柄，以及带 label 的宽度输入、应用、原始尺寸和左对齐/居中/右对齐操作；浮层使用既有编辑器主题变量、6px 圆角和 shadow token，并在滚动、窄屏时保持可见。仅保存宽度，图片高度跟随原始比例；显示宽度受容器约束，窄屏不改变文档中保存的宽度。未设置对齐时保留原有行内显示；选择对齐后仅当前图片独占一行，通过 margin 对齐，不修改段落或其他图片。右对齐的缩放手柄位于左下角，其他情况位于右下角。只读模式隐藏操作控件。

粘贴图片、Pexels 图片与本地图片统一先导入文档附件，再插入图片节点；正文保存附件下载地址，不保存临时 Blob URL 或新导入图片的 base64。默认以图片形式显示，初始宽度为编辑器正文可用宽度的一半；图片浮层提供“显示为附件”，图片附件卡片提供“显示为图片”，切换复用同一文件。图片读取沿用各页面现有鉴权接口。`editor-paste.ts` 独立管理粘贴转换、异步选区映射和导入占位，保留特殊格式转换的扩展入口。

`src/components/files/FileList.vue` 是项目目录与最近文件的共享列表，统一网格/列表切换、刷新、加载/空/错误状态、分页和右键菜单入口；布局偏好沿用 `voex-desktop-view`。文件链接保持语义化，列表窄屏始终保留文件名与操作。`FileDetailsDialog` 复用 VoexModal，名称允许换行，创建/修改时间与修改人按标签和值排列；仅有项目访问权限时显示可换行的路径链接，项目名进入项目，文件夹名与文件名进入所在目录。视觉沿用当前工作台 tokens。

`ProjectTree` 使用嵌套列表、文件夹 disclosure button 和 RouterLink；键盘可 Tab 聚焦、Enter 激活，展开状态由 `aria-expanded` 表达，不冒充具备方向键操作的 ARIA tree widget。

回收站在 Home 工作台中使用独立语义表格，名称与恢复/彻底删除动作优先，移入时间和到期时间使用现有辅助文字层级；窄屏将行转为带字段标签的纵向记录，不省略删除人、到期时间或操作。项目和每页条数沿用原生 select，接受系统选项 popup；按钮与状态复用 `team.styl`，确认复用 ConfirmDialog，通知复用 NotificationBar，不新增 theme tokens。列表区域拥有内部滚动，沿用全局滚动条基线。

右键菜单统一使用 `src/plugins/context-menu/VoexContextMenu.vue`，通过 Teleport 脱离目录裁剪区域。浮层消费 `--color-bg-secondary`、`--color-border-secondary`、`--shadow-medium` 与既有圆角 tokens，行高至少 34px，图标 16px；危险操作以分隔线和 `--color-red` 区分，禁用原因直接显示。菜单层级为 200，低于通知和原生 modal 的 top layer。

团队管理沿用 Home 的深色工作台，系统字体和低对比细边框。团队卡片显示名称、角色与人数，选中状态使用现有 `--color-accent` 边框；个人团队标记只是类型说明。成员、申请、邀请以紧凑行展示，不引入营销卡片。页面标题 20px，团队名称 17px，操作与正文 13px，辅助信息 12px。团队选择和转让对象使用带 label 的原生 select，接受浏览器/系统的选项弹层外观和键盘行为。

团队共用的表单、按钮、状态样式由 `src/components/team/team.styl` 消费既有 `theme.styl` 语义变量：背景 `--color-bg-secondary` / `--color-bg-panel`，文本 `--color-text-primary` / `--color-text-secondary` / `--color-text-tertiary`，边框 `--color-border-primary`，操作 `--color-brand-bg` / `--color-brand-text`，危险操作 `--color-red`，焦点 `--color-accent`。未新增全局颜色或另一份 theme。团队与项目权限弹窗仍由 VoexModal 负责焦点和滚动隔离，权限与移除确认使用 ConfirmDialog。

认证页面复用 `AuthLayout`（登录宽 320px，注册/资料宽 360px）、`AuthField`、`ProfileFields`、`AvatorPicker`。登录与注册的 Voex 既有白色 logo 位于标题上方，表单无外围卡片；系统字体，标题 20px / 600，输入 14px，按钮高 44px / 胶囊圆角，输入圆角 10px。账户资料使用 `/home/profile` 子路由，保留 Home 侧边栏；`AuthLayout` 的 embedded 模式省略认证 logo 与底部署名，透明背景融入工作台，表单在 Home 内容区内滚动。登录与注册在短屏与手机保持自然滚动，账号/密码不截断粘贴。会话过期使用既有 `VoexModal` 配合 `LoginForm`，避免销毁当前编辑页面。

下载队列沿用全局 download store；编辑页使用 DownloadQueue 的 popover 变体，锚定左侧下载列表按钮，通过既有 useFloating 定位、翻转和视口避让。浮层使用 `--color-bg-secondary`、`--shadow-medium` 与 12px 容器圆角，内容独立滚动。分享页和上传调试页继续使用默认 inline 变体，不改变其布局。

滚动条基线由 `src/assets/style/main.css` 全局定义，thumb/track/hover/active 映射现有主题变量，并提供 forced-colors 回退。按钮有 hover、focus-visible、pressed、disabled 状态。动画尊重 prefers-reduced-motion。

## Do's and Don'ts

使用后端返回权限控制项目行为，团队角色、项目授权与文件分享共同决定访问；creator 仅记录创建者。目录元数据不携带正文。创建失败保留输入，防止重复提交。文件切换前保护未保存内容，旧请求结果不能覆盖新路由。保留现有文档和附件数据。

本次按用户明确需求建立 JWT 登录、注册与资料编辑。不加入拖拽移动或批量操作、不引入新 UI 依赖。遵守项目约束，不生成或运行单元测试。验收采用类型检查、Lint、构建和浏览器实际交互；数据库实测与模拟接口验收分别记录。

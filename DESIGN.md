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

目录用 document 自然滚动，每页 48 项，页码位于 URL。编辑器保持三栏结构，项目树宽 264px，正文与树各自滚动；手机通过公共弹窗打开项目树。文件路由是状态来源，目录上下文通过 `/desktop?project=…&folder=…` 恢复。

## Elevation & Depth

目录卡片以细边框划分，不用阴影制造层次。仅提示和弹窗使用已有 shadow tokens。加载、空目录、错误状态保留相同内容区域，错误提供重试和主页入口。

## Shapes

控件圆角 6px，目录面板与弹窗 8px。图标统一使用 `src/assets/svg` 中的本地图标，通过 `SvgIcon` 和 SVG sprite 渲染；缺失图标按 `voex-icons` skill 的 16×16、单色圆润风格补齐。文件夹使用蓝色图标，文件使用中性文档图标，尺寸和颜色服从所在组件的样式。

## Components

`InputDialog` 是命名输入和异步提交的公共入口；`ConfirmDialog` 是删除/未保存确认入口；`VoexModal` 负责焦点、Escape、背景隔离和滚动锁；`NotificationBar` 与 notification store 负责统一提示。创建文件统一通过 `useCreateDocument`：后台确定落点，展示实际路径 1000ms 后跳转。

`ProjectTree` 使用嵌套列表、文件夹 disclosure button 和 RouterLink；键盘可 Tab 聚焦、Enter 激活，展开状态由 `aria-expanded` 表达，不冒充具备方向键操作的 ARIA tree widget。

团队管理沿用 Home 的深色工作台，系统字体和低对比细边框。团队卡片显示名称、角色与人数，选中状态使用现有 `--color-accent` 边框；个人团队标记只是类型说明。成员、申请、邀请以紧凑行展示，不引入营销卡片。页面标题 20px，团队名称 17px，操作与正文 13px，辅助信息 12px。团队选择和转让对象使用带 label 的原生 select，接受浏览器/系统的选项弹层外观和键盘行为。

团队共用的表单、按钮、状态样式由 `src/components/team/team.styl` 消费既有 `theme.styl` 语义变量：背景 `--color-bg-secondary` / `--color-bg-panel`，文本 `--color-text-primary` / `--color-text-secondary` / `--color-text-tertiary`，边框 `--color-border-primary`，操作 `--color-brand-bg` / `--color-brand-text`，危险操作 `--color-red`，焦点 `--color-accent`。未新增全局颜色或另一份 theme。团队与项目权限弹窗仍由 VoexModal 负责焦点和滚动隔离，权限与移除确认使用 ConfirmDialog。

认证页面复用 `AuthLayout`（登录宽 320px，注册/资料宽 360px）、`AuthField`、`ProfileFields`、`AvatorPicker`。Voex 既有白色 logo 位于标题上方，表单无外围卡片；系统字体，标题 20px / 600，输入 14px，按钮高 44px / 胶囊圆角，输入圆角 10px。短屏与手机保持自然滚动，账号/密码不截断粘贴。会话过期使用既有 `VoexModal` 配合 `LoginForm`，避免销毁当前编辑页面。

滚动条基线由 `src/assets/style/main.css` 全局定义，thumb/track/hover/active 映射现有主题变量，并提供 forced-colors 回退。按钮有 hover、focus-visible、pressed、disabled 状态。动画尊重 prefers-reduced-motion。

## Do's and Don'ts

使用后端返回权限控制项目行为，团队角色、项目授权与文件分享共同决定访问；creator 仅记录创建者。目录元数据不携带正文。创建失败保留输入，防止重复提交。文件切换前保护未保存内容，旧请求结果不能覆盖新路由。保留现有文档和附件数据。

本次按用户明确需求建立 JWT 登录、注册与资料编辑。不加入拖拽移动或批量操作、不引入新 UI 依赖。遵守项目约束，不生成或运行单元测试。验收采用类型检查、Lint、构建和浏览器实际交互；数据库实测与模拟接口验收分别记录。

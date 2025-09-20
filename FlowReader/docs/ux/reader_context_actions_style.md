# 样式与文案规范：阅读页上下文 AI 快捷动作

> 版本: v1.0 | 适用: 桌面与移动 | 依赖: Tailwind, 现有 UI 组件库

## 1. 组件映射（优先复用）
- 按钮：`apps/web/src/lib/components/ui/Button.svelte`
  - 变体：primary（主操作）、secondary（次操作）、ghost（工具类）
- 面板：优先使用现有 `Modal.svelte` 的样式体系；左侧 AI 面板为固定侧栏样式（见尺寸规范）
- 卡片/分组：`Card.svelte` 用于内容分区（上下文预览、输出区、操作区）
- 加载：`Loading.svelte`（Skeleton 或 Spinner）
- 提示：`Toast.svelte` 用于全局短提示
- 输入：`Input.svelte`（若需要快捷词输入框增强）
- 徽章：`Badge.svelte` 显示意图标签（translate/explain/disambiguate/ask）

避免引入新依赖；若需图标，优先使用文本 + Emoji（例：🌐 翻译、💡 解释、🧭 辨析、❓ 提问），或项目已有图标方案。

## 2. 布局与尺寸
- Popover（选区操作条）
  - 高度: 36–40px；内边距: `px-3 py-1.5`；圆角: `rounded-md`
  - 间距: 操作项 `gap-2`；相邻元素 `space-x-2`
  - 阴影: `shadow-md`；边框: `border border-gray-200/60 dark:border-gray-700/60`
  - 位置: 选区上方优先，若空间不足放下方；8px 安全间距

- 左侧 AI 面板（桌面）
  - 宽度: 360–420px（默认 380px）；占满高度；可折叠
  - 内边距: `p-4` 外层，分区 `p-3`
  - 分区：
    1) 标题区（含意图标签）
    2) 上下文预览（可展开）
    3) 流式输出区（可滚动）
    4) 操作区（复制/保存）

- 移动端抽屉
  - 高度: 默认占屏 70%；边角: `rounded-t-2xl`
  - 手势区域高度: 24px；拖拽指示条宽度: 36px，高度: 4px

## 3. 颜色与排版（Tailwind）
- 文本：`text-gray-900 dark:text-gray-100`
- 次文本：`text-gray-600 dark:text-gray-300`
- 背景：`bg-white dark:bg-gray-900`
- 边框：`border-gray-200 dark:border-gray-700`
- 主按钮：`bg-blue-600 hover:bg-blue-700 text-white`（暗色 `bg-blue-500`）
- 警示：`text-amber-600`（提醒）、`text-red-600`（错误）
- 字体与行高：正文 `text-sm leading-relaxed`；标题 `text-base font-medium`

## 4. 动效与状态
- 出入场：`transition ease-out duration-150`（Popover、面板）
- Skeleton：3–5 行，行高 14–16px，行间距 8px；120ms 后再显示 Skeleton（防止闪烁）
- 悬停与按压：按钮 `hover:opacity-90 active:opacity-80`

## 5. 快捷键与可达性（A11y）
- 快捷键：`T` 翻译、`E` 解释、`D` 辨析、`?` 提问（需存在选区）
- 关闭面板：`Esc`；确认主操作：`Enter`
- 焦点管理：打开面板时将焦点置于标题或第一个交互控件；关闭后回到正文选区附近
- 键盘顺序：Popover 中使用 roving tabindex（左右键切换，Enter 确认）
- ARIA：
  - Popover `role="toolbar"`；按钮 `aria-label="翻译所选文本"` 等
  - 面板 `aria-labelledby` 关联标题；上下文预览有 `aria-expanded` 状态

## 6. 文案规范（Microcopy）
- Popover 操作：
  - 翻译（快捷键 T）
  - 解释（E）
  - 辨析（D）
  - 提问（?）
- 面板标题：`翻译` / `解释` / `辨析` / `提问`
- 上下文预览切换：`展开上下文` / `收起`
- 操作按钮：`复制` / `保存为笔记`
- 错误：`请求失败，请重试。` 次行小字：`若多次失败，可复制选区使用外部工具。`
- 超长选区：`选区过长（>300 字），请缩小后重试。`
- 空状态（无选区快捷触发时）：`可在左侧输入框直接提问，或在正文中选择片段以获得贴合语境的回答。`

## 7. 断点与响应式
- `sm`（≥640px）：Popover 单行显示；面板宽度 100%（抽屉）
- `md`（≥768px）：面板宽度 320–360px；正文与面板并排
- `lg`（≥1024px）：面板宽度 380px；正文最大宽度 720–820px

## 8. 校验与容错
- 输入长度：`context.text` ≤ 300 字；前后文各 ≤ 300 字
- 重复请求：同一选区 3 秒内重复点击同一操作则防抖
- 并发：同一面板仅处理一个 SSE 流；新请求会取消旧请求（展示“已取消”）

## 9. 性能预算
- p50 延迟 ≤ 2.0s（≤200 字）；p95 ≤ 4.0s
- 首字时间（SSE 首 token）≤ 800ms（理想）
- 内存与重排：面板内部滚动，不影响正文滚动上下文

## 10. 示例结构（HTML/Tailwind 伪代码）
```html
<aside class="w-[380px] h-full border-l bg-white dark:bg-gray-900 p-4 flex flex-col">
  <header class="flex items-center justify-between mb-3">
    <h2 class="text-base font-medium">翻译</h2>
    <span class="text-xs text-gray-500">🌐 translate</span>
  </header>
  <section class="mb-3">
    <div class="text-xs text-gray-600 dark:text-gray-300">上下文</div>
    <div class="mt-1 text-sm line-clamp-2">In this poem, ...</div>
    <button class="text-xs text-blue-600">展开上下文</button>
  </section>
  <section class="flex-1 overflow-auto space-y-2">
    <!-- SSE tokens append here -->
    <div class="text-sm">译文：在这首诗中…</div>
    <div class="text-sm text-gray-600">备注：更偏隐喻义…</div>
  </section>
  <footer class="mt-3 flex gap-2">
    <button class="btn btn-secondary">复制</button>
    <button class="btn btn-primary">保存为笔记</button>
  </footer>
</aside>
```

## 11. 视觉对齐与验收清单
- 色彩与间距符合上文规范；
- Popover 不遮挡选区；
- 面板滚动顺畅，不影响正文滚动位置；
- 键盘/屏幕阅读器可完整操作；
- 加载态 120ms 延时出现；
- 错误文案清晰，提供重试与备选路径；
- 移动端抽屉手势与可达性通过基本可用性测试。


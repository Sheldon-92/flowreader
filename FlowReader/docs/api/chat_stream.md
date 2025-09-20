# API 契约：`api/chat/stream.ts`（含上下文与意图）

> 版本: v1.0 | 状态: 草案（向后兼容）

## 概述

在现有 SSE 流式对话接口上，新增可选字段以支持“上下文感知 AI 快捷动作”。未传新增字段时，行为与当前版本保持一致。

## 端点

- 方法: `POST`
- 路径: `/api/chat/stream`
- 鉴权: 必须（Supabase 会话/JWT）
- 响应: `text/event-stream`（SSE）

## 请求体（JSON）

必填
- `message: string`  // 用户提问或系统生成的意图提示

可选（新）
- `intent?: 'ask' | 'translate' | 'explain' | 'disambiguate' | 'summarize'`
- `targetLang?: string`  // 目标语言，如 `zh`
- `bookId?: string`      // 绑定书本（用于检索/审计）
- `context?: { text: string; before?: string; after?: string }`
- `conversationId?: string`  // 继续既有对话

示例
```json
{
  "message": "/翻译",
  "intent": "translate",
  "targetLang": "zh",
  "bookId": "book_123",
  "context": {
    "text": "flower",
    "before": "In this poem, the author compares love to a ",
    "after": ", which slowly opens to the sun."
  }
}
```

## 行为与提示（服务器侧逻辑）

- 当存在 `context` 时，模型必须优先基于选中内容与其上下文进行理解与回答。
- `intent` 分支：
  - `translate`: 输出贴合语境的译文，可附简短语义说明；默认输出目标为 `targetLang` 或中文。
  - `explain`: 解释选中文段的含义与背景，突出关键信息。
  - `disambiguate`: 判断词语在当前语境下的义项（字面/隐喻/术语等），给出理由与例证。
  - `ask`: 普通问答（携带上下文）。
- 流输出：维持现有 SSE 协议（增量文本、完成信号、可选结构化小节）。

## 响应（SSE 片段示例）

```
event: token
data: "译文：在这首诗中，作者将爱比作花朵……"

event: token
data: "要点：此处的 flower 更偏隐喻含义……"

event: done
data: {"finishReason":"stop","meta":{"intent":"translate","confidence":"medium"}}
```

## 错误

- 400：请求体缺失必要字段（`message`）。
- 413：`context.text` 超过最大长度（建议≤300字符）。
- 401：未授权或会话失效。
- 500：内部错误（记录 `requestId` 便于排查）。

## 速率与性能

- p50 ≤ 2s（≤200字符），对更长上下文允许更高延迟。
- 限制 Top-K 与重排开销，避免 token 浪费。

## 兼容性

- 未传 `intent/context` 时，行为与当前版本一致。


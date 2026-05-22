# Customer-Facing Script

## Tone

Use the business user's perspective:

- "我每天需要判断哪些客户优先跟进。"
- "我可以直接问 Agent，也可以在后台查看规则。"
- "系统会暂停自动回复，并提醒负责人去对应应用处理。"

Avoid:

- "这是 mock 数据。"
- "这个 demo 暂时没有接后端。"
- "代码里写死了。"
- "本地服务、端口、选择器、脚本、测试。"

## Structure

Use this arc:

1. Role and scenario.
2. Main app action.
3. System result.
4. Risk/rule/audit proof when needed.
5. Config/admin view only when it proves control.
6. Business outcome.

## Wording Rules

- Prefer short clauses. Long subtitles cause visual/audio mismatch.
- Say what the user sees now. Do not narrate a future page before it appears.
- When a UI list/card is important, let the viewer inspect it for one extra beat.
- If both Agent and admin pages are shown, say "也可以在后台查看或调整", not "必须去后台确认".

## Review Checklist

Before voice generation:

- no "demo", "test", "mock", "local", "port", "selector"
- no internal implementation claims
- no unsupported product promises
- each paragraph maps to one scene or one coherent UI state
- risk, handoff, and human reply wording matches the page shown

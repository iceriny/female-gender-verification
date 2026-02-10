# Result 组件 (`src/components/Result.tsx`)

负责展示评估结果、置信度以及参考答案。

## 🎨 视觉展示
- **ConfidenceRing**: 一个 SVG 动画组件，通过 `stroke-dasharray` 实现圆环进度条动画，颜色根据置信度动态变化 (红 -> 黄 -> 绿)。
- **结果卡片**:
  - `pass`: 显示 "验证通过" 或 "验证未通过"。
  - `overallConfidence`: 百分比显示。
  - **Reasoning Content**: 如果开启了深度思考，会折叠展示模型的完整推理过程（Thinking Process）。

## 🔓 参考答案解锁
为了防止题目被轻易泄露或作弊，参考答案默认折叠。

- **鉴权机制**: 需要输入开发者密钥 (`verifyDevSecret`)。
- **逻辑**:
  1. 用户输入密钥。
  2. 调用 `utils.verifyDevSecret` (比对哈希)。
  3. 验证通过后，设置 `showReference` 为 `true`，渲染参考答案列表。

## 📊 数据展示
- 渲染 `referenceQA` 列表。
- 每题显示：题目 (Q)、参考答案 (A)、单题置信度条 (Progress Bar)。

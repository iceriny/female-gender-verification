# Quiz 组件 (`src/components/Quiz.tsx`)

`Quiz` 是整个应用最核心的交互组件，负责题目生成、答题交互、反作弊数据采集以及流程控制。

## 🧩 内部结构与状态

### 状态定义 (State)

| 状态名 | 类型 | 说明 |
|Ref|--- |---|
| `phase` | `'main' \| 'followup-loading' \| 'followup' \| 'submitting'` | 当前所处阶段（主题目/生成追问中/追问中/评估提交中） |
| `localAnswer` | `string` | 当前输入框的内容（防抖/暂存） |
| `direction` | `'next' \| 'prev'` | 动画切换方向 |
| `animKey` | `number` | 用于触发重渲染以执行动画的 Key |

### 关键 Refs

- `questionStartTime`: `useRef<number>`
    - 用于记录当前题目开始显示的时间戳，在切换题目时重置。
    - **交互**: 在 `handleNext` / `handlePrev` 时计算差值并调用 `store.updateTimeSpent`。
- `generatedRef`: `useRef<boolean>`
    - 防止 React 严格模式下的二次 Effect 执行导致重复生成题目。

## ⚡️ 核心方法与交互

### 1. 题目生成

在组件挂载时 (`useEffect`) 触发：

1. 调用 `generateQuestionsViaLLM(10)`。
2. 成功后调用 `store.updateQuestions` 更新 Store。
3. 失败则设置 `error` 状态，允许重试。

### 2. 计时器逻辑

```typescript
const resetTimer = useCallback(() => {
    questionStartTime.current = Date.now()
}, [])

const getElapsedSeconds = useCallback(() => {
    return Math.round((Date.now() - questionStartTime.current) / 1000)
}, [])
```

- **触发时机**: `useEffect` 监听 `currentQuestionIndex` 或 `phase` 变化时调用 `resetTimer`。
- **数据保存**: 在 `saveCurrentAnswer` 中调用 `getElapsedSeconds` 并写入 Store。

### 3. 反作弊监听

```typescript
useEffect(() => {
    const handler = () => {
        if (document.hidden) incrementTabSwitch()
    }
    document.addEventListener('visibilitychange', handler)
    // ... cleanup
}, [incrementTabSwitch])
```

直接与 `QuestionStore` 交互，增加切屏计数。

### 4. 流程控制 (Phase Transition)

<details>
<summary><strong>handleFirstRoundDone (第一轮结束)</strong></summary>

1. 保存最后一题答案。
2. 设置 `phase` 为 `'followup-loading'`。
3. 调用 `utils.generateFollowUpViaLLM`。
4. **分支逻辑**:
    - 成功获取追问 -> `store.setFollowUpQuestions` -> `phase` 设为 `'followup'`。
    - 获取失败/为空 -> 直接调用 `doFinalEvaluation` 进入评估。
      </details>

<details>
<summary><strong>doFinalEvaluation (最终评估)</strong></summary>

1. 设置 `phase` 为 `'submitting'`。
2. 调用 `utils.evaluateAnswersViaLLM`，此时会把 `questions` (含 `timeSpent`)、`followUpQuestions` 和 `tabSwitchCount` 一并打包发给 LLM。
3. 成功后调用父组件传递的 `onDone` 回调。
 </details>

## 🎨 UI 细节

- **动画**: 使用 CSS Animation (`slideInRight`/`slideInLeft`) 实现丝滑的题目切换。
- **追问标识**: 在 `followup` 阶段，顶部会显示琥珀色的 Badge 提示用户当前处于追问环节。
- **进度条**: 动态计算，在追问阶段保持 100% 或特定样式。

# 状态管理 (Zustand Stores)

项目使用 Zustand 进行全局状态管理，主要分为题目状态 (`QuestionStore`) 和 LLM 状态 (`LLMStore`)。

## 📝 QuestionStore (`src/store/questionStore.ts`)

管理答题过程中的所有数据，包括题目、答案、进度和反作弊信号。

### 核心 State

```typescript
interface QuestionStore {
    questions: Question[]
    currentQuestionIndex: number
    
    // 反作弊数据
    tabSwitchCount: number      // 页面切换次数
    
    // 追问阶段
    followUpQuestions: FollowUpQuestion[]
    followUpIndex: number
    
    // 结果
    confidence: number
    passTheTest: boolean
}
```

### 核心 Question 结构
```typescript
interface Question {
    id: number
    question: string
    answer: string      // 用户回答
    confidence: number  // 单题置信度
    timeSpent?: number  // 答题耗时(秒) - 关键反作弊数据
}
```

### 交互方法
- `updateQuestions`: 初始化题目。
- `updateAnswer`: 更新用户答案。
- `updateTimeSpent`: 更新单题耗时。
- `incrementTabSwitch`: 页面可见性变化时调用。
- `reset`: 重置所有状态（用于重新开始）。

---

## 🤖 LLMStore (`src/store/LLMStore.ts`)

负责与 SiliconFlow / OpenRouter 的底层交互，并统一处理流式状态。

### 核心 State

```typescript
interface LLMStore {
    provider: 'siliconflow' | 'openrouter'
    apiKey: string
    apiModel: string
    llmModelList: string[]
    
    // 深度思考配置
    enableThinking: boolean
    thinkingBudget: number
    
    // 流式状态
    streamingText: string       // 当前生成的文本内容
    streamingReasoning: string  // 当前生成的思考过程
    streamingPhase: string      // 当前阶段 (如 "生成题目", "评估答案")
}
```

### 核心方法 `request`

这是一个通用的 LLM 请求封装器：
1. **提供商分流**: 根据 `provider` 选择 SiliconFlow（OpenAI 兼容接口）或 OpenRouter（`@openrouter/sdk` 的 `callModel`）。
2. **参数组装**: 将 `messages`, `jsonMode`, `enable_thinking` 等参数组装成请求参数。
3. **调试模式**: 如果 `__DEBUG__` 为真，开启流式显示。
4. **流式解析 (`parseSSEStream`)**:
   - 处理 `text/event-stream` 响应。
   - 实时解析 `delta.content` 和 `delta.reasoning_content`。
   - 实时更新 `streamingText` 和 `streamingReasoning` 状态，以便 UI (`DebugStreamPanel`) 实时渲染。
5. **JSON 修复**: 流式结束后，尝试将累积文本解析为 JSON 对象返回。

# 核心逻辑实现

本章节详细解析 `src/utils/` 下的核心模块，包括 LLM 交互逻辑、安全加密以及数据结构处理。

## 🧠 LLM Handlers (`src/utils/llmHandlers.ts`)

这是连接 Store 和 API 的中间层，负责 Prompt 组装和响应解析。其底层请求由 `LLMStore.request` 提供，可切换 SiliconFlow 或 OpenRouter。

### 1. 题目生成 (`generateQuestionsViaLLM`)

- **Input**: 数量 `count` (默认10)。
- **Prompt**: 组合 `jsonModePrefix` + `PROMPT_GENERATE`。
- **Output**: `Question[]`。
- **解析策略**:
  - 优先尝试直接 `JSON.parse`。
  - 如果失败（常见于模型输出了 Markdown 代码块），使用 `safeJsonParse` 正则提取 ````json ... ```` 中的内容。
  - 再次校验结构 (`ensureStructured`)，确保字段完整。

### 2. 追问生成 (`generateFollowUpViaLLM`)

- **Input**: 完整的 `Question[]` (含用户答案)。
- **Prompt**: `jsonModePrefixFollowUp` + `PROMPT_FOLLOWUP` + 用户第一轮 QA。
- **Output**: `FollowUpQuestion[]` (2-3道)。
- **逻辑**: 要求 LLM 基于用户的具体回答（而非题目本身）设计追问，以测试真实性。

### 3. 答案评估 (`evaluateAnswersViaLLM`)

这是最复杂的逻辑，需要组装包含行为数据的 Context。

**Context 组装顺序**:
1. System Prompt (`PROMPT_EVALUATE` - 含反作弊指令)。
2. 用户第一轮 QA (User Content)。
3. **行为数据**: `答题期间页面切换次数 = X`。
4. **耗时数据**: 每个 QA 对象中附带 `timeSpent`。
5. **追问数据**: 如果有追问环节，附带追问的 QA 和耗时。

**Prompt 策略**:
- 明确要求 LLM 结合回答内容和行为数据进行判断。
- 例如：如果检测到 `timeSpent < 5s` 且回答完美，Prompt 指令会引导模型判定为 "低置信度"。

## 🔐 密钥安全 (`src/utils/secret.ts`)

为了在纯前端项目中安全地分发 API Key，我们使用 **PBKDF2 + AES-256-GCM** 方案。

### 加密流程 (Build Time - `vite.config.ts`)
1. 读取环境变量 `VITE_DEV_SECRET` 和 `VITE_LLM_API_KEY`。
2. 生成随机 `Salt` (16B) 和 `IV` (12B)。
3. **PBKDF2**: 使用 Secret + Salt 迭代 100,000 次，生成 32字节 (256-bit) 密钥。
4. **AES-GCM**: 使用生成的密钥和 IV 加密 API Key，生成密文 + Auth Tag。
5. 将 `Ciphertext`, `Salt`, `IV` 注入到全局常量 (`__ENCRYPTED_LLM_KEY__` 等)。

### 解密流程 (Runtime - `secret.ts`)
1. 用户输入 `devSecret`。
2. 前端使用 `window.crypto.subtle` API 重复上述 PBKDF2 过程，派生解密密钥。
3. 使用 AES-GCM 解密注入的密文。
4. **安全性**: GCM 模式包含完整性校验，如果密钥错误，解密会直接抛出异常，而不是输出乱码，从而可以精确提示用户"密钥错误"。

## 🛠️ 调试工具 (`src/utils/debug.ts`)

- 封装了 `console.log`, `console.group`, `console.time` 等。
- **Tree-shaking**: 通过 `__DEBUG__` 常量控制。在生产环境 (`npm run build`)，这些函数调用会被死代码消除 (Dead Code Elimination) 移除，零运行时开销。

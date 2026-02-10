# Agreement 组件 (`src/components/Agreement.tsx`)

应用的入口组件，负责展示用户协议、选择 AI 提供商、收集 API Key 以及配置模型参数。

## 🔑 核心功能：API Key 管理

### 1. 本地存储 (LocalStorage)
- 组件挂载时恢复 `llm_provider`，并读取对应提供商的 Key：
  - `sf_api_key`（硅基流动）
  - `or_api_key`（OpenRouter）
- 用户手动输入 Key 并在失去焦点 (`onBlur`) 时，触发 `setLlmModelList` 拉取模型列表，并写入当前提供商的本地存储。

### 2. 提供商切换
- 支持在 `SiliconFlow / OpenRouter` 之间切换。
- 切换后自动恢复该提供商之前保存的 Key 与模型，并重新拉取模型列表。

### 3. 内置密钥解锁 (Built-in Key Unlock)
这是一个安全相关的核心交互，利用 `src/utils/secret.ts` 实现。

- **UI**: 当检测到构建产物中包含当前提供商的加密 Key (`hasBuiltinApiKey(provider)`) 时，显示"解锁内置 API Key"链接。
- **交互**:
  1. 用户输入开发者密钥 (Dev Secret)。
  2. 点击解锁，调用 `decryptBuiltinApiKey(secret, provider)`。
  3. **PBKDF2 + AES-GCM** 解密过程在前端执行。
  4. 解密成功后，`isBuiltinKey` 状态置为 `true`，输入框变为只读并显示绿色状态。
  5. 自动使用解密出的 Key 拉取模型列表。

## ⚙️ 模型配置
- **模型列表**: 过滤掉非 Chat 类模型（如 SDXL, Whisper 等）。
- **深度思考 (Enable Thinking)**:
  - 提供 `enable_thinking` 开关。
  - 提供 `thinking_budget` 滑块 (1024 - 32768 tokens)。
  - 当模型不支持 thinking 时显示软提示 (Soft Warning)，但不强制禁用（允许用户尝试）。

# 女性社区真实性别验证 (Female Gender Verification)

这是一个纯前端的 AI 驱动性别验证系统，旨在通过大模型生成具有"体感"和"隐晦性"的测试题目，验证用户是否拥有真实的女性生理与生活体验。

主要用于女性社区的准入验证，防止男性用户通过搜索引擎或简单的 AI 辅助混入。

## ✨ 核心特性

- **大模型动态出题**：支持 SiliconFlow (硅基流动) 与 OpenRouter 两种 AI 提供商，每次生成不同的 10 道题目。
- **体验导向设计**：题目设计原则为"只有亲身经历过才知道的细节"，避免可搜索的知识性问题。
- **追问验证机制**：首轮回答后，AI 会选取 2-3 题进行追问，基于用户的具体回答挖掘细节，防止编造。
- **多维反作弊系统**：
  - **隐性计时**：记录每题答题耗时，作为 AI 评估的参考信号（过快可能为粘贴）。
  - **切屏检测**：记录答题期间页面切换次数，识别查阅资料行为。
  - **AI 风格识别**：Prompt 层面识别 ChatGPT 等 AI 生成的"完美但无体感"的回答。
- **内敛美学设计**：采用 Rose/White 配色，提供舒适、不张扬的视觉体验，配合丝滑的动画效果。
- **纯前端架构**：无后端服务，通过加密方式在构建产物中内嵌 API Key（需开发者密钥解锁）。

## 🛠️ 技术栈

- **框架**: React 19 + TypeScript + Vite
- **样式**: Tailwind CSS v4
- **状态管理**: Zustand
- **AI 接入**: SiliconFlow API + OpenRouter TypeScript SDK (`callModel`)
- **部署**: GitHub Pages (自动工作流)

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env`：

```bash
cp .env.example .env
```

配置以下变量：
- `VITE_DEV_SECRET`: 开发者密钥（用于解锁参考答案或内置 API Key）
- `VITE_DEV_SECRET_SALT`: 密钥盐值
- `VITE_LLM_API_KEY`: (可选) 内置的 SiliconFlow API Key
- `VITE_OPENROUTER_API_KEY`: (可选) 内置的 OpenRouter API Key

### 3. 开发环境运行

```bash
npm run dev
```
访问 `http://localhost:5173`。开发环境下默认开启 Debug 模式，可查看 LLM 实时流式输出。

### 4. 构建部署

```bash
npm run build
```

## 🔒 安全机制

### 内置 API Key 加密
为了方便部署且防止 API Key 泄露，本项目采用 **PBKDF2 + AES-256-GCM** 加密方案：
1. **构建时**：利用 `VITE_DEV_SECRET` 派生密钥，加密 `VITE_LLM_API_KEY` / `VITE_OPENROUTER_API_KEY`。
2. **产物中**：只包含加密后的密文、Salt 和 IV。
3. **运行时**：用户输入正确的开发者密钥后，在浏览器端解密并使用。

### 反作弊策略详情
- **时间信号**：如果某题回答字数较多但耗时极短 (<5s)，AI 会大幅降低该题置信度。
- **追问陷阱**：AI 会针对用户回答中的细节（如"你说内衣钢圈戳腋下，后来怎么解决的？"）进行追问，AI 代答通常难以在追问中保持细节一致性。
- **Prompt 防御**：系统提示词明确要求 AI 识别"书面化、条理过分清晰、缺乏情绪"的 AI 风格回答。

## 🤝 贡献

欢迎提交 Issue 或 Pull Request 改进题目生成逻辑或交互体验。

## 📄 License

MIT License

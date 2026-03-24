# Astro + Directus 博客项目

[English](./README.md)

这是一个基于 Astro SSR 和 Directus 的博客模板仓库，包含：

- 使用 `@astrojs/node` 渲染的 Astro 前台
- 基于 SQLite 的 Directus CMS 服务
- `posts` 集合和公开仪表盘的初始化脚本
- 基于 JSON 的文章导入脚本
- 一个可选的、兼容 OpenAI API 的 AI 对话组件

## 功能特性

- Astro 6 服务端渲染博客前台
- Directus 11 内容管理后台
- 使用 Docker Compose 进行本地或单机部署
- 支持 Markdown 正文和 KaTeX 数学公式
- 自动生成 RSS 与 Sitemap
- 可选的 Directus 仪表盘前台映射页面
- 可选的 AI 对话组件，基于最近文章上下文回答问题

## 技术栈

- Astro
- TypeScript
- Directus
- Docker Compose
- SQLite
- KaTeX
- Marked

## 项目结构

```text
.
├── content/posts/                  # 可版本化的 JSON 文章源文件
├── scripts/                        # 初始化与导入脚本
├── site/                           # Astro 应用
│   ├── src/pages/                  # 页面路由与 API 路由
│   ├── src/components/             # 通用组件
│   ├── src/lib/                    # CMS 与仪表盘数据访问层
│   └── public/                     # 静态资源
├── docker-compose.yml              # 本地/单机部署编排
├── .env.template                   # 脱敏后的环境变量模板
└── README.md                       # 英文文档
```

## 架构说明

整套系统由两个主要服务组成：

- `cms`：Directus 服务，容器内端口 `8055`，映射到宿主机 `DIRECTUS_PORT`
- `blog`：Astro SSR 服务，容器内端口 `4321`，映射到宿主机 `ASTRO_PORT`

前台主要通过以下方式访问 Directus：

- 博客页面通过公开读取权限拉取 `posts` 集合内容
- 仪表盘页面通过管理权限读取 dashboard/panel 配置后渲染公开页面

此外，仓库还提供了将 `content/posts/` 下 JSON 文件同步到 Directus 的脚本，便于“版本化内容源 + CMS 发布”的混合工作流。

## 部署前准备

在本地部署前，请确保具备：

- Docker 与 Docker Compose
- 如果需要脱离 Docker 运行 Astro，本机需安装 Node.js `>= 22.12.0`
- `jq`、`curl`、`awk` 可用于执行脚本

## 推荐阅读与最小部署路径

如果你是第一次阅读这个仓库，建议按下面的最短路径操作：

1. 从 `.env.template` 复制出 `.env`
2. 使用 Docker Compose 启动服务栈
3. 执行 `./scripts/bootstrap_directus.sh`
4. 登录 Directus，确认 `posts` 集合已经创建
5. 如果你希望立刻看到博客内容，再导入示例 JSON 文章
6. 等博客和 CMS 主流程确认正常后，再继续配置 AI 功能

## 快速开始

1. 从模板生成本地环境文件：

```bash
cp .env.template .env
```

2. 按你的环境修改 `.env`。

3. 启动服务栈：

```bash
docker compose up -d --build
```

4. 初始化 Directus 结构：

```bash
./scripts/bootstrap_directus.sh
```

5. 如果需要，导入版本化文章：

```bash
./scripts/import_posts.sh
```

6. 打开服务：

- 博客：`http://127.0.0.1:<ASTRO_PORT>`
- Directus 后台：`http://127.0.0.1:<DIRECTUS_PORT>/admin`

## 部署完成后你应该看到什么

首次部署成功后，通常应满足以下状态：

- 博客首页可以正常打开，没有服务端错误
- `/admin` 后台可访问
- 执行 `./scripts/bootstrap_directus.sh` 后，Directus 中能看到 `posts` 集合
- 导入或手动创建的文章会出现在博客列表页
- 如果还没配置 AI，首页的 AI 组件会显示但保持禁用状态

## 环境变量说明

请从 `.env.template` 复制并按需填写：

| 变量名 | 必填 | 说明 |
| --- | --- | --- |
| `DIRECTUS_KEY` | 是 | Directus 应用密钥 |
| `DIRECTUS_SECRET` | 是 | Directus 应用密钥对应的 secret |
| `DIRECTUS_ADMIN_EMAIL` | 是 | 初始 Directus 管理员邮箱 |
| `DIRECTUS_ADMIN_PASSWORD` | 是 | 初始 Directus 管理员密码 |
| `DIRECTUS_PORT` | 是 | 宿主机映射到 Directus 的端口 |
| `ASTRO_PORT` | 是 | 宿主机映射到 Astro 的端口 |
| `SITE_URL` | 是 | 站点公开地址，用于 canonical、sitemap 等 |
| `CMS_URL` | 是 | Directus 的公开访问地址 |
| `ABOUT_GITHUB_URL` | 否 | 关于页中展示的 GitHub 链接 |
| `ABOUT_CONTACT_EMAIL` | 否 | 关于页中展示的公开联系邮箱 |
| `AI_API_KEY` | 否 | 启用 AI 对话所需的 API Key |
| `AI_MODEL` | 否 | 优先使用的模型，默认 `grok` |
| `AI_API_BASE_URL` | 否 | 兼容 OpenAI 的 API 基础地址 |
| `AI_SYSTEM_PROMPT` | 否 | 自定义 AI 系统提示词 |

## 首次初始化流程

首次启动容器后，建议按这个顺序操作：

1. 执行 Directus 初始化脚本：

```bash
./scripts/bootstrap_directus.sh
```

2. 使用以下凭据登录 Directus：

- `DIRECTUS_ADMIN_EMAIL`
- `DIRECTUS_ADMIN_PASSWORD`

3. 首次登录后立即修改管理员密码。

4. 如果你需要前台公开仪表盘，可继续执行：

```bash
./scripts/bootstrap_insights_dashboard.sh
```

## 内容管理方式

这个项目支持两种内容管理方式。

### 1. 直接在 Directus 中维护文章

在 Directus 后台使用 `posts` 集合创建和编辑文章。

### 2. 使用 JSON 文件版本化文章，再同步到 Directus

示例源文件：

- `content/posts/what-is-p-value.json`

导入单篇文章：

```bash
./scripts/upsert_post.sh content/posts/what-is-p-value.json
```

导入全部版本化文章：

```bash
./scripts/import_posts.sh
```

这两个脚本都是幂等的：如果 `slug` 已存在，则会执行更新而不是重复创建。

## AI 对话配置

首页可以显示一个 AI 对话组件，使用最近公开文章作为上下文。

如需启用，请在 `.env` 中设置：

```bash
AI_API_KEY=your_api_key
AI_MODEL=grok
AI_API_BASE_URL=https://api.example.com/v1
AI_SYSTEM_PROMPT=
```

行为说明：

- 如果服务商支持 `/models`，系统会优先尝试解析可用模型
- AI 路由位于 `site/src/pages/api/ai-chat.ts`
- 如果未配置 `AI_API_KEY`，前端组件会保持禁用状态
- 修改 AI 相关环境变量后，需要你手动重启或重建 `blog` 服务

## 常用命令

启动完整服务栈：

```bash
docker compose up -d --build
```

查看服务状态：

```bash
docker compose ps
```

查看 CMS 日志：

```bash
docker compose logs -f cms
```

查看博客日志：

```bash
docker compose logs -f blog
```

停止服务栈：

```bash
docker compose down
```

在 `site/` 目录本地运行 Astro：

```bash
npm install
npm run dev
```

在 `site/` 目录执行构建：

```bash
npm run build
```

## 部署说明

- 这个仓库适用于本地开发、单机部署，或作为进一步容器编排的基础
- 对公网部署时，必须正确设置 `SITE_URL` 和 `CMS_URL`
- 出于公开仓库隐私隔离考虑，`k8s/` 目录不会纳入版本控制
- Docker Compose 使用具名卷保存 Directus 数据库和上传文件

## 常见问题

### Directus 无法登录

请检查：

- `.env` 是否存在且管理员凭据正确
- `cms` 容器是否正常启动
- 是否已经执行过 `./scripts/bootstrap_directus.sh`

### 博客无法读取 CMS 内容

请检查：

- `CMS_URL` 是否为正确的公开访问地址
- Docker 内部的 `DIRECTUS_API_URL` 是否保持为 `http://cms:8055`
- `posts` 集合是否存在且已开放公开读权限

### AI 对话不可用

请检查：

- `AI_API_KEY` 是否已设置
- `AI_API_BASE_URL` 是否能从容器内访问
- 所选服务商是否提供兼容的 `chat/completions` 接口

## 给使用者的说明

- 这个公开仓库已经做过脱敏处理
- 你需要自行提供域名、管理员凭据、联系方式以及 AI 服务配置

## License

当前仓库还没有附带 License 文件。如需进一步公开分发，建议补充明确的许可证。

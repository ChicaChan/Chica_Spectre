# Astro + Directus Blog

[中文说明](./README.zh-CN.md)

An Astro SSR blog starter backed by Directus as a headless CMS. This repository includes:

- An Astro site rendered with `@astrojs/node`
- A Directus CMS service running with SQLite
- Bootstrap scripts for the `posts` collection and a public dashboard
- JSON-based content import helpers
- An optional AI chat widget powered by an OpenAI-compatible API

## Features

- Astro 6 server-rendered blog frontend
- Directus 11 content management backend
- Docker Compose setup for local and self-hosted deployment
- Markdown blog rendering with KaTeX math support
- RSS feed and sitemap generation
- Optional public dashboard rendered from Directus panels
- Optional AI chat widget using recent blog posts as context

## Tech Stack

- Astro
- TypeScript
- Directus
- Docker Compose
- SQLite
- KaTeX
- Marked

## Project Structure

```text
.
├── content/posts/                  # Versioned JSON post sources for import
├── scripts/                        # Bootstrap and import scripts
├── site/                           # Astro application
│   ├── src/pages/                  # Routes and API endpoints
│   ├── src/components/             # Shared Astro components
│   ├── src/lib/                    # CMS and dashboard data access
│   └── public/                     # Static assets
├── docker-compose.yml              # Local/self-hosted runtime stack
├── .env.template                   # Sanitized environment template
└── README.zh-CN.md                 # Chinese documentation
```

## Architecture Overview

The stack runs two services:

- `cms`: Directus exposed on `8055` inside the container and mapped to `DIRECTUS_PORT`
- `blog`: Astro SSR application exposed on `4321` inside the container and mapped to `ASTRO_PORT`

The Astro frontend fetches published content from Directus through:

- public item access for blog pages
- admin-authenticated access for dashboard rendering

The repository also includes import scripts so you can version JSON post sources under `content/posts/` and sync them into Directus.

## Prerequisites

Before deploying locally, make sure you have:

- Docker and Docker Compose
- Node.js `>= 22.12.0` if you want to run the Astro app outside Docker
- `jq`, `curl`, and `awk` available for the helper scripts

## Recommended Path

If you are reading this repository for the first time, the shortest path is:

1. Copy `.env.template` to `.env`
2. Start the stack with Docker Compose
3. Run `./scripts/bootstrap_directus.sh`
4. Log in to Directus and verify the `posts` collection exists
5. Import sample JSON posts if you want visible blog content immediately
6. Revisit the AI section only after the base blog and CMS flow works

## Quick Start

1. Create a local environment file:

```bash
cp .env.template .env
```

2. Edit `.env` with your own values.

3. Start the stack:

```bash
docker compose up -d --build
```

4. Bootstrap the Directus schema:

```bash
./scripts/bootstrap_directus.sh
```

5. Import the sample JSON posts if needed:

```bash
./scripts/import_posts.sh
```

6. Open the services:

- Blog: `http://127.0.0.1:<ASTRO_PORT>`
- Directus Admin: `http://127.0.0.1:<DIRECTUS_PORT>/admin`

## What You Should See

After a successful first-time setup:

- the blog homepage loads without a server error
- the Directus admin page is reachable at `/admin`
- the `posts` collection exists in Directus after running `./scripts/bootstrap_directus.sh`
- imported or manually created posts appear in the blog listing page
- if AI is not configured yet, the AI widget remains visible but disabled

## Environment Variables

Copy from `.env.template` and customize the values below.

| Variable | Required | Description |
| --- | --- | --- |
| `DIRECTUS_KEY` | Yes | Directus application key |
| `DIRECTUS_SECRET` | Yes | Directus application secret |
| `DIRECTUS_ADMIN_EMAIL` | Yes | Initial Directus admin login |
| `DIRECTUS_ADMIN_PASSWORD` | Yes | Initial Directus admin password |
| `DIRECTUS_PORT` | Yes | Host port mapped to Directus |
| `ASTRO_PORT` | Yes | Host port mapped to Astro |
| `SITE_URL` | Yes | Public site URL used by Astro for canonical URLs and sitemap |
| `CMS_URL` | Yes | Public Directus URL used by the frontend and Directus itself |
| `ABOUT_GITHUB_URL` | No | Public GitHub URL shown on the about page |
| `ABOUT_CONTACT_EMAIL` | No | Public contact email shown on the about page |
| `AI_API_KEY` | No | API key for the optional AI chat provider |
| `AI_MODEL` | No | Preferred AI model, defaults to `grok` |
| `AI_API_BASE_URL` | No | OpenAI-compatible API base URL |
| `AI_SYSTEM_PROMPT` | No | Optional custom system prompt for the AI chat route |

## First-Time Initialization

After the first container startup:

1. Run the Directus bootstrap script:

```bash
./scripts/bootstrap_directus.sh
```

2. Log in to Directus using:

- `DIRECTUS_ADMIN_EMAIL`
- `DIRECTUS_ADMIN_PASSWORD`

3. Change the admin password immediately after first login.

4. Optionally create the public dashboard structure:

```bash
./scripts/bootstrap_insights_dashboard.sh
```

## Content Management

This project supports two content flows:

### 1. Manage content directly in Directus

Use the `posts` collection in Directus to create and edit articles.

### 2. Version content as JSON and sync it into Directus

Example source file:

- `content/posts/what-is-p-value.json`

Import one post:

```bash
./scripts/upsert_post.sh content/posts/what-is-p-value.json
```

Import all versioned posts:

```bash
./scripts/import_posts.sh
```

Both scripts are idempotent and update by `slug` when the record already exists.

## AI Chat Configuration

The homepage can render an AI chat widget that uses recent public posts as context.

Set these variables in `.env` to enable it:

```bash
AI_API_KEY=your_api_key
AI_MODEL=grok
AI_API_BASE_URL=https://api.example.com/v1
AI_SYSTEM_PROMPT=
```

Behavior notes:

- The route tries to resolve a usable model from `/models` when supported by the provider
- The default AI route is `site/src/pages/api/ai-chat.ts`
- If `AI_API_KEY` is missing, the UI stays disabled
- Restart or recreate the `blog` service after changing AI-related environment variables

## Common Commands

Start the full stack:

```bash
docker compose up -d --build
```

View container status:

```bash
docker compose ps
```

View CMS logs:

```bash
docker compose logs -f cms
```

View blog logs:

```bash
docker compose logs -f blog
```

Stop the stack:

```bash
docker compose down
```

Run Astro locally from `site/`:

```bash
npm install
npm run dev
```

Build Astro locally from `site/`:

```bash
npm run build
```

## Deployment Notes

- This repository is suitable for local deployment, a single server, or further container orchestration
- Public deployment requires a valid `SITE_URL` and `CMS_URL`
- The `k8s/` directory is intentionally excluded from version control in this public repository
- The included Docker Compose stack uses named volumes for Directus database and uploads persistence

## Troubleshooting

### Directus login fails

Check:

- `.env` exists and contains valid admin credentials
- the `cms` container is healthy
- you ran `./scripts/bootstrap_directus.sh` after startup

### Blog cannot load CMS content

Check:

- `CMS_URL` is correct for public access
- `DIRECTUS_API_URL` inside Docker resolves to `http://cms:8055`
- the `posts` collection exists and has public read permissions

### AI chat is unavailable

Check:

- `AI_API_KEY` is set
- `AI_API_BASE_URL` is reachable from the container
- the configured provider exposes a compatible `chat/completions` API

## Notes for Readers

- This repository is sanitized for public sharing
- You are expected to provide your own domain, credentials, contact information, and AI provider configuration

## License

No license file is included yet. Add one before wider redistribution if needed.

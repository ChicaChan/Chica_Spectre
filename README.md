# Astro + Directus Blog

This stack deploys:
- `Astro` blog site (SSR): `http://<server-ip>:4321`
- `Directus` Headless CMS: `http://<server-ip>:1337/admin`

## Environment Setup

Create your local environment file from the template before starting the stack:

```bash
cp .env.template .env
```

Then update at least these values in `.env`:

- `DIRECTUS_KEY`
- `DIRECTUS_SECRET`
- `DIRECTUS_ADMIN_EMAIL`
- `DIRECTUS_ADMIN_PASSWORD`
- `SITE_URL`
- `CMS_URL`
- `ABOUT_GITHUB_URL`
- `ABOUT_CONTACT_EMAIL`

Notes:

- `.env` is intentionally ignored and should not be committed
- `.env.template` only contains sanitized placeholders for repository sharing

## Stack Commands

From `/home/ubuntu/astro-headless-blog`:

```bash
sudo docker compose up -d --build
sudo docker compose ps
sudo docker compose logs -f cms
sudo docker compose logs -f blog
sudo docker compose down
```

After first startup, run CMS bootstrap (idempotent):

```bash
./scripts/bootstrap_directus.sh
```

## Add Or Update Blog Posts

Posts are stored in Directus, while the source content can be versioned under `content/posts/*.json`.

Create or update a single post:

```bash
./scripts/upsert_post.sh content/posts/what-is-p-value.json
```

Import every versioned post into Directus:

```bash
./scripts/import_posts.sh
```

Both scripts are idempotent: if a `slug` already exists, the post is updated instead of duplicated.

## Initial CMS Login

Credentials are in `.env`:

- `DIRECTUS_ADMIN_EMAIL`
- `DIRECTUS_ADMIN_PASSWORD`

After first login, change password immediately.

## Optional AI Chat

The homepage now includes an AI chat widget. It uses the latest public posts from Directus as context and calls an OpenAI-compatible `chat/completions` endpoint.

Add these variables to `.env` if you want to enable it:

```bash
AI_API_KEY=your_api_key
AI_MODEL=grok
AI_API_BASE_URL=https://api.example.com/v1
AI_SYSTEM_PROMPT=
```

Notes:

- `AI_API_BASE_URL` defaults to `https://api.example.com/v1`
- `AI_MODEL` defaults to `grok`
- if the provider supports `/models`, the server will try to match `grok` first, then fall back to another returned model
- `AI_SYSTEM_PROMPT` is optional and overrides the default blog assistant prompt
- after editing `.env`, recreate or restart the `blog` service so the container receives the new variables

## Create Blog Collection (Directus)
`./scripts/bootstrap_directus.sh` already does all of this:

- Creates collection `posts`
- Creates fields: `slug`, `title`, `excerpt`, `content`, `published_at`
- Enables public app access policy
- Grants public `read` permission on `posts`
- Creates one sample post (`hello-astro-directus`)

## Port Notes

- CMS: `1337 -> 8055`
- Blog: `4321 -> 4321`

Port `80/443` on this server is already occupied by existing k3s ingress.

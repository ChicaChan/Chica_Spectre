import type { APIRoute } from 'astro';

import { SITE_TITLE } from '../../consts';
import { listPosts } from '../../lib/cms';

const DEFAULT_AI_BASE_URL = 'https://api.example.com/v1';
const DEFAULT_AI_MODEL = 'grok';
const MAX_HISTORY_ITEMS = 8;
const MAX_MESSAGE_LENGTH = 1200;
const MODEL_CACHE_TTL_MS = 5 * 60 * 1000;

type ChatRole = 'system' | 'user' | 'assistant';

type ChatMessage = {
	role: ChatRole;
	content: string;
};

type ChatRequestBody = {
	history?: unknown;
	model?: unknown;
};

type UpstreamResponse = {
	choices?: Array<{
		message?: {
			content?: unknown;
		};
	}>;
	error?: {
		message?: string;
	};
};

type ModelListResponse = {
	data?: Array<{
		id?: unknown;
	}>;
};

const modelCache = new Map<string, { expiresAt: number; models: string[] }>();

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
		},
	});
}

function sanitizeHistory(input: unknown): ChatMessage[] {
	if (!Array.isArray(input)) return [];

	return input
		.map((item) => {
			if (!item || typeof item !== 'object') return null;

			const role = 'role' in item ? item.role : null;
			const content = 'content' in item ? item.content : null;

			if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') {
				return null;
			}

			const safeContent = content.trim().slice(0, MAX_MESSAGE_LENGTH);
			if (!safeContent) return null;

			return {
				role,
				content: safeContent,
			} satisfies ChatMessage;
		})
		.filter((item): item is ChatMessage => item !== null)
		.slice(-MAX_HISTORY_ITEMS);
}

function getAiConfig() {
	const apiKey = (process.env.AI_API_KEY ?? '').trim();
	const model = (process.env.AI_MODEL ?? '').trim();
	const baseUrl = (process.env.AI_API_BASE_URL ?? DEFAULT_AI_BASE_URL).trim().replace(/\/$/, '');
	const customSystemPrompt = (process.env.AI_SYSTEM_PROMPT ?? '').trim();

	return {
		apiKey,
		model,
		baseUrl,
		customSystemPrompt,
		isConfigured: Boolean(apiKey),
	};
}

function sanitizeModel(input: unknown) {
	if (typeof input !== 'string') return '';
	return input.trim().slice(0, 120);
}

function pickModel(preferredModel: string, availableModels: string[]) {
	if (availableModels.length === 0) {
		return preferredModel || DEFAULT_AI_MODEL;
	}

	if (availableModels.includes(preferredModel)) {
		return preferredModel;
	}

	const grokModel = availableModels.find((model) => model.toLowerCase() === DEFAULT_AI_MODEL);
	if (grokModel) {
		return grokModel;
	}

	const grokVariant = availableModels.find((model) => model.toLowerCase().includes(DEFAULT_AI_MODEL));
	if (grokVariant) {
		return grokVariant;
	}

	return availableModels[0];
}

async function listAvailableModels(baseUrl: string, apiKey: string) {
	const cacheKey = `${baseUrl}::${apiKey}`;
	const cached = modelCache.get(cacheKey);

	if (cached && cached.expiresAt > Date.now()) {
		return cached.models;
	}

	try {
		const response = await fetch(`${baseUrl}/models`, {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${apiKey}`,
			},
			signal: AbortSignal.timeout(10000),
		});

		if (!response.ok) {
			return [];
		}

		const payload = (await response.json()) as ModelListResponse;
		const models =
			payload.data
				?.map((item) => (typeof item.id === 'string' ? item.id.trim() : ''))
				.filter((item) => item.length > 0) ?? [];

		modelCache.set(cacheKey, {
			expiresAt: Date.now() + MODEL_CACHE_TTL_MS,
			models,
		});

		return models;
	} catch {
		return [];
	}
}

async function resolveModel(baseUrl: string, apiKey: string, configuredModel: string) {
	const preferredModel = configuredModel || DEFAULT_AI_MODEL;
	const availableModels = await listAvailableModels(baseUrl, apiKey);
	return pickModel(preferredModel, availableModels);
}

export const GET: APIRoute = async () => {
	const { apiKey, model, baseUrl, isConfigured } = getAiConfig();
	const defaultModel = model || DEFAULT_AI_MODEL;

	if (!isConfigured) {
		return json({
			configured: false,
			defaultModel,
			resolvedModel: defaultModel,
			models: [defaultModel],
		});
	}

	const models = await listAvailableModels(baseUrl, apiKey);
	const resolvedModel = pickModel(defaultModel, models);

	return json({
		configured: true,
		defaultModel,
		resolvedModel,
		models,
	});
};

async function buildBlogContext() {
	const posts = await listPosts(5);

	if (posts.length === 0) {
		return '当前没有可参考的公开文章。';
	}

	return posts
		.map((post, index) => {
			const parts = [
				`${index + 1}. ${post.title}`,
				`slug: ${post.slug}`,
			];

			if (post.published_at) {
				parts.push(`发布时间: ${post.published_at}`);
			}

			if (post.excerpt) {
				parts.push(`摘要: ${post.excerpt}`);
			}

			return parts.join(' | ');
		})
		.join('\n');
}

function extractTextContent(content: unknown): string {
	if (typeof content === 'string') {
		return content.trim();
	}

	if (!Array.isArray(content)) {
		return '';
	}

	return content
		.map((part) => {
			if (typeof part === 'string') {
				return part;
			}

			if (!part || typeof part !== 'object') {
				return '';
			}

			if ('text' in part && typeof part.text === 'string') {
				return part.text;
			}

			if (
				'text' in part &&
				part.text &&
				typeof part.text === 'object' &&
				'value' in part.text &&
				typeof part.text.value === 'string'
			) {
				return part.text.value;
			}

			return '';
		})
		.join('\n')
		.trim();
}

export const POST: APIRoute = async ({ request }) => {
	const { apiKey, model, baseUrl, customSystemPrompt, isConfigured } = getAiConfig();

	if (!isConfigured) {
		return json({ error: 'AI 服务未配置，请先设置 AI_API_KEY。' }, 503);
	}

	let body: ChatRequestBody;
	try {
		body = (await request.json()) as ChatRequestBody;
	} catch {
		return json({ error: '请求体必须是合法的 JSON。' }, 400);
	}

	const history = sanitizeHistory(body.history);
	const requestedModel = sanitizeModel(body.model);
	if (history.length === 0) {
		return json({ error: '消息不能为空。' }, 400);
	}

	const lastMessage = history[history.length - 1];
	if (!lastMessage || lastMessage.role !== 'user') {
		return json({ error: '最后一条消息必须来自用户。' }, 400);
	}

	const defaultSystemPrompt = [
		`你是 ${SITE_TITLE} 的站点助手。`,
		'请使用简体中文回答，保持简洁、准确。',
		'优先依据给定的博客上下文回答，不要编造不存在的文章、链接或作者经历。',
		'如果上下文不足，请明确说明，再给出通用建议。',
	].join(' ');

	const blogContext = await buildBlogContext();
	const messages: ChatMessage[] = [
		{
			role: 'system',
			content: customSystemPrompt || defaultSystemPrompt,
		},
		{
			role: 'system',
			content: `以下是当前站点最近文章摘要，请优先基于这些信息回答：\n${blogContext}`,
		},
		...history,
	];
	const resolvedModel = await resolveModel(baseUrl, apiKey, requestedModel || model);

	let upstreamResponse: Response;
	try {
		upstreamResponse = await fetch(`${baseUrl}/chat/completions`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				model: resolvedModel,
				stream: false,
				messages,
			}),
			signal: AbortSignal.timeout(30000),
		});
	} catch {
		return json({ error: '连接 AI 服务失败，请稍后重试。' }, 502);
	}

	let payload: UpstreamResponse | null = null;
	try {
		payload = (await upstreamResponse.json()) as UpstreamResponse;
	} catch {
		return json({ error: 'AI 服务返回了无法解析的响应。' }, 502);
	}

	if (!upstreamResponse.ok) {
		return json(
			{
				error:
					payload?.error?.message ??
					`AI 服务请求失败，状态码 ${upstreamResponse.status}。`,
			},
			502,
		);
	}

	const message = extractTextContent(payload?.choices?.[0]?.message?.content);
	if (!message) {
		return json({ error: 'AI 服务没有返回有效内容。' }, 502);
	}

	return json({
		message,
		model: resolvedModel,
	});
};

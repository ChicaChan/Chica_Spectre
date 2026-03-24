import { directusRequest, type DirectusResponse } from './directus';

export type CmsPost = {
	id: string | number;
	slug: string;
	title: string;
	excerpt?: string | null;
	content?: string | null;
	published_at?: string | null;
};

const collection = 'posts';

function toPost(record: Record<string, unknown>): CmsPost | null {
	const slug = typeof record.slug === 'string' ? record.slug.trim() : '';
	const title = typeof record.title === 'string' ? record.title.trim() : '';
	if (!slug || !title) return null;
	return {
		id: (record.id as string | number | undefined) ?? slug,
		slug,
		title,
		excerpt: (record.excerpt as string | null | undefined) ?? null,
		content: (record.content as string | null | undefined) ?? null,
		published_at: (record.published_at as string | null | undefined) ?? null,
	};
}

export async function listPosts(limit = 50): Promise<CmsPost[]> {
	const query = new URLSearchParams({
		fields: 'id,slug,title,excerpt,content,published_at',
		sort: '-published_at',
		limit: String(limit),
	});
	const payload = await directusRequest<DirectusResponse<Record<string, unknown>[]>>(
		`/items/${collection}?${query.toString()}`,
	);
	if (!payload || !Array.isArray(payload.data)) return [];

	return payload.data.map(toPost).filter((post): post is CmsPost => post !== null);
}

export async function getPostBySlug(slug: string): Promise<CmsPost | null> {
	const safeSlug = slug.trim();
	if (!safeSlug) return null;
	const query = new URLSearchParams({
		fields: 'id,slug,title,excerpt,content,published_at',
		limit: '1',
		'filter[slug][_eq]': safeSlug,
	});
	const payload = await directusRequest<DirectusResponse<Record<string, unknown>[]>>(
		`/items/${collection}?${query.toString()}`,
	);
	if (!payload || !Array.isArray(payload.data) || payload.data.length === 0) return null;
	return toPost(payload.data[0]);
}

export function formatPostDate(post: CmsPost): Date | null {
	const raw = post.published_at;
	if (!raw) return null;
	const d = new Date(raw);
	return Number.isNaN(d.getTime()) ? null : d;
}

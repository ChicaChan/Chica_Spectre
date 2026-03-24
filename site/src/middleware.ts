import { defineMiddleware } from 'astro:middleware';

const DIRECTUS_ROUTE_PREFIXES = [
	'/admin',
	'/server',
	'/auth',
	'/items',
	'/files',
	'/folders',
	'/users',
	'/permissions',
	'/roles',
	'/policies',
	'/fields',
	'/collections',
	'/relations',
	'/presets',
	'/operations',
	'/flows',
	'/translations',
	'/extensions',
	'/dashboards',
	'/panels',
	'/notifications',
	'/shares',
	'/versions',
	'/comments',
	'/assets',
	'/graphql',
	'/utils',
	'/settings',
	'/activity',
	'/revisions',
	'/websocket',
];

function isDirectusRoute(pathname: string) {
	return DIRECTUS_ROUTE_PREFIXES.some(
		(prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
	);
}

function getDirectusBaseUrl() {
	const raw =
		process.env.DIRECTUS_API_URL ??
		process.env.PUBLIC_CMS_URL ??
		import.meta.env.DIRECTUS_API_URL ??
		import.meta.env.PUBLIC_CMS_URL ??
		'';
	return raw.replace(/\/$/, '');
}

export const onRequest = defineMiddleware(async (context, next) => {
	const { request, url } = context;
	const directusBaseUrl = getDirectusBaseUrl();

	if (!directusBaseUrl || !isDirectusRoute(url.pathname)) {
		return next();
	}

	const headers = new Headers(request.headers);
	headers.set('x-forwarded-host', request.headers.get('host') ?? '');
	headers.set('x-forwarded-proto', url.protocol.replace(':', ''));

	const init: RequestInit = {
		method: request.method,
		headers,
		redirect: 'manual',
	};

	if (request.method !== 'GET' && request.method !== 'HEAD') {
		init.body = await request.arrayBuffer();
	}

	try {
		const upstreamUrl = `${directusBaseUrl}${url.pathname}${url.search}`;
		const upstreamResponse = await fetch(upstreamUrl, init);
		const responseHeaders = new Headers(upstreamResponse.headers);
		const location = responseHeaders.get('location');

		if (location?.startsWith(directusBaseUrl)) {
			responseHeaders.set('location', location.replace(directusBaseUrl, ''));
		}

		return new Response(upstreamResponse.body, {
			status: upstreamResponse.status,
			statusText: upstreamResponse.statusText,
			headers: responseHeaders,
		});
	} catch {
		return new Response('CMS 服务暂时不可用。', { status: 502 });
	}
});

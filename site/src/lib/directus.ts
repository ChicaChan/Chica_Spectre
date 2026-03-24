export type DirectusResponse<T> = {
	data: T;
};

type DirectusAuthResponse = {
	data?: {
		access_token?: string;
		expires?: number;
	};
};

let adminAuthCache: { token: string; expiresAt: number } | null = null;

export function getDirectusBaseUrl() {
	const runtimeUrl =
		process.env.DIRECTUS_API_URL ??
		process.env.PUBLIC_CMS_URL ??
		import.meta.env.DIRECTUS_API_URL ??
		import.meta.env.PUBLIC_CMS_URL ??
		'http://localhost:1337';
	return runtimeUrl.replace(/\/$/, '');
}

export async function directusRequest<T>(path: string, init: RequestInit = {}): Promise<T | null> {
	const url = `${getDirectusBaseUrl()}${path}`;
	const headers = new Headers(init.headers);
	headers.set('Accept', 'application/json');

	try {
		const res = await fetch(url, {
			...init,
			cache: init.cache ?? 'no-store',
			headers,
		});
		if (!res.ok) return null;
		return (await res.json()) as T;
	} catch {
		return null;
	}
}

function getDirectusAdminCredentials() {
	const email =
		process.env.DIRECTUS_ADMIN_EMAIL ??
		import.meta.env.DIRECTUS_ADMIN_EMAIL ??
		'';
	const password =
		process.env.DIRECTUS_ADMIN_PASSWORD ??
		import.meta.env.DIRECTUS_ADMIN_PASSWORD ??
		'';

	if (!email || !password) return null;
	return { email, password };
}

async function getDirectusAdminToken() {
	const now = Date.now();
	if (adminAuthCache && adminAuthCache.expiresAt > now + 15_000) {
		return adminAuthCache.token;
	}

	const credentials = getDirectusAdminCredentials();
	if (!credentials) return null;

	try {
		const res = await fetch(`${getDirectusBaseUrl()}/auth/login`, {
			method: 'POST',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(credentials),
		});
		if (!res.ok) return null;

		const payload = (await res.json()) as DirectusAuthResponse;
		const token = payload.data?.access_token;
		if (!token) return null;

		adminAuthCache = {
			token,
			expiresAt: now + (payload.data?.expires ?? 60_000),
		};

		return token;
	} catch {
		return null;
	}
}

export async function directusAdminRequest<T>(
	path: string,
	init: RequestInit = {},
): Promise<T | null> {
	const token = await getDirectusAdminToken();
	if (!token) return null;

	const headers = new Headers(init.headers);
	headers.set('Authorization', `Bearer ${token}`);

	return directusRequest<T>(path, {
		...init,
		headers,
	});
}

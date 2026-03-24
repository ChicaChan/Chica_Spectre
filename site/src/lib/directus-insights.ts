import {
	directusAdminRequest,
	directusRequest,
	type DirectusResponse,
} from './directus';

type Primitive = string | number | boolean | null;
type JsonValue = Primitive | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };
type DirectusItem = Record<string, unknown>;

type DashboardSummary = {
	id: string;
	name: string;
	icon?: string | null;
	color?: string | null;
	note?: string | null;
};

type PanelRecord = {
	id: string;
	dashboard: string;
	type: string;
	position_x: number;
	position_y: number;
	width: number;
	height: number;
	show_header: boolean;
	name?: string | null;
	icon?: string | null;
	color?: string | null;
	note?: string | null;
	options?: JsonObject | null;
};

type DashboardRecord = DashboardSummary & {
	panels: PanelRecord[];
};

type MetricPanelView = {
	kind: 'metric';
	id: string;
	type: 'metric';
	positionX: number;
	positionY: number;
	width: number;
	height: number;
	showHeader: boolean;
	name: string;
	icon?: string | null;
	color?: string | null;
	note?: string | null;
	value: string;
	rawValue: number | string | null;
};

type LabelPanelView = {
	kind: 'label';
	id: string;
	type: 'label';
	positionX: number;
	positionY: number;
	width: number;
	height: number;
	showHeader: boolean;
	name: string;
	icon?: string | null;
	color?: string | null;
	note?: string | null;
	text: string;
	whiteSpace: string;
};

type ListPanelView = {
	kind: 'list';
	id: string;
	type: 'list';
	positionX: number;
	positionY: number;
	width: number;
	height: number;
	showHeader: boolean;
	name: string;
	icon?: string | null;
	color?: string | null;
	note?: string | null;
	items: Array<{
		id: string | number;
		label: string;
		meta?: string | null;
		href?: string | null;
	}>;
};

type TimeSeriesPoint = {
	label: string;
	value: number;
};

type TimeSeriesPanelView = {
	kind: 'time-series';
	id: string;
	type: 'time-series';
	positionX: number;
	positionY: number;
	width: number;
	height: number;
	showHeader: boolean;
	name: string;
	icon?: string | null;
	color?: string | null;
	note?: string | null;
	points: TimeSeriesPoint[];
	maxValue: number;
};

type UnsupportedPanelView = {
	kind: 'unsupported';
	id: string;
	type: string;
	positionX: number;
	positionY: number;
	width: number;
	height: number;
	showHeader: boolean;
	name: string;
	icon?: string | null;
	color?: string | null;
	note?: string | null;
};

export type DashboardPanelView =
	| MetricPanelView
	| LabelPanelView
	| ListPanelView
	| TimeSeriesPanelView
	| UnsupportedPanelView;

export type PublicDashboardView = {
	id: string;
	name: string;
	icon?: string | null;
	color?: string | null;
	note?: string | null;
	panels: DashboardPanelView[];
};

const DASHBOARD_FIELDS = [
	'id',
	'name',
	'icon',
	'color',
	'note',
	'panels.id',
	'panels.dashboard',
	'panels.type',
	'panels.position_x',
	'panels.position_y',
	'panels.width',
	'panels.height',
	'panels.show_header',
	'panels.name',
	'panels.icon',
	'panels.color',
	'panels.note',
	'panels.options',
].join(',');

const supportedPanelTypes = new Set(['metric', 'label', 'list', 'time-series']);
const PUBLIC_DASHBOARD_NAME = '博客公开仪表盘';

export async function getPublicDashboardView(): Promise<PublicDashboardView | null> {
	const dashboardListQuery = new URLSearchParams({
		fields: 'id,name,icon,color,note',
		sort: 'name',
	});
	const dashboardList = await directusAdminRequest<DirectusResponse<DashboardSummary[]>>(
		`/dashboards?${dashboardListQuery.toString()}`,
	);

	const dashboard =
		dashboardList?.data?.find((item) => item.name === PUBLIC_DASHBOARD_NAME) ??
		dashboardList?.data?.[0];
	if (!dashboard) return null;

	const dashboardDetailQuery = new URLSearchParams({
		fields: DASHBOARD_FIELDS,
	});
	const dashboardDetail = await directusAdminRequest<DirectusResponse<DashboardRecord>>(
		`/dashboards/${dashboard.id}?${dashboardDetailQuery.toString()}`,
	);
	if (!dashboardDetail?.data) return null;

	const panels = dashboardDetail.data.panels
		.slice()
		.sort((a, b) => {
			if (a.position_y !== b.position_y) return a.position_y - b.position_y;
			return a.position_x - b.position_x;
		});

	const resolvedPanels = await Promise.all(panels.map(resolvePanelView));

	return {
		id: dashboardDetail.data.id,
		name: dashboardDetail.data.name,
		icon: dashboardDetail.data.icon ?? null,
		color: dashboardDetail.data.color ?? null,
		note: dashboardDetail.data.note ?? null,
		panels: resolvedPanels,
	};
}

async function resolvePanelView(panel: PanelRecord): Promise<DashboardPanelView> {
	const base = {
		id: panel.id,
		type: panel.type,
		positionX: Math.max(panel.position_x || 1, 1),
		positionY: Math.max(panel.position_y || 1, 1),
		width: Math.max(panel.width || 6, 1),
		height: Math.max(panel.height || 4, 1),
		showHeader: panel.show_header ?? false,
		name: panel.name?.trim() || panel.type,
		icon: panel.icon ?? null,
		color: panel.color ?? null,
		note: panel.note ?? null,
	};

	if (!supportedPanelTypes.has(panel.type)) {
		return { kind: 'unsupported', ...base };
	}

	switch (panel.type) {
		case 'metric':
			return resolveMetricPanel(panel, base);
		case 'label':
			return resolveLabelPanel(panel, base);
		case 'list':
			return resolveListPanel(panel, base);
		case 'time-series':
			return resolveTimeSeriesPanel(panel, base);
		default:
			return { kind: 'unsupported', ...base };
	}
}

async function resolveMetricPanel(
	panel: PanelRecord,
	base: Omit<MetricPanelView, 'kind' | 'value' | 'rawValue'>,
): Promise<MetricPanelView> {
	const options = panel.options ?? {};
	const data = await requestPanelData(panel);
	const rawValue = readMetricValue(options, data);

	return {
		kind: 'metric',
		...base,
		type: 'metric',
		value: formatMetricValue(rawValue, options),
		rawValue,
	};
}

async function resolveLabelPanel(
	panel: PanelRecord,
	base: Omit<LabelPanelView, 'kind' | 'text' | 'whiteSpace'>,
): Promise<LabelPanelView> {
	const options = panel.options ?? {};
	return {
		kind: 'label',
		...base,
		type: 'label',
		text: asString(options.text) ?? '',
		whiteSpace: asString(options.whiteSpace) ?? 'normal',
	};
}

async function resolveListPanel(
	panel: PanelRecord,
	base: Omit<ListPanelView, 'kind' | 'items'>,
): Promise<ListPanelView> {
	const options = panel.options ?? {};
	const data = await requestPanelData(panel);
	const displayTemplate = asString(options.displayTemplate) ?? '{{ title }}';
	const sortField = asString(options.sortField) ?? null;

	const items = data.map((item) => {
		const id = (item.id as string | number | undefined) ?? '';
		const label = renderDisplayTemplate(displayTemplate, item);
		const metaValue =
			sortField && typeof item[sortField] === 'string'
				? formatDateLabel(item[sortField] as string)
				: null;
		const slug = typeof item.slug === 'string' ? item.slug : null;

		return {
			id,
			label: label || '未命名条目',
			meta: metaValue,
			href: slug ? `/blog/${slug}/` : null,
		};
	});

	return {
		kind: 'list',
		...base,
		type: 'list',
		items,
	};
}

async function resolveTimeSeriesPanel(
	panel: PanelRecord,
	base: Omit<TimeSeriesPanelView, 'kind' | 'points' | 'maxValue'>,
): Promise<TimeSeriesPanelView> {
	const options = panel.options ?? {};
	const data = await requestPanelData(panel);
	const points = data
		.map((item) => toTimeSeriesPoint(item, options))
		.filter((point): point is TimeSeriesPoint => point !== null);
	const maxValue = points.reduce((max, point) => Math.max(max, point.value), 0);

	return {
		kind: 'time-series',
		...base,
		type: 'time-series',
		points,
		maxValue,
	};
}

async function requestPanelData(panel: PanelRecord): Promise<DirectusItem[]> {
	const requestPath = buildPanelRequestPath(panel);
	if (!requestPath) return [];

	const payload = await directusRequest<DirectusResponse<DirectusItem[]>>(requestPath);
	return Array.isArray(payload?.data) ? payload.data : [];
}

function buildPanelRequestPath(panel: PanelRecord): string | null {
	const options = panel.options ?? {};
	const collection = asString(options.collection);
	if (!collection) return null;

	const params = new URLSearchParams();

	switch (panel.type) {
		case 'metric':
			return buildMetricRequestPath(collection, options, params);
		case 'list':
			return buildListRequestPath(collection, options, params);
		case 'time-series':
			return buildTimeSeriesRequestPath(collection, options, params);
		default:
			return null;
	}
}

function buildMetricRequestPath(
	collection: string,
	options: JsonObject,
	params: URLSearchParams,
): string | null {
	const fn = asString(options.function);
	if (!fn) return null;

	const field = asString(options.field) ?? '*';
	const sortField = asString(options.sortField) ?? field;
	appendFilterParams(params, options.filter);

	if (fn === 'first' || fn === 'last') {
		params.set('limit', '1');
		params.set('fields', field);
		if (sortField && sortField !== '*') {
			params.set('sort', fn === 'last' ? `-${sortField}` : sortField);
		}
		return `/items/${collection}?${params.toString()}`;
	}

	params.set(`aggregate[${fn}]`, field || '*');
	return `/items/${collection}?${params.toString()}`;
}

function buildListRequestPath(
	collection: string,
	options: JsonObject,
	params: URLSearchParams,
): string | null {
	const fields = new Set(['id', 'slug']);
	const displayTemplate = asString(options.displayTemplate);
	const sortField = asString(options.sortField);

	for (const field of extractTemplateFields(displayTemplate)) {
		fields.add(field);
	}

	if (sortField) fields.add(sortField);

	params.set('fields', Array.from(fields).join(','));
	params.set('limit', String(asNumber(options.limit) ?? 5));

	if (sortField) {
		const direction = asString(options.sortDirection) === 'asc' ? '' : '-';
		params.set('sort', `${direction}${sortField}`);
	}

	appendFilterParams(params, options.filter);
	return `/items/${collection}?${params.toString()}`;
}

function buildTimeSeriesRequestPath(
	collection: string,
	options: JsonObject,
	params: URLSearchParams,
): string | null {
	const fn = asString(options.function);
	const dateField = asString(options.dateField);
	const valueField = asString(options.valueField);
	const precision = asString(options.precision) ?? 'month';
	if (!fn || !dateField || !valueField) return null;

	const groupedFields = buildDateGroupFields(precision, dateField);
	if (groupedFields.length === 0) return null;

	params.set(`aggregate[${fn}]`, valueField);
	for (const field of groupedFields) {
		params.append('groupBy[]', field);
		params.append('sort[]', field);
	}

	appendFilterParams(params, options.filter);
	appendRangeFilter(params, dateField, asString(options.range));

	return `/items/${collection}?${params.toString()}`;
}

function appendRangeFilter(params: URLSearchParams, dateField: string, range: string | null) {
	if (!range || range === 'auto') return;
	params.append(`filter[${dateField}][_gte]`, `$NOW(-${range})`);
	params.append(`filter[${dateField}][_lte]`, '$NOW');
}

function appendFilterParams(params: URLSearchParams, filter: JsonValue | undefined) {
	if (!filter) return;
	const objectFilter = normalizeJsonObject(filter);
	if (!objectFilter) return;
	appendJsonObject(params, 'filter', objectFilter);
}

function appendJsonObject(params: URLSearchParams, prefix: string, value: JsonValue) {
	if (Array.isArray(value)) {
		for (const item of value) {
			appendJsonObject(params, `${prefix}[]`, item);
		}
		return;
	}

	if (value && typeof value === 'object') {
		for (const [key, nested] of Object.entries(value)) {
			appendJsonObject(params, `${prefix}[${key}]`, nested);
		}
		return;
	}

	if (value !== null && value !== undefined) {
		params.append(prefix, String(value));
	}
}

function normalizeJsonObject(value: JsonValue): JsonObject | null {
	if (typeof value === 'string') {
		try {
			const parsed = JSON.parse(value) as JsonValue;
			return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
				? (parsed as JsonObject)
				: null;
		} catch {
			return null;
		}
	}

	if (value && typeof value === 'object' && !Array.isArray(value)) {
		return value as JsonObject;
	}

	return null;
}

function readMetricValue(options: JsonObject, data: DirectusItem[]): number | string | null {
	const row = data[0];
	if (!row) return null;

	const fn = asString(options.function);
	const field = asString(options.field) ?? '*';
	if (!fn) return null;

	if (fn === 'first' || fn === 'last') {
		const raw = row[field];
		return typeof raw === 'number' || typeof raw === 'string' ? raw : null;
	}

	const aggregateValue = row[fn];
	if (typeof aggregateValue === 'number' || typeof aggregateValue === 'string') {
		return aggregateValue;
	}

	if (aggregateValue && typeof aggregateValue === 'object') {
		const nested = (aggregateValue as Record<string, unknown>)[field];
		if (typeof nested === 'number' || typeof nested === 'string') {
			return nested;
		}

		const fallback = Object.values(aggregateValue as Record<string, unknown>)[0];
		if (typeof fallback === 'number' || typeof fallback === 'string') {
			return fallback;
		}
	}

	return null;
}

function formatMetricValue(value: number | string | null, options: JsonObject) {
	if (value === null || value === undefined || value === '') return '--';

	const prefix = asString(options.prefix) ?? '';
	const suffix = asString(options.suffix) ?? '';

	if (typeof value === 'string' && looksLikeDate(value)) {
		return `${prefix}${formatDateLabel(value)}${suffix}`;
	}

	if (typeof value === 'number' || looksLikeNumber(value)) {
		const numericValue = Number(value);
		try {
			const formatter = new Intl.NumberFormat('zh-CN', {
				style: normalizeNumberStyle(asString(options.numberStyle)),
				notation: normalizeNotation(asString(options.notation)),
				unit: asString(options.numberStyle) === 'unit' ? asString(options.unit) ?? undefined : undefined,
				currency:
					asString(options.numberStyle) === 'currency'
						? asString(options.unit) ?? 'CNY'
						: undefined,
				minimumFractionDigits: clampInteger(asNumber(options.minimumFractionDigits), 0, 20),
				maximumFractionDigits: clampInteger(asNumber(options.maximumFractionDigits), 0, 20),
			});
			return `${prefix}${formatter.format(numericValue)}${suffix}`;
		} catch {
			return `${prefix}${numericValue.toLocaleString('zh-CN')}${suffix}`;
		}
	}

	return `${prefix}${String(value)}${suffix}`;
}

function normalizeNumberStyle(value: string | null): Intl.NumberFormatOptions['style'] {
	switch (value) {
		case 'currency':
		case 'percent':
		case 'unit':
			return value;
		default:
			return 'decimal';
	}
}

function normalizeNotation(value: string | null): Intl.NumberFormatOptions['notation'] {
	switch (value) {
		case 'scientific':
		case 'engineering':
		case 'compact':
			return value;
		default:
			return 'standard';
	}
}

function toTimeSeriesPoint(item: DirectusItem, options: JsonObject): TimeSeriesPoint | null {
	const fn = asString(options.function);
	const valueField = asString(options.valueField);
	const dateField = asString(options.dateField);
	const precision = asString(options.precision) ?? 'month';
	if (!fn || !valueField || !dateField) return null;

	const aggregateValue = item[fn];
	let value = 0;

	if (typeof aggregateValue === 'number') {
		value = aggregateValue;
	} else if (aggregateValue && typeof aggregateValue === 'object') {
		const nested = (aggregateValue as Record<string, unknown>)[valueField];
		value = typeof nested === 'number' ? nested : Number(nested ?? 0);
	} else {
		value = Number(aggregateValue ?? 0);
	}

	return {
		label: formatTimeSeriesLabel(item, dateField, precision),
		value,
	};
}

function formatTimeSeriesLabel(item: DirectusItem, dateField: string, precision: string) {
	const year = asNumber(item[`${dateField}_year`]);
	const month = asNumber(item[`${dateField}_month`]);
	const week = asNumber(item[`${dateField}_week`]);
	const day = asNumber(item[`${dateField}_day`]);
	const hour = asNumber(item[`${dateField}_hour`]);
	const minute = asNumber(item[`${dateField}_minute`]);

	switch (precision) {
		case 'year':
			return `${year ?? '--'} 年`;
		case 'month':
			return `${year ?? '--'}-${padNumber(month)}`;
		case 'week':
			return `${year ?? '--'} 第 ${week ?? '--'} 周`;
		case 'day':
			return `${year ?? '--'}-${padNumber(month)}-${padNumber(day)}`;
		case 'hour':
			return `${padNumber(month)}/${padNumber(day)} ${padNumber(hour)}:00`;
		case 'minute':
			return `${padNumber(month)}/${padNumber(day)} ${padNumber(hour)}:${padNumber(minute)}`;
		case 'second':
			return `${padNumber(month)}/${padNumber(day)} ${padNumber(hour)}:${padNumber(minute)}`;
		default:
			return String(year ?? '--');
	}
}

function buildDateGroupFields(precision: string, dateField: string) {
	switch (precision) {
		case 'year':
			return [`year(${dateField})`];
		case 'month':
			return [`year(${dateField})`, `month(${dateField})`];
		case 'week':
			return [`year(${dateField})`, `week(${dateField})`];
		case 'day':
			return [`year(${dateField})`, `month(${dateField})`, `day(${dateField})`];
		case 'hour':
			return [`year(${dateField})`, `month(${dateField})`, `day(${dateField})`, `hour(${dateField})`];
		case 'minute':
			return [
				`year(${dateField})`,
				`month(${dateField})`,
				`day(${dateField})`,
				`hour(${dateField})`,
				`minute(${dateField})`,
			];
		case 'second':
			return [
				`year(${dateField})`,
				`month(${dateField})`,
				`day(${dateField})`,
				`hour(${dateField})`,
				`minute(${dateField})`,
				`second(${dateField})`,
			];
		default:
			return [];
	}
}

function extractTemplateFields(template: string | null) {
	if (!template) return [];
	return Array.from(template.matchAll(/\{\{\s*([a-zA-Z0-9_.$-]+)\s*\}\}/g)).map((match) => match[1]);
}

function renderDisplayTemplate(template: string, item: DirectusItem) {
	return template.replace(/\{\{\s*([a-zA-Z0-9_.$-]+)\s*\}\}/g, (_match, field) => {
		const value = item[field];
		if (value === null || value === undefined) return '';
		if (typeof value === 'string' && looksLikeDate(value)) return formatDateLabel(value);
		return String(value);
	});
}

function formatDateLabel(value: string) {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;

	return new Intl.DateTimeFormat('zh-CN', {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).format(date);
}

function looksLikeDate(value: string) {
	return /^\d{4}-\d{2}-\d{2}T/.test(value) || /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function looksLikeNumber(value: string) {
	return value.trim() !== '' && Number.isFinite(Number(value));
}

function asString(value: unknown) {
	return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function asNumber(value: unknown) {
	return typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : null;
}

function clampInteger(value: number | null, min: number, max: number) {
	if (value === null || !Number.isFinite(value)) return undefined;
	return Math.min(Math.max(Math.trunc(value), min), max);
}

function padNumber(value: number | null) {
	return value === null || !Number.isFinite(value) ? '--' : String(value).padStart(2, '0');
}

import type { CmsPost } from './cms';
import { formatPostDate } from './cms';

const SHANGHAI_TIME_ZONE = 'Asia/Shanghai';
const MS_PER_DAY = 1000 * 60 * 60 * 24;

const zonedDateFormatter = new Intl.DateTimeFormat('en-CA', {
	timeZone: SHANGHAI_TIME_ZONE,
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
});

type InsightPost = {
	slug: string;
	title: string;
	excerpt: string | null;
	date: Date | null;
	contentLength: number;
	excerptLength: number;
	readingMinutes: number;
	ageDays: number | null;
};

export type InsightSeriesPoint = {
	label: string;
	count: number;
	percentage: number;
};

export type InsightPostRank = {
	slug: string;
	title: string;
	date: Date | null;
	contentLength: number;
	excerptLength: number;
	readingMinutes: number;
	ageDays: number | null;
};

export type PostInsights = {
	totalPosts: number;
	publishedPosts: number;
	postsWithExcerpt: number;
	excerptCoverage: number;
	totalContentLength: number;
	avgContentLength: number;
	avgReadingMinutes: number;
	recentCount30Days: number;
	avgGapDays: number;
	longestGapDays: number;
	publicationSpanDays: number;
	latestPublication: Date | null;
	oldestPublication: Date | null;
	latestAgeDays: number | null;
	monthSeries: InsightSeriesPoint[];
	weekdaySeries: InsightSeriesPoint[];
	peakMonth: InsightSeriesPoint | null;
	peakWeekday: InsightSeriesPoint | null;
	recentPosts: InsightPostRank[];
	longestPosts: InsightPostRank[];
	longestPost: InsightPostRank | null;
};

function stripMarkdown(source?: string | null) {
	if (!source) return '';

	return source
		.replace(/```[\s\S]*?```/g, ' ')
		.replace(/`[^`]*`/g, ' ')
		.replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
		.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
		.replace(/<[^>]+>/g, ' ')
		.replace(/^#{1,6}\s+/gm, '')
		.replace(/^>\s?/gm, '')
		.replace(/[*_~|]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function countChars(source?: string | null) {
	return stripMarkdown(source).replace(/\s+/g, '').length;
}

function getShanghaiDateParts(date: Date) {
	const parts = zonedDateFormatter.formatToParts(date);
	const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
	const year = Number(lookup.year);
	const month = Number(lookup.month);
	const day = Number(lookup.day);

	return { year, month, day };
}

function getMonthKey(date: Date) {
	const { year, month } = getShanghaiDateParts(date);
	return `${year}-${String(month).padStart(2, '0')}`;
}

function getMonthLabel(year: number, month: number) {
	return `${year}.${String(month).padStart(2, '0')}`;
}

function getWeekdayIndex(date: Date) {
	const { year, month, day } = getShanghaiDateParts(date);
	return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function daysBetween(later: Date, earlier: Date) {
	return Math.max(0, Math.round((later.getTime() - earlier.getTime()) / MS_PER_DAY));
}

function buildMonthSeries(dates: Date[]) {
	if (dates.length === 0) return [] as InsightSeriesPoint[];

	const latest = dates[0];
	const { year: latestYear, month: latestMonth } = getShanghaiDateParts(latest);
	const counts = new Map<string, number>();

	for (const date of dates) {
		const key = getMonthKey(date);
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}

	const series: InsightSeriesPoint[] = [];

	for (let offset = 5; offset >= 0; offset -= 1) {
		const index = latestMonth - 1 - offset;
		const year = latestYear + Math.floor(index / 12);
		const month = ((index % 12) + 12) % 12 + 1;
		const key = `${year}-${String(month).padStart(2, '0')}`;

		series.push({
			label: getMonthLabel(year, month),
			count: counts.get(key) ?? 0,
			percentage: 0,
		});
	}

	const maxCount = Math.max(...series.map((item) => item.count), 0);
	return series.map((item) => ({
		...item,
		percentage: maxCount > 0 ? (item.count / maxCount) * 100 : 0,
	}));
}

function buildWeekdaySeries(dates: Date[]) {
	const counts = new Map<number, number>();

	for (const date of dates) {
		const index = getWeekdayIndex(date);
		counts.set(index, (counts.get(index) ?? 0) + 1);
	}

	const weekdays = [
		{ index: 1, label: '周一' },
		{ index: 2, label: '周二' },
		{ index: 3, label: '周三' },
		{ index: 4, label: '周四' },
		{ index: 5, label: '周五' },
		{ index: 6, label: '周六' },
		{ index: 0, label: '周日' },
	];

	const series = weekdays.map((weekday) => ({
		label: weekday.label,
		count: counts.get(weekday.index) ?? 0,
		percentage: 0,
	}));

	const maxCount = Math.max(...series.map((item) => item.count), 0);
	return series.map((item) => ({
		...item,
		percentage: maxCount > 0 ? (item.count / maxCount) * 100 : 0,
	}));
}

function toInsightPost(post: CmsPost, now: Date): InsightPost {
	const date = formatPostDate(post);
	const contentLength = countChars(post.content);
	const excerptLength = countChars(post.excerpt);
	const ageDays = date ? daysBetween(now, date) : null;

	return {
		slug: post.slug,
		title: post.title,
		excerpt: post.excerpt ?? null,
		date,
		contentLength,
		excerptLength,
		readingMinutes: Math.max(1, Math.round(contentLength / 420)),
		ageDays,
	};
}

function toRankedPost(post: InsightPost): InsightPostRank {
	return {
		slug: post.slug,
		title: post.title,
		date: post.date,
		contentLength: post.contentLength,
		excerptLength: post.excerptLength,
		readingMinutes: post.readingMinutes,
		ageDays: post.ageDays,
	};
}

export function buildPostInsights(posts: CmsPost[], now = new Date()): PostInsights {
	const insightPosts = posts.map((post) => toInsightPost(post, now));
	const datedPosts = insightPosts
		.filter((post) => post.date !== null)
		.sort((a, b) => (b.date as Date).getTime() - (a.date as Date).getTime());
	const datedEntries = datedPosts.map((post) => post.date as Date);
	const totalContentLength = insightPosts.reduce((sum, post) => sum + post.contentLength, 0);
	const postsWithExcerpt = insightPosts.filter((post) => post.excerptLength > 0).length;
	const recentCount30Days = datedPosts.filter(
		(post) => post.ageDays !== null && post.ageDays <= 30,
	).length;
	const gapDays = datedEntries.slice(1).map((date, index) => daysBetween(datedEntries[index], date));
	const monthSeries = buildMonthSeries(datedEntries);
	const weekdaySeries = buildWeekdaySeries(datedEntries);
	const longestPosts = [...insightPosts]
		.sort((a, b) => b.contentLength - a.contentLength || a.title.localeCompare(b.title, 'zh-CN'))
		.slice(0, 5)
		.map(toRankedPost);
	const recentPosts = datedPosts.slice(0, 6).map(toRankedPost);
	const latestPublication = datedEntries[0] ?? null;
	const oldestPublication = datedEntries[datedEntries.length - 1] ?? null;
	const peakMonth =
		monthSeries.find((item) => item.count === Math.max(...monthSeries.map((point) => point.count), 0)) ??
		null;
	const peakWeekday =
		weekdaySeries.find(
			(item) => item.count === Math.max(...weekdaySeries.map((point) => point.count), 0),
		) ?? null;

	return {
		totalPosts: insightPosts.length,
		publishedPosts: datedPosts.length,
		postsWithExcerpt,
		excerptCoverage: insightPosts.length > 0 ? Math.round((postsWithExcerpt / insightPosts.length) * 100) : 0,
		totalContentLength,
		avgContentLength:
			insightPosts.length > 0 ? Math.round(totalContentLength / insightPosts.length) : 0,
		avgReadingMinutes:
			insightPosts.length > 0
				? Number(
						(
							insightPosts.reduce((sum, post) => sum + post.readingMinutes, 0) /
							insightPosts.length
						).toFixed(1),
				  )
				: 0,
		recentCount30Days,
		avgGapDays:
			gapDays.length > 0
				? Number((gapDays.reduce((sum, gap) => sum + gap, 0) / gapDays.length).toFixed(1))
				: 0,
		longestGapDays: gapDays.length > 0 ? Math.max(...gapDays) : 0,
		publicationSpanDays:
			latestPublication && oldestPublication ? daysBetween(latestPublication, oldestPublication) : 0,
		latestPublication,
		oldestPublication,
		latestAgeDays: latestPublication ? daysBetween(now, latestPublication) : null,
		monthSeries,
		weekdaySeries,
		peakMonth: peakMonth?.count ? peakMonth : null,
		peakWeekday: peakWeekday?.count ? peakWeekday : null,
		recentPosts,
		longestPosts,
		longestPost: longestPosts[0] ?? null,
	};
}

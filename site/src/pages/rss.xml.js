import rss from '@astrojs/rss';
import { SITE_DESCRIPTION, SITE_TITLE } from '../consts';
import { formatPostDate, listPosts } from '../lib/cms';

export async function GET(context) {
	const posts = await listPosts(100);
	return rss({
		title: SITE_TITLE,
		description: SITE_DESCRIPTION,
		site: context.site,
		items: posts.map((post) => ({
			title: post.title,
			description: post.excerpt ?? '',
			pubDate: formatPostDate(post) ?? undefined,
			link: `/blog/${post.slug}/`,
		})),
	});
}

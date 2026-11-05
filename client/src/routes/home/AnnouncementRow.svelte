<script lang="ts">
	import { formatRelativeTime } from '$lib/dates';
	import type { HomeAnnouncement } from '$lib/home';
	import { conferenceAnnouncementsUrl } from '$lib/urls';

	type Props = {
		/** One announcement, read by `listHomeAnnouncements` in `$lib/server/home-announcements.ts`. */
		announcement: HomeAnnouncement;
		/** The moment the page was drawn, which turns `publishedAt` into "3 days ago". */
		now: Date;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { announcement, now }: Props = $props();

	/*
		"Amsterdam Open MUN 2027 · 3 days ago", or the date once the announcement
		is a week old, written in the conference's own timezone. `$derived` works
		it out again whenever the announcement or `now` changes.
	*/
	const meta = $derived(
		`${announcement.conferenceName} · ${formatRelativeTime(
			announcement.publishedAt,
			now,
			announcement.conferenceTimezone
		)}`
	);
</script>

<!--
	One row of "Announcements": the title and which conference said it, how long
	ago. No badge and no body text; the whole row is one link to that
	conference's announcements page, where the body is. It is an `<li>`, so the
	section puts these rows inside a `<ul>`.
-->
<li>
	<a
		href={conferenceAnnouncementsUrl(announcement.conferenceSlug)}
		class="flex min-h-13 flex-col justify-center border-b border-border px-1 py-2 transition-colors duration-150 hover:bg-accent"
	>
		<p class="text-dense font-medium text-foreground">{announcement.title}</p>
		<p class="text-small text-muted-foreground">{meta}</p>
	</a>
</li>

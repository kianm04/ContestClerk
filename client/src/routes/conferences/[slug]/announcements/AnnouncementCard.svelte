<script lang="ts">
	import Pin from '@lucide/svelte/icons/pin';
	import Badge from '$lib/components/Badge.svelte';
	import ParagraphText from '$lib/components/ParagraphText.svelte';
	import {
		announcementBadgeLabel,
		announcementBadgeTone,
		formatPublishedAt,
		showsReaderBadge,
		type ReaderAnnouncement
	} from '$lib/announcements';

	type Props = {
		announcement: ReaderAnnouncement;
		/** The moment the page was drawn, for "3 hours ago". */
		now: Date;
		/** The conference's timezone, which dates are shown in. */
		timezone: string;
	};

	let { announcement, now, timezone }: Props = $props();

	// `$derived` works these out again whenever the props change. A pinned
	// announcement stands out with a tinted background as well as its pin.
	const publishedAt = $derived(formatPublishedAt(announcement.publishedAt, now, timezone));
	const background = $derived(announcement.isPinned ? 'bg-brand-50' : 'bg-surface');
</script>

<article class="flex flex-col gap-2 rounded-2xl border border-line p-4 md:p-6 {background}">
	<div class="flex flex-wrap items-center gap-2">
		{#if announcement.isPinned}
			<Pin size={16} strokeWidth={1.75} class="shrink-0 text-brand-700" aria-label="Pinned" />
		{/if}
		<h3 class="font-display text-h3 text-ink-900">{announcement.title}</h3>
		{#if showsReaderBadge(announcement)}
			<Badge
				tone={announcementBadgeTone(announcement)}
				label={announcementBadgeLabel(announcement)}
			/>
		{/if}
	</div>
	<p class="text-small text-ink-600">{announcement.authorLine} · {publishedAt}</p>
	<!-- The whole body, however long: this is where it is read. -->
	<ParagraphText text={announcement.body} />
</article>

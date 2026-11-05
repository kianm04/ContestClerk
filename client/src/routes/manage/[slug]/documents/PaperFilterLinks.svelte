<script lang="ts">
	import { PAPER_STATUSES, paperStatusLabel, type PaperStatus } from '$lib/documents';
	import type { DocumentsPageView } from '$lib/documents-page';
	import { manageDocumentsUrl } from '$lib/urls';

	type Props = {
		view: DocumentsPageView;
		conferenceSlug: string;
	};

	let { view, conferenceSlug }: Props = $props();

	/** The same committee, showing only papers with `status`, or all with `null`. */
	function filterHref(status: PaperStatus | null) {
		return manageDocumentsUrl(conferenceSlug, {
			tab: 'papers',
			committeeId: view.committeeId,
			paper: status
		});
	}

	/**
	 * The active filter is drawn filled in light blue, so the reader sees which
	 * one is on. Written out in full for Tailwind.
	 */
	function linkClass(status: PaperStatus | null) {
		const isActive = view.paper === status;
		const base = 'inline-flex min-h-8 items-center rounded-full border px-3 text-small';

		if (isActive) {
			return `${base} border-selected bg-selected font-medium text-primary`;
		}

		return `${base} border-border text-foreground hover:border-ring`;
	}
</script>

<!-- Plain links: each filter is its own address, so it works without JavaScript. -->
<nav aria-label="Filter papers by status">
	<ul class="flex flex-wrap gap-2">
		<li>
			<a href={filterHref(null)} class={linkClass(null)}>All</a>
		</li>
		<!-- A list of plain strings has no id, so it is keyed by position. -->
		{#each PAPER_STATUSES as status, index (index)}
			<li>
				<a href={filterHref(status)} class={linkClass(status)}>{paperStatusLabel(status)}</a>
			</li>
		{/each}
	</ul>
</nav>

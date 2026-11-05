<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import StatusDot from '$lib/components/manage/StatusDot.svelte';
	import type { LivePanel } from '$lib/dashboard-live';
	import { manageAnnouncementsUrl } from '$lib/urls';

	type Props = {
		/** What the panel says, from `livePanel` in `$lib/dashboard-live.ts`. */
		panel: LivePanel;
		/** Whether the reader may open the announcements, which the button leads to. */
		mayPostAnnouncement: boolean;
		conferenceSlug: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { panel, mayPostAnnouncement, conferenceSlug }: Props = $props();
</script>

<!--
	The top of the dashboard on a conference day: how many rooms are sitting,
	what is on the programme now and what comes next, and the page's one filled
	button. `flex-wrap` drops the button under the words on a phone.
-->
<div
	class="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-2xl bg-accent px-6 py-4.5"
>
	<div class="min-w-0">
		<div class="mb-1"><StatusDot text={panel.dotText} tone={panel.dotTone} /></div>
		<p class="font-display text-xl font-semibold text-foreground">{panel.headline}</p>

		{#if panel.nextLine}
			<p class="text-small text-muted-foreground">{panel.nextLine}</p>
		{/if}
	</div>

	{#if mayPostAnnouncement}
		<Button
			label="Post an announcement"
			variant="primary"
			size="dense"
			href={manageAnnouncementsUrl(conferenceSlug)}
		/>
	{/if}
</div>

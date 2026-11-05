<script lang="ts">
	import Email from 'carbon-icons-svelte/lib/Email.svelte';
	import { SAMPLE_ANNOUNCEMENT, SAMPLE_CONFERENCE_NAME } from '$lib/organiser-fees';
</script>

<!--
	The same announcement arriving as an email, drawn small: who sent it, the
	subject, two lines of the message and a link back to MUNMeet, drawn as a
	`<span>` because the picture cannot be pressed.

	On a phone it is tucked under the notifications at the left; from `md` up
	it overlaps the form's lower right corner.
-->
<div
	class="relative -mt-2 flex w-[17rem] flex-col rounded-2xl bg-surface px-4 pt-3.5 pb-4 shadow-card md:absolute md:right-7 md:bottom-0 md:m-0 md:w-[17.5rem]"
>
	<span class="flex items-center gap-2 text-caption text-ink-600">
		<Email size={16} class="flex-none" />
		<span class="flex-1 font-medium text-ink-900">{SAMPLE_CONFERENCE_NAME}</span>
		<span>now</span>
	</span>
	<span class="mt-2 font-semibold">{SAMPLE_ANNOUNCEMENT.title}</span>
	<span class="mt-1 text-[0.75rem]/[1.125rem] text-ink-600">{SAMPLE_ANNOUNCEMENT.body}</span>
	<span class="mt-2 text-caption font-medium text-brand-700">Open in MUNMeet</span>
</div>

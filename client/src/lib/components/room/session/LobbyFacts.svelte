<script lang="ts">
	import type { LastSessionView } from '$lib/room-ready';
	import TextLink from './TextLink.svelte';

	type Props = {
		/** The last session that ended, or null before the first. */
		lastSession: LastSessionView | null;
		/** "Session 2 · 09:30, Council Chamber", or null. */
		nextOnSchedule: string | null;
	};

	let { lastSession, nextOnSchedule }: Props = $props();
</script>

<!--
	The lobby's facts under a rule: the last session with its record, and the
	next event on the schedule. `<dt>` names a fact and the `<dd>`s after it
	hold it, which tells a screen reader they belong together. The names sit
	in a 180 px column; on a phone each name goes above its fact. The lobby
	draws this only when there is at least one of the two.
-->
<dl
	class="grid grid-cols-[180px_minmax(0,1fr)] gap-x-6 gap-y-1 border-t border-line pt-6 max-md:grid-cols-1"
>
	{#if lastSession}
		<dt class="text-ink-600">Last session</dt>
		<dd>{lastSession.summary}</dd>
		{#if lastSession.recordLine}
			<dd class="col-start-2 text-ink-600 max-md:col-start-1">{lastSession.recordLine}</dd>
		{/if}
		<dd class="col-start-2 max-md:col-start-1">
			<TextLink href={lastSession.recordHref} label="Session record →" />
		</dd>
	{/if}
	{#if nextOnSchedule}
		<dt class="text-ink-600 max-md:mt-3">Next on the schedule</dt>
		<dd>{nextOnSchedule}</dd>
	{/if}
</dl>

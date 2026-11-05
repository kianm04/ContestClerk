<script lang="ts">
	import type { EarlierRollCallLink } from '$lib/roll-call-view';

	type Props = {
		/** The session's other roll calls, newest first, each a link to edit it. */
		rollCalls: EarlierRollCallLink[];
	};

	let { rollCalls }: Props = $props();
</script>

<!--
	One line: "Earlier roll calls this session: 10:05 (12 present) · 09:02 (11
	present)", each time a link to that roll call. Editing one changes only it;
	the latest still decides who is present.
-->
<p>
	Earlier roll calls this session:
	<!-- The `(rollCall.id)` key lets Svelte reuse a link instead of rebuilding it. -->
	{#each rollCalls as rollCall, index (rollCall.id)}
		{#if index > 0}·{/if}
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- `rollCallViewUrl` builds the roll call's own address from `chairRollCallUrl`, which `resolve()` made -->
		<a href={rollCall.href} class="text-brand-700 underline">{rollCall.label}</a>
	{/each}
</p>

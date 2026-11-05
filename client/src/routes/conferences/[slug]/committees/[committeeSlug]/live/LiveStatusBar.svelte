<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import Button from '$lib/components/Button.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import type { LiveStatus } from '$lib/committee-room-live';

	type Props = {
		/** Null until the page's JavaScript has started listening. */
		status: LiveStatus | null;
		/** This page's own address, which "Refresh" loads again. */
		refreshHref: ResolvedPathname;
	};

	let { status, refreshHref }: Props = $props();
</script>

<!--
	Shown only once the connection has dropped. Without JavaScript the page never
	listened at all, so there is nothing to say.
-->
{#if status === 'paused'}
	<Notice tone="warning">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<p>Live updates paused. Refresh to catch up.</p>
			<Button label="Refresh" variant="secondary" size="sm" href={refreshHref} />
		</div>
	</Notice>
{/if}

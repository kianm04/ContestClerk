<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import Info from '@lucide/svelte/icons/info';
	import type { LaunchRow } from '$lib/creation-readiness';

	type Props = { status: LaunchRow['status'] };

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { status }: Props = $props();
</script>

<!--
	How ready one row is, at the right of the readiness table. The design draws
	two: "Ready" as a white tick in a 24 pixel green circle, and "Optional" as a
	105 by 32 pale blue pill with an info icon. A row that needs a look
	("Review") or stops publishing ("Needed") has no board of its own, so it
	takes the "Ready" shape with an alert icon in amber or red. The word is
	always written, because colour is never the only signal.
-->
{#if status === 'optional'}
	<span
		class="flex h-8 w-26.25 items-center gap-3.75 rounded-full bg-creation-tint pl-2 fs-13 font-medium text-creation-ink-450"
	>
		<Info class="size-5.5 shrink-0 text-creation-ink-700" aria-hidden="true" />
		Optional
	</span>
{:else if status === 'ready'}
	<span class="flex items-center gap-3.25 pl-1.5 fs-13 font-semibold text-creation-green">
		<span
			aria-hidden="true"
			class="flex size-6 shrink-0 items-center justify-center rounded-full bg-creation-green text-white"
		>
			<Check class="size-3.5" strokeWidth={3} />
		</span>
		Ready
	</span>
{:else}
	<span
		class={[
			'flex items-center gap-3.25 pl-1.5 fs-13 font-semibold',
			status === 'blocked' ? 'text-creation-red' : 'text-creation-amber'
		]}
	>
		<CircleAlert class="size-6 shrink-0" aria-hidden="true" />
		{status === 'blocked' ? 'Needed' : 'Review'}
	</span>
{/if}

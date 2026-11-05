<script lang="ts">
	import type { LucideIcon } from '@lucide/svelte';
	import type { ResolvedPathname } from '$app/types';
	import { Button } from '$lib/components/ui/button';

	type Props = {
		/** An icon component from `@lucide/svelte`, such as `Inbox`. */
		icon: LucideIcon;
		/** States the fact: "No applications yet." */
		title: string;
		/** Says what to do about it. */
		description: string;
		/** The words on the one button. Nothing is shown without `actionHref` as well. */
		actionLabel?: string;
		/** Built with a helper from `$lib/urls.ts`; a hand-written string is refused. */
		actionHref?: ResolvedPathname;
	};

	let { icon: Icon, title, description, actionLabel, actionHref }: Props = $props();
</script>

<div
	class="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line px-6 py-10 text-center"
>
	<span class="text-ink-400">
		<Icon size={24} strokeWidth={1.75} aria-hidden="true" />
	</span>

	<h3 class="font-display text-h2">{title}</h3>
	<p class="max-w-prose text-body text-ink-600">{description}</p>

	{#if actionLabel && actionHref}
		<!-- The shadcn `Button` with an `href` renders a link that looks like a button; `h-11` is the 44px a finger needs. -->
		<div class="mt-2">
			<Button href={actionHref} class="h-11 px-4">{actionLabel}</Button>
		</div>
	{/if}
</div>

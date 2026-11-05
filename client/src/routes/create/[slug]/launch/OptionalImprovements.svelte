<script lang="ts">
	import type { LucideIcon } from '@lucide/svelte';
	import Database from '@lucide/svelte/icons/database';
	import FileText from '@lucide/svelte/icons/file-text';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import UsersRound from '@lucide/svelte/icons/users-round';
	import IconCircle from '$lib/components/creation/IconCircle.svelte';
	import { Button } from '$lib/components/ui/button';
	import type { LaunchImprovement } from '$lib/creation-readiness';

	type Props = {
		/** From `optionalImprovements()` in `$lib/creation-readiness.ts`. */
		improvements: LaunchImprovement[];
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { improvements }: Props = $props();

	/** The design's icon for each suggestion. */
	const ICONS: Record<LaunchImprovement['key'], LucideIcon> = {
		description: FileText,
		committees: UsersRound,
		fees: Database
	};
</script>

<!--
	Suggestions, never requirements, in the design's small panel under the
	preview: a 40 pixel circle and a 15 pixel sans title, then one 39 pixel row
	each with its icon, two lines of 12 pixel text and a 139 pixel outline
	button linking to where it is done. Outline, because the filled button on
	this page is "Publish conference".
-->
<section
	class="rounded-xl border border-creation-panel-border bg-white pt-2 pr-4.75 pb-2.5 pl-5 shadow-creation-panel"
>
	<div class="flex min-h-10 items-center gap-3.5">
		<IconCircle icon={Sparkles} class="size-10" iconClass="size-5" />
		<div class="min-w-0">
			<h2 class="fs-15 lh-20 font-semibold text-creation-ink-950">Optional before launch</h2>
			<p class="fs-13 lh-18 text-creation-ink-350">
				These steps can be completed now or later. They're not required to publish.
			</p>
		</div>
	</div>
	<ul class="mt-1.5">
		<!-- The `(improvement.key)` key lets Svelte keep each row as the list redraws. -->
		{#each improvements as improvement (improvement.key)}
			{@const Icon = ICONS[improvement.key]}
			<li class="flex items-center gap-7.25 pl-2.5 max-lg:flex-wrap max-lg:py-2 lg:h-9.75">
				<Icon class="size-5.5 shrink-0 text-creation-ink-700" aria-hidden="true" />
				<div class="min-w-0 flex-1 max-lg:min-w-50">
					<p class="fs-12 lh-16 font-semibold text-creation-ink-950">{improvement.label}</p>
					<p class="fs-12 lh-15 text-creation-ink-275">{improvement.description}</p>
				</div>
				<Button
					variant="outline"
					href={improvement.href}
					class="h-8 min-w-34.75 rounded-md border-creation-panel-border bg-white px-3.5 fs-12 font-semibold text-creation-ink-800 hover:bg-creation-field hover:text-creation-ink-800 max-lg:min-h-11"
				>
					{improvement.actionLabel}
				</Button>
			</li>
		{/each}
	</ul>
</section>

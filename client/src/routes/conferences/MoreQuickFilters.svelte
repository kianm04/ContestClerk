<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import SquareDot from '@lucide/svelte/icons/square-dot';
	import { quickFilterChipClasses } from '$lib/button-classes';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import type { QuickFilterChip } from '$lib/conference-quick-filters';
	import { cn } from '$lib/utils';

	type Props = {
		/** The chips with no room in the row, from `quickFilterChips`. */
		chips: QuickFilterChip[];
	};

	let { chips }: Props = $props();

	// "More" is drawn light blue too while one of the chips inside it is on, so
	// the row still shows that the results are filtered.
	const hasActiveChip = $derived(chips.some((chip) => chip.isActive));
</script>

<!--
	"More" at the end of the row, after the mockup (Trello WMcXfry0): a shadcn
	`DropdownMenu`, as the account menu in the top bar is. It needs JavaScript
	to open; the regions it holds are tick boxes in the filter card as well, so
	a browser without scripting still reaches them there. The button is dressed
	as a chip by the same classes as the chips beside it, so the row matches.
-->
<DropdownMenu.Root>
	<DropdownMenu.Trigger
		class={cn(buttonVariants({ variant: 'outline' }), quickFilterChipClasses(hasActiveChip))}
	>
		<SquareDot size={18} strokeWidth={1.75} aria-hidden="true" />
		More
		<ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
	</DropdownMenu.Trigger>

	<DropdownMenu.Content align="end" class="min-w-56">
		<DropdownMenu.Group>
			<!-- The `(chip.key)` key lets Svelte reuse the lines instead of rebuilding them. -->
			{#each chips as chip (chip.key)}
				<!--
					Each line is a real link, so a chip's results can be opened in a new
					tab or shared as an address, like the chips in the row. A menu line is
					not a link by itself: the `child` snippet is how bits-ui hands the
					line's own attributes (`props`) to an element of ours instead, which
					is the one place this page uses a snippet. `min-h-11` makes the line
					44px, big enough for a finger, and `aria-current` marks the one the
					results are filtered by, in bolder words.
				-->
				<DropdownMenu.Item class="min-h-11 aria-[current=true]:font-semibold">
					{#snippet child({ props })}
						<a {...props} href={chip.href} aria-current={chip.isActive ? 'true' : undefined}>
							{chip.label}
						</a>
					{/snippet}
				</DropdownMenu.Item>
			{/each}
		</DropdownMenu.Group>
	</DropdownMenu.Content>
</DropdownMenu.Root>

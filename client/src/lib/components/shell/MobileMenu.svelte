<script lang="ts">
	import Menu from 'carbon-icons-svelte/lib/Menu.svelte';
	// `afterNavigate` runs the function it is given after every navigation from
	// one page to another, once the new page is on screen.
	import { afterNavigate } from '$app/navigation';
	import { buttonVariants } from '$lib/components/ui/button';
	// `* as Sheet` gathers the panel's parts under one name: `Sheet.Root`,
	// `Sheet.Trigger`, `Sheet.Content` and so on.
	import * as Sheet from '$lib/components/ui/sheet';
	import type { NavigationLink } from '$lib/navigation';
	import { cn } from '$lib/utils';
	import PrimaryNavigation from './PrimaryNavigation.svelte';

	type Props = {
		links: NavigationLink[];
		/** The address of the page being shown, so the right link is underlined. */
		pathname: string;
	};

	let { links, pathname }: Props = $props();

	// `bind:open` below keeps this in step with the panel, both ways.
	let isOpen = $state(false);

	// The bar stays on screen from page to page, so a followed link would leave
	// the panel open over the page it led to.
	afterNavigate(() => {
		isOpen = false;
	});
</script>

<!--
	The top bar has no room for the links below 1024px, so they move into a
	panel that slides in from the left. It needs JavaScript to open. `lg:hidden`
	takes the button away from 1024px up, where the links are back in the bar.
	The trigger draws its own `<button>`, so the button's look is passed in as
	a class rather than wrapping a `Button`.
-->
<div class="lg:hidden">
	<Sheet.Root bind:open={isOpen}>
		<Sheet.Trigger
			aria-label="Menu"
			class={cn(buttonVariants({ variant: 'ghost', size: 'icon-lg' }), 'size-11')}
		>
			<Menu size={20} class="size-5" />
		</Sheet.Trigger>

		<Sheet.Content side="left">
			<Sheet.Header>
				<Sheet.Title>Menu</Sheet.Title>
			</Sheet.Header>

			<nav aria-label="Main" class="px-4">
				<PrimaryNavigation {links} {pathname} direction="column" />
			</nav>
		</Sheet.Content>
	</Sheet.Root>
</div>

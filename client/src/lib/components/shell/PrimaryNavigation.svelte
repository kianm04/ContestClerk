<script lang="ts">
	import { activeLinkHref, type NavigationLink } from '$lib/navigation';
	// `cn` joins class names and lets a later class win over an earlier one.
	import { cn } from '$lib/utils';

	type Props = {
		links: NavigationLink[];
		/** The address of the page being shown, so the right link is underlined. */
		pathname: string;
		/**
		 * `row` is the strip across the top bar; `column` is the same links stacked
		 * inside the slide-in menu on a phone.
		 */
		direction: 'row' | 'column';
	};

	let { links, pathname, direction }: Props = $props();

	// `$derived` works this out again whenever `pathname` or `links` changes,
	// which is on every navigation. At most one link is marked.
	const activeHref = $derived(activeLinkHref(pathname, links));

	/*
		In the bar each link is as tall as the bar, so the light blue line under
		the page being read sits on the bar's own bottom rule. From 1024px to
		1280px the bar holds as many as six links, so they sit 8px closer there.
		In the slide-in menu the line moves to the left edge of the column.
		Written out in full, because Tailwind reads the class names out of this file.
	*/
	const LIST_CLASSES = {
		row: 'flex h-full items-stretch gap-1',
		column: 'flex flex-col'
	};
	const LINK_CLASSES = {
		row: 'h-full border-b-2 px-2 xl:px-3',
		column: 'min-h-11 flex-1 border-l-2 px-3'
	};

	/**
	 * The border is there on every link so the words do not shift by two pixels
	 * when a link becomes the active one; only its colour changes.
	 */
	function linkClasses(isActive: boolean): string {
		return cn(
			'flex items-center text-body transition-colors duration-150 motion-reduce:transition-none',
			LINK_CLASSES[direction],
			isActive
				? 'border-ring font-medium text-primary'
				: 'border-transparent text-muted-foreground hover:text-foreground'
		);
	}
</script>

<ul class={LIST_CLASSES[direction]}>
	<!-- The `(link.href)` key lets Svelte reuse list items instead of rebuilding them. -->
	{#each links as link (link.href)}
		<li class="flex">
			<a
				href={link.href}
				aria-current={link.href === activeHref ? 'page' : undefined}
				class={linkClasses(link.href === activeHref)}
			>
				{link.label}
			</a>
		</li>
	{/each}
</ul>

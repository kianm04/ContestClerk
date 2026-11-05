<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { SHOWCASE_STORIES, SHOWCASE_VIEWS, type ShowcaseView } from '$lib/landing-showcase';
	import { landingShowcaseUrl } from '$lib/urls';

	type Props = {
		/** The view shown now, whose half of the switch is lit. */
		view: ShowcaseView;
	};

	let { view }: Props = $props();

	// Each view's words and icon, in the order the switch shows them.
	const stories = SHOWCASE_VIEWS.map((option) => SHOWCASE_STORIES[option]);

	/**
	 * The classes of one half of the switch, on top of the ghost button's own:
	 * pale blue while its view is shown, with dark blue words, because the
	 * lighter link blue is too faint on pale blue to read.
	 */
	function optionClasses(option: ShowcaseView): string {
		const shared = 'h-10 flex-1 gap-2.5 rounded-full px-4 text-sm';

		if (option === view) {
			return `${shared} bg-brand-100 font-medium text-brand-900 hover:bg-brand-100 hover:text-brand-900`;
		}

		return `${shared} font-normal text-ink-900`;
	}
</script>

<!--
	The switch over the example, after the landing page's mockup (Trello
	RBz46aTQ). Each half is a shadcn `Button` with an `href`, which draws a
	plain link to `/` or `/?view=organiser`, so it works without JavaScript,
	and `load` in `+page.server.ts` reads the view back from the address.
	`data-sveltekit-noscroll` asks SvelteKit to keep the page where it is
	rather than jump back to the top, since only the example changes.
	`aria-current` tells a screen reader which view is shown, as the pale blue
	tells the eye.
-->
<nav
	aria-label="Example"
	class="mx-auto flex w-full max-w-[23.25rem] rounded-full bg-surface p-1 shadow-card"
>
	<!-- The `(story.view)` key lets Svelte reuse each link instead of rebuilding it. -->
	{#each stories as story (story.view)}
		<Button
			href={landingShowcaseUrl(story.view)}
			variant="ghost"
			data-sveltekit-noscroll
			aria-current={story.view === view ? 'page' : undefined}
			class={optionClasses(story.view)}
		>
			<!-- `<story.switchIcon />` draws whichever icon component the story holds. -->
			<story.switchIcon aria-hidden="true" />
			{story.switchLabel}
		</Button>
	{/each}
</nav>

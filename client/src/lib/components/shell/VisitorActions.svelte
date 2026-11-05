<script lang="ts">
	import Search from 'carbon-icons-svelte/lib/Search.svelte';
	import { Button } from '$lib/components/ui/button';
	import { conferenceListUrl, loginUrl, registerUrl } from '$lib/urls';

	type Props = {
		/** Where "Log in" and "Sign up" bring the visitor back to once they are in. */
		authDestination: string;
		/** False on the conference directory, whose own filter form is its search. */
		showsSearch: boolean;
	};

	let { authDestination, showsSearch }: Props = $props();
</script>

<!--
	The right of the top bar for a visitor: a magnifying glass that opens the
	conference directory, "Log in" and "Sign up". Given an `href`, `Button`
	draws a link. Neither way in is the dark blue button: that is kept for the
	one thing each page is for. All three are 44px tall, to stay tappable.
	The glass has no words beside it, so its name is in `aria-label`, and a
	phone has no room for it, so it appears from `md` (768px) up.
-->
{#if showsSearch}
	<Button
		href={conferenceListUrl()}
		variant="ghost"
		size="icon-lg"
		aria-label="Search conferences"
		class="hidden size-11 md:inline-flex"
	>
		<Search size={20} class="size-5" />
	</Button>
{/if}

<Button href={loginUrl(authDestination)} variant="ghost" class="h-11 px-3">Log in</Button>
<Button href={registerUrl(authDestination)} variant="outline" class="h-11 px-3">Sign up</Button>

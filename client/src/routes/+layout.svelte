<script lang="ts">
	import { invalidate } from '$app/navigation';
	// `page` from `$app/state` is the page being shown: its address, and the
	// result of the last form action. Reading it here is what lets the shell
	// underline the right link and show a flash message from any page at all.
	import { page } from '$app/state';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import AppFooter from '$lib/components/shell/AppFooter.svelte';
	import AppHeader from '$lib/components/shell/AppHeader.svelte';
	import FlashToast from '$lib/components/shell/FlashToast.svelte';
	import { isFlash, type Flash } from '$lib/flash';
	import { toastShownAtOnce } from '$lib/instant-form.svelte';
	import { MAIN_CLASSES, pageFrame, showsSiteFooter } from '$lib/page-frame';
	import type { LayoutProps } from './$types';

	// `data` is whatever the `load` functions for this layout returned, so it
	// holds the Supabase client, whoever is signed in, and what the bell shows.
	// `children` is the page being shown inside this layout.
	let { data, children }: LayoutProps = $props();

	/**
	 * The chair's console, the projector's display and the quick session pages
	 * each draw their own top line and their own `<main id="main">`, filling the
	 * window, so the app's header and footer are left out there (the session
	 * redesign; `03-design/app-shell.md`). An error page under one of these
	 * addresses has no top line of its own, so it keeps the header.
	 */
	const CONSOLE_ROUTE_PREFIXES = [
		'/conferences/[slug]/committees/[committeeSlug]/chair',
		'/conferences/[slug]/committees/[committeeSlug]/display',
		'/quick'
	];

	// `page.route.id` is the route's folder path, the same for every conference
	// and committee, so one comparison covers every chair page or live view.
	const isChairPage = $derived(
		CONSOLE_ROUTE_PREFIXES.some((prefix) => page.route.id?.startsWith(prefix) ?? false) &&
			!page.error
	);

	// `$lib/page-frame.ts` names the other pages drawn without the footer.
	const showsFooter = $derived(showsSiteFooter(page.route.id) && !isChairPage);

	// On the chair console a toast sits in the middle above the mode bar (`Toast`).
	const isChairConsole = $derived(isChairPage && page.route.id?.includes('/chair') === true);

	// How much room `<main>` gets: the ordinary frame, edge to edge under the top
	// bar, on the landing page up behind the bar too, or the whole window beside
	// an organiser's sidebar. `$lib/page-frame.ts` explains which page gets which.
	const frame = $derived(pageFrame(page.route.id, Boolean(page.error)));

	/*
		Two ways a message reaches the screen, and this picks whichever arrived.
		An action that stays on its page returns `{ flash }`, which lands in
		`page.form`; one that redirects leaves it in a cookie, which the layout's
		`load` read. `page.form` is whatever that page's action chose to return,
		so it is checked rather than trusted. An instant form can show a third
		kind the moment it is pressed, such as "Profile saved." (T142). It goes
		first, because the other two may still hold an earlier press's message,
		and it is gone again once the press is answered or has failed.
	*/
	const answeredFlash: Flash | null = $derived(
		isFlash(page.form?.flash) ? page.form.flash : (data.flash ?? null)
	);
	const flash: Flash | null = $derived(toastShownAtOnce() ?? answeredFlash);

	// `$effect` runs in the browser once the layout is on screen, and is the
	// right place to talk to something outside Svelte. Supabase tells us here
	// whenever the session changes (a token refresh, or signing out in another
	// tab), and `invalidate` then re-runs every load function marked with
	// `depends('supabase:auth')` so the header stops showing a stale user.
	// Returning a function tells Svelte how to tidy up afterwards.
	$effect(() => {
		const { data: listener } = data.supabase.auth.onAuthStateChange((_event, newSession) => {
			// `exp` in the claims and `expires_at` on a session are both the moment
			// the same access token runs out, so when the two differ this is a
			// different session from the one the page was rendered with.
			if (newSession?.expires_at !== data.claims?.exp) {
				invalidate('supabase:auth');
			}
		});

		return () => listener.subscription.unsubscribe();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>MUNMeet</title>
</svelte:head>

<!--
	The skip link is the first thing the Tab key reaches. It is invisible until
	then, and it jumps past the navigation straight to the page itself.
-->
<a
	href="#main"
	class="sr-only rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-30"
>
	Skip to content
</a>

<div class="flex min-h-screen flex-col">
	{#if !isChairPage}
		<AppHeader
			person={data.person}
			notifications={data.bellNotifications}
			unreadCount={data.unreadCount}
			now={data.now}
			pathname={page.url.pathname}
			nextParameter={page.url.searchParams.get('next')}
			hasOrganiserArea={data.hasOrganiserArea}
			hasApplications={data.hasApplications}
		/>
	{/if}

	{#if isChairPage}
		<!--
			A chair page draws its own top bar and its own `<main id="main">` under
			it, so the skip link jumps past the bar and the chair's tabs; see the
			chair layout.
		-->
		{@render children()}
	{:else}
		<main id="main" class={MAIN_CLASSES[frame]}>
			{@render children()}
		</main>
	{/if}

	{#if showsFooter}
		<AppFooter year={data.now.getFullYear()} />
	{/if}
</div>

<FlashToast {flash} isAboveModeBar={isChairConsole} />

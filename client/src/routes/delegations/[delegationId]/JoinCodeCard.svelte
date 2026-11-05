<script lang="ts">
	import { page } from '$app/state';
	import type { ResolvedPathname } from '$app/types';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import { absolutePath } from '$lib/urls';

	/*
		The dashboard and the members page both draw this card, which is why it
		sits in the folder above `members/` and is imported from there with `../`.
		The two differ only in the heading, the hint sentence and whether a closed
		delegation replaces the card with a notice, so those three are props.
	*/
	type Props = {
		/** The code itself, such as `H7KP3QWX`. The database mints it and nobody may change it. */
		joinCode: string;
		/** Where the link goes. Built with `joinDelegationUrl`, never by hand. */
		joinPath: ResolvedPathname;
		/** The card's title: "Join code" on the dashboard, "Invite" on the members page. */
		heading: string;
		/** One sentence under the code saying what the link is for. */
		hint: string;
		/**
		 * Drawn instead of the whole card once nobody can join any more, or `null`
		 * while they still can. `delegationClosedNotice` in `$lib/delegations` writes it.
		 */
		closedNotice: string | null;
	};

	let { joinCode, joinPath, heading, hint, closedNotice }: Props = $props();

	/*
		The whole address to share, such as `https://munmeet.app/join/H7KP3QWX`.

		`page` from `$app/state` is SvelteKit's read-only view of the request being
		drawn, so `page.url.origin` is the site this page was served from. It is
		the same on the server and in the browser, so the line below does not
		change once the page comes to life. `$derived` works it out again whenever
		the code changes.

		`joinPath` comes from `resolve()`, which answers with a *relative* address
		while a page is built on the server: on the dashboard it reads
		`../join/H7KP3QWX`, and gluing that straight onto the origin gives the
		nonsense `https://munmeet.app../join/H7KP3QWX`. `absolutePath` resolves it
		against the address of the page it was written on first. See its comment in
		`$lib/urls.ts`.
	*/
	const joinLink = $derived(`${page.url.origin}${absolutePath(joinPath, page.url.pathname)}`);

	// The wireframe in `members.md` labels the code "Join code" under the heading
	// "Invite". On the dashboard the heading already says "Join code", and a label
	// under it would say the same two words twice.
	const showsCodeLabel = $derived(heading !== 'Join code');

	// `$state` makes Svelte redraw when this changes, which is what puts the
	// "Link copied." line on the screen.
	let hasCopied = $state(false);

	/**
	 * Put the whole link on the clipboard.
	 *
	 * `navigator.clipboard` is a browser API: it exists only with JavaScript
	 * running, and only on a secure page (https, or localhost). When it is
	 * missing, or refuses, nothing is copied and nothing is claimed — and the
	 * reader loses nothing, because the link is printed under the code as plain
	 * selectable text that can be copied by hand. That text is what a reader
	 * with no JavaScript at all uses too.
	 */
	async function handleCopyLink() {
		if (!navigator.clipboard) {
			return;
		}

		try {
			await navigator.clipboard.writeText(joinLink);
			hasCopied = true;
		} catch {
			hasCopied = false;
		}
	}
</script>

{#if closedNotice}
	<Notice tone="warning">{closedNotice}</Notice>
{:else}
	<Card>
		<h2 class="font-display text-h2 text-brand-900">{heading}</h2>

		<div class="mt-2">
			{#if showsCodeLabel}
				<p class="text-label text-ink-600 uppercase">Join code</p>
			{/if}
			<p class="font-display text-h1-mobile tracking-widest">{joinCode}</p>
		</div>

		<p class="mt-2 text-small text-ink-600">{hint}</p>

		<!--
			The whole address as plain text. `break-all` keeps a long one inside the
			card instead of letting it run out past the edge.
		-->
		<p class="mt-1 text-body break-all">{joinLink}</p>

		<div class="mt-4">
			<Button label="Copy link" variant="secondary" type="button" onclick={handleCopyLink} />
		</div>

		<!--
			`aria-live` makes a screen reader read this out when it changes, without
			moving the reader away from the button. The paragraph is on the page from
			the start, and empty until there is something to say, because a live
			region only announces changes to itself.
		-->
		<p class="mt-2 min-h-5 text-small text-ink-600" aria-live="polite">
			{hasCopied ? 'Link copied.' : ''}
		</p>
	</Card>
{/if}

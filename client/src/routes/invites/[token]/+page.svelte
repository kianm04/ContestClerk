<script lang="ts">
	import MailX from '@lucide/svelte/icons/mail-x';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import AuthCard from '$lib/components/AuthCard.svelte';
	import Button from '$lib/components/Button.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import { inviteProblem } from '$lib/invites';
	import { logoutUrl, signedInHomeUrl } from '$lib/urls';
	import InviteSummary from './InviteSummary.svelte';
	import type { PageProps } from './$types';

	// `PageProps` comes from `./$types`, which SvelteKit writes for this one
	// folder. `data` is whatever `load` in `+page.server.ts` returned, and it is
	// worked out again whenever the address changes or an action on this page
	// finishes. `form` is what the `accept` action gave back when it refused,
	// and is `null` until somebody has pressed the button.
	let { data, form }: PageProps = $props();

	// `$derived` recalculates on its own whenever `data` or `form` changes.
	//
	// The problem the page can see for itself is worked out from `data.now`, the
	// moment the server rendered the page, rather than from the browser's clock,
	// so that the two cannot disagree about an invitation expiring between them.
	const knownProblem = $derived(
		data.invite ? inviteProblem(data.invite, data.myEmail, new Date(data.now)) : null
	);

	// What the action found when the button was pressed replaces it, because by
	// then the server has looked again.
	const problem = $derived(form?.problem ?? knownProblem);

	// The three refusals carry their own sentence; anything else the action says
	// is plain text.
	const errorText = $derived(problem?.message ?? form?.message ?? null);

	// Only the mismatch gets the "Log out" link, because logging in as somebody
	// else is the only one of the three a reader can do anything about.
	const isMismatch = $derived(problem?.kind === 'mismatch');

	// Nobody should be able to press a button that cannot work.
	const canAccept = $derived(problem === null);

	// Sends the form in the background and redraws the page without reloading
	// it (`$lib/in-place-form.svelte.ts`). `use:enhance` in the markup hands the
	// form over; without JavaScript it posts and reloads the page as before.
	const inPlaceForm = createInPlaceForm();
</script>

<svelte:head>
	<!-- A page nobody can share has nothing for a link card, so it writes its own
		title rather than using `PageMeta`, which asks for a description too. -->
	<title>Invitation · MUNMeet</title>
</svelte:head>

{#if data.invite}
	<!-- `AuthCard` is the centred `max-w-md` card the page file draws, the same
		box the sign in and sign up pages sit in. -->
	<AuthCard title="You are invited.">
		<!-- `get_invite` names the inviter, the conference and the address only
			while the invitation is open. A used or expired one has only its status
			to show, which the notice below says. -->
		{#if data.invite.status === 'pending'}
			<InviteSummary invite={data.invite} />
		{/if}

		{#if errorText}
			<div class="mt-4">
				<Notice tone="error">{errorText}</Notice>
			</div>
		{/if}

		{#if isMismatch}
			<a
				href={logoutUrl()}
				class="mt-2 inline-flex min-h-11 items-center text-small text-brand-700 hover:underline"
			>
				Log out
			</a>
		{/if}

		<!--
			An ordinary HTML form, so accepting works even if the JavaScript never
			loads. `action="?/accept"` names the action in `+page.server.ts` it
			posts to.
		-->
		<form
			method="post"
			action="?/accept"
			class="mt-6 flex flex-wrap gap-3"
			use:enhance={inPlaceForm.submit}
		>
			<Button
				label="Accept invite"
				variant="primary"
				isDisabled={!canAccept}
				isLoading={inPlaceForm.isBusy}
			/>

			<!-- A link rather than a second button: leaving changes nothing. -->
			<Button label="Not now" variant="secondary" href={signedInHomeUrl()} />
		</form>
	</AuthCard>
{:else}
	<div class="mx-auto w-full max-w-md py-4 md:py-8">
		<EmptyState
			icon={MailX}
			title="This invite does not exist."
			description="Ask the person who invited you for a new link."
			actionLabel="Go to your dashboard"
			actionHref={signedInHomeUrl()}
		/>
	</div>
{/if}

<script lang="ts">
	// `05-pages/auth/confirm-and-error.md` asks for the "link-off" icon, which
	// lucide now calls `unlink`.
	import Unlink from '@lucide/svelte/icons/unlink';
	import Button from '$lib/components/Button.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import PageMeta from '$lib/components/shell/PageMeta.svelte';
	import { describeAuthErrorReason } from '$lib/auth';
	import { forgotPasswordUrl, loginUrl, signedInHomeUrl } from '$lib/urls';
	import type { PageProps } from './$types';

	// `data` is whatever `load` in `+page.server.ts` returned: which of the three
	// reasons this was, and whether the visitor is signed in after all.
	let { data }: PageProps = $props();

	// `$derived` works the sentence out again whenever the reason changes.
	const description = $derived(describeAuthErrorReason(data.reason));
</script>

<PageMeta title="Link problem" description="This link from a MUNMeet email no longer works." />

<div class="mx-auto w-full max-w-md py-4 md:py-8">
	{#if data.isSignedIn}
		<!--
			The link failed, but following it signed the visitor in anyway, or
			they already were. Nothing is wrong for them, so the page says so.
		-->
		<EmptyState
			icon={Unlink}
			title="You are already logged in."
			description="There is nothing left to confirm."
			actionLabel="Go to MUNMeet"
			actionHref={signedInHomeUrl()}
		/>
	{:else}
		<EmptyState icon={Unlink} title="This link does not work any more." {description} />

		<div class="mt-4 flex flex-wrap justify-center gap-3">
			<Button label="Request a new link" variant="primary" href={forgotPasswordUrl()} />
			<Button label="Log in" variant="secondary" href={loginUrl()} />
		</div>
	{/if}
</div>

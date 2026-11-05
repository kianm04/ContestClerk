<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import Notice from '$lib/components/Notice.svelte';
	import type { ApplyRefusal } from '$lib/applications';
	import { applicationUrl, conferenceUrl, delegationUrl, newDelegationUrl } from '$lib/urls';

	type Props = {
		/** Which of the six reasons `canApply` gave, and the sentence for it. */
		refusal: ApplyRefusal;
		conferenceSlug: string;
		/** Whether this conference takes groups, which decides one of the links below. */
		acceptsDelegations: boolean;
		/** The application this person already has here, or `null`. */
		existingApplicationId: string | null;
		/** The delegation this person is already in here, or `null`. */
		existingDelegationId: string | null;
	};

	let {
		refusal,
		conferenceSlug,
		acceptsDelegations,
		existingApplicationId,
		existingDelegationId
	}: Props = $props();

	/** Where the one link under the sentence goes, and what it says. */
	type RefusalLink = {
		href: ResolvedPathname;
		label: string;
	};

	/**
	 * The link that belongs with this reason, or `null` when it has none.
	 *
	 * All six carry one now. The last two arrived with T25, which built
	 * `/delegations/[id]` and `/conferences/[slug]/delegations/new`: `resolve()`
	 * from `$app/paths` refuses an address whose folder is not under
	 * `src/routes/`, so until those pages existed neither link could be written.
	 *
	 * "Register a delegation" is offered only by a conference that takes them.
	 * Offering it otherwise would send the reader from one refusal straight to
	 * another, which is the dead end the apply panel on the conference page hit
	 * once already with its own button.
	 */
	function refusalLink(reason: ApplyRefusal): RefusalLink | null {
		if (reason.kind === 'already_applied' && existingApplicationId !== null) {
			return { href: applicationUrl(existingApplicationId), label: 'View your application' };
		}

		if (reason.kind === 'in_delegation' && existingDelegationId !== null) {
			return { href: delegationUrl(existingDelegationId), label: 'View your delegation' };
		}

		if (reason.kind === 'individuals_not_accepted' && acceptsDelegations) {
			return { href: newDelegationUrl(conferenceSlug), label: 'Register a delegation' };
		}

		if (reason.kind === 'in_delegation' || reason.kind === 'individuals_not_accepted') {
			return null;
		}

		return { href: conferenceUrl(conferenceSlug), label: 'Back to the conference' };
	}

	// `$derived` works the link out again whenever the reason changes.
	const action = $derived(refusalLink(refusal));
</script>

<!--
	The form is left out altogether when this is drawn: `canApply` has said why
	there is nothing here to fill in. The conference itself stays public, so this
	is a notice rather than a 404.
-->
<Notice tone="warning">
	<p>{refusal.message}</p>

	{#if action}
		<a href={action.href} class="text-brand-700 hover:underline">{action.label}</a>
	{/if}
</Notice>

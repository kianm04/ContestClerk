<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import { Button } from '$lib/components/ui/button';
	import type { PaperNumber } from '$lib/chair-resolutions';
	import type { PaperKind, PaperStatus } from '$lib/committee-papers';
	import PaperScreenControl from '$lib/components/committee-papers/PaperScreenControl.svelte';
	import type { PaperScreen } from '$lib/paper-on-screen';
	import ApproveForm from './ApproveForm.svelte';

	type Props = {
		/** The paper's title, the page's one heading. */
		title: string;
		/** The heading's id, which also names the text for a screen reader. */
		headingId: string;
		/** "Draft resolution · Submitted 15 March, 09:12 by Austria · Version 1". */
		metaLine: string;
		kind: PaperKind;
		status: PaperStatus;
		/** The number "Approve" offers, or `null` once the paper no longer waits for an answer. */
		proposedNumber: PaperNumber | null;
		/** "Resolutions", or "Directives" in a crisis committee, and the list's address. */
		back: { text: string; href: ResolvedPathname };
		/** The page with "Return to the authors" open, `?return=1`. */
		returnHref: ResolvedPathname;
		/** The page with "Withdraw at the sponsors' request" open, `?withdraw=1`. */
		withdrawHref: ResolvedPathname;
		/** Once the paper is introduced: whether it is on the projector, and where. Else `null`. */
		screen?: PaperScreen | null;
	};

	let {
		title,
		headingId,
		metaLine,
		kind,
		status,
		proposedNumber,
		back,
		returnHref,
		withdrawHref,
		screen = null
	}: Props = $props();
</script>

<!--
	Back to the list, the title with the dais's answer beside it, and the line
	of facts under it. While the paper waits, "Approve" is the page's one
	primary button and "Return to the authors" opens its dialog from the
	address, so both work without JavaScript. Once the paper is on the floor
	the dais puts it on the projector and steps through it clause by clause,
	and its sponsors may ask the dais to withdraw it.
-->
<a
	href={back.href}
	class="inline-flex min-h-11 items-center text-small text-link hover:underline sm:min-h-6"
>
	← {back.text}
</a>
<div class="mt-1 flex flex-wrap items-center justify-between gap-x-8 gap-y-3">
	<h1 id={headingId} class="font-display text-h1-mobile text-foreground sm:text-[1.875rem]/9">
		{title}
	</h1>
	{#if status === 'submitted' && proposedNumber}
		<div class="flex flex-wrap items-center gap-x-5 gap-y-3">
			<Button href={returnHref} variant="outline" size="lg" class="h-10 max-lg:h-11">
				Return to the authors
			</Button>
			<ApproveForm {kind} {proposedNumber} />
		</div>
	{:else if status === 'introduced'}
		<div class="flex flex-wrap items-center gap-x-4 gap-y-3">
			{#if screen}
				<PaperScreenControl {screen} />
			{/if}
			<Button href={withdrawHref} variant="outline" size="lg" class="h-10 max-lg:h-11">
				Withdraw at the sponsors' request
			</Button>
		</div>
	{/if}
</div>
<p class="mt-1 text-small text-muted-foreground">{metaLine}</p>

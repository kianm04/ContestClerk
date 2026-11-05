<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import type { LiveStatus } from '$lib/committee-room-live';
	import AddComment from 'carbon-icons-svelte/lib/AddComment.svelte';
	import { Button } from '$lib/components/ui/button';
	import PaperLivePaused from '$lib/components/paper-writing/PaperLivePaused.svelte';
	import PaperModeMenu from '$lib/components/paper-writing/PaperModeMenu.svelte';
	import PaperWritersPresent from '$lib/components/paper-writing/PaperWritersPresent.svelte';
	import PaperScreenControl from '$lib/components/committee-papers/PaperScreenControl.svelte';
	import type { LiveWriter } from '$lib/live-writers';
	import { openSuggestionsText } from '$lib/paper-comments';
	import type { PaperMargin } from '$lib/paper-margin-state.svelte';
	import type { PaperScreen } from '$lib/paper-on-screen';
	import type { SigningButton } from '$lib/paper-signing';
	import PaperStepButtons from './PaperStepButtons.svelte';

	type Props = {
		/** The paper's title, the page's one heading. */
		title: string;
		/** The heading's id, which also names the editor for a screen reader. */
		headingId: string;
		/** "Working paper · Lethal autonomous weapons systems · Saved", from `paperMetaLine`. */
		metaLine: string;
		/** The other authors writing now. Left out for somebody who only reads the paper. */
		writers?: LiveWriter[];
		/** Whether the live channel to the other authors is connecting, live or paused. */
		status?: LiveStatus;
		/** A live paper's margin, once the page's script runs: the mode, and the suggestions open. */
		margin?: PaperMargin;
		/** "Open for signatures", "Sign as Ghana" and the rest, or `null` for nothing to do. */
		signing?: SigningButton | null;
		/** "Comment", for a reader with no toolbar who may comment on the whole paper. */
		onComment?: () => void;
		/** Where "Submit to the dais" opens its dialog, while it is the author's next step. */
		submitHref?: ResolvedPathname | null;
		/** Where "Withdraw" opens its dialog, for an author of a paper with the dais. */
		withdrawHref?: ResolvedPathname | null;
		/** The suggestions the stored paper holds, counted before the margin's script runs. */
		openSuggestions?: number;
		/** For the dais on an introduced paper: whether it is on the projector, and where. Else `null`. */
		screen?: PaperScreen | null;
		/** The submit button's words, from `submitWords` in `$lib/crisis-papers.ts`. */
		submitLabel?: string;
		/** Where "Propose an amendment" goes, for a delegate on an introduced draft. */
		proposeHref?: ResolvedPathname | null;
		/** Where "Record copy" leads, once the paper passed. Else `null`. */
		recordHref?: ResolvedPathname | null;
	};

	let {
		title,
		headingId,
		metaLine,
		writers = [],
		status = 'connecting',
		margin,
		signing = null,
		onComment,
		submitHref = null,
		withdrawHref = null,
		openSuggestions = 0,
		screen = null,
		submitLabel = 'Submit to the dais',
		proposeHref = null,
		recordHref = null
	}: Props = $props();

	const suggestionCount = $derived(margin?.suggestionCount ?? openSuggestions);
	const hasButtons = $derived(
		Boolean(
			signing || onComment || submitHref || withdrawHref || screen || proposeHref || recordHref
		)
	);

	// `PaperWritersPresent` shows nobody while the channel is paused, so then no space is kept either.
	const isAnyoneShown = $derived(status !== 'paused' && writers.length > 0);
</script>

<!--
	The title, its line of facts, and the circles of the other authors writing
	now: beside the title on a desktop, under the facts on a phone, as the
	paper writer was drawn. One grid places the same three things at both
	widths, so the circles are drawn once: on a phone each takes a row of its
	own (`col-span-2`), and from `sm` up the circles move up into the first row,
	in the second column (`sm:row-start-1 sm:col-start-2`).
-->
<div class="mt-1 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-8">
	<h1
		id={headingId}
		class="col-span-2 font-display text-h1-mobile text-foreground sm:col-span-1 sm:text-[1.875rem]/9"
	>
		{title}
	</h1>
	<div
		class={[
			'col-span-2 row-start-3 sm:col-span-1 sm:col-start-2 sm:row-start-1',
			(isAnyoneShown || margin?.editor || hasButtons) && 'mt-3 sm:mt-0'
		]}
	>
		<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
			<PaperWritersPresent {writers} {status} />
			<!-- On a phone the mode moves here from the toolbar, which has no room for it. -->
			{#if margin?.editor}
				<div class="sm:hidden">
					<PaperModeMenu editor={margin.editor} isSuggesting={margin.isSuggesting} />
				</div>
			{/if}
			<!-- The id lets the button that submits the paper say why it has to wait. -->
			{#if suggestionCount > 0}
				<span
					id="open-suggestions"
					class="text-small whitespace-nowrap text-muted-foreground max-sm:hidden"
				>
					{openSuggestionsText(suggestionCount)}
				</span>
			{/if}
			{#if onComment}
				<Button variant="outline" size="lg" class="max-lg:h-11" onclick={onComment}>
					<AddComment size={16} aria-hidden="true" />
					Comment
				</Button>
			{/if}
			<PaperStepButtons
				{signing}
				{submitHref}
				isSubmitBlocked={suggestionCount > 0}
				{withdrawHref}
				{submitLabel}
				{proposeHref}
			/>
			{#if screen}
				<PaperScreenControl {screen} />
			{/if}
			{#if recordHref}
				<Button variant="outline" size="lg" class="max-lg:h-11" href={recordHref}
					>Record copy</Button
				>
			{/if}
		</div>
	</div>
	<p class="col-span-2 row-start-2 mt-1 text-small text-muted-foreground">{metaLine}</p>
</div>

{#if status === 'paused'}
	<div class="mt-2">
		<PaperLivePaused {status} othersWriting="the other authors'" />
	</div>
{/if}

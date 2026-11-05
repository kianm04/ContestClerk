<script lang="ts">
	import BulkActionBar from '$lib/components/BulkActionBar.svelte';
	import Button from '$lib/components/Button.svelte';

	type Props = {
		/** How many rows are ticked, which the bar counts. */
		selectedCount: number;
		/**
		 * Whether one of the two panels is open above the table. While it is, the
		 * bar is left out: the organiser has already chosen what to do and the
		 * panel's own button is the one to press, so a second row of actions would
		 * only be one more thing to read — and a bar stuck to the foot of the
		 * screen would sit over the panel's button.
		 */
		isPanelOpen: boolean;
		/**
		 * Where each bulk button posts to, built by `manageApplicationsActionUrl`
		 * so that the tab and the filters survive the post. See that helper.
		 */
		chooseAcceptAction: string;
		waitlistAction: string;
		chooseRejectAction: string;
		/**
		 * True while the press posting to a given formaction is on its way; see
		 * `$lib/in-place-form.svelte.ts`. Only "Accept…" and "Reject…" read it:
		 * they open a panel rather than deciding anything themselves, so the
		 * browser cannot predict their answer and shows a spinner instead.
		 * "Waitlist" changes the screen the moment it is pressed
		 * (`$lib/instant-form.svelte.ts`) and so has no spinner to show.
		 */
		isSending: (formAction: string) => boolean;
	};

	let {
		selectedCount,
		isPanelOpen,
		chooseAcceptAction,
		waitlistAction,
		chooseRejectAction,
		isSending
	}: Props = $props();
</script>

<!-- The buttons are in the table's post form, so each one sends every ticked box. -->
<p class="text-small text-muted-foreground">
	Tick several to accept, waitlist or reject them together.
</p>

{#if !isPanelOpen}
	<BulkActionBar {selectedCount}>
		<Button
			label="Accept…"
			variant="primary"
			size="dense-sm"
			formaction={chooseAcceptAction}
			isLoading={isSending(chooseAcceptAction)}
		/>
		<Button label="Waitlist" variant="secondary" size="dense-sm" formaction={waitlistAction} />
		<Button
			label="Reject…"
			variant="danger"
			size="dense-sm"
			formaction={chooseRejectAction}
			isLoading={isSending(chooseRejectAction)}
		/>
	</BulkActionBar>
{/if}

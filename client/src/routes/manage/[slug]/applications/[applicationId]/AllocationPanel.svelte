<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import type { SeatGroup } from '$lib/allocation';
	import Button from '$lib/components/Button.svelte';
	import SelectField from '$lib/components/SelectField.svelte';
	import { seatChoiceOptions } from '$lib/application-review';

	type Props = {
		/** The free seats, the applicant's preferred committees first. */
		seatGroups: SeatGroup[];
		/** The seat chosen when the last accept was refused, or `''`. */
		seatId: string;
		/** Why the last accept was refused, or `null`. */
		error: string | null;
		/** Where the form posts, keeping the queue the page was opened from. */
		formaction: string;
		/**
		 * The page's instant form (`$lib/instant-form.svelte.ts`), which accepts
		 * the application and fills the seat the moment this is pressed instead of
		 * waiting for the server (T142).
		 */
		onSubmit: SubmitFunction;
	};

	let { seatGroups, seatId, error, formaction, onSubmit }: Props = $props();

	/* `$derived` flattens the groups again whenever the free seats change. */
	const options = $derived(seatChoiceOptions(seatGroups));
</script>

{#if options.length === 0}
	<p class="text-body text-muted-foreground">
		Every seat is taken. Free a seat on the allocation page to accept this application.
	</p>
{:else}
	<!--
		One dropdown of "Committee · Seat" rather than two that depend on each
		other, because a second list that follows the first needs JavaScript and
		this form has to work without it.
	-->
	<form method="post" action={formaction} class="flex flex-col gap-3" use:enhance={onSubmit}>
		<SelectField
			isDense
			label="Seat"
			name="seatId"
			value={seatId}
			{options}
			{error}
			placeholder="Choose a seat"
			help="Only free seats are listed. The committees the applicant asked for come first."
		/>

		<div>
			<Button label="Accept and allocate" variant="primary" size="dense" />
		</div>
	</form>
{/if}

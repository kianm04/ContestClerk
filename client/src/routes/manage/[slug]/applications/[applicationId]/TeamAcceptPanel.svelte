<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import type { TeamAccept } from '$lib/application-teams';
	import Button from '$lib/components/Button.svelte';
	import SelectField from '$lib/components/SelectField.svelte';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';

	type Props = {
		/** The countries free in a different committee for every undecided member. */
		teamAccept: TeamAccept;
		/** The country chosen when the last accept was refused, or `''`. */
		countryCode: string;
		/** Why the last accept was refused, or `null`. */
		error: string | null;
	};

	let { teamAccept, countryCode, error }: Props = $props();

	// Sends the form in the background and redraws the page with the answer
	// (`$lib/in-place-form.svelte.ts`). Without JavaScript it posts and reloads.
	const inPlaceForm = createInPlaceForm();
</script>

<!--
	A team is given one country, not one seat (Trello pZNcdPqU): the server
	puts each member in that country's seat in a committee of their own, the one
	they asked for where it is free, and accepts all of them or none.
-->
{#if teamAccept.countryOptions.length === 0}
	<p class="text-body text-muted-foreground">
		No country has a free seat in enough committees for the whole team. Free seats on the allocation
		page, or take a member out of the team.
	</p>
{:else}
	<form
		method="post"
		action={teamAccept.formaction}
		class="flex flex-col gap-3"
		use:enhance={inPlaceForm.submit}
	>
		<SelectField
			isDense
			label="Country"
			name="countryCode"
			value={countryCode}
			options={teamAccept.countryOptions}
			{error}
			placeholder="Choose a country"
			help="Each member gets this country's seat in a different committee, the one they asked for where it is free."
		/>

		<div>
			<Button
				label="Accept the team"
				variant="primary"
				size="dense"
				isLoading={inPlaceForm.isSending(teamAccept.formaction)}
			/>
		</div>
	</form>
{/if}

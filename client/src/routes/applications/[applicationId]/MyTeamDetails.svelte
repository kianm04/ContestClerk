<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import type { MyTeam } from '$lib/application-teams';
	import Button from '$lib/components/Button.svelte';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';

	type Props = {
		team: MyTeam;
		/** False once the organisers have decided: the team is then only shown. */
		canChangeTeam: boolean;
	};

	let { team, canChangeTeam }: Props = $props();

	// Sends the form in the background and redraws the page with the answer
	// (`$lib/in-place-form.svelte.ts`). Without JavaScript it posts and reloads.
	const inPlaceForm = createInPlaceForm();
</script>

<!-- The team the applicant is in: the code their friends join with, and who has. -->
<div>
	<p class="text-label text-ink-600">Code</p>
	<p class="text-h2 tabular-nums">{team.joinCode}</p>
</div>

<!-- Names are not unique, so each one's place in the list is its key. -->
<ul class="flex flex-col divide-y divide-line border-y border-line">
	{#each team.memberNames as memberName, index (index)}
		<li class="py-2 text-body">{memberName}</li>
	{/each}
</ul>

{#if canChangeTeam}
	<form method="post" action="?/leaveTeam" use:enhance={inPlaceForm.submit}>
		<Button
			label="Leave the team"
			variant="secondary"
			size="dense"
			isLoading={inPlaceForm.isSending('?/leaveTeam')}
		/>
	</form>
{/if}

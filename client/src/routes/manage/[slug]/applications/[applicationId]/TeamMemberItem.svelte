<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import type { TeamMemberRow } from '$lib/application-teams';
	import Button from '$lib/components/Button.svelte';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import { statusLabel } from '$lib/status';

	type Props = {
		member: TeamMemberRow;
		/** Whether the reader may change the team; without it the row only reads. */
		canDecide: boolean;
		removeAction: string;
	};

	let { member, canDecide, removeAction }: Props = $props();

	// Sends the form in the background and redraws the page with the answer
	// (`$lib/in-place-form.svelte.ts`). Without JavaScript it posts and reloads.
	const inPlaceForm = createInPlaceForm();
</script>

<!-- One member of a team: their name, where they stand, their public profile. -->
<li
	class="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-1 border-b border-border py-2 last:border-b-0"
>
	<div class="min-w-0 flex-1">
		{#if member.reviewHref}
			<a href={member.reviewHref} class="text-body font-medium text-link hover:underline">
				{member.fullName}
			</a>
		{:else}
			<span class="text-body font-medium">{member.fullName}</span>
		{/if}
		<p class="text-small text-muted-foreground">
			{statusLabel('application_status', member.status)}
		</p>
	</div>

	<a href={member.profileHref} class="text-small text-link hover:underline">Public profile</a>

	{#if canDecide}
		<form method="post" action={removeAction} use:enhance={inPlaceForm.submit}>
			<input type="hidden" name="memberApplicationId" value={member.applicationId} />
			<Button
				label="Remove from team"
				variant="secondary"
				size="dense"
				isLoading={inPlaceForm.isSending(removeAction)}
			/>
		</form>
	{/if}
</li>

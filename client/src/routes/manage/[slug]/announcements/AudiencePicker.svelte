<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import SelectField from '$lib/components/SelectField.svelte';
	import {
		ANNOUNCEMENT_AUDIENCE_OPTIONS,
		type AnnouncementFormErrors,
		type AudienceChoice,
		type AudienceCount
	} from '$lib/announcement-form';
	import { recipientCountLine, type AnnouncementGroup } from '$lib/announcements';

	type Props = {
		/** The audience chosen so far. */
		choice: AudienceChoice;
		errors: AnnouncementFormErrors;
		/** False for a chair, who may address only their own committees. */
		mayAddressConference: boolean;
		committees: AnnouncementGroup[];
		/** Only the accepted delegations, which are the only ones with anybody to tell. */
		delegations: AnnouncementGroup[];
		/** Who the audience was last counted as, or null when it has not been counted. */
		audienceCount: AudienceCount | null;
		/** True while "Preview recipients" itself is on its way to the server. */
		isPreviewSending: boolean;
	};

	let {
		choice,
		errors,
		mayAddressConference,
		committees,
		delegations,
		audienceCount,
		isPreviewSending
	}: Props = $props();

	// `$derived` works these out again whenever the props change.
	const hasDelegations = $derived(delegations.length > 0);

	// "One delegation" is offered only once a delegation has been accepted,
	// because there is nobody else to pick. A chair is offered "One committee"
	// only, and the server refuses anything else they post.
	const audienceOptions = $derived(
		ANNOUNCEMENT_AUDIENCE_OPTIONS.filter((option) =>
			mayAddressConference
				? option.value !== 'delegation' || hasDelegations
				: option.value === 'committee'
		)
	);
	const audienceHelp = $derived(
		hasDelegations || !mayAddressConference
			? undefined
			: 'One delegation can be chosen once a delegation is accepted.'
	);
	const committeeOptions = $derived(
		committees.map((committee) => ({ value: committee.id, label: committee.name }))
	);
	const delegationOptions = $derived(
		delegations.map((delegation) => ({ value: delegation.id, label: delegation.name }))
	);
</script>

<!--
	The two pickers are always on the page and shown only while "One committee"
	or "One delegation" is chosen, with no JavaScript at all: the form around
	them has the `group` class, and `group-has-[…]` asks whether it holds a
	selected (`:checked`) option with that value. The browser works it out
	itself on every change.
-->
<div class="flex flex-col gap-4">
	<SelectField
		isDense
		label="Send to"
		name="audience"
		value={choice.audience}
		options={audienceOptions}
		error={errors.audience}
		help={audienceHelp}
		isRequired
	/>

	<div class="hidden group-has-[option[value=committee]:checked]:block">
		<SelectField
			isDense
			label="Committee"
			name="committeeId"
			value={choice.committeeId}
			error={errors.committeeId}
			options={committeeOptions}
			placeholder="Pick the committee"
		/>
	</div>

	<div class="hidden group-has-[option[value=delegation]:checked]:block">
		<SelectField
			isDense
			label="Delegation"
			name="delegationId"
			value={choice.delegationId}
			error={errors.delegationId}
			options={delegationOptions}
			placeholder="Pick the delegation"
		/>
	</div>

	<div class="flex flex-wrap items-center gap-x-3 gap-y-2">
		<!-- The count only changes when this button asks for it, so it says whom it counted. -->
		{#if audienceCount}
			<p class="text-small text-muted-foreground" aria-live="polite">
				{recipientCountLine(audienceCount.recipientCount)} · counted for {audienceCount.audienceLabel}
			</p>
		{/if}
		<!-- `skipsValidation` lets the count be asked for before the title and message are written. -->
		<Button
			label="Preview recipients"
			variant="secondary"
			size="dense-sm"
			formaction="?/preview"
			skipsValidation
			isLoading={isPreviewSending}
		/>
	</div>

	{#if audienceCount?.recipientCount === 0}
		<Notice tone="warning">
			Nobody will receive this yet. Announcements reach delegates once they have a seat.
		</Notice>
	{/if}
</div>

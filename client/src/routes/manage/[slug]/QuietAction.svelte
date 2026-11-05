<script lang="ts">
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import ActionRow from '$lib/components/manage/ActionRow.svelte';
	import ManageSection from '$lib/components/manage/ManageSection.svelte';
	import type { QuietAction } from '$lib/dashboard-layout';

	type Props = {
		/**
		 * Which one the phase offers, from `quietAction` in
		 * `$lib/dashboard-layout.ts`: "Unpublish" before the conference days while
		 * nobody holds a seat, "Archive" once a published conference is over.
		 */
		action: QuietAction;
		/** The conference's name, which the question names. */
		conferenceName: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { action, conferenceName }: Props = $props();
</script>

<!--
	The one action at the foot of the dashboard that takes the conference out of
	the directory. Each asks before it acts, in a dialog with JavaScript and on
	a confirmation page without it, and the action in `+page.server.ts` checks
	its own rule again, because a button being shown is not a rule.
-->
{#if action === 'unpublish'}
	<ManageSection title="If plans change">
		<ul>
			<ActionRow
				title="Unpublish this conference"
				detail="It becomes a draft again. Only possible while nobody holds a seat."
			>
				<ConfirmButton
					label="Unpublish"
					confirmTitle="Unpublish {conferenceName}?"
					confirmText="It disappears from the directory and applications close."
					formaction="?/unpublish"
					variant="soft-danger"
					size="dense-sm"
				/>
			</ActionRow>
		</ul>
	</ManageSection>
{:else}
	<ManageSection title="When everything is done">
		<ul>
			<ActionRow
				title="Archive this conference"
				detail="It stays on public profiles and in your list under Archived. Nothing is deleted."
			>
				<ConfirmButton
					label="Archive"
					confirmTitle="Archive {conferenceName}?"
					confirmText="Participants keep access; it leaves the directory."
					formaction="?/archive"
					variant="secondary"
					size="dense-sm"
				/>
			</ActionRow>
		</ul>
	</ManageSection>
{/if}

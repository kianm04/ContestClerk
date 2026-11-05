<script lang="ts">
	import ConferencePreview from '$lib/components/creation/ConferencePreview.svelte';
	import { creationPreview, type CreationDraft } from '$lib/creation-draft';
	import { closingWarning } from '$lib/creation-when';

	type Props = {
		/** The draft as the form now has it, so the preview follows the typing. */
		draft: CreationDraft;
		organizationName: string;
		/** When the page was drawn, as an ISO instant. */
		now: string;
	};

	let { draft, organizationName, now }: Props = $props();

	// This step's preview is the name, who runs it, when and where, who it is
	// for and its timezone, as the design lists them: the tagline and the
	// description wait for the Setup step's preview.
	const fullPreview = $derived(creationPreview(draft, organizationName, null));
	const preview = $derived({ ...fullPreview, tagline: null, description: null });
	// A closing date counted back from a first day that is too soon has passed already.
	const warning = $derived(closingWarning(draft, new Date(now)));
</script>

<ConferencePreview
	{preview}
	variant="when"
	note={{
		title: 'Application deadlines and scheduling',
		text: 'Your application deadlines, committee timeline and conference schedule will be based on these dates. You can edit them anytime.'
	}}
/>
{#if warning}
	<p class="mt-2 fs-14 lh-20 text-creation-ink-375">
		Applications would close on {warning.closesOn}, which has passed. Setup will suggest a later
		deadline.
	</p>
{/if}

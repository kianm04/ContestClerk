<script lang="ts">
	import {
		clearMembers,
		removeMember,
		type DraftChange,
		type QuickSessionDraft,
		type QuickSessionErrors
	} from '$lib/quick-session';
	import CommitteeMembers from './CommitteeMembers.svelte';
	import DelegationPicker from './DelegationPicker.svelte';

	type Props = {
		/** The draft as it stands. */
		draft: QuickSessionDraft;
		/** The messages of the last change or the last refused press. */
		errors: QuickSessionErrors;
		/** Called with the changed draft whenever a column changes it with JavaScript. */
		onChange: (change: DraftChange) => void;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { draft, errors, onChange }: Props = $props();

	function handleRemove(value: string) {
		onChange({ draft: removeMember(draft, value), errors: {} });
	}

	function handleClear() {
		onChange({ draft: clearMembers(draft), errors: {} });
	}
</script>

<!--
	The two columns of myMUN's "Set up new committee", which both quick
	session pages draw: what can be added on the left, the committee on the
	right. They fill the height the page leaves them, and each list scrolls
	inside its own column. On a phone they stack.
-->
<div class="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-2 md:grid-rows-[minmax(0,1fr)]">
	<DelegationPicker {draft} {errors} {onChange} />
	<CommitteeMembers
		members={draft.members}
		error={errors.members}
		onRemove={handleRemove}
		onClear={handleClear}
	/>
</div>

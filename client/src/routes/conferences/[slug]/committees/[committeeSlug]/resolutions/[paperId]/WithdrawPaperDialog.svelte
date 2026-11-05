<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ResolvedPathname } from '$app/types';
	import ManageDialog from '$lib/components/manage/ManageDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import type { PaperKind } from '$lib/committee-papers';
	import { CRISIS_WITHDRAW_TEXT, goesToCrisisStaff } from '$lib/crisis-papers';
	import { SUBMITTING_MESSAGES } from '$lib/paper-submitting';

	type Props = {
		/** The paper's title. */
		title: string;
		/** The paper's kind: a directive or a press release is with the crisis staff, not the dais. */
		kind: PaperKind;
		/** The paper's page with this dialog closed, where "Keep the paper" goes. */
		closeHref: ResolvedPathname;
	};

	let { title, kind, closeHref }: Props = $props();

	// Sent in the background, so the browser does not ask about unsaved text on the way out.
	const inPlace = createInPlaceForm();
</script>

<!--
	The confirmation "Withdraw" opens, for an author of a paper that has been
	to the dais and is not yet introduced. The red button is the confirming
	step; the one that opened this dialog was a plain outline.
-->
<ManageDialog title={SUBMITTING_MESSAGES.withdrawTitle(title)} {closeHref}>
	<p class="max-w-md text-body text-foreground">
		{goesToCrisisStaff(kind) ? CRISIS_WITHDRAW_TEXT : SUBMITTING_MESSAGES.withdrawText}
	</p>

	<form
		method="post"
		action="?/withdraw"
		use:enhance={inPlace.submit}
		class="flex flex-wrap gap-3 pt-3"
	>
		<Button
			type="submit"
			variant="destructive"
			size="lg"
			class="max-lg:h-11"
			disabled={inPlace.isBusy}
		>
			Withdraw paper
		</Button>
		<Button href={closeHref} variant="outline" size="lg" class="max-lg:h-11">Keep the paper</Button>
	</form>
</ManageDialog>

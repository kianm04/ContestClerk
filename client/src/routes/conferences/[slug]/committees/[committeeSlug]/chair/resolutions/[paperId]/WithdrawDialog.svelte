<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ResolvedPathname } from '$app/types';
	import ManageDialog from '$lib/components/manage/ManageDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';

	type Props = {
		/** "Draft resolution 1.1". */
		name: string;
		/** The paper's title. */
		title: string;
		/** The page with this dialog closed, where "Keep it on the floor" goes. */
		closeHref: ResolvedPathname;
	};

	let { name, title, closeHref }: Props = $props();

	const inPlace = createInPlaceForm();
</script>

<!--
	The confirmation "Withdraw at the sponsors' request" opens. Only this step
	is red; the button that opened it is plain. A withdrawn paper keeps its
	number, which is never given again.
-->
<ManageDialog title="Withdraw {name}?" description="“{title}”" {closeHref}>
	<p class="max-w-md text-body text-foreground">
		The paper leaves the floor and cannot be introduced again. Its number is not given to another
		paper.
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
		<Button href={closeHref} variant="outline" size="lg" class="max-lg:h-11">
			Keep it on the floor
		</Button>
	</form>
</ManageDialog>

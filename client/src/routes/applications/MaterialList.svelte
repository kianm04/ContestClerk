<script lang="ts">
	import type { CardMaterial } from '$lib/application-cards';
	import { TONE_FILL_CLASSES, TONE_TEXT_CLASSES } from '$lib/application-tone-classes';

	type Props = {
		materials: CardMaterial[];
	};

	let { materials }: Props = $props();
</script>

<!-- "Application materials": the form, then the payment once there is an invoice. -->
<div class="flex flex-col gap-1">
	<p class="text-small text-muted-foreground">Application materials</p>

	<ul class="flex flex-col">
		<!-- The `(material.label)` key lets Svelte reuse list items instead of rebuilding them. -->
		{#each materials as material (material.label)}
			<!--
				Each part, then where it stands as a word in its state's colour. The
				small dot before the word lets the eye find what is still owed down
				the column; the word alone says it to a screen reader.
			-->
			<li class="flex items-center gap-2 py-1">
				<span class="flex-1 text-foreground">{material.label}</span>
				<span aria-hidden="true" class="size-2 rounded-full {TONE_FILL_CLASSES[material.tone]}"
				></span>
				<span class="w-20 text-small {TONE_TEXT_CLASSES[material.tone]}">
					{material.statusLabel}
				</span>
			</li>
		{/each}
	</ul>
</div>

<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import type { PaperScreen } from '$lib/paper-on-screen';

	type Props = {
		/** Whether the paper is on the committee's projector, and which clause of it is. */
		screen: PaperScreen;
	};

	let { screen }: Props = $props();
</script>

<!--
	For the dais, on an introduced paper, on its reading page and on the
	dais's review of it: "Show on screen" puts it on the committee's projector,
	in place of the floor, at its start. While it is there, "Previous clause"
	and "Next clause" move the projector through it, and "Take off screen"
	gives the projector back to the floor. Each is a plain form posting to the
	page's action of the same name, so it works without JavaScript; the
	actions are shared (`$lib/server/paper-screen-actions.ts`).
-->
{#if screen.isOnScreen}
	<span class="text-small whitespace-nowrap text-muted-foreground">
		On screen{screen.step ? ` · ${screen.step.position}` : ''}
	</span>
	{#if screen.step}
		<!-- A disabled button cannot be pressed, so the projector never runs off either end. -->
		<form method="post" action="?/previousClause">
			<Button
				type="submit"
				variant="outline"
				size="lg"
				class="max-lg:h-11"
				disabled={!screen.step.hasPrevious}
			>
				Previous clause
			</Button>
		</form>
		<form method="post" action="?/nextClause">
			<Button
				type="submit"
				variant="outline"
				size="lg"
				class="max-lg:h-11"
				disabled={!screen.step.hasNext}
			>
				Next clause
			</Button>
		</form>
	{/if}
	<form method="post" action="?/takeOffScreen">
		<Button type="submit" variant="outline" size="lg" class="max-lg:h-11">Take off screen</Button>
	</form>
{:else}
	<form method="post" action="?/showOnScreen">
		<Button type="submit" size="lg" class="max-lg:h-11">Show on screen</Button>
	</form>
{/if}

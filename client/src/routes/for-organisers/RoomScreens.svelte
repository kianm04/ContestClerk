<script lang="ts">
	import ChairConsole from './ChairConsole.svelte';
	import DelegatePhone from './DelegatePhone.svelte';
	import ProjectorDisplay from './ProjectorDisplay.svelte';
</script>

<!--
	One committee room on three screens: the projector display at the back,
	the chair's console over its left side and a delegate's phone over its
	right, each with a caption under it. All three show the same speaker and
	the same clock, standing still at 0:23. On a phone there is no projector:
	the console, then the phone centred under it.

	The desktop staging places each screen by hand, and needs 66.75rem across,
	the width of the page's column. Below a 68rem window (1088px) the column is
	narrower than that, so the stacked phone arrangement is used there instead;
	`min-[68rem]:` is Tailwind's way of naming that one width.

	The picture is hidden from screen readers (`aria-hidden`), and the sentence
	before it says what it shows.
-->
<div>
	<p class="sr-only">
		The same committee room on three screens. The chair's console, the projector and a delegate's
		phone all show Kenya holding the floor in the Human Rights Council with 0:23 left of 1:30, and
		Brazil, Japan and Norway next on the speakers' list.
	</p>

	<div aria-hidden="true" class="relative flex flex-col text-ink-900 min-[68rem]:h-[32.25rem]">
		<div class="absolute top-0 right-0 hidden w-[36.75rem] min-[68rem]:block">
			<ProjectorDisplay />
			<span class="mt-2.5 block pl-40 text-caption font-medium text-ink-600">On the projector</span>
		</div>

		<div
			class="relative z-1 w-full min-[68rem]:absolute min-[68rem]:top-15 min-[68rem]:left-0 min-[68rem]:w-[38.75rem]"
		>
			<ChairConsole />
			<span class="mt-2.5 block text-caption font-medium text-ink-600">Chair's console</span>
		</div>

		<div
			class="relative z-2 mt-6 w-50 self-center min-[68rem]:absolute min-[68rem]:top-18 min-[68rem]:right-5 min-[68rem]:mt-0"
		>
			<DelegatePhone showsList />
			<span class="mt-2.5 block text-caption font-medium text-ink-600">Every delegate's phone</span>
		</div>
	</div>
</div>

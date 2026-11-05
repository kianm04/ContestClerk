<script lang="ts">
	type Props = {
		/** Which side slide this button lies over. */
		side: 'left' | 'right';
		/** The name of the stage on that slide, such as "Apply". */
		stage: string;
		onclick: () => void;
	};

	let { side, stage, onclick }: Props = $props();
</script>

<!--
	An invisible button over one of the carousel's side slides, so pressing the
	slide turns the carousel one stage towards it. It covers the part of the
	slide left showing beside the centre slide, plus a sliver of the centre
	slide's blank margin, so it is wide enough to press even on a phone, where
	only a narrow edge of the side slide shows. It sits above every slide
	(`z-10`) and draws only a focus ring.
-->
<button
	type="button"
	aria-label={side === 'left' ? `Previous stage: ${stage}` : `Next stage: ${stage}`}
	class={[
		'absolute inset-y-[12%] z-10 w-[40%] cursor-pointer rounded-[10px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
		side === 'left' ? 'right-[calc(100%-1rem)]' : 'left-[calc(100%-1rem)]'
	]}
	{onclick}
></button>

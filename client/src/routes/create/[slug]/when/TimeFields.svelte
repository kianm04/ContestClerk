<script lang="ts">
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import { announceChange } from './announce-change';
	import TimeSelectField from './TimeSelectField.svelte';

	type Props = {
		startTime: string;
		endTime: string;
		/** "Times not decided yet". */
		isTimesTba: boolean;
	};

	let {
		startTime = $bindable(),
		endTime = $bindable(),
		isTimesTba = $bindable()
	}: Props = $props();

	let switchRow: HTMLElement | undefined = $state(); // set by `bind:this`
</script>

<!--
	The daily start and end time, and the switch that says they are not known
	yet. These are three cells of the two-column grid in `DateRangeFields`: the
	two times side by side, the switch row across both columns, 24 pixels under
	them (22 of the grid's gap and 2 more).
-->
<TimeSelectField
	name="startTime"
	label="Start time"
	bind:value={startTime}
	isDisabled={isTimesTba}
/>
<TimeSelectField name="endTime" label="End time" bind:value={endTime} isDisabled={isTimesTba} />
<div class="col-span-2 mt-0.5 flex items-start gap-4.5 max-lg:col-span-1" bind:this={switchRow}>
	<!--
		shadcn's `Switch`, drawn at the design's size: a 48 by 26 track and a 22
		pixel knob, 2 pixels inside it at either end, that slides 22 pixels
		across when it is on. shadcn's own track has a one pixel border, which is
		not a design pixel and would leave the knob nearer one end than the other
		once the step is scaled, so `border-0` drops it. `*:data-checked:` reaches
		the knob, the root's child, once it is on (`data-state="checked"`), and
		replaces shadcn's own slide of "100% minus 2px". With a `name` the switch
		keeps a hidden checkbox that sends "on" with the form.
	-->
	<Switch
		id="timesTba"
		name="timesTba"
		aria-describedby="timesTba-help"
		bind:checked={isTimesTba}
		onCheckedChange={() => announceChange(switchRow)}
		class="mt-0.25 border-0 focus-visible:ring-2 focus-visible:ring-creation-blue-focus data-[size=default]:h-6.5 data-[size=default]:w-12 max-lg:my-2.25 data-checked:bg-creation-blue *:data-checked:translate-x-5.5! data-unchecked:bg-creation-radio-border [&_[data-slot=switch-thumb]]:ml-0.5 [&_[data-slot=switch-thumb]]:size-5.5! [&_[data-slot=switch-thumb]]:bg-white [&_[data-slot=switch-thumb]]:shadow-creation-pill"
	/>
	<div>
		<Label for="timesTba" class="fs-17 lh-24 font-semibold text-creation-ink-950 max-lg:min-h-11">
			Times not decided yet
		</Label>
		<p id="timesTba-help" class="mt-0.5 fs-15 lh-20 text-creation-ink-225">
			You can change the dates and times later.
		</p>
	</div>
</div>

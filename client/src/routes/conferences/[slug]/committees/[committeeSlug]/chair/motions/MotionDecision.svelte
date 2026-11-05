<script lang="ts">
	import {
		OUTLINED_BUTTON_CLASSES,
		PRIMARY_BUTTON_CLASSES,
		QUIET_BUTTON_CLASSES
	} from '$lib/console-buttons';
	import type { MotionDecision, MotionDecisionButton } from '$lib/motion-count';

	type Props = {
		/** Which of Pass and Fail is filled and which is disabled, with why (`motionDecision`). */
		decision: MotionDecision;
	};

	let { decision }: Props = $props();

	const REASON_ID = 'motion-decision-reason';

	/** A decision button's look: filled when the count agrees with it, outlined otherwise. */
	function buttonClasses(button: MotionDecisionButton): string {
		return decision.primary === button ? PRIMARY_BUTTON_CLASSES : OUTLINED_BUTTON_CLASSES;
	}

	/** The reason's id for the button it disables, so a screen reader reads why. */
	function describedBy(button: MotionDecisionButton): string | undefined {
		return decision.disabled === button ? REASON_ID : undefined;
	}
</script>

<!--
	The decision row, inside the motion's form: "Withdraw" quiet at the left,
	away from Pass, and at the right the reason, "Fail" and "Pass". Pass and
	Fail send `result`, so one form serves both. With no count they are two
	equal outlined buttons (P1); once counted, the one the count agrees with is
	filled and the other is disabled with its reason beside it. Without
	JavaScript the counts never reach this row, so both stay pressable and the
	server checks the count instead.
-->
<div class="flex items-end gap-2 max-md:flex-wrap">
	<button
		type="submit"
		formaction="?/withdraw"
		class="{QUIET_BUTTON_CLASSES} -ml-4 h-[52px] px-4 max-md:h-11"
	>
		Withdraw
	</button>
	<div class="ml-auto flex items-end gap-2 max-md:w-full max-md:flex-wrap">
		{#if decision.reason}
			<p id={REASON_ID} class="text-right text-small text-ink-600 max-md:w-full max-md:text-left">
				{decision.reason}
			</p>
		{/if}
		<button
			type="submit"
			name="result"
			value="failed"
			disabled={decision.disabled === 'fail'}
			aria-describedby={describedBy('fail')}
			class="{buttonClasses('fail')} h-[52px] min-w-[132px] max-md:min-w-0 max-md:flex-1"
		>
			Fail
		</button>
		<button
			type="submit"
			name="result"
			value="passed"
			disabled={decision.disabled === 'pass'}
			aria-describedby={describedBy('pass')}
			class="{buttonClasses('pass')} h-[52px] min-w-[132px] max-md:min-w-0 max-md:flex-1"
		>
			Pass
		</button>
	</div>
</div>

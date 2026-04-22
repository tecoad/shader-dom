import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createScheduler } from "./scheduler"

describe("createScheduler", () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it("does not call run on creation", () => {
		const run = vi.fn()
		createScheduler(run)
		expect(run).not.toHaveBeenCalled()
	})

	it("calls run once after invalidate, on next rAF", async () => {
		const run = vi.fn()
		const scheduler = createScheduler(run)
		scheduler.invalidate()
		expect(run).not.toHaveBeenCalled()
		await vi.advanceTimersByTimeAsync(17)
		expect(run).toHaveBeenCalledTimes(1)
	})

	it("coalesces multiple invalidates in the same frame into one run", async () => {
		const run = vi.fn()
		const scheduler = createScheduler(run)
		scheduler.invalidate()
		scheduler.invalidate()
		scheduler.invalidate()
		await vi.advanceTimersByTimeAsync(17)
		expect(run).toHaveBeenCalledTimes(1)
	})

	it("re-runs if invalidate fires after a previous run completed", async () => {
		const run = vi.fn()
		const scheduler = createScheduler(run)
		scheduler.invalidate()
		await vi.advanceTimersByTimeAsync(17)
		scheduler.invalidate()
		await vi.advanceTimersByTimeAsync(17)
		expect(run).toHaveBeenCalledTimes(2)
	})

	it("re-arms when invalidate is called during run", async () => {
		const run = vi.fn()
		const scheduler = createScheduler(run)
		run.mockImplementationOnce(() => {
			scheduler.invalidate()
		})
		scheduler.invalidate()
		await vi.advanceTimersByTimeAsync(17)
		await vi.advanceTimersByTimeAsync(17)
		expect(run).toHaveBeenCalledTimes(2)
	})

	it("does not run after dispose", async () => {
		const run = vi.fn()
		const scheduler = createScheduler(run)
		scheduler.invalidate()
		scheduler.dispose()
		await vi.advanceTimersByTimeAsync(17)
		expect(run).not.toHaveBeenCalled()
	})

	it("awaits async run before allowing re-run", async () => {
		let resolveRun!: () => void
		const run = vi.fn(
			() =>
				new Promise<void>(r => {
					resolveRun = r
				})
		)
		const scheduler = createScheduler(run)
		scheduler.invalidate()
		await vi.advanceTimersByTimeAsync(17)
		expect(run).toHaveBeenCalledTimes(1)
		scheduler.invalidate()
		await vi.advanceTimersByTimeAsync(17)
		expect(run).toHaveBeenCalledTimes(1)
		resolveRun()
		await vi.runAllTimersAsync()
		expect(run).toHaveBeenCalledTimes(2)
	})
})

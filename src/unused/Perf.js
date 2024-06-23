var Perf = {
	_timers: {},

	/**
	 * Start a timer with a given name.
	 * @param timerName {string}
	 */
	start(timerName) {
		if (!Perf._timers[timerName]) {
			Perf._timers[timerName] = {
				startTime: null,
				elapsedTime: 0
			};
		}
		Perf._timers[timerName].startTime = performance.now();
	},

	/**
	 * Stop a timer with a given name and calculate the elapsed time.
	 * @param timerName {string}
	 */
	stop(timerName) {
		if (Perf._timers[timerName] && Perf._timers[timerName].startTime !== null) {
			let stopTime = performance.now();
			Perf._timers[timerName].elapsedTime += stopTime - Perf._timers[timerName].startTime;
			Perf._timers[timerName].startTime = null;  // Reset start time
		}
	},

	/**
	 * Get the total time elapsed for each timer.
	 * @return {string[]}
	 */
	getReport() {
		let report = [];
		for (let timerName in Perf._timers) {
			report.push(`${timerName}: ${Perf._timers[timerName].elapsedTime.toFixed(2)} ms`);
		}
		return report;
	},

	clear() {
		this._timers = {};
	}
}

export default Perf;
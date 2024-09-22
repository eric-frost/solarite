//#IFDEV
/*@__NO_SIDE_EFFECTS__*/
export function assert(val) {
	if (!val) {
		debugger;
		throw new Error('Assertion failed: ' + val);
}

var Errors = {
	getStack(ignoreTop=0, ignoreRegex) {
		var e = new Error();
		if (!e.stack) return []; // There is no stack in IE.
		return e.stack
			.split('\n')
			.slice(ignoreTop+2)
			.map(line => line.trim().replace(/^at /, ''))
			.filter(line => !ignoreRegex || !line.match(ignoreRegex));
	}
}
//#ENDIF
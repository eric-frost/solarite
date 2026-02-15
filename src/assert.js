
/*@__NO_SIDE_EFFECTS__*/
export default function assert(val) {
	//#IFDEV
	if (!val) {
		//debugger;
		throw new Error('Assertion failed: ' + val);
	}
	//#ENDIF
}

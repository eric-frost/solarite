var Misc = {
	weakMemoize(obj, callback) {
		let result = weakMemoizeInputs.get(obj);
		if (!result) {
			result = callback(obj);
			weakMemoizeInputs.set(obj, result);
		}
		return result;
	}
};


let weakMemoizeInputs = new WeakMap();
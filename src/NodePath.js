export default {

	/** @return {int[]} Returns indices in reverse order, because doing it that way is faster. */
	get(node) {
		let result = [];
		while(true) {
			let parent = node.parentNode
			if (!parent)
				break;
			result.push(Array.prototype.indexOf.call(node.parentNode.childNodes, node))
			node = parent;
		}
		return result;
	},

	/**
	 * Note that the path is backward, with the outermost element at the end.
	 * @param root {HTMLElement|Document|DocumentFragment|ParentNode}
	 * @param path {int[]}
	 * @returns {Node|HTMLElement|HTMLStyleElement} */
	resolve(root, path) {
		for (let i=path.length-1; i>=0; i--)
			root = root.childNodes[path[i]];
		return root;
	}
}
import ExprPath from "./ExprPath.js";

// This ExprPath renders nothing.
export default class ExprPathComment extends ExprPath {

	constructor(nodeBefore, nodeMarker) {
		super(nodeBefore, nodeMarker);
	}
}
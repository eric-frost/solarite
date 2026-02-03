import Path from "./Path.js";

// This Path renders nothing.
export default class PathToComment extends Path {
	constructor(nodeBefore, nodeMarker) {
		super(nodeBefore, nodeMarker);
	}
}
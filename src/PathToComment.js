import PathTo from "./Path.js";

// This PathTo renders nothing.
export default class PathToComment extends PathTo {
	constructor(nodeBefore, nodeMarker) {
		super(nodeBefore, nodeMarker);
	}
}
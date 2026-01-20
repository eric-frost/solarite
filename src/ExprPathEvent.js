import ExprPath, {ExprPathType} from "./ExprPath.js";

// TODO: Merge this into ExprPathAttribValue?
export default class ExprPathEvent extends ExprPath {

	constructor(nodeBefore, nodeMarker, type, attrName=null, attrValue=null) {
		super(nodeBefore, nodeMarker, ExprPathType.Event, attrName, attrValue);
	}


}
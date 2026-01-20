import ExprPath, {ExprPathType} from "./ExprPath.js";

export default class ExprPathAttribValue extends ExprPath {

	constructor(nodeBefore, nodeMarker, type, attrName=null, attrValue=null) {
		super(nodeBefore, nodeMarker, ExprPathType.AttribValue, attrName, attrValue);
	}
}
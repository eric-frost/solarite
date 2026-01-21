

export default class ComponentInfo {
	constructor(component, attribs, children) {
		this.component = component;
		this.attribs = attribs;

		//this.children = children;

		// This way we can keep track of when the children change when we re-render
		this.childrenParent
		this.beforeFirstChild;
		this.afterLastChild;
	}
}

import h from '../src/Solarite.js';

let button = h({
	count: 0,

	inc() {
		this.count++;
		this.render();
	},

	render() {
		h(this, <button onclick={this.inc}>{this.count} times.<span contenteditable>a</span></button>);
	}
});
document.body.append(button);
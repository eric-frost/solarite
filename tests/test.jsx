
import {r} from '../src/Solarite.js';

let button = r({
	count: 0,

	inc() {
		this.count++;
		this.render();
	},

	render() {
		r(this, <button onclick={this.inc}>{this.count} times.<span contenteditable>a</span></button>);
	}
});
document.body.append(button);
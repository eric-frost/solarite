import {Solarite, h as r} from "../../../dist/Solarite.min.js";
import Draggable2 from "../util/Draggable2.js";
import Util from "../util/Util.js";

/**
 * Put this element between flex children to allow resizing them. */
export default class FlexResizer extends Solarite {

	onStart = Util.callback();
	onMove = Util.callback();
	onStop = Util.callback();
	
	/**
	 * @param unit {string} Can be 'px' or '%'
	 * @param thickness {int} Width of the resize drag area.
	 * @param vertical {?boolean} Whether this is an upright divider between side-by-side panes.  Leave it null to
	 *     work it out from the parent's flex-direction, which only works if the parent is already in the page when
	 *     this first renders.  A parent that is built before it is attached, as the playground is, has no computed
	 *     style yet, so it must say.  Same option as packchain's FlexResizer.ts. */
	constructor({unit='px', thickness=10, vertical=null}={}) {
		super();

		// Written as a bare attribute in a template, `vertical` arrives here as an empty string, which means true.
		let v = this.hasAttribute('vertical') ? this.getAttribute('vertical') : vertical;
		this.vertical = v === null || v === undefined ? null : v !== false && v !== 'false';
		this.thickness = parseFloat(this.getAttribute('thickness') ?? thickness);
		let u = this.getAttribute('unit') ?? unit;
		this.unit = ['px', '%'].includes(u) ? u : 'px';

		let prevEl, startSize, isVertical;
		let iframePointerEvents = new WeakMap(); // Store values of iframe pointer events.
		let draggable = new Draggable2(this, {
			onStart: e => {
				isVertical = this.isVertical();
				prevEl = this.previousElementSibling;
				startSize =  isVertical ? prevEl.offsetWidth : prevEl.offsetHeight;
				
				// Disable iframes
				for (let iframe of this.ownerDocument.querySelectorAll('iframe')) {
					iframePointerEvents.set(iframe, iframe.style.pointerEvents);
					iframe.style.pointerEvents = 'none';
				}
				
				this.onStart(draggable, e);
			},
			onMove: e => {
				let parentSizePx = isVertical
					? this.parentNode.offsetWidth
					: this.parentNode.offsetHeight;
				let dragDist = isVertical
					? draggable.totalDist.x
					: draggable.totalDist.y;
				let parentSize = this.unit==='%' ? 100 : parentSizePx;
				let newSize = this.unit==='%'
					? (startSize + dragDist) / parentSizePx * 100
					: (startSize + dragDist);
				if (newSize > parentSize)
					newSize = parentSize;
				this.setSize(newSize);
				this.onMove(draggable, e);
			},
			onStop: e => {
				
				// Re-enable iframes.
				for (let iframe of this.ownerDocument.querySelectorAll('iframe'))
					iframe.style.pointerEvents = iframePointerEvents.get(iframe); // restore prev value
				
				this.onStop(draggable, e);
			}
		});
	}

	/**
	 * It's vertical if the user drags the resizer vertically to resize.
   * When vertical, the resizer will be stretched horizontally to fill the available space.
	 * @returns {boolean} */
	isVertical() {
		if (this.vertical !== null)
			return this.vertical;
		if (this.parentNode) {
			return getComputedStyle(this.parentNode).flexDirection === 'row';
		}
	}

	/** @return {Number} */
	getSize() {
		let prev;
		let prev2 = this;
		while (prev2 = prev2.previousElementSibling) {
			if (prev2.style.display !== 'none' && prev2.tagName !== 'flex-resizer') {
				prev = prev2;
				break;
			}
		}

		return (this.isVertical() ? prev?.offsetWidth : prev?.offsetHeight) || 0;
	}

	/**
	 * @param size {Number} Width in pixels or percent. */
	setSize(size) {
		let prevEl = this.previousElementSibling;
		let nextEl = this.nextElementSibling;
        if (size < 0)
            size = 0;
		
		if (prevEl) {
			if (this.isVertical()) {
				if (nextEl) {
					let totalWidth = this.unit === '%'
						? (prevEl.offsetWidth + nextEl.offsetWidth) / this.parentNode.offsetWidth * 100
						: (prevEl.offsetWidth + nextEl.offsetWidth);
                    if (totalWidth - size < 0)
                        size = totalWidth;

					nextEl.style.minWidth = (totalWidth - size) + this.unit;
					nextEl.style.maxWidth = (totalWidth - size) + this.unit;
				}
				prevEl.style.minWidth = size + this.unit;
				prevEl.style.maxWidth = size + this.unit;
			}
			else {
				if (nextEl) {
					let totalHeight = this.unit === '%'
						? (prevEl.offsetHeight + nextEl.offsetHeight) / this.parentNode.offsetHeight * 100
						: (prevEl.offsetHeight + nextEl.offsetHeight);
                    if (totalHeight - size < 0)
                        size = totalHeight;
					nextEl.style.minHeight = (totalHeight - size) + this.unit;
					nextEl.style.maxHeight = (totalHeight - size) + this.unit;
				}
				
				prevEl.style.minHeight = size + this.unit;
				prevEl.style.maxHeight = size + this.unit;
			}
		}
	}

	render() {
		r(this)`
		<flex-resizer>
			<style>
				:host {
					display: block; z-index: 1;
				
					/* We put the resize region (the margin thickness) all to the right / top bc vertical scrollbars 
					 * are often to the left, and tab bars below the top.*/
					${this.isVertical()
			
						/* Stretch horizontally */
						? `min-width: ${this.thickness-1}px !important; max-width: ${this.thickness-1}px !important;
							margin-left: -1px; margin-right: -${this.thickness-1}px; cursor: ew-resize`
			
						/* Stretch vertically */
						: `min-height: ${this.thickness}px !important; max-height: ${this.thickness}px !important;
							margin-top: -${this.thickness/2}px; margin-bottom: -${this.thickness/2}px; cursor: ns-resize`
					};
				}
			</style>
		</flex-resizer>
	`}
}
customElements.define('flex-resizer', FlexResizer);
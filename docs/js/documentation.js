import Playground from "./Playground.js";



// We have to import like this b/c we're not a module.


document.addEventListener('DOMContentLoaded', () => {
	
	let dt = new DarkToggle();
	dt.setAttribute('style', 'position: fixed; top: 15px; right: 15px; cursor: pointer; transform: scale(2)');
	document.body.append(dt);
	


	// Convert all code blocks to use Playground.js
    for (let pre of document.querySelectorAll('pre.ty-contain-cm')) {
        let lines = [];
        for (let preLine of pre.querySelectorAll('pre.CodeMirror-line > span'))
            lines.push(preLine.textContent.replace(/\xa0/g, ' ').replace(/\n$/g, '').replace(/    /g, '\t'))
	    
	    let prefix = `
			<style>
				html[dark] { background: #0f1318; color: white }
				body { font: 12px Arial; background: transparent !important }
			</style>`;
        let value = lines.join('\n');
		
        let pg = new Playground({value, language: pre.getAttribute('lang'), width: 75, maxHeight: 1000, prefix, limitCodeEditorHeight: true})
        pre.replaceWith(pg);
    }
})

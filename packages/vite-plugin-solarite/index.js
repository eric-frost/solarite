/** vite-plugin-solarite — compiles .jsx/.tsx into Solarite precompile output before Vite's own JSX
 * handling runs (the `enforce: 'pre'` slot @vitejs/plugin-react uses), giving JSX the same runtime
 * speed as `h` tagged templates.  Build-time only; nothing is shipped to the browser. */
import { transform } from 'babel-plugin-solarite';

export default function solariteVite(options = {}) {
	return {
		name: 'vite-plugin-solarite',
		enforce: 'pre',
		transform(code, id) {
			const path = id.split('?')[0];
			if (!/\.[jt]sx$/.test(path)) return null;
			const result = transform(code, {
				filename: path,
				importSource: options.importSource,
				sourceMaps: true,
			});
			return { code: result.code, map: result.map };
		},
	};
}

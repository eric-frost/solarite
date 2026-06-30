/** esbuild-plugin-solarite — an onLoad plugin that compiles .jsx/.tsx into Solarite precompile
 * output before esbuild bundles, giving JSX the same runtime speed as `h` tagged templates.  esbuild
 * only ever sees plain JS.  Build-time only; nothing is shipped to the browser. */
import fs from 'node:fs';
import { transform } from 'babel-plugin-solarite';

export default function solariteEsbuild(options = {}) {
	return {
		name: 'esbuild-plugin-solarite',
		setup(build) {
			build.onLoad({ filter: /\.[jt]sx$/ }, async args => {
				const source = await fs.promises.readFile(args.path, 'utf8');
				const { code, map } = transform(source, {
					filename: args.path,
					importSource: options.importSource,
					sourceMaps: true,
				});
				let contents = code;
				if (map)
					contents += '\n//# sourceMappingURL=data:application/json;base64,' +
						Buffer.from(JSON.stringify(map)).toString('base64');
				return { contents, loader: 'js' };
			});
		},
	};
}

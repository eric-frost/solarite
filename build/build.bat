:<<"::CMDLITERAL"
@echo off
rem --------------------------------------
rem This is a polyglot script that runs on both Windows (as a .bat file)
rem and Linux/macOS (as a .sh file) to build the project.
rem --------------------------------------

cd %~dp0
deno run --allow-read --allow-write build.js ../src/Solarite.js ../dist/Solarite.js
copy "..\dist\Solarite.min.js" "..\benchmarks\solarite\Solarite.min.js"
GOTO :EOF
::CMDLITERAL

 # Linux/macOS version
 cd "$(dirname "$0")"
 deno run --allow-read --allow-write build.js ../src/Solarite.js ../dist/Solarite.js
 ln -sf "../../dist/Solarite.min.js" "../benchmarks/solarite/Solarite.min.js"

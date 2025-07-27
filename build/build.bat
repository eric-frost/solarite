:<<"::CMDLITERAL"
@echo off
rem --------------------------------------
rem This is a polyglot script that runs on both Windows (as a .bat file)
rem and Linux/macOS (as a .sh file) to build the project.
rem --------------------------------------

node build ../src/Solarite.js ../dist/Solarite.js
copy "..\dist\Solarite.min.js" "..\benchmarks\naive\Solarite.min.js"
copy "..\dist\Solarite.min.js" "..\benchmarks\watch\Solarite.min.js"
GOTO :EOF
::CMDLITERAL

# Linux/macOS version
node build ../src/Solarite.js ../dist/Solarite.js
cp "../dist/Solarite.min.js" "../benchmarks/naive/Solarite.min.js"
cp "../dist/Solarite.min.js" "../benchmarks/watch/Solarite.min.js"

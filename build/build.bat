@echo off
node build ../src/Solarite.js ../dist/Solarite.js
copy "..\dist\Solarite.min.js" "../benchmarks/naive/Solarite.min.js"
copy "..\dist\Solarite.min.js" "../benchmarks/watch/Solarite.min.js"

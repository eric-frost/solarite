:<<"::CMDLITERAL"
@echo off

rem --------------------------------------
rem This is a polyglot script that runs on both Windows (as a .bat file)
rem and Linux/macOS (as a .sh file) to execute the test suite.
rem Call this with no arguments to run all tests:
rem ./run.bat
rem
rem Or pass individual test and test group names separated by spaces like this:
rem ./run.bat StringUtil.nextInSequence ObjectUtilTest
rem --------------------------------------

deno run -A "%~dp0Testimony.js" --headless --webroot=../ --page=tests/index.html %*
GOTO :EOF
::CMDLITERAL

deno run -A "$(dirname "$0")/Testimony.js" --headless --webroot=../ --page=tests/index.html "$@"
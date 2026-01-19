## Code Style
Omit braces with if/for/foreach/do/while etc. statements when (and only when) they are not required.
Put the last */ of doc comments on the same line.
When writing CSS, put the selector and each of its rules on a single line.  Only insert line returns to prevent the total line being > 120 chars.
When writing web components, don't use shadow root.
When creating a database table, always have an int auto increment primary key named "id".
When a web component uses h(this) to render its HTML, if you see an element with the attribute data-id="propertyName", assume that the web component's this.propertyName points to that element.
When writing jsdoc for .js files, put variable names before the type, and use {int} and {float} instead of {number}
When writing phpdoc, put variable names after the type.
I import JavaScript modules directly in the browser, and I don't use a tools like npm or Yarn.  I don't use a build step.

## Documentation Style
Avoid being redundant when writing documentation and keep things short.  You don't need to document every parameter and the return value if a function's description already describes what they do.

Put the last trailing */ of a doc comment on the same line, not a line by itself.

When documenting the return value, use @return, not @returns.

## Tests
Test are hierarchical, so we can easily run groups of tests.  Test names are written as group.testName or group.subgroup.testName.

The second argument to Testimony.test() can optionally be a sentence describing what the test does.

Tests are run using Testimony.js, which is a custom test runner that allows selecting checkboxes of tests to run in the browser, or can be run from the command line.  It is for both php and js tests.  You will run it from the command line via:

./tests/run.bat testGroup

-or-

cd tests
./run.bat testGroup.testName testGroup.testName2

You can create new test files in the tests folder, using other tests there as a guide.
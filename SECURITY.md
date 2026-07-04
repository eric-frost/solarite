# Security Policy

## Supported versions

Solarite is pre-1.0 and ships fixes only on the latest release line.

| Version | Supported |
| ------- | --------- |
| 0.7.x   | ✅        |
| < 0.7   | ❌        |

## Reporting a vulnerability

Please report security issues **privately**, not through public issues or Discussions.

Use GitHub's private vulnerability reporting: go to the [Security tab](https://github.com/eric-frost/solarite/security) and click **"Report a vulnerability."** This opens a private advisory visible only to you and the maintainer.

Please include:

- A description of the issue and its impact.
- Steps to reproduce, or a minimal proof of concept.
- The Solarite version and browser affected.

You can expect an acknowledgement within a few days. Once a fix is ready, it will be released and the advisory published with credit to the reporter (unless you prefer to remain anonymous).

## Scope

Solarite is a client-side rendering library that builds DOM from your templates. Note that expressions inside `h` templates are inserted as live values, so treat any template built from untrusted input the same way you would treat `innerHTML`. Reports of injection through untrusted template input, prototype pollution, or similar are in scope.

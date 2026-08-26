# Security Policy

## Supported versions

The API is unstable until 1.0.0. Only the latest published version receives fixes; there are
no maintenance branches for older 0.x releases.

## Reporting a vulnerability

Report privately through
[GitHub Security Advisories](https://github.com/VuelaLibre-net/soarwx/security/advisories/new).
Please do not open a public issue for a vulnerability.

Include the version, a minimal reproduction, and what an attacker gains. Expect an
acknowledgement within a week. Once a fix is released the advisory is published with credit,
unless you ask otherwise.

## Attack surface

The published bundle has **no runtime dependencies** and makes exactly one kind of outbound
request: `soarwx/openmeteo` calls the Open-Meteo HTTPS API. Every other module is pure
computation, enforced by lint rules that ban `fetch`, `XMLHttpRequest` and all Node APIs
outside that module. The package reads no files, no environment variables and no credentials,
and the Open-Meteo free tier needs no API key.

Things worth reporting: a way to make `soarwx/openmeteo` reach a host other than the
configured Open-Meteo endpoint; a crafted API response that causes unbounded memory or CPU
use instead of a `Result` error; a render function whose SVG output escapes its context when
fed hostile site data.

## Scope note

This library produces an **advisory forecast**. A wrong number is a correctness bug, not a
vulnerability — report it as an issue. It does not replace an official weather briefing or
the pilot in command's judgment, and it is not certified for any operational use.

# Security policy

## Supported versions

Only the latest release (the newest `vX.Y.Z` tag, see `CHANGELOG.md`) receives security fixes. A fix is published as a new release; older releases are not patched. If you run an older release, update to the latest one (README → Operations → Update to a release).

## Reporting a vulnerability

Please report vulnerabilities **privately**, never in a public issue, pull request or discussion.

Use GitHub's private vulnerability reporting: on the repository page, open the **Security** tab, then **Report a vulnerability**. The report is visible only to the maintainers.

Please include:

- the release (or commit) affected;
- the steps to reproduce, or a proof of concept;
- the impact as you understand it (what an attacker can read, change or prevent, and with which role, if any).

Do not test against a deployment you do not run yourself, and do not access, change or delete other people's data.

## What happens next

| Step | Time |
|---|---|
| Acknowledgement of your report | within 7 days |
| First assessment (confirmed or not, severity) | within 14 days |
| Fixed release for a critical or high severity issue | within 30 days of the confirmation |
| Fixed release for a medium or low severity issue | in the next monthly maintenance release |

We keep you informed in the private advisory, agree with you on a publication date, and publish a GitHub security advisory with the fixed release. You are credited in the advisory unless you prefer not to be.

## Scope

In scope: the code of this repository (backend, frontend, the deployment files in `deploy/`) and the vendored libraries in `frontend/assets/vendor/` as they are used by Tacto. Weaknesses of a particular server (its operating system, its Nginx or TLS settings beyond `deploy/nginx`) are out of scope; report them to whoever runs that server.

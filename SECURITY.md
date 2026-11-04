# Security policy

## Supported versions

Only the current `main` branch is supported. Please reproduce reports against
the latest version where possible.

## Reporting a vulnerability

Do not report security vulnerabilities through public issues. Private
vulnerability reporting is enabled for this repository. On GitHub, open the
repository's **Security** tab, choose **Report a vulnerability**, and submit the
private report form. See [GitHub's private vulnerability reporting
instructions](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/report-privately).

If GitHub's reporting form is unavailable, email `siebrand@kitano.nl` with the
subject prefix `SECURITY:`.

Include the impact, reproduction steps, affected component, and any suggested
remediation. You will receive an acknowledgement as soon as reasonably
possible, followed by coordinated remediation and disclosure.

## Scope

In scope are the static application, build scripts, Docker/Nginx configuration,
recipe-data processing, and repository automation. Do not include secrets,
personal data, or live credentials in reports.

# Security policy

## Supported versions

Only the current `main` branch is supported. Historical version tags identify
individual commits but do not receive separate support. Use the latest version
when reporting. The CalVer ID appears in every deployed page's footer; include
it and the full commit SHA when reporting a released version. Published GitHub
releases include an SPDX SBOM for the corresponding Nginx image.

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

The scope includes the static application, the Docker and Nginx
configuration, the recipe data validation script, and the CI workflows. Do not
put secrets, personal data, or live credentials in a report.

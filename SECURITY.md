# Security policy

Ops-Copilot is a portfolio and research demonstration of an industrial troubleshooting assistant, an offline manufacturing-risk case study, and a read-only GitHub REST API auditor. It is **not** a production-certified operational safety or cybersecurity system.

## Privately report a vulnerability

**Do not open a public issue or pull request containing exploitable details, credentials, user documents, tokens or factory information.**

- Preferred contact: [senanur.cetin.work@gmail.com](mailto:senanur.cetin.work@gmail.com), subject **Ops-Copilot security report**.
- If GitHub's [private vulnerability reporting](https://github.com/senanurcetin/Ops-Copilot/security/advisories) feature has been enabled for this repository, you may also use its **Report a vulnerability** form. The presence of this link alone does not confirm the feature is enabled.

Useful details include the affected commit/version, reproducible steps using **synthetic data**, observed/expected behavior, potential impact, and any safe suggested remediation. Avoid attaching live exploit payloads that could disclose user or plant information.

This is a single-maintainer project. Reports are triaged on a best-effort basis; response and remediation times depend on severity and maintainer availability and **are not guaranteed**. Please allow reasonable time for assessment before public disclosure.

## Boundaries and known limitations

- **Industrial usage:** This project does not provide validated plant operating procedures or safety controls. Never use its AI outputs to override an approved operator procedure, interlock, permit-to-work process, or engineering authority.
- **Authentication and secrets:** The application uses Firebase authentication and Firestore. Check the specific deployed configuration and applicable rules before asserting tenant isolation. Store credentials in environment variables, not source code.
- **Language-model content:** Retrieved documentation and generated text can be wrong, malicious or incomplete. Treat source passages as untrusted input and require operator verification.
- **GitHub REST integration:** The standalone auditor calls read-only Actions endpoints. For private repositories, use a narrowly scoped `Actions: read` token; keep it out of command lines, reports, examples and tickets.
- **Benchmarks:** Manufacturing-model results are offline case-study estimates, not production guarantees.
- **Deployment:** Security posture depends on hosting, dependency versions, environment configuration and ongoing maintenance; this policy is not a compliance certificate.

## Supported versions

Security fixes, when feasible, target the current `main` branch. Historical commits, forks, and third-party deployments have no promised support or patch schedule. Project maturity and status are described in [README.md](README.md).

## Ordinary bugs and questions

For non-security issues, use the repository's [issue tracker](https://github.com/senanurcetin/Ops-Copilot/issues) or consult [CONTRIBUTING.md](CONTRIBUTING.md). Developer support: [senanur.cetin.work@gmail.com](mailto:senanur.cetin.work@gmail.com).

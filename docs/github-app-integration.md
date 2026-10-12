# GitHub App integration — local installation authentication

**Status:** implementation scaffold tested offline; no GitHub App has been registered, installed or deployed by this change. This is optional for GitHub Developer Program eligibility.

The existing [GitHub Actions auditor](github-actions-integration.md) already reads the public REST API. A GitHub App installation is useful when repository owners need scoped access to private CI history without sharing broad personal access tokens.

## Registration — account owner action

1. Open [GitHub App settings](https://github.com/settings/apps) and create a new app if desired.
2. Enter a recognizable name and an appropriate public homepage URL such as this repository. Confirm the app's visibility and who can install it.
3. Under **Repository permissions**, choose **Actions: Read-only**. Do not request Contents write, Workflows write, Administration or other unneeded permissions.
4. Configure webhook delivery according to actual needs. This local, request-driven CLI does not require incoming webhooks; do not expose a fake webhook URL.
5. Create the app, install it on your own GitHub account, and grant access only to the specific repository you intend to inspect.
6. Generate a private key from the GitHub App settings page. Store the `.pem` file **outside** the repository. Protect it with operating-system file permissions. Never upload it to a cloud document, ticket or chat.
7. Record the **App ID** and **installation ID**. They are distinct from the App's client ID and cannot be guessed or fabricated.

No step above has been performed by the assistant automatically. Creating/installing the app or agreeing to GitHub terms needs the account owner's action.

## Local run after registration

The installed app must have authorized the target repository. Node.js 20+ is required.

```bash
# Set environment variables for your own OS or shell.
export GH_APP_ID="YOUR_NUMERIC_APP_ID"
export GH_APP_INSTALLATION_ID="YOUR_NUMERIC_INSTALLATION_ID"
export GH_APP_PRIVATE_KEY_PATH="/secure/path/to/github-app-private-key.pem"

node scripts/github-app-audit.mjs OWNER/REPO --limit 5 --markdown
node --test tests/github-app-auth.test.mjs
```

PowerShell uses `$env:GH_APP_ID = "..." ` and equivalent variable assignments.

The authentication module signs an **RS256 JWT** with an issued-at offset of −60 seconds and an expiry of +540 seconds, then exchanges that JWT using GitHub's official `POST /app/installations/{installation_id}/access_tokens` endpoint. It explicitly asks for `repositories: [targetRepo]` and `permissions: { actions: "read" }` and uses the resulting short-lived installation token **only in memory** to call read-only Actions endpoints. This token exchange is an authentication operation; it does not trigger Actions, change repository settings or publish any app.

## Security and limitations

- The private key is never included in the repository or accepted through CLI arguments; only its local file path is used. Tokens, JWTs and key material are not written to reports or logs.
- A production integration should use a dedicated secret manager, rotation, rate-limit handling, audit logs that omit secrets, and an appropriate GitHub App lifecycle/installation flow. This repo implements a local developer integration, **not** a hosted OAuth/webhook service.
- GitHub may deny installation-token creation for unapproved permissions, a different installation/repository, or an invalid key. Our code fails without printing response bodies that could contain secrets.
- Reported elapsed job-minutes are sampled diagnostics and not GitHub billing.
- This setup does not confirm GitHub Developer Program admission, a GitHub Marketplace listing or public app publication.

Official references: [GitHub App JWT](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app), [installation access tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app), [least-privilege permissions](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app).

Developer support: senanur.cetin.work@gmail.com.

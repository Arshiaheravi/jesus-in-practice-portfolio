# Optional Render deployment

Hosting is not required for this portfolio. These examples are provided for developers who choose to deploy their own installation. No service, paid plan, domain or provider account is created by CI.

## Available examples

| File                             | Purpose                                                                                         |
| -------------------------------- | ----------------------------------------------------------------------------------------------- |
| `deployment/render-preview.yaml` | Two free preview web services, no database/worker/custom domain, all provider features disabled |
| `render.yaml`                    | Two paid native Node services with example domains; initially preview mode                      |
| `deployment/render-worker.yaml`  | Separate optional paid scheduler; enable only after the dashboard is ready                      |

Review current [Render pricing](https://render.com/pricing), [free limits](https://render.com/docs/free), region choices and the creation screen before applying a Blueprint. Applying it can create billable resources and immediately deploy, even with automatic deployment disabled. Free sleeping services are inappropriate for dependable scheduled delivery.

## Configure your installation

1. Fork the repository and connect only the intended repo to your Render account. Use the tested revision and an explicit release process.
2. Replace `example.com` and `app.example.com` in the paid examples with your own domains, or use the provider-issued HTTPS URLs. The free preview resolves its origins through `RENDER_EXTERNAL_URL` service references; verify the actual resolved values and cross-app links.
3. Keep the repository root as the service build root. Preserve pinned Node/pnpm, frozen installs and app-specific build commands. Native `start:host` reads `PORT` and binds `0.0.0.0`; local `preview` deliberately binds to loopback.
4. Set your own public identity/contact values in both apps. Keep server secrets in Render environment settings, not YAML or browser variables. The dashboard `.env.example` and [provider setup](provider-setup.md) describe the settings.
5. Follow [release guidance](release.md) before selecting live mode or enabling providers. Supabase Auth email is needed for real sign-in. Rebuild after public-mode/origin changes.
6. Configure your DNS from the exact values Render provides. Verify HTTPS, canonical redirects, private cookies, cross-app navigation, health, callbacks and errors before enabling capabilities.
7. Start the worker only after the database, consent, provider and operations checks pass. It must use the dashboard's existing `CRON_SECRET`; generating a different value breaks authorization. Configure separate readiness monitoring and recovery alerts.

Keep public indexing disabled for previews. Record actual deployment IDs, commit, URLs and smoke-test results for your environment. Configuration examples and local test results do not establish a hosted release.

The container/Compose/proxy examples are an alternative to native Render services. Verify them separately if selected; no container or cloud deployment is claimed by the portfolio checks.

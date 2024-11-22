Wrangler CLI Telemetry

Cloudflare gathers non-user identifying telemetry data about usage of Wrangler, the command-line interface for building and deploying Workers and Pages applications.

You can opt out of sharing telemetry data at any time (see below).

Why are we collecting telemetry data?

Telemetry in Wrangler allows us to better identify bugs and gain visibility on usage of features across all users. It also helps us to make data-informed decisions like adding, improving or removing features. We monitor and analyze this data to ensure Wrangler’s consistent growth, stability, usability and developer experience. For instance:

If certain errors are hit more frequently, those bug fixes will be prioritized in future releases 
Understanding usage of Wrangler features

What telemetry data is Cloudflare collecting?
Arguments and sanitized flags given to Wrangler (e.g. npx wrangler deploy, npx wrangler dev) 
Your usage of various Cloudflare products (e.g. Workers KV, D1, R2) 
Package manager being used (e.g. npm, yarn)
The version of Wrangler being run (e.g. 3.70.0)
Number of first time Wrangler downloads
Total session duration of wrangler dev (e.g. 30 seconds, etc.)
General machine information such as OS Version, CPU architecture (e.g. macOS, x84)

Cloudflare will receive the IP address associated with your machine and such information is handled in accordance with Cloudflare’s Privacy Policy.

What happens with sensitive data?

Cloudflare takes your privacy seriously and does not collect any sensitive information including: any  usernames, raw error logs and stack traces, file names/paths and content of files, and environment variables. Data is never shared with third parties.

How can I view analytics data?

To view what is being collected while using Wrangler, provide the environment variable in your command

WRANGLER_LOG=debug

(e.g. WRANGLER_LOG=debug npx wrangler deploy)

Analytics source code can be viewed at https://github.com/cloudflare/workers-sdk/tree/main/packages/wrangler/src/metrics). It is run in the background and will not delay project execution. As a result, when necessary (e.g. no internet connection), it will fail quickly and quietly.

How can I configure Wrangler telemetry?

If you would like to disable telemetry, you can run:

npx wrangler telemetry disable

You may also configure telemetry on a per project basis by adding the following filed to your project’s wrangler.toml:

send_metrics=false

Alternatively, you may set an environment variable to disable telemetry.

WRANGLER_TELEMETRY_DISABLE=1

If you would like to re-enable telemetry globally, you can run:

npx wrangler telemetry enable

If you would like to check the status of Wrangler telemetry, you can run:

npx wrangler telemetry status

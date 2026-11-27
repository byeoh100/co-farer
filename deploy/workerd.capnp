# Co-farer on plain workerd (docs/MIGRATION.md, Phase 1).
#
# Phase 2d: no DeepSpace platform plumbing; four Durable Object classes.
#
# Run with `npm run workerd` (scripts/workerd-run.mjs): it builds nothing,
# fills the environment variables read below, and points the two disk
# services at real folders with --directory-path. Secrets are never in this
# file: every key and identity comes from the environment.

using Workerd = import "/workerd/workerd.capnp";

const config :Workerd.Config = (
  services = [
    (name = "main", worker = .appWorker),
    # The built front end: a read-only disk (dist/client), served through a
    # small worker that behaves like Cloudflare's asset layer (assets-worker.js).
    (name = "assets", worker = .assetsWorker),
    (name = "assets-disk", disk = (path = "dist/client", writable = false)),
    # Durable Object SQLite files. ./.workerd-data/do locally; /var/lib/cofarer/do on the server.
    (name = "do-storage", disk = (path = ".workerd-data/do", writable = true)),
    # Outbound HTTPS (AI, search, auth providers in later phases).
    (name = "internet", network = (allow = ["public"], tlsOptions = (trustBrowserCas = true))),
    # The EC2 instance metadata service (IMDSv2), for the instance role's
    # credentials (src/lib/ai-provider.ts). Only this one address, through
    # its own binding: "internet" above still refuses link-local addresses.
    # Nothing answers it locally, where the AWS_* variables are used instead.
    (name = "imds", external = (address = "169.254.169.254:80", http = ())),
  ],
  sockets = [
    (name = "http", address = "*:8080", http = (), service = "main"),
  ],
);

const assetsWorker :Workerd.Worker = (
  modules = [(name = "assets-worker.js", esModule = embed "assets-worker.js")],
  compatibilityDate = "2025-01-01",
  bindings = [(name = "DISK", service = "assets-disk")],
);

const appWorker :Workerd.Worker = (
  modules = [
    (name = "index.js", esModule = embed "../dist/co_farer/index.js"),
  ],
  # Copied from wrangler.toml.
  compatibilityDate = "2025-01-01",
  compatibilityFlags = ["nodejs_compat", "assets_navigation_has_no_effect"],

  bindings = [
    (name = "ASSETS", service = "assets"),
    (name = "RECORD_ROOMS", durableObjectNamespace = "AppRecordRoom"),
    (name = "PRESENCE_ROOMS", durableObjectNamespace = "AppPresenceRoom"),
    (name = "CRON_ROOMS", durableObjectNamespace = "AppCronRoom"),
    (name = "JOB_ROOMS", durableObjectNamespace = "AppJobRoom"),

    # wrangler.toml [vars]
    (name = "DEEPSPACE_APP_ID", fromEnvironment = "DEEPSPACE_APP_ID"),
    (name = "APP_NAME", fromEnvironment = "APP_NAME"),
    (name = "NATIVE_AUTH_REDIRECT_URIS", fromEnvironment = "NATIVE_AUTH_REDIRECT_URIS"),

    # Sign-in: the public key and issuer verifyJwt checks against.
    (name = "AUTH_JWT_PUBLIC_KEY", fromEnvironment = "AUTH_JWT_PUBLIC_KEY"),
    (name = "AUTH_JWT_ISSUER", fromEnvironment = "AUTH_JWT_ISSUER"),
    (name = "OWNER_USER_ID", fromEnvironment = "OWNER_USER_ID"),

    # Cognito sign-in (Phase 2b, src/server/cognito-auth.ts). Public identifiers,
    # not secrets. The app's signing key comes from Parameter Store
    # (/cofarer/app-jwt-private-key); APP_JWT_PRIVATE_KEY is local development only.
    (name = "COGNITO_DOMAIN", fromEnvironment = "COGNITO_DOMAIN"),
    (name = "COGNITO_CLIENT_ID", fromEnvironment = "COGNITO_CLIENT_ID"),
    (name = "COGNITO_USER_POOL_ID", fromEnvironment = "COGNITO_USER_POOL_ID"),
    (name = "APP_URL", fromEnvironment = "APP_URL"),
    (name = "APP_JWT_PRIVATE_KEY", fromEnvironment = "APP_JWT_PRIVATE_KEY"),

    # AI research (Phase 2a): Bedrock and Brave through src/lib/ai-provider.ts.
    (name = "IMDS", service = "imds"),
    (name = "AWS_REGION", fromEnvironment = "AWS_REGION"),
    (name = "BEDROCK_MODEL_ID", fromEnvironment = "BEDROCK_MODEL_ID"),
    # Local development only; never set on the server, which uses the
    # instance role and Parameter Store (/cofarer/brave-api-key).
    (name = "AWS_ACCESS_KEY_ID", fromEnvironment = "AWS_ACCESS_KEY_ID"),
    (name = "AWS_SECRET_ACCESS_KEY", fromEnvironment = "AWS_SECRET_ACCESS_KEY"),
    (name = "AWS_SESSION_TOKEN", fromEnvironment = "AWS_SESSION_TOKEN"),
    (name = "BRAVE_API_KEY", fromEnvironment = "BRAVE_API_KEY"),

    # Local only.
    (name = "ALLOW_DEBUG_ROUTES", fromEnvironment = "ALLOW_DEBUG_ROUTES"),
    (name = "LOCAL_STUB_AUTH", fromEnvironment = "LOCAL_STUB_AUTH"),
    (name = "STUB_AUTH_PRIVATE_KEY", fromEnvironment = "STUB_AUTH_PRIVATE_KEY"),
  ],

  durableObjectNamespaces = [
    (className = "AppRecordRoom", uniqueKey = "cofarer-AppRecordRoom", enableSql = true),
    (className = "AppPresenceRoom", uniqueKey = "cofarer-AppPresenceRoom", enableSql = true),
    (className = "AppCronRoom", uniqueKey = "cofarer-AppCronRoom", enableSql = true),
    (className = "AppJobRoom", uniqueKey = "cofarer-AppJobRoom", enableSql = true),
  ],
  durableObjectStorage = (localDisk = "do-storage"),
  globalOutbound = "internet",
);

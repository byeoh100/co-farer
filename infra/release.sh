#!/bin/bash
# Build a Co-farer release, upload it to S3, and (with --install) put it live
# on the server. Used by hand and by .github/workflows/deploy.yml (Phase 4).
#
#   infra/release.sh                    build + upload, mark as latest
#   infra/release.sh --install          … then install it (rolls back by itself if /healthz fails)
#   infra/release.sh --install --broken-for-test
#                                       a release whose worker can't start: proves the rollback
#
# Installing goes through the `cofarer-install-release` SSM document, which can
# only run /opt/cofarer/bin/install-release <id>: no SSH, no arbitrary commands.
#
# A release is dist/ (worker bundle + front end), deploy/workerd.capnp,
# deploy/assets-worker.js, and the Linux arm64 workerd binary of the exact
# version the tests run (from npm, integrity-checked by npm).
#
# Where: COFARER_BUCKET and COFARER_INSTANCE if set (CI), else Terraform outputs.
# How: AWS_PROFILE (default "cofarer") locally; in CI, the OIDC role's environment credentials.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/bin:$PATH"
REGION="${AWS_REGION:-us-east-2}"
AWS=(aws --region "$REGION")
if [ -z "${GITHUB_ACTIONS:-}" ]; then AWS+=(--profile "${AWS_PROFILE:-cofarer}"); fi

INSTALL=false; BROKEN=false
for a in "$@"; do
  case "$a" in
    --install) INSTALL=true ;;
    --broken-for-test) BROKEN=true ;;
    *) echo "unknown option $a" >&2; exit 2 ;;
  esac
done

BUCKET="${COFARER_BUCKET:-$(terraform -chdir=infra output -raw bucket)}"
INSTANCE="${COFARER_INSTANCE:-$(terraform -chdir=infra output -raw instance_id)}"

ID=$(git rev-parse --short=12 HEAD)
if [ -n "$(git status --porcelain)" ]; then ID="$ID-dirty-$(date -u +%Y%m%d%H%M%S)"; fi
if $BROKEN; then ID="$ID-broken-$(date -u +%Y%m%d%H%M%S)"; fi
echo "Release $ID"

npm run build >/dev/null 2>&1
WORKERD_VERSION=$(node -p "require('./node_modules/workerd/package.json').version")

STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/r/deploy" "$STAGE/r/bin" "$STAGE/r/dist" "$STAGE/npm"
(cd "$STAGE/npm" && npm pack --silent "@cloudflare/workerd-linux-arm64@$WORKERD_VERSION" >/dev/null && tar -xzf ./*.tgz)
install -m 0755 "$STAGE/npm/package/bin/workerd" "$STAGE/r/bin/workerd"
cp -R dist/client dist/co_farer "$STAGE/r/dist/"
rm -f "$STAGE/r/dist/co_farer/wrangler.json" "$STAGE/r/dist/client/.assetsignore"
cp deploy/workerd.capnp deploy/assets-worker.js "$STAGE/r/deploy/"
if $BROKEN; then
  # Valid files, but the worker throws the moment it loads: /healthz never answers.
  echo 'throw new Error("deliberately broken release (release.sh --broken-for-test)")' > "$STAGE/r/dist/co_farer/index.js"
fi
echo "$ID" > "$STAGE/r/RELEASE"
tar -czf "$STAGE/release.tar.gz" -C "$STAGE/r" .
echo "  $(du -h "$STAGE/release.tar.gz" | cut -f1) (workerd $WORKERD_VERSION, linux-arm64)"

# Uploaded tagged retire=true: S3 expires retired releases after 30 days.
# Only once a release is live is the tag removed, and the previous live
# release retired. So the live release and releases/latest.txt never expire,
# and a release that failed never becomes "latest" (a rebuilt server installs
# latest.txt by itself).
"${AWS[@]}" s3api put-object --bucket "$BUCKET" --key "releases/$ID/release.tar.gz" \
  --body "$STAGE/release.tar.gz" --tagging "retire=true" --query ETag --output text >/dev/null
echo "  uploaded to s3://$BUCKET/releases/$ID/"

if ! $INSTALL; then
  echo "  not installed (run with --install to put it live and mark it latest)"
  exit 0
fi

CMD=$("${AWS[@]}" ssm send-command --instance-ids "$INSTANCE" --document-name cofarer-install-release \
  --comment "Co-farer release $ID" --parameters "releaseId=$ID" --query Command.CommandId --output text)
echo "  installing on $INSTANCE (command $CMD)…"
# Poll until a final status. The install can take a few minutes (download,
# restart, up to 60 s of health checks, maybe a rollback); the document's own
# limit is 300 s.
STATUS=Pending
for _ in $(seq 1 72); do
  sleep 5
  STATUS=$("${AWS[@]}" ssm get-command-invocation --command-id "$CMD" --instance-id "$INSTANCE" --query Status --output text 2>/dev/null || echo Pending)
  case "$STATUS" in Pending|InProgress|Delayed) ;; *) break ;; esac
done
"${AWS[@]}" ssm get-command-invocation --command-id "$CMD" --instance-id "$INSTANCE" \
  --query '[StandardOutputContent,StandardErrorContent]' --output text | sed 's/^/    /'
echo "  install: $STATUS"
[ "$STATUS" = "Success" ] || exit 1

# Live: keep it, mark it latest, retire the one it replaced.
PREV_LATEST=$("${AWS[@]}" s3 cp --only-show-errors "s3://$BUCKET/releases/latest.txt" - 2>/dev/null || true)
"${AWS[@]}" s3api put-object-tagging --bucket "$BUCKET" --key "releases/$ID/release.tar.gz" --tagging 'TagSet=[]'
printf '%s' "$ID" | "${AWS[@]}" s3 cp --only-show-errors - "s3://$BUCKET/releases/latest.txt"
if [ -n "$PREV_LATEST" ] && [ "$PREV_LATEST" != "$ID" ]; then
  "${AWS[@]}" s3api put-object-tagging --bucket "$BUCKET" --key "releases/$PREV_LATEST/release.tar.gz" \
    --tagging 'TagSet=[{Key=retire,Value=true}]' 2>/dev/null || true
fi
echo "  $ID is live and marked latest${PREV_LATEST:+ (retired $PREV_LATEST)}"

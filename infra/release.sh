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

"${AWS[@]}" s3 cp --only-show-errors "$STAGE/release.tar.gz" "s3://$BUCKET/releases/$ID/release.tar.gz"
# A broken test release is never marked latest (a rebuilt server must not pick it).
if ! $BROKEN; then
  printf '%s' "$ID" | "${AWS[@]}" s3 cp --only-show-errors - "s3://$BUCKET/releases/latest.txt"
  echo "  uploaded to s3://$BUCKET/releases/$ID/ and marked latest"
else
  echo "  uploaded to s3://$BUCKET/releases/$ID/ (test only, not marked latest)"
fi

if $INSTALL; then
  CMD=$("${AWS[@]}" ssm send-command --instance-ids "$INSTANCE" --document-name cofarer-install-release \
    --comment "Co-farer release $ID" --parameters "releaseId=$ID" --query Command.CommandId --output text)
  echo "  installing on $INSTANCE (command $CMD)…"
  "${AWS[@]}" ssm wait command-executed --command-id "$CMD" --instance-id "$INSTANCE" || true
  read -r STATUS < <("${AWS[@]}" ssm get-command-invocation --command-id "$CMD" --instance-id "$INSTANCE" --query Status --output text)
  "${AWS[@]}" ssm get-command-invocation --command-id "$CMD" --instance-id "$INSTANCE" \
    --query '[StandardOutputContent,StandardErrorContent]' --output text | sed 's/^/    /'
  echo "  install: $STATUS"
  [ "$STATUS" = "Success" ]
fi

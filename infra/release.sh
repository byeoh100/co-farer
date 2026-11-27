#!/bin/bash
# Build a Co-farer release, upload it to S3, and (with --install) put it live
# on the server through SSM Run Command (no SSH). Phase 4's GitHub Actions
# deploy does the same steps.
#
#   infra/release.sh             build + upload, mark as latest
#   infra/release.sh --install   … then install it on the server (rolls back if it fails)
#
# A release is: dist/ (worker bundle + front end), deploy/workerd.capnp,
# deploy/assets-worker.js, and the Linux arm64 workerd binary of the exact
# version the tests run (from npm, integrity-checked by npm).
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/bin:$PATH"
PROFILE="${AWS_PROFILE:-cofarer}"
REGION="${AWS_REGION:-us-east-2}"
INSTALL=false; [ "${1:-}" = "--install" ] && INSTALL=true

BUCKET=$(terraform -chdir=infra output -raw bucket)
INSTANCE=$(terraform -chdir=infra output -raw instance_id)

ID=$(git rev-parse --short=12 HEAD)
if [ -n "$(git status --porcelain)" ]; then ID="$ID-dirty-$(date -u +%Y%m%d%H%M%S)"; fi
echo "Release $ID"

npm run build >/dev/null
WORKERD_VERSION=$(node -p "require('./node_modules/workerd/package.json').version")

STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/r/deploy" "$STAGE/r/bin" "$STAGE/r/dist" "$STAGE/npm"
(cd "$STAGE/npm" && npm pack --silent "@cloudflare/workerd-linux-arm64@$WORKERD_VERSION" >/dev/null && tar -xzf ./*.tgz)
install -m 0755 "$STAGE/npm/package/bin/workerd" "$STAGE/r/bin/workerd"
cp -R dist/client dist/co_farer "$STAGE/r/dist/"
rm -f "$STAGE/r/dist/co_farer/wrangler.json" "$STAGE/r/dist/client/.assetsignore"
cp deploy/workerd.capnp deploy/assets-worker.js "$STAGE/r/deploy/"
echo "$ID" > "$STAGE/r/RELEASE"
tar -czf "$STAGE/release.tar.gz" -C "$STAGE/r" .
echo "  $(du -h "$STAGE/release.tar.gz" | cut -f1) (workerd $WORKERD_VERSION, linux-arm64)"

aws s3 cp --only-show-errors --profile "$PROFILE" --region "$REGION" "$STAGE/release.tar.gz" "s3://$BUCKET/releases/$ID/release.tar.gz"
printf '%s' "$ID" | aws s3 cp --only-show-errors --profile "$PROFILE" --region "$REGION" - "s3://$BUCKET/releases/latest.txt"
echo "  uploaded to s3://$BUCKET/releases/$ID/ and marked latest"

if $INSTALL; then
  CMD=$(aws ssm send-command --profile "$PROFILE" --region "$REGION" --instance-ids "$INSTANCE" \
    --document-name AWS-RunShellScript --comment "Co-farer release $ID" \
    --parameters "commands=[\"/opt/cofarer/bin/install-release $ID\"]" --query Command.CommandId --output text)
  echo "  installing on $INSTANCE (command $CMD)…"
  aws ssm wait command-executed --profile "$PROFILE" --region "$REGION" --command-id "$CMD" --instance-id "$INSTANCE" || true
  aws ssm get-command-invocation --profile "$PROFILE" --region "$REGION" --command-id "$CMD" --instance-id "$INSTANCE" \
    --query '[Status,StandardOutputContent,StandardErrorContent]' --output text
fi

#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SITE="$ROOT/release/gaga-notes-mobile"
REPO="gaga-notes-mobile"

if ! gh auth status >/dev/null 2>&1; then
  echo "请先运行: gh auth login --hostname github.com --git-protocol https --web"
  exit 1
fi

OWNER="$(gh api user --jq .login)"

rm -rf "$SITE"
mkdir -p "$SITE"
cp -R "$ROOT/dist/." "$SITE/"

cd "$SITE"
git init -q
git add .
git -c user.name="Gaga" -c user.email="gaga.yjj@gmail.com" commit -q -m "deploy GAGA notes mobile PWA"

if gh repo view "$OWNER/$REPO" >/dev/null 2>&1; then
  git -c http.version=HTTP/1.1 push "https://x-access-token:$(gh auth token)@github.com/$OWNER/$REPO.git" main --force
else
  gh repo create "$REPO" --public --source "$SITE" --push
fi

if ! gh api "repos/$OWNER/$REPO/pages" >/dev/null 2>&1; then
  gh api -X POST "repos/$OWNER/$REPO/pages" -f "source[branch]=main" -f "source[path]=/"
fi

echo "部署完成，正式网址: https://$OWNER.github.io/$REPO/"

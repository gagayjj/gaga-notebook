#!/usr/bin/env bash
# 部署 dist 到 gagayjj/gaga-notebook 仓库的 gh-pages 分支（GitHub Pages）
# 凭证来自 macOS keychain（credential.helper=osxkeychain），URL 不含明文 token
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SITE="$(mktemp -d /tmp/gaga-ghpages-XXXX)"
trap 'rm -rf "$SITE" 2>/dev/null' EXIT

echo "==> 复制 dist 到临时目录 $SITE"
cp -R "$ROOT/dist/." "$SITE/"
touch "$SITE/.nojekyll"

cd "$SITE"
git init -q
git add -A
git -c user.email="gaga.yjj@gmail.com" -c user.name="Gaga" commit -q -m "deploy $(date +%Y%m%d-%H%M%S)"

TOKEN="$(security find-internet-password -s github.com -w 2>/dev/null || true)"
if [ -n "$TOKEN" ]; then
  REMOTE="https://x-access-token:$TOKEN@github.com/gagayjj/gaga-notebook.git"
else
  REMOTE="https://github.com/gagayjj/gaga-notebook.git"
fi
git remote add origin "$REMOTE"

echo "==> 强制推送 HEAD:gh-pages（github.com 经代理可能 502，自动重试）"
OK=0
for i in $(seq 1 25); do
  if git -c http.version=HTTP/1.1 -c http.timeout=25 push --force origin HEAD:gh-pages 2>&1; then
    echo "PUSH_OK attempt=$i"
    OK=1
    break
  fi
  echo "== 第 $i 次推送失败，8 秒后重试 =="
  sleep 8
done

if [ "$OK" -eq 1 ]; then
  echo "部署完成：https://gagayjj.github.io/gaga-notebook/"
else
  echo "部署失败：请检查网络/凭证后重试"
  exit 1
fi

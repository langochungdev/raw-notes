#!/usr/bin/env bash
# Script nay dung de build va dong goi extension thanh file zip tuong thich tot voi Windows Explorer
set -eu

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
VERSION_JSON="$ROOT_DIR/web/version.json"
MANIFEST_PATH="$ROOT_DIR/extension/manifest.json"
PACKAGE_JSON="$ROOT_DIR/extension/package.json"

if [[ ! -f "$VERSION_JSON" ]]; then
  exit 1
fi

VERSION_RAW=$(grep -oE '"version"\s*:\s*"[^"]+"' "$VERSION_JSON" | head -n1 | sed -E 's/.*"([^"]+)".*/\1/')
if [[ -z "$VERSION_RAW" ]]; then
  exit 1
fi

VERSION="${VERSION_RAW#v}"
if [[ -z "$VERSION" ]]; then
  exit 1
fi

node -e "const fs=require('fs');const file=process.argv[1];const version=process.argv[2];const data=JSON.parse(fs.readFileSync(file,'utf8'));data.version=version;fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');" "$MANIFEST_PATH" "$VERSION"
node -e "const fs=require('fs');const file=process.argv[1];const version=process.argv[2];const data=JSON.parse(fs.readFileSync(file,'utf8'));data.version=version;fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');" "$PACKAGE_JSON" "$VERSION"

ZIP_NAME="rawnotes-$VERSION.zip"
ZIP_PATH="$ROOT_DIR/$ZIP_NAME"

if [[ -f "$ZIP_PATH" ]]; then
  rm -f "$ZIP_PATH"
fi

if command -v cygpath >/dev/null 2>&1; then
  WIN_ROOT_DIR=$(cygpath -w "$ROOT_DIR")
  WIN_ZIP_PATH=$(cygpath -w "$ZIP_PATH")
else
  WIN_ROOT_DIR="$ROOT_DIR"
  WIN_ZIP_PATH="$ZIP_PATH"
fi

powershell.exe -NoProfile -Command "Get-ChildItem -Path '$WIN_ROOT_DIR\extension' -Exclude 'node_modules' | Compress-Archive -DestinationPath '$WIN_ZIP_PATH' -Force"

if [[ ! -f "$ZIP_PATH" ]]; then
  exit 1
fi

echo "Da tao $ZIP_NAME"

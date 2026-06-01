#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
VERSION_JSON="$ROOT_DIR/web/version.json"
MANIFEST_PATH="$ROOT_DIR/extension/manifest.json"
PACKAGE_JSON="$ROOT_DIR/extension/package.json"

if [[ ! -f "$VERSION_JSON" ]]; then
  echo "Khong tim thay web/version.json"
  exit 1
fi

VERSION_RAW=$(grep -oE '"version"\s*:\s*"[^"]+"' "$VERSION_JSON" | head -n1 | sed -E 's/.*"([^"]+)".*/\1/')
if [[ -z "$VERSION_RAW" ]]; then
  echo "Khong doc duoc version tu web/version.json"
  exit 1
fi

VERSION="${VERSION_RAW#v}"
if [[ -z "$VERSION" ]]; then
  echo "Version khong hop le"
  exit 1
fi

node -e "const fs=require('fs');const file=process.argv[1];const version=process.argv[2];const data=JSON.parse(fs.readFileSync(file,'utf8'));data.version=version;fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');" "$MANIFEST_PATH" "$VERSION"
node -e "const fs=require('fs');const file=process.argv[1];const version=process.argv[2];const data=JSON.parse(fs.readFileSync(file,'utf8'));data.version=version;fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');" "$PACKAGE_JSON" "$VERSION"

ZIP_NAME="rawnotes-$VERSION.zip"
ZIP_PATH="$ROOT_DIR/$ZIP_NAME"

if [[ -f "$ZIP_PATH" ]]; then
  rm -f "$ZIP_PATH"
fi

if command -v tar >/dev/null 2>&1; then
  tar -a -c -f "$ZIP_PATH" -C "$ROOT_DIR/extension" --exclude "node_modules" .
else
  powershell.exe -NoProfile -Command "Compress-Archive -Path '$ROOT_DIR/extension/*' -DestinationPath '$ZIP_PATH' -Force"
fi

if [[ ! -f "$ZIP_PATH" ]]; then
  echo "Khong tao duoc file zip"
  exit 1
fi

echo "Da tao $ZIP_NAME"

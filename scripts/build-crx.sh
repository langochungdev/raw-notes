#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
KEY_PATH="$ROOT_DIR/key.pem"
MANIFEST_PATH="$ROOT_DIR/extension/manifest.json"

if [[ ! -f "$KEY_PATH" ]]; then
  echo "key.pem không tồn tại."
  echo "openssl genrsa -out key.pem 2048"
  echo "Backup file này, không commit lên git"
  exit 1
fi

VERSION=$(grep -oE '"version"\s*:\s*"[^"]+"' "$MANIFEST_PATH" | head -n1 | sed -E 's/.*"([^"]+)".*/\1/')
if [[ -z "$VERSION" ]]; then
  echo "Không đọc được version từ manifest.json"
  exit 1
fi

detect_chrome() {
  local os_name
  os_name=$(uname -s)

  if [[ "$os_name" == "Darwin" ]]; then
    local mac_paths=(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      "/Applications/Chromium.app/Contents/MacOS/Chromium"
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
    )
    for path in "${mac_paths[@]}"; do
      if [[ -x "$path" ]]; then
        echo "$path"
        return 0
      fi
    done
  elif [[ "$os_name" == "Linux" ]]; then
    local linux_bins=(
      "google-chrome"
      "google-chrome-stable"
      "chromium"
      "chromium-browser"
      "brave-browser"
    )
    for bin in "${linux_bins[@]}"; do
      if command -v "$bin" >/dev/null 2>&1; then
        command -v "$bin"
        return 0
      fi
    done
  else
    local win_paths=(
      "/c/Program Files/Google/Chrome/Application/chrome.exe"
      "/c/Program Files (x86)/Google/Chrome/Application/chrome.exe"
      "/c/Program Files/Chromium/Application/chrome.exe"
      "/c/Program Files (x86)/Chromium/Application/chrome.exe"
      "/c/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe"
      "/c/Program Files (x86)/BraveSoftware/Brave-Browser/Application/brave.exe"
    )
    for path in "${win_paths[@]}"; do
      if [[ -x "$path" ]]; then
        echo "$path"
        return 0
      fi
    done
  fi

  return 1
}

CHROME_BIN=$(detect_chrome || true)
if [[ -z "$CHROME_BIN" ]]; then
  echo "Không tìm thấy Chrome CLI. Cài Chrome hoặc cập nhật đường dẫn trong script."
  exit 1
fi

"$CHROME_BIN" --pack-extension="$ROOT_DIR/extension" --pack-extension-key="$KEY_PATH"

CRX_PATH="$ROOT_DIR/extension.crx"
if [[ ! -f "$CRX_PATH" ]]; then
  echo "Không tạo được extension.crx"
  exit 1
fi

cp "$CRX_PATH" "$ROOT_DIR/web/rawnotes.crx"

UPDATES_XML="$ROOT_DIR/web/updates.xml"
if [[ ! -f "$UPDATES_XML" ]]; then
  echo "Không tìm thấy web/updates.xml"
  exit 1
fi

tmp_file=$(mktemp)
sed "s/VERSION_PLACEHOLDER/$VERSION/g" "$UPDATES_XML" > "$tmp_file"
mv "$tmp_file" "$UPDATES_XML"

VERSION_JSON="$ROOT_DIR/web/version.json"
updated_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
cat > "$VERSION_JSON" <<EOF
{
  "version": "v$VERSION",
  "updatedAt": "$updated_at"
}
EOF

rm -f "$CRX_PATH"

echo "✓ Built v$VERSION"
echo "✓ web/rawnotes.crx đã sẵn sàng"
echo "✓ web/updates.xml đã cập nhật"
echo ""
echo "Bước tiếp theo:"
echo "1. Commit và deploy thư mục web/"
echo "2. Kéo web/rawnotes.crx vào chrome://extensions"
echo "3. Copy Extension ID từ chrome://extensions"
echo "4. Điền ID vào web/updates.xml thay EXTENSION_ID_PLACEHOLDER"
echo "5. Commit và deploy lại web/updates.xml"

#!/bin/zsh
set -euo pipefail

repo_dir="/Users/syo/MYWORK/hexo-blog"
source_dir="$repo_dir/tools/HexoPublisher"
build_dir="$source_dir/build"
app_dir="$HOME/Applications/Hexo Publisher.app"
launch_agents_dir="$HOME/Library/LaunchAgents"
launch_agent="$launch_agents_dir/top.sissioy.hexopublisher.plist"

mkdir -p "$build_dir" "$app_dir/Contents/MacOS" "$app_dir/Contents/Resources" "$launch_agents_dir"
swiftc -O -target arm64-apple-macos13 \
  -framework AppKit \
  "$source_dir/Sources/HexoPublisher/main.swift" \
  -o "$build_dir/HexoPublisher"
cp "$build_dir/HexoPublisher" "$app_dir/Contents/MacOS/HexoPublisher"

plist_tmp="$(mktemp)"
cat > "$plist_tmp" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key><string>HexoPublisher</string>
  <key>CFBundleIdentifier</key><string>top.sissioy.hexopublisher</string>
  <key>CFBundleName</key><string>Hexo Publisher</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0.0</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>LSUIElement</key><true/>
</dict>
</plist>
PLIST
cp "$plist_tmp" "$app_dir/Contents/Info.plist"

cat > "$plist_tmp" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>top.sissioy.hexopublisher</string>
  <key>ProgramArguments</key>
  <array><string>$app_dir/Contents/MacOS/HexoPublisher</string></array>
  <key>RunAtLoad</key><true/>
  <key>ProcessType</key><string>Interactive</string>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/HexoPublisher/app.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/HexoPublisher/app.log</string>
</dict>
</plist>
PLIST
cp "$plist_tmp" "$launch_agent"
rm -f "$plist_tmp"

mkdir -p "$HOME/Library/Logs/HexoPublisher"
launchctl bootout "gui/$(id -u)" "$launch_agent" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$launch_agent"
echo "Installed $app_dir"

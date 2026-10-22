#!/bin/bash

# 遇到任何错误立即退出
set -euo pipefail

# 获取脚本目录的父目录作为项目根目录
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "🚀 [1/3] 开始生成 iOS 原生工程 (Expo Prebuild)..."
# 每次同步配置和本地模块，避免旧生成工程继续链接已移除的依赖。
npx expo prebuild --platform ios --no-install
(cd ios && pod install)

shopt -s nullglob
WORKSPACES=(ios/*.xcworkspace)
if [ "${#WORKSPACES[@]}" -ne 1 ]; then
  echo "需要且只能有一个 iOS workspace，实际找到 ${#WORKSPACES[@]} 个。"
  exit 1
fi
WORKSPACE="${WORKSPACES[0]}"
SCHEME="$(basename "$WORKSPACE" .xcworkspace)"

echo "📦 [2/3] 开始编译 iOS App 产物 (未签名 Release)..."
# 本地无上传凭据时仍可离线构建；配置凭据后默认上传，并保留显式跳过设置。
if [ -z "${SENTRY_AUTH_TOKEN:-}" ] || \
  [ "${SENTRY_DISABLE_AUTO_UPLOAD:-false}" = true ] || \
  [ "${SENTRY_NO_UPLOAD:-0}" = 1 ] || \
  [ "${SENTRY_NO_UPLOAD:-false}" = true ]; then
  export SENTRY_DISABLE_AUTO_UPLOAD=true
  export SENTRY_NO_UPLOAD=1
  echo "Sentry source map 上传已跳过。"
else
  export SENTRY_DISABLE_AUTO_UPLOAD=false
  # release/dist 必须与运行时从原生构建信息生成的值一致。
  unset SENTRY_NO_UPLOAD SENTRY_RELEASE SENTRY_DIST
  export SENTRY_ALLOW_FAILURE=false
  export SENTRY_CLI_RN_XCODE_EXTRA_ARGS="${SENTRY_CLI_RN_XCODE_EXTRA_ARGS:-} --force-foreground --wait"
fi
xcodebuild -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration Release \
  -sdk iphoneos \
  SYMROOT="$PROJECT_ROOT/build" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY="" \
  CODE_SIGN_ENTITLEMENTS="" \
  clean build

echo "🗜️ [3/3] 开始打包成 .ipa 文件..."
APP_VERSION=$(node -p "require('./package.json').version")
IPA_NAME="zhihu-minus-minus-v${APP_VERSION}-unsigned.ipa"

APPS=(build/Release-iphoneos/*.app)
if [ "${#APPS[@]}" -ne 1 ]; then
  echo "需要且只能有一个已编译 App，实际找到 ${#APPS[@]} 个。"
  exit 1
fi

# 只清理本次临时目录；不删除其他版本 IPA 或用户已有的 Payload。
PACKAGE_DIRECTORY="$(mktemp -d "$PROJECT_ROOT/build/ipa.XXXXXX")"
trap 'rm -rf "$PACKAGE_DIRECTORY"' EXIT
mkdir -p "$PACKAGE_DIRECTORY/Payload"
cp -R "${APPS[0]}" "$PACKAGE_DIRECTORY/Payload/"
(cd "$PACKAGE_DIRECTORY" && zip -qr "$IPA_NAME" Payload)
mv "$PACKAGE_DIRECTORY/$IPA_NAME" "$PROJECT_ROOT/$IPA_NAME"

echo "✅ 打包完成！未签名 IPA 生成成功！"
echo "👉 产物路径: $PROJECT_ROOT/$IPA_NAME"

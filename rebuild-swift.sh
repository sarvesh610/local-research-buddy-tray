#!/bin/bash
set -euo pipefail

echo "🔨 Rebuilding Swift voice binary..."

cd "$(dirname "$0")/src/voice/whisper-binary"

echo "📁 Current directory: $(pwd)"
echo "📝 Swift files:"
ls -la *.swift || true

ARCH="$(uname -m)"
if [[ "$ARCH" == "arm64" ]]; then
TARGET="arm64-apple-macos13"
else
TARGET="x86_64-apple-macos13"
fi

SDK_PATH="$(xcrun --show-sdk-path --sdk macosx)"
echo "🧰 Using SDK: $SDK_PATH"
echo "🏷️ Target: $TARGET"


OUT="LucidTalkStreamer"
echo "🚀 Compiling ($OUT) with AVFoundation + ScreenCaptureKit..."
# Compile ONLY the entry + required sources to avoid duplicate @main
swiftc -O \
  -sdk "$SDK_PATH" \
  -target "$TARGET" \
  -framework AVFoundation \
  -framework ScreenCaptureKit \
  AudioStreamer.swift \
  WhisperProcessor.swift \
  LucidTalkStreamer.swift \
  -o "$OUT"

chmod +x "$OUT"

echo "✅ Build complete: $(pwd)/$OUT"
ls -la "$OUT"

echo ""
echo "ℹ️ Notes:"
echo " - Electron looks for '$OUT' in this folder."
echo " - ScreenCaptureKit requires macOS 13+."
echo " - Ensure microphone permissions are granted on first run."

# if [ $? -eq 0 ]; then
#     echo "✅ Swift binary rebuilt successfully!"
#     echo "📦 Binary location: $(pwd)/MindMeetStreamer"
#     ls -la MindMeetStreamer
#     echo ""
#     echo "🆕 New Features Added:"
#     echo "   • Automatic system audio recovery after calls"
#     echo "   • Detection of call/meeting apps (WhatsApp, Zoom, etc.)"
#     echo "   • Multiple recovery attempts with intelligent backoff"
#     echo "   • macOS audio engine configuration change monitoring"
# else
#     echo "❌ Swift compilation failed!"
#     exit 1
# fi

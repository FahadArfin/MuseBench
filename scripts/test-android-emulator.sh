#!/usr/bin/env bash
set -euo pipefail
node scripts/mobile-emulator-host.mjs > /tmp/muse-emulator-host.log 2>&1 &
fixture_pid=$!
trap 'kill "$fixture_pid" 2>/dev/null || true' EXIT
for attempt in {1..100}; do
  if [ -f artifacts/mobile-emulator/pair-link.txt ]; then break; fi
  sleep 0.1
done
pair_link=$(cat artifacts/mobile-emulator/pair-link.txt)
printf '::add-mask::%s\n' "$pair_link"
version=$(node -p 'require("./package.json").version')
code=$(git rev-list --count HEAD)
gradle -p mobile/android connectedDebugAndroidTest "-Pandroid.testInstrumentationRunnerArguments.pairLink=$pair_link" -PmuseVersion="$version" -PmuseVersionCode="$code" --console plain
adb shell am start -W -n io.github.fahadarfin.musebench.debug/io.github.fahadarfin.musebench.MainActivity
sleep 2
adb exec-out screencap -p > artifacts/mobile-emulator/android-home.png

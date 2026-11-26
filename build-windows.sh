#!/bin/bash
# Builds the Windows version into dist/windows/Hailed/ (Hailed.exe + game/) and zips it to dist/Hailed-windows.zip.
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"
OUT=dist/windows/Hailed
rm -rf dist/windows && mkdir -p "$OUT/game"
dotnet publish windows/Hailed.Win/Hailed.Win.csproj -c Release -r win-x64 --self-contained true \
  -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -nodeReuse:false \
  --configfile windows/nuget.config -o "$OUT"
cp -r index.html style.css style-expansion.css src content assets "$OUT/game/"
rm -f dist/Hailed-windows.zip
(cd dist/windows && zip -qr ../Hailed-windows.zip Hailed)
echo "Built $OUT and dist/Hailed-windows.zip"

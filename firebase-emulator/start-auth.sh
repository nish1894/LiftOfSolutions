#!/bin/sh
set -eu

export_dir=/workspace/.firebase/export
if [ -f "$export_dir/firebase-export-metadata.json" ]; then
  exec firebase emulators:start --project "$FIREBASE_PROJECT_ID" --only auth \
    --import "$export_dir" --export-on-exit "$export_dir"
fi
exec firebase emulators:start --project "$FIREBASE_PROJECT_ID" --only auth \
  --export-on-exit "$export_dir"

# Precomputed Bilibili Data

Run `precomputeAll()` from `app/src/scripts/precomputeBilibili.ts` in dev mode,
then copy the generated files here:

```bash
# After precomputation completes:
cp ~/Library/Application\ Support/com.daoyu.lyra/lyra.db \
   app/src-tauri/resources/lyra.db

cp ~/Library/Application\ Support/com.daoyu.lyra/lyra-audio-features.json \
   app/src-tauri/resources/lyra-audio-features.json
```

These files are bundled into the app via `tauri.conf.json` → `bundle.resources`
and copied to the app data dir on first launch by `setup_bundled_data`.

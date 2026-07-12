# Virtual Camera DirectShow Filter

This directory must contain the `obs-virtualsource.dll` DirectShow filter before
running `bun run build:desktop`. It is not vendored in source control because it
is a third-party compiled binary and its integrity should be verified by hand
before it ships inside the Velo installer.

## Why this file is needed

`crates/vcam-driver` writes NV12 frames into a named shared memory region
(`OBSVirtualCamVideo`) using the same layout OBS Studio's `win-dshow` plugin
uses. That shared memory is only visible to Windows applications as a camera
device once this DirectShow filter is registered with `regsvr32`. The filter
itself does not require OBS Studio to be installed or running; it only reads
frames from the shared memory region, regardless of which process wrote them.

## Steps to vendor the DLL

1. Download the release matching your target OBS Virtual Camera protocol
   version from `https://github.com/Avasam/obs-virtual-cam/releases`. Use
   release `3.1.0` unless a newer one has since been published.
2. Verify the download: check the asset's SHA-256 checksum against the value
   published on the release page, and confirm the release is signed by the
   `Avasam` GitHub account before extracting it.
3. Extract the archive and copy `obs-virtualsource.dll` (64-bit build) into
   this directory as `apps/desktop/resources/obs-virtualsource.dll`.
4. Reference it from `apps/desktop/tauri.conf.json` under
   `bundle.resources` so Tauri packages it into `$INSTDIR/resources`.

## License note

`obs-virtual-cam` is distributed under GPL-2.0. Velo consumes the compiled
filter as a standalone resource via shared memory, without linking against it
or embedding its source, but the distributed `.dll` itself remains under its
original license. Include its license file alongside the binary if the
upstream release ships one.

## NSIS registration

Once the DLL is present, `apps/desktop/tauri.conf.json`'s NSIS hooks execute:

```
On install:   regsvr32.exe /s "$INSTDIR\resources\obs-virtualsource.dll"
On uninstall: regsvr32.exe /u /s "$INSTDIR\resources\obs-virtualsource.dll"
```

See `TODO.md` Phase 5 for the remaining packaging checklist.

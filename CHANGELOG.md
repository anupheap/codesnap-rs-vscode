# Changelog

## 0.3.0

- Add separate Linux x64 and ARM64 VSIX packages with verified upstream renderers.
- Resolve the native executable by host platform and preserve Linux execute permissions.
- Use persistent PNG clipboard helpers: wl-copy on Wayland and xclip on X11.
- Add portable native preparation and platform packaging, including pinned archive checksums.
- Add native Linux checks for both architectures and document the x64 glibc 2.39 requirement.

## 0.2.0

- Add a live preview beside the editor with Save PNG, Copy image, a shutter button, refresh, and fit/100% zoom.
- Debounce selection changes, cancel stale renders, reuse the panel, and stop updates when hidden or closed.
- Cache previews and save the exact displayed PNG without another render.
- Package the verified CodeSnap Rust CLI v0.14.0 for Windows x64.

## 0.1.0

- Initial local adapter with direct save and copy commands using the Rust renderer.

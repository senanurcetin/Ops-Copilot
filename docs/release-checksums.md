# Release checklist — GitHub Actions Auditor

1. Start from a clean clone and check out the exact release tag (`git status --short` should be empty).
2. Follow the Auditor package build instructions in the repository and produce the release artifact(s). Do not hash a mutable directory or an unbuilt source tree.
3. In the directory containing the finished release artifacts, generate `SHA256SUMS` using `sha256sum <artifact-file> > SHA256SUMS`. For multiple artifacts, pass each exact filename to `sha256sum` in a stable order.
4. Verify locally with `sha256sum -c SHA256SUMS` and require every entry to report `OK`.
5. Review `CHANGELOG.md` and record the released version, date, and notable changes before publishing.
6. Attach the immutable artifact files and `SHA256SUMS` to the same GitHub release. Never claim a release has checksums unless the release assets include the file.
7. After download to a clean directory, rerun `sha256sum -c SHA256SUMS` against the downloaded artifacts.

On macOS, use `shasum -a 256` for generation; verification of GNU-style checksum files may require GNU coreutils `sha256sum`.

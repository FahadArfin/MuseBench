# Third-party research evidence

Files listed in `evidence/provenance.json` are unmodified copies from the official `meta-models/muse-code-sdk` source revision `3dce908f556bd8b3dfc9cd7f28f442b0504d74a4`. They are retained as offline protocol evidence. Their upstream MIT copyright and license notice is preserved in `evidence/LICENSE`.

No upstream TypeScript or package was installed, compiled, imported or executed. The JSON schema and recorded JSON frames are read as test data. In particular, the old recorded fixture handshake is not rewritten to impersonate the pinned stable schema.

Patchlight's fixture connection is separately written test utility code. Its matching descriptor is synthetic and does not establish a working host version. The package/README inconsistency and transcript fingerprint mismatch are documented in `README.md` and `EVIDENCE-MATRIX.md`.

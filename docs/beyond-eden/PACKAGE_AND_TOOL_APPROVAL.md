# Package and tool approval gate

The original task requires approval before downloading a package or native tool. This handoff contains source code, manifests, and helper scripts only. It does not perform installation.

The local agent should first determine whether the following exact tools are already installed and already approved in the user’s project context. If not, ask before downloading.

## 1. `three@0.187.0`

- Purpose: pinned WebGPU renderer, automatic WebGL2 backend fallback, GLTFLoader, KTX2Loader, Meshopt decoder, and TSL height fog.
- Source: npm package maintained by the three.js project.
- License: MIT.
- Cost: $0.
- Runtime policy: `tools/vendor/copy-three.mjs` copies the required build/addon files into `assets/vendor/three-r187/`; runtime uses no CDN.

Metadata-only check:

```bash
npm view three@0.187.0 dist.unpackedSize dist.tarball
```

## 2. `@gltf-transform/cli@4.5.1`

- Purpose: validation, inspection, draw-call cleanup, meshopt geometry compression, and KTX2 texture conversion.
- Source: npm package maintained by the glTF Transform project.
- License: MIT.
- Cost: $0.
- Dependency note: includes Sharp and meshoptimizer through the resolved dependency tree; record exact versions from the lockfile.

Metadata-only check:

```bash
npm view @gltf-transform/cli@4.5.1 dist.unpackedSize dist.tarball dependencies
```

## 3. Transitive meshoptimizer

- Purpose: `EXT_meshopt_compression` encoding through glTF Transform.
- License: MIT.
- Cost: $0.
- Policy: do not add an unrelated top-level version merely to satisfy this document. Record the version actually resolved by the pinned glTF Transform CLI.

## 4. KTX-Software 4.4.2 for Apple Silicon

- Purpose: provides the KTX/Basis tools used by glTF Transform’s KTX2 path and the standalone tree-billboard encoder.
- Source: official KhronosGroup KTX-Software release.
- Proposed Apple Silicon installer: `KTX-Software-4.4.2-Darwin-arm64.pkg`.
- Download size previously identified: 6,785,364 bytes (approximately 6.47 MiB).
- License: Apache-2.0.
- Cost: $0.
- Required commands after installation: `ktx` and `toktx`.

## Tree status

Tree selection is already resolved and is not part of this approval gate. The agent should locate the existing approved source locally. If it is missing, ask before downloading any replacement.

## Installation rule

Do not use `npx` because it may download packages implicitly. Once approval is confirmed:

1. record metadata;
2. run the local package-manager install;
3. retain `package-lock.json`;
4. vendor three.js locally;
5. record native-tool versions;
6. update the package/asset ledger.

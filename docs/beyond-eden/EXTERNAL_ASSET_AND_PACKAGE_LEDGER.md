# External asset and package ledger

## Included in this handoff

| Item | Source | License | Cost | Shipped in runtime? | Status |
|---|---|---:|---:|---:|---|
| Original procedural temple/plaza code | Created for this proof | Project-owned | $0 | Yes | Included |
| Procedural proxy tree | Created for this proof | Project-owned | $0 | Yes, fallback | Included |
| Internal architecture atlas | Research compilation | Varies by archive | N/A | **No** | Internal reference only |
| Archival photographs | Source archives listed in atlas | Varies | N/A | **No** | Never copy into runtime |

## Pinned packages — not downloaded by this handoff

| Package/tool | Version | Source | License | Cost | Local status to record |
|---|---:|---|---|---:|---|
| three | 0.187.0 | npm / three.js | MIT | $0 | Pending local confirmation |
| @gltf-transform/cli | 4.5.1 | npm / glTF Transform | MIT | $0 | Pending local confirmation |
| meshoptimizer | Resolved by glTF Transform | npm / zeux | MIT | $0 | Record lockfile version |
| KTX-Software | 4.4.2 Apple Silicon | Khronos release | Apache-2.0 | $0 | Pending local confirmation |

## Approved tree

Selection has already been handled. The handoff does not contain the source asset or guess its provenance. Complete:

```text
assets/beyond-eden/trees/tree-source-ledger.json
```

from real local records, including:

- exact listing/source URL;
- author/publisher;
- license and evidence path;
- download/purchase date;
- original filename, bytes, and SHA-256;
- commercial-use confirmation;
- cost;
- modifications;
- final derivative filenames and sizes.

## Final release checklist

Before any public upload, regenerate this ledger from:

- `package-lock.json`;
- `assets/vendor/three-r187/VENDOR-MANIFEST.json`;
- tree source manifest and ledger;
- GLB optimization manifest;
- final runtime network log.

Verify that no archival image or unlicensed source texture entered an exported GLB or public screenshot.

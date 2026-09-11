# Legacy CDN Assets Manifest & Backup Inventory

This document records the exact state, hashes, sizes, and original URLs of all pre-v4 DataCamp Light assets hosted on `https://cdn.datacamp.com/`.

These hashes serve as an authoritative record so that any legacy environment (development, staging, or production) can be verified or restored if necessary.

---

## Active Legacy Assets Snapshot

| Original CDN URL | Size (Bytes) | MD5 Checksum | SHA-256 Checksum | Last Modified (UTC) | Backup Location (`s3://cdn.datacamp.com/`) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `https://cdn.datacamp.com/dcl-react-dev.js.gz` | 5,392,369 | `7fd36621e7fe30a7999964c5a31dc31e` | `2454ea0e721ce2f2e6097d8120b0b8c66e4093f4be8d5cf65db01249b6b9076f` | 2019-07-24 15:15:59 | `dcl/v3/dev/dcl-react-dev.js.gz` |
| `https://cdn.datacamp.com/dcl-react-dev/dcl-react.js.gz` | 5,392,369 | `7fd36621e7fe30a7999964c5a31dc31e` | `2454ea0e721ce2f2e6097d8120b0b8c66e4093f4be8d5cf65db01249b6b9076f` | 2019-07-24 15:16:00 | `dcl/v3/dev/dcl-react.js.gz` |
| `https://cdn.datacamp.com/dcl-react-dev/index.html` | 34,949 | `fbb4392dd25417ec4d3303852717cb8b` | `b1e85f2d8cb53c8efcf240d4fdb9fbca259b3fb09403f0b2f5bfe2bc6ba9aa4b` | 2019-07-24 15:16:01 | `dcl/v3/dev/index.html` |
| `https://cdn.datacamp.com/dcl-react-dev/example.html` | 17,528 | `b1991ab8a01ce6bed8a52e673375af2b` | `aa3696d5063f6ee1ba5d0504856f61099ec161c6b553c7a36c84c1ce77490218` | 2019-07-24 15:16:01 | `dcl/v3/dev/example.html` |
| `https://cdn.datacamp.com/dcl-react-staging.js.gz` | 2,087,271 | `5409c74adb7a0d5ebaa8f738c8bc7c39` | `82b8bb1e076f0c8636feff2411977759a2245b7803657b98d287ee3b4fe6466f` | 2025-03-27 14:31:22 | `dcl/v3/staging/dcl-react-staging.js.gz` |
| `https://cdn.datacamp.com/dcl-react-staging/dcl-react.js.gz` | 2,087,271 | `5409c74adb7a0d5ebaa8f738c8bc7c39` | `82b8bb1e076f0c8636feff2411977759a2245b7803657b98d287ee3b4fe6466f` | 2025-03-27 14:31:23 | `dcl/v3/staging/dcl-react.js.gz` |
| `https://cdn.datacamp.com/dcl-react-staging/index.html` | 34,937 | `c181a70b89e9fde4c63f93c06646988c` | `b14e7e4c65c2b0407df7f73a9ebfd5184a1d46b7eb25e215456fefb5dfae0d03` | 2025-03-27 14:31:24 | `dcl/v3/staging/index.html` |
| `https://cdn.datacamp.com/dcl-react-staging/example.html` | 16,525 | `455d7b7c30e067a13ba37a4b2138a93f` | `458ca4a8fc5ff9cf17d23d8c2b7ba108f919d4e9c704a40879949f5068cf5b24` | 2025-03-27 14:31:25 | `dcl/v3/staging/example.html` |
| `https://cdn.datacamp.com/dcl-react.js.gz` (root) | 2,087,271 | `5409c74adb7a0d5ebaa8f738c8bc7c39` | `82b8bb1e076f0c8636feff2411977759a2245b7803657b98d287ee3b4fe6466f` | 2025-03-27 16:09:01 | `dcl/v3/prod/dcl-react.js.gz` |
| `https://cdn.datacamp.com/dcl-react-prod/dcl-react.js.gz` | 2,087,271 | `5409c74adb7a0d5ebaa8f738c8bc7c39` | `82b8bb1e076f0c8636feff2411977759a2245b7803657b98d287ee3b4fe6466f` | 2025-03-27 16:09:02 | `dcl/v3/prod/dcl-react-prod/dcl-react.js.gz` |
| `https://cdn.datacamp.com/dcl-react-prod/index.html` | 34,937 | `d8dfbbb418e37e0e86abe80112e81525` | `705b4e48eba11c2ad4e07357c91e4f3a74efba17db4cb7b26715eeae77d3aa3a` | 2025-03-27 16:09:03 | `dcl/v3/prod/index.html` |
| `https://cdn.datacamp.com/dcl-react-prod/example.html` | 16,525 | `a096239feb5313f20c21d4de7a5242e7` | `1859f02ab7f744e8bc92fb083c2670e06225eecb77f9ff3ce45d221fe7c12662` | 2025-03-27 16:09:04 | `dcl/v3/prod/example.html` |
| `https://cdn.datacamp.com/dcl/latest/dcl-react.js.gz` | 2,088,742 | `e5e8e343757fbbed6de354ac3e083109` | `9d3399079be0b1d3d623253b70868f0a232fba50d53fb7dd82a0b411d332d962` | 2025-03-27 14:31:52 | `dcl/v3/latest/dcl-react.js.gz` |
| `https://cdn.datacamp.com/dcl-react/standalone-example.html` | 15,909 | `6c4e7456ffe71054cc08df4b014313b7` | `a76eec2f75667e411340bfa097a8a64177264a93c72635fe3eb1346067b5f5bb` | 2017-10-31 16:41:01 | `dcl/v3/legacy/standalone-example.html` |

---

## Restoration Commands

In the event that an emergency rollback of any endpoint is required:

```bash
# Restore dev endpoint
aws s3 cp s3://cdn.datacamp.com/dcl/v3/dev/dcl-react-dev.js.gz s3://cdn.datacamp.com/dcl-react-dev.js.gz --content-encoding "gzip" --content-type "application/javascript"
aws s3 sync s3://cdn.datacamp.com/dcl/v3/dev/ s3://cdn.datacamp.com/dcl-react-dev/
aws cloudfront create-invalidation --distribution-id E11JM11LLUSZQE --paths "/dcl-react-dev.js.gz" "/dcl-react-dev/*"

# Restore staging endpoint
aws s3 cp s3://cdn.datacamp.com/dcl/v3/staging/dcl-react-staging.js.gz s3://cdn.datacamp.com/dcl-react-staging.js.gz --content-encoding "gzip" --content-type "application/javascript"
aws s3 sync s3://cdn.datacamp.com/dcl/v3/staging/ s3://cdn.datacamp.com/dcl-react-staging/
aws cloudfront create-invalidation --distribution-id E11JM11LLUSZQE --paths "/dcl-react-staging.js.gz" "/dcl-react-staging/*"

# Restore prod endpoint
aws s3 cp s3://cdn.datacamp.com/dcl/v3/prod/dcl-react.js.gz s3://cdn.datacamp.com/dcl-react.js.gz --content-encoding "gzip" --content-type "application/javascript"
aws s3 sync s3://cdn.datacamp.com/dcl/v3/prod/ s3://cdn.datacamp.com/dcl-react-prod/
aws cloudfront create-invalidation --distribution-id E11JM11LLUSZQE --paths "/dcl-react.js.gz" "/dcl-react-prod/*"
```

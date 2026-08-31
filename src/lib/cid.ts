import { cidOf } from './car';

/**
 * The CIDv1 (raw codec, base32) wrapping a sha-256 multihash digest:
 * 'b' + base32(0x01 0x55 0x12 0x20 || digest). Content added to IPFS with
 * `raw-leaves` and `cid-version=1` carries exactly this CID, which is why the
 * contract can store just the 32-byte digest.
 *
 * The multicodec prefix and the base32 alphabet used to be written out here by hand, and again
 * in the CAR writer next door. They are the one constant this app cannot afford to get wrong -
 * the whole content layer is addressed by it - so they are read from `multiformats` rather than
 * remembered in two places.
 */
export function cidFromSha256Digest(digest: Uint8Array): string {
  return cidOf(digest).toString();
}

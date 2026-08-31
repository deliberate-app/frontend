/**
 * A CARv1 archive holding exactly one raw block.
 *
 * The contentURI scheme is only sound while the CID is `0x01 0x55 0x12 0x20 || sha-256(bytes)` -
 * the raw-leaves CIDv1 the contract's 32-byte digest reconstructs. A pinning service that
 * imports loose bytes decides that CID for itself, and services differ: Filebase wraps content
 * in UnixFS and returns a dag-pb CIDv0 (`Qm…`) for bytes whose raw CID is `bafkrei…`, so the
 * same text is addressed two different ways and the on-chain digest resolves to nothing.
 *
 * Handing the service a CAR instead moves that decision back here. A CAR carries its own blocks
 * and names its own roots, so the importer stores what it is given rather than re-chunking it,
 * and the CID is settled before the upload leaves this process.
 *
 * The format (CARv1) is a varint-delimited header followed by varint-delimited blocks:
 *
 *   varint(len(header)) || header             header = DAG-CBOR {roots: [cid], version: 1}
 *   varint(len(cid) + len(data)) || cid || data
 */

/** The 36 raw bytes of a CIDv1 raw-codec sha-256 CID - the binary form of `cidFromSha256Digest`. */
export function cidBytesFromSha256Digest(digest: Uint8Array): Uint8Array {
  if (digest.length !== 32) {
    throw new Error(`a sha-256 digest is 32 bytes, got ${digest.length}`);
  }
  return new Uint8Array([0x01, 0x55, 0x12, 0x20, ...digest]);
}

/** Unsigned LEB128, the length prefix CARv1 delimits its sections with. */
export function varint(value: number): Uint8Array {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`varint takes a non-negative integer, got ${value}`);
  }
  const out: number[] = [];
  let remaining = value;
  while (remaining >= 0x80) {
    out.push((remaining & 0x7f) | 0x80);
    remaining >>>= 7;
  }
  out.push(remaining);
  return Uint8Array.from(out);
}

/**
 * The DAG-CBOR header naming the single root: `{roots: [<cid>], version: 1}`.
 *
 * Hand-encoded because the shape is fixed and one CBOR library is not worth carrying into an
 * edge function for eleven constant bytes and a link. A CID inside DAG-CBOR is tag 42 around a
 * byte string whose first byte is the multibase identity prefix `0x00`.
 */
function carHeader(cidBytes: Uint8Array): Uint8Array {
  const text = (value: string): number[] => [0x60 | value.length, ...new TextEncoder().encode(value)];
  const link = [
    0xd8,
    0x2a, // tag(42)
    0x58,
    cidBytes.length + 1, // byte string, 1-byte length follows
    0x00, // multibase identity prefix
    ...cidBytes,
  ];
  return Uint8Array.from([
    0xa2, // map(2)
    ...text('roots'),
    0x81, // array(1)
    ...link,
    ...text('version'),
    0x01,
  ]);
}

/** The CARv1 bytes for one raw block, rooted at the block's own CID. */
export function singleBlockCar(data: Uint8Array, digest: Uint8Array): Uint8Array {
  const cidBytes = cidBytesFromSha256Digest(digest);
  const header = carHeader(cidBytes);
  const headerPrefix = varint(header.length);
  const blockPrefix = varint(cidBytes.length + data.length);

  const car = new Uint8Array(
    headerPrefix.length + header.length + blockPrefix.length + cidBytes.length + data.length,
  );
  let at = 0;
  for (const part of [headerPrefix, header, blockPrefix, cidBytes, data]) {
    car.set(part, at);
    at += part.length;
  }
  return car;
}

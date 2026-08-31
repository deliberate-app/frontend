import * as CarBufferWriter from '@ipld/car/buffer-writer';
import { CID } from 'multiformats/cid';

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
 * The framing comes from the IPLD project's own writer rather than from this repo. The format
 * is small enough to hand-encode - and was, at first - but hand-encoding it means owning a
 * varint encoder and a DAG-CBOR header in a codebase whose subject is neither, and testing them
 * against a decoder written by the same hand, which cannot catch a shared misreading of the
 * spec. This module is imported only by the pin proxy, so the dependency lands in the edge
 * function and costs the browser bundle nothing.
 */
export function singleBlockCar(data: Uint8Array, digest: Uint8Array): Uint8Array {
  const cid = cidOf(digest);
  const size = CarBufferWriter.headerLength({ roots: [cid] }) + CarBufferWriter.blockLength({ cid, bytes: data });
  const writer = CarBufferWriter.createWriter(new ArrayBuffer(size), { roots: [cid] });
  writer.write({ cid, bytes: data });
  return writer.close();
}

/**
 * CIDv1, raw codec (0x55), sha-256 multihash (0x12 0x20) - the prefix the contract's 32-byte
 * digest is expanded with, written once here and nowhere else.
 *
 * Built by decoding the canonical bytes rather than from `multiformats`' codec and hash
 * registries: Vercel's edge bundler rejects that package's `codecs/*` and `hashes/*` subpath
 * exports, and a deploy is where you find that out. `CID.decode` is in the one entry point that
 * does bundle, and it still validates the bytes and owns the base32 serialisation - which is the
 * part worth not writing by hand.
 */
const RAW_CIDV1_SHA256 = [0x01, 0x55, 0x12, 0x20];

/** The raw-codec CIDv1 for a sha-256 digest - the one definition of the scheme's CID. */
export function cidOf(digest: Uint8Array): CID {
  if (digest.length !== 32) {
    throw new Error(`a sha-256 digest is 32 bytes, got ${digest.length}`);
  }
  return CID.decode(new Uint8Array([...RAW_CIDV1_SHA256, ...digest]));
}

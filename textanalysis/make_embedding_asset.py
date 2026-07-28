#!/usr/bin/env python3
"""
Turn a text-clip embedding table into a DMPE binary asset for the Dumpster app,
and register it in the app's data/embeddings.json manifest.

Used for both:
  regime 2 — 128D word2vec bigram means   (input: textanalysis/output/vect_2g.txt)
  regime 3 — sentence-transformer vectors (input: whatever Phase 2 emits)

Input format: one record per line, whitespace-separated. The first token must
contain the record's 5-digit ID (either a bare `00000` or a path like
`text_cleaned/0/0/0/00000.txt`); the remaining tokens are the vector.

Output format (DMPE, little-endian) — see similarity_providers.js:

    offset  0 : magic    b'DMPE'
    offset  4 : version  uint8   = 1
    offset  5 : dtype    uint8   = 0 (int8)
    offset  6 : dims     uint16
    offset  8 : count    uint32   record count; row i == bupId i
    offset 12 : reserved uint32   = 0
    offset 16 : payload  count*dims int8, row-major

Quantization: each row is scaled by its own largest absolute component so it
spans the full int8 range, then rounded. Cosine similarity is invariant to a
positive per-row scale, and the app recovers exact cosine of the quantized rows
via per-row inverse norms — so this loses nothing and buys ~1.7 bits of
precision over scaling by the L2 norm.

Rows absent from the input, or with an all-zero vector, are written as zeros.
The app treats those as neutral (cosine 0) rather than similar or dissimilar.

No third-party dependencies.

Usage:
    python3 make_embedding_asset.py                    # regime 2, all defaults
    python3 make_embedding_asset.py --dry-run          # report, write nothing
    python3 make_embedding_asset.py --input X --regime 3 --label SBERT-256
"""

import argparse
import json
import os
import re
import struct
import sys

HERE        = os.path.dirname(os.path.abspath(__file__))
REPO        = os.path.dirname(HERE)
APP_DATA    = os.path.join(REPO, 'p5Dumpster', 'port_03', 'data')

DEFAULT_INPUT    = os.path.join(HERE, 'output', 'vect_2g.txt')
DEFAULT_OUTPUT   = 'bigram_w2v_128_int8.bin'
DEFAULT_REGIME   = 2
DEFAULT_LABEL    = 'W2V-128'
N_RECORDS        = 20038          # N_BREAKUP_DATABASE_RECORDS

DMPE_MAGIC       = b'DMPE'
DMPE_VERSION     = 1
DMPE_DTYPE_INT8  = 0

ID_RE = re.compile(r'(\d{5})(?:\.txt)?$')


def parse_table(path, count):
    """Return (rows, dims, stats). rows[i] is a list of floats or None."""
    rows = [None] * count
    dims = None
    n_parsed = n_skipped_id = n_out_of_range = n_dup = n_bad_dims = 0

    with open(path, 'r') as f:
        for lineno, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            parts = line.split()
            m = ID_RE.search(parts[0])
            if not m:
                n_skipped_id += 1
                continue
            rec_id = int(m.group(1))
            vals = parts[1:]

            if dims is None:
                dims = len(vals)
                if dims == 0:
                    sys.exit(f'{path}:{lineno}: first record has no vector values')
            elif len(vals) != dims:
                n_bad_dims += 1
                continue

            if not (0 <= rec_id < count):
                n_out_of_range += 1
                continue
            if rows[rec_id] is not None:
                n_dup += 1
                continue

            try:
                rows[rec_id] = [float(v) for v in vals]
            except ValueError:
                n_bad_dims += 1
                continue
            n_parsed += 1

    if dims is None:
        sys.exit(f'{path}: no parseable records found')

    stats = dict(parsed=n_parsed, no_id=n_skipped_id, out_of_range=n_out_of_range,
                 duplicate=n_dup, bad_dims=n_bad_dims)
    return rows, dims, stats


def mean_center(rows, dims):
    """Subtract the corpus mean from every present row.

    Sentence-transformer embeddings are anisotropic — they occupy a narrow cone,
    so every pair looks similar and cosine loses discriminating power. Measured
    on bge-small over this corpus: random-pair cosine was mean 0.729 / sd 0.063,
    and the 20th-nearest neighbour sat only 1.76 sd above the mean. After
    centring: mean -0.001 / sd 0.113, and the 20th neighbour sits 3.11 sd out.
    It also changes 55% of the top-20 neighbour sets, so it is not cosmetic.

    Absent and all-zero rows are left untouched, so they stay zero and the app
    keeps treating them as neutral rather than placing them at -mean.
    """
    present = [v for v in rows if v is not None and any(v)]
    if not present:
        return 0
    mu = [0.0] * dims
    for v in present:
        for k in range(dims):
            mu[k] += v[k]
    n = float(len(present))
    for k in range(dims):
        mu[k] /= n
    for v in rows:
        if v is None or not any(v):
            continue
        for k in range(dims):
            v[k] -= mu[k]
    return len(present)


def quantize(rows, dims):
    """int8 payload, scaling each row by its own max |component|."""
    payload = bytearray(len(rows) * dims)
    n_zero = n_missing = 0

    for i, v in enumerate(rows):
        if v is None:
            n_missing += 1
            continue                      # leave as zeros
        peak = max(abs(x) for x in v)
        if peak == 0.0:
            n_zero += 1
            continue                      # leave as zeros
        scale = 127.0 / peak
        base = i * dims
        for k in range(dims):
            q = int(round(v[k] * scale))
            if q >  127: q =  127
            if q < -127: q = -127
            payload[base + k] = q & 0xFF   # two's complement into a byte
    return bytes(payload), n_zero, n_missing


def write_dmpe(path, payload, dims, count):
    header = (DMPE_MAGIC
              + struct.pack('<BBHII', DMPE_VERSION, DMPE_DTYPE_INT8, dims, count, 0))
    assert len(header) == 16, len(header)
    with open(path, 'wb') as f:
        f.write(header)
        f.write(payload)
    return len(header) + len(payload)


def update_manifest(manifest_path, regime, filename, dims, count, label):
    doc = {'assets': {}}
    if os.path.exists(manifest_path):
        try:
            with open(manifest_path) as f:
                doc = json.load(f)
        except (ValueError, OSError) as e:
            print(f'  ! {manifest_path} unreadable ({e}); rewriting it')
            doc = {'assets': {}}
    doc.setdefault('assets', {})
    doc['assets'][str(regime)] = {
        'file': filename, 'dims': dims, 'count': count, 'label': label,
    }
    with open(manifest_path, 'w') as f:
        json.dump(doc, f, indent=2)
        f.write('\n')


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--input',    default=DEFAULT_INPUT)
    ap.add_argument('--out-dir',  default=APP_DATA)
    ap.add_argument('--output',   default=DEFAULT_OUTPUT, help='filename within out-dir')
    ap.add_argument('--regime',   type=int, default=DEFAULT_REGIME)
    ap.add_argument('--label',    default=DEFAULT_LABEL)
    ap.add_argument('--count',    type=int, default=N_RECORDS)
    ap.add_argument('--center',   action='store_true',
                    help='subtract the corpus mean before quantizing. Strongly '
                         'recommended for sentence-transformer embeddings, which '
                         'are anisotropic; see mean_center() for measurements.')
    ap.add_argument('--dry-run',  action='store_true', help='report only, write nothing')
    args = ap.parse_args()

    if not os.path.exists(args.input):
        sys.exit(f'input not found: {args.input}')

    print(f'reading {args.input}')
    rows, dims, stats = parse_table(args.input, args.count)
    print(f'  {stats["parsed"]} of {args.count} records, {dims}D')
    for key, msg in (('no_id',        'lines with no 5-digit id'),
                     ('out_of_range', 'ids outside 0..%d' % (args.count - 1)),
                     ('duplicate',    'duplicate ids (first kept)'),
                     ('bad_dims',     'lines with wrong dims or bad floats')):
        if stats[key]:
            print(f'  ! {stats[key]} {msg}')

    if args.center:
        n_centered = mean_center(rows, dims)
        print(f'  mean-centered {n_centered} rows')

    payload, n_zero, n_missing = quantize(rows, dims)
    if n_missing:
        print(f'  ! {n_missing} records absent from input -> written as zeros (neutral)')
    if n_zero:
        print(f'  {n_zero} records have an all-zero vector -> written as zeros (neutral)')

    out_path = os.path.join(args.out_dir, args.output)
    manifest = os.path.join(args.out_dir, 'embeddings.json')

    if args.dry_run:
        print(f'\n[dry run] would write {out_path} '
              f'({(16 + len(payload)) / 1048576.0:.2f} MB)')
        print(f'[dry run] would register regime {args.regime} '
              f'({args.label}) in {manifest}')
        return

    if not os.path.isdir(args.out_dir):
        sys.exit(f'out-dir does not exist: {args.out_dir}')

    total = write_dmpe(out_path, payload, dims, args.count)
    print(f'\nwrote {out_path}  ({total} bytes, {total / 1048576.0:.2f} MB)')

    update_manifest(manifest, args.regime, args.output, dims, args.count, args.label)
    print(f'registered regime {args.regime} ({args.label}) in {manifest}')
    print('\nReload the app and press '
          f'{args.regime} to use it.')


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""
Build a content-aware PixelView layout: 2D UMAP of the clip embeddings, then a
Linear Assignment Problem (LAP) solve to place clips on the actual pixel grid.

The macro structure is preserved exactly. `dump_baseline_layout.js` exports the
current PixelIndexer layout, which fixes which (age, sex, instigator) group owns
which pixels. This script only rearranges clips *within* each group — so the age
bands, the sex ribbons and the instigator runs all stay where they are, and only
the ordering inside them becomes semantic instead of langMetric-driven.

Grid rectification follows the recipe in Kyle McDonald's ImageRearranger:
normalize both the embedding and the target cells to [0,1] per axis, build a
squared-euclidean cost matrix, and solve with Jonker-Volgenant. Normalizing each
axis independently stretches the embedding to whatever aspect the group happens
to have, which matters here because groups range from tall-and-narrow to a single
row.

Usage (needs the venv — see requirements.txt):
    node dump_baseline_layout.js > output/pixel_baseline.tsv
    python make_pixel_layout.py
    # -> p5Dumpster/port_03/data/pixel_layout_nomic.bin

Output format ("DMPL"), little-endian:
    offset  0 : magic    b'DMPL'      4 bytes
    offset  4 : version  uint8        = 1
    offset  5 : reserved uint8        = 0
    offset  6 : gridW    uint16
    offset  8 : gridH    uint16
    offset 10 : reserved uint16       = 0
    offset 12 : payload  gridW*gridH  uint16, bupId per pixel index (row-major)
"""

import argparse
import os
import struct
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
APP_DATA = os.path.join(REPO, 'p5Dumpster', 'port_03', 'data')

DEFAULT_BASELINE = os.path.join(HERE, 'output', 'pixel_baseline.tsv')
DEFAULT_VECTORS  = os.path.join(HERE, 'output', 'vect_nomic256.txt')
DEFAULT_OUTPUT   = None   # derived from --group-by
GROUP_FIELDS     = ('age', 'sex', 'instigator')

DMPL_MAGIC = b'DMPL'


def read_baseline(path):
    """Return (cells, gridW, gridH). cells[pixelIndex] = (x, y, bupId, key)."""
    cells = []
    maxx = maxy = 0
    with open(path) as f:
        for line in f:
            if line.startswith('#') or not line.strip():
                continue
            p = line.rstrip('\n').split('\t')
            _pi, x, y, bup, age, sex, instig = (int(v) for v in p[:7])
            cells.append((x, y, bup, (age, sex, instig)))
            maxx = max(maxx, x)
            maxy = max(maxy, y)
    return cells, maxx + 1, maxy + 1


def read_vectors(path):
    import numpy as np
    import re
    ids, rows = [], []
    dims = None
    id_re = re.compile(r'(\d{5})')
    with open(path) as f:
        for line in f:
            if not line.strip():
                continue
            p = line.split()
            m = id_re.search(p[0])
            if not m:
                continue
            vals = p[1:]
            if dims is None:
                dims = len(vals)
            elif len(vals) != dims:
                continue
            ids.append(int(m.group(1)))
            rows.append(vals)
    X = np.asarray(rows, dtype=np.float32)
    return np.asarray(ids, dtype=np.int64), X


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--baseline', default=DEFAULT_BASELINE)
    ap.add_argument('--vectors',  default=DEFAULT_VECTORS)
    ap.add_argument('--out-dir',  default=APP_DATA)
    ap.add_argument('--output',   default=DEFAULT_OUTPUT,
                    help='filename within out-dir; defaults from --group-by')
    ap.add_argument('--group-by',  default='age,sex,instigator',
                    help="comma list from age,sex,instigator. These stay as the "
                         "outer scaffolding; content only reorders within a group. "
                         "Dropping a field makes groups larger, so the semantic "
                         "layout gets more room but that attribute stops being "
                         "spatially legible.")
    ap.add_argument('--n-neighbors', type=int,   default=15)
    ap.add_argument('--min-dist',    type=float, default=0.1)
    ap.add_argument('--metric',      default='cosine',
                    help="UMAP metric. 'cosine' suits normalized semantic "
                         "embeddings; ImageRearranger used 'euclidean'.")
    ap.add_argument('--seed',        type=int, default=1234)
    ap.add_argument('--embed-cache', default=os.path.join(HERE, 'output', 'embed_2d_umap.txt'),
                    help='reuse a previous 2D embedding if present (gitignored)')
    ap.add_argument('--refresh-embed', action='store_true', help='ignore the cache')
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()

    import numpy as np
    from scipy.spatial.distance import cdist

    fields = [f.strip() for f in args.group_by.split(',') if f.strip()]
    bad = [f for f in fields if f not in GROUP_FIELDS]
    if bad:
        sys.exit(f'unknown --group-by field(s) {bad}; choose from {GROUP_FIELDS}')
    if not fields:
        sys.exit('--group-by needs at least one field')
    if args.output is None:
        args.output = 'pixel_layout_lap_' + ''.join(f[0] for f in fields) + '.bin'

    for p in (args.baseline, args.vectors):
        if not os.path.exists(p):
            sys.exit(f'missing input: {p}\n(did you run dump_baseline_layout.js?)')

    cells, gw, gh = read_baseline(args.baseline)
    print(f'baseline: {len(cells)} pixels on a {gw}x{gh} grid')

    # ---- 2D embedding -----------------------------------------------------
    if os.path.exists(args.embed_cache) and not args.refresh_embed:
        print(f'reusing cached 2D embedding {args.embed_cache}')
        cached = np.loadtxt(args.embed_cache)
        ids2d = cached[:, 0].astype(np.int64)
        Y = cached[:, 1:3].astype(np.float64)
    else:
        ids2d, X = read_vectors(args.vectors)
        print(f'vectors: {X.shape[0]} clips x {X.shape[1]}D -> UMAP 2D '
              f'(n_neighbors={args.n_neighbors}, min_dist={args.min_dist}, '
              f'metric={args.metric})')
        import umap
        t0 = time.time()
        reducer = umap.UMAP(n_components=2, n_neighbors=args.n_neighbors,
                            min_dist=args.min_dist, metric=args.metric,
                            random_state=args.seed, verbose=True)
        Y = reducer.fit_transform(X).astype(np.float64)
        print(f'  UMAP took {time.time()-t0:.1f}s')
        np.savetxt(args.embed_cache,
                   np.column_stack([ids2d, Y]), fmt='%.6f')
        print(f'  cached to {args.embed_cache}')

    pos = {int(i): (Y[k, 0], Y[k, 1]) for k, i in enumerate(ids2d)}
    missing = [c[2] for c in cells if c[2] not in pos]
    if missing:
        print(f'  ! {len(missing)} placed clips have no 2D coords; '
              f'they keep their baseline position')

    # ---- group by (age, sex, instigator) ---------------------------------
    pick = tuple(GROUP_FIELDS.index(f) for f in fields)
    groups = {}
    for pi, (x, y, bup, key) in enumerate(cells):
        gk = tuple(key[i] for i in pick)
        groups.setdefault(gk, []).append((pi, x, y, bup))
    sizes = sorted((len(v) for v in groups.values()), reverse=True)
    big = [s for s in sizes if s >= 100]
    print(f"\n{len(groups)} ({','.join(fields)}) groups; largest {sizes[:5]}")
    print(f'  {len(big)} groups have >=100 clips, holding '
          f'{100*sum(big)/len(cells):.1f}% of all pixels')

    # ---- LAP within each group ------------------------------------------
    out = np.zeros(gw * gh, dtype=np.uint16)
    import lap
    t0 = time.time()
    n_lap = n_trivial = 0
    for key, members in groups.items():
        n = len(members)
        if n == 1 or any(m[3] not in pos for m in members):
            # Single cell, or incomplete coords: keep the baseline order.
            for pi, x, y, bup in members:
                out[pi] = bup
            n_trivial += 1
            continue

        cellxy = np.array([[m[1], m[2]] for m in members], dtype=np.float64)
        clipxy = np.array([pos[m[3]] for m in members], dtype=np.float64)

        # Normalize both to [0,1] per axis. A degenerate axis (group only one
        # row tall, or all clips at the same coord) collapses to 0.5 so it
        # simply stops influencing the cost.
        def norm(A):
            A = A - A.min(axis=0)
            span = A.max(axis=0)
            for d in (0, 1):
                if span[d] > 0:
                    A[:, d] /= span[d]
                else:
                    A[:, d] = 0.5
            return A
        cellxy = norm(cellxy)
        clipxy = norm(clipxy)

        cost = cdist(cellxy, clipxy, 'sqeuclidean')
        mx = cost.max()
        cost = (cost * (100000.0 / mx)).astype(np.int32) if mx > 0 else cost.astype(np.int32)
        _, col_for_row, _ = lap.lapjv(cost, extend_cost=True)
        for ci, member_idx in enumerate(col_for_row):
            out[members[ci][0]] = members[int(member_idx)][3]
        n_lap += 1

    print(f'\nLAP: solved {n_lap} groups ({n_trivial} passed through) '
          f'in {time.time()-t0:.1f}s')

    # sanity: every placed bupId appears exactly once
    uniq = np.unique(out)
    if len(uniq) != len(cells):
        print(f'  ! WARNING: {len(cells)} cells but {len(uniq)} distinct bupIds')
    else:
        print(f'  permutation is a bijection over {len(uniq)} clips')

    if args.dry_run:
        print('\n[dry run] nothing written')
        return

    path = os.path.join(args.out_dir, args.output)
    header = DMPL_MAGIC + struct.pack('<BBHHH', 1, 0, gw, gh, 0)
    assert len(header) == 12, len(header)
    with open(path, 'wb') as f:
        f.write(header)
        f.write(out.tobytes())
    total = 12 + out.nbytes
    print(f'\nwrote {path}  ({total} bytes, {total/1024:.1f} KB)')
    print('Set PIXELVIEW_LAYOUT_ASSET in dumpster_constants.js to use it.')


if __name__ == '__main__':
    main()

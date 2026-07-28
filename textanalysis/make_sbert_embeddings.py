#!/usr/bin/env python3
"""
Embed every Dumpster text clip with a local sentence-transformer, and write the
result in the same whitespace-separated table format that
make_embedding_asset.py consumes.

    python3 make_sbert_embeddings.py            # -> output/vect_sbert.txt
    python3 make_embedding_asset.py --input output/vect_sbert.txt \
        --regime 3 --output sbert_384_int8.bin --label SBERT-384

Runs entirely locally. The model is downloaded once from HuggingFace into
textanalysis/models/ (gitignored) and reused thereafter; pass --offline to
refuse any network access and fail if the weights are not already cached.
The Dumpster app itself never contacts anything — it loads a static binary.

Input is the cleaned corpus, either an unpacked text_cleaned/ directory or the
text_cleaned.zip shipped in TheDumpster/data/. Each file's first line is the
author/handle line, which is stripped so the embedding sees the same body text
the app displays via getBreakupText().

Requires the venv: see requirements.txt.
"""

import argparse
import io
import os
import re
import sys
import zipfile

HERE       = os.path.dirname(os.path.abspath(__file__))
REPO       = os.path.dirname(HERE)
MODEL_DIR  = os.path.join(HERE, 'models')

DEFAULT_ZIP    = os.path.join(REPO, 'TheDumpster', 'data', 'text_cleaned.zip')
DEFAULT_DIR    = os.path.join(HERE, 'text_cleaned')
DEFAULT_OUT    = os.path.join(HERE, 'output', 'vect_sbert.txt')
DEFAULT_MODEL  = 'BAAI/bge-small-en-v1.5'
N_RECORDS      = 20038

ID_RE = re.compile(r'(\d{5})\.txt$')


def clean_body(raw):
    """Strip the author line and normalize apostrophes, matching the app's
    getBreakupText() so the embedding sees what the viewer reads."""
    nl = raw.find('\n')
    body = raw[nl + 1:] if nl != -1 else raw
    body = body.replace(' ` ', "'").replace(" ' ", "'")
    return ' '.join(body.split())


def load_corpus(args):
    """Return a list of length N_RECORDS; entries are body text or None."""
    texts = [None] * args.count

    if args.corpus_dir and os.path.isdir(args.corpus_dir):
        print(f'reading corpus from {args.corpus_dir}')
        for root, _dirs, files in os.walk(args.corpus_dir):
            for name in files:
                m = ID_RE.search(name)
                if not m:
                    continue
                rid = int(m.group(1))
                if not (0 <= rid < args.count):
                    continue
                with open(os.path.join(root, name), 'r',
                          encoding='utf-8', errors='replace') as f:
                    texts[rid] = clean_body(f.read())
    elif args.corpus_zip and os.path.exists(args.corpus_zip):
        print(f'reading corpus from {args.corpus_zip}')
        with zipfile.ZipFile(args.corpus_zip) as z:
            for info in z.infolist():
                if info.is_dir() or '__MACOSX' in info.filename:
                    continue
                m = ID_RE.search(info.filename)
                if not m:
                    continue
                rid = int(m.group(1))
                if not (0 <= rid < args.count):
                    continue
                raw = z.read(info).decode('utf-8', errors='replace')
                texts[rid] = clean_body(raw)
    else:
        sys.exit(f'no corpus found (looked for dir {args.corpus_dir} '
                 f'and zip {args.corpus_zip})')

    found = sum(1 for t in texts if t is not None)
    empty = sum(1 for t in texts if t is not None and not t.strip())
    print(f'  {found} of {args.count} records; {empty} are empty after cleaning')
    if found == 0:
        sys.exit('corpus produced no texts')
    return texts


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--corpus-zip', default=DEFAULT_ZIP)
    ap.add_argument('--corpus-dir', default=DEFAULT_DIR,
                    help='preferred over --corpus-zip when it exists')
    ap.add_argument('--out',    default=DEFAULT_OUT)
    ap.add_argument('--model',  default=DEFAULT_MODEL)
    ap.add_argument('--dims',   type=int, default=0,
                    help='truncate to this many dims (0 = keep native). Use with '
                         '--matryoshka for models trained for it.')
    ap.add_argument('--matryoshka', action='store_true',
                    help='layer-norm before truncating, per the matryoshka recipe. '
                         'Required for correct results with nomic-embed-text-v1.5; '
                         'meaningless for models not trained this way.')
    ap.add_argument('--prefix', default='',
                    help='prepended to every text. nomic-embed needs a task prefix; '
                         'use "clustering: " for symmetric doc-doc similarity.')
    ap.add_argument('--trust-remote-code', action='store_true',
                    help='allow the model repo to execute its own code at build '
                         'time. Needed by nomic-embed-text-v1.5.')
    ap.add_argument('--count',  type=int, default=N_RECORDS)
    ap.add_argument('--batch',  type=int, default=64)
    ap.add_argument('--max-seq-len', type=int, default=512,
                    help='cap the model\'s sequence length. The default of 512 is '
                         'ample here — the longest record in the corpus is 1849 '
                         'bytes, ~460 tokens. Long-context models default much '
                         'higher (nomic-embed: 8192), which wastes memory and '
                         'compute quadratically and can get the process OOM-killed. '
                         'Pass 0 to keep the model default.')
    ap.add_argument('--offline', action='store_true',
                    help='fail rather than download; requires cached weights')
    args = ap.parse_args()

    if args.offline:
        os.environ['HF_HUB_OFFLINE'] = '1'
        os.environ['TRANSFORMERS_OFFLINE'] = '1'

    texts = load_corpus(args)

    # Imported after corpus loading so a corpus error doesn't wait on torch.
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError:
        sys.exit('sentence-transformers not installed. Activate the venv:\n'
                 '  source textanalysis/.venv/bin/activate\n'
                 '  pip install -r textanalysis/requirements.txt')

    os.makedirs(MODEL_DIR, exist_ok=True)
    print(f'loading model {args.model} (cache: {MODEL_DIR})')
    kw = {'cache_folder': MODEL_DIR}
    if args.trust_remote_code:
        kw['trust_remote_code'] = True
    model = SentenceTransformer(args.model, **kw)
    try:
        native = model.get_embedding_dimension()
    except AttributeError:                      # sentence-transformers < 5.6
        native = model.get_sentence_embedding_dimension()
    print(f'  native dimensionality: {native}')
    if args.max_seq_len and model.max_seq_length > args.max_seq_len:
        print(f'  capping max_seq_length {model.max_seq_length} -> {args.max_seq_len}')
        model.max_seq_length = args.max_seq_len

    if args.dims and args.dims > native:
        sys.exit(f'--dims {args.dims} exceeds the model\'s {native}')

    # Records with no text get an all-zero row; the app treats those as neutral.
    idx    = [i for i, t in enumerate(texts) if t and t.strip()]
    batch  = [args.prefix + texts[i] for i in idx]
    if args.prefix:
        print(f'  prefixing every text with {args.prefix!r}')
    print(f'embedding {len(batch)} texts (batch size {args.batch})')

    vecs = model.encode(batch, batch_size=args.batch, show_progress_bar=True,
                        convert_to_numpy=True, normalize_embeddings=False)

    dims = args.dims if args.dims else native
    if dims != native:
        if args.matryoshka:
            # Official matryoshka recipe: layer-norm across the feature axis
            # FIRST, then slice, then L2-normalize. Slicing without the
            # layer-norm measurably degrades the truncated vectors.
            import torch
            import torch.nn.functional as F
            print(f'  matryoshka: layer-norm, truncate {native} -> {dims}, renormalize')
            t = torch.from_numpy(vecs)
            t = F.layer_norm(t, normalized_shape=(t.shape[1],))
            t = t[:, :dims]
            t = F.normalize(t, p=2, dim=1)
            vecs = t.numpy()
        else:
            print(f'  WARNING: truncating {native} -> {dims} without --matryoshka. '
                  f'Only correct if the model was trained for plain truncation.')
            vecs = vecs[:, :dims]

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    written = 0
    with open(args.out, 'w') as f:
        for row, rid in enumerate(idx):
            vals = ' '.join(f'{v:.6f}' for v in vecs[row][:dims])
            f.write(f'{rid:05d}.txt {vals}\n')
            written += 1
    print(f'\nwrote {args.out}  ({written} rows x {dims}D)')
    print(f'{args.count - written} records had no text and are omitted; '
          f'make_embedding_asset.py writes those as zeros (neutral).')
    print('\nNext:')
    print(f'  python3 make_embedding_asset.py --input {os.path.relpath(args.out, HERE)} \\')
    print(f'      --regime 3 --output sbert_{dims}_int8.bin --label SBERT-{dims}')


if __name__ == '__main__':
    main()

# Training

Offline Python pipeline for the policy-value model used by the Rust `gamey` neural bots.

## What Is Implemented

- `model.py`: neural network and board encoding utilities.
- `self_play.py`: self-play generation logic.
- `train.py`: AlphaZero-style training loop with evaluation, replay buffer, checkpointing and ONNX export.
- `pre_train.py`: supervised pre-training from a dataset.
- `export_model.py`: export a PyTorch checkpoint to ONNX.
- `test_*.py`: pytest coverage for model, export, contracts, self-play and training smoke paths.
- `fixtures/encoder_contract_cases.json`: encoder contract fixtures shared with tests.

Generated training artifacts are written to paths passed through CLI options. The Rust service expects the production model at `gamey/models/yovi_model.onnx`.

## Requirements

```bash
python -m pip install -r training/requirements.txt
```

The main dependencies are PyTorch, NumPy, pytest, ONNX and ONNX Script.

## Tests

```bash
python -m pytest training -q
```

## Train

Fast smoke run:

```bash
python training/train.py --iterations 1 --games-per-iter 2 --epochs 1 --batch-size 32
```

Default output paths from `train.py` are:

- `../gamey/models/yovi_model.pt`
- `../gamey/models/yovi_model.onnx`

When running from the repository root, prefer explicit paths:

```bash
python training/train.py --iterations 1 --games-per-iter 2 --epochs 1 --batch-size 32 --model-path gamey/models/yovi_model.pt --onnx-path gamey/models/yovi_model.onnx
```

Useful options include:

- `--board-sizes 5 7 9 11`
- `--simulations 150`
- `--eval-games 40`
- `--eval-simulations 50`
- `--checkpoint-path <path>`
- `--metrics-path <path>`

## Export Existing Weights

```bash
python training/export_model.py --weights gamey/models/yovi_model.pt --output gamey/models/yovi_model.onnx
```

## Supervised Pre-Training

```bash
python training/pre_train.py --dataset path/to/dataset.jsonl --model gamey/models/yovi_model.pt --onnx gamey/models/yovi_model.onnx
```

Additional options include `--epochs`, `--lr`, `--batch-size`, `--value-coef`, `--patience`, `--train-ratio`, `--resume`, `--channels` and `--num-res-blocks`.

# Training

Pipeline offline de entrenamiento y exportación del modelo policy-value usado por `gamey`.

## Requisitos

```sh
python -m pip install -r training/requirements.txt
```

## Tests

```sh
python -m pytest training -q
```

## Export ONNX

```sh
python training/export_model.py --weights gamey/models/yovi_model.pt --output gamey/models/yovi_model.onnx
```

## Entrenamiento

```sh
python training/train.py --iterations 1 --games-per-iter 2 --epochs 1 --batch-size 32
```

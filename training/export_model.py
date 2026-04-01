import argparse
from pathlib import Path

from model import PolicyValueNet


def main():
    parser = argparse.ArgumentParser(description="Exporta un modelo PyTorch a ONNX")
    parser.add_argument(
        "--weights",
        required=True,
        help="Ruta al .pt/.pth con los pesos del modelo",
    )
    parser.add_argument(
        "--output",
        required=True,
        help="Ruta de salida del archivo .onnx",
    )
    parser.add_argument(
        "--channels",
        type=int,
        default=64,
        help="Número de canales del modelo (debe coincidir con el entrenamiento)",
    )
    parser.add_argument(
        "--num-res-blocks",
        type=int,
        default=6,
        help="Número de bloques residuales (debe coincidir con el entrenamiento)",
    )

    args = parser.parse_args()

    weights_path = Path(args.weights)
    output_path = Path(args.output)

    if not weights_path.exists():
        raise FileNotFoundError(f"No existe el fichero de pesos: {weights_path}")

    output_path.parent.mkdir(parents=True, exist_ok=True)

    model = PolicyValueNet.load(
        str(weights_path),
        channels=args.channels,
        num_res_blocks=args.num_res_blocks,
    )

    model.export_onnx(str(output_path))
    print("Exportación completada correctamente.")


if __name__ == "__main__":
    main()
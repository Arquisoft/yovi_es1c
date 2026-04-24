from pathlib import Path

import onnx

from model import GRID_SIZE, PolicyValueNet


def tensor_shape(tensor):
    return [
        dim.dim_value if dim.dim_value else dim.dim_param
        for dim in tensor.type.tensor_type.shape.dim
    ]


def test_export_onnx_uses_stable_io_contract():
    model = PolicyValueNet(channels=8, num_res_blocks=1)
    output_dir = Path("training/tmp/test-artifacts")
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / "model.onnx"

    model.export_onnx(str(output_path))

    onnx_model = onnx.load(output_path)
    inputs = [tensor.name for tensor in onnx_model.graph.input]
    input_shapes = {tensor.name: tensor_shape(tensor) for tensor in onnx_model.graph.input}
    outputs = [tensor.name for tensor in onnx_model.graph.output]

    assert inputs == ["spatial", "board_norm"]
    assert outputs == ["policy", "value"]
    assert input_shapes["spatial"] == ["batch_size", 6, GRID_SIZE, GRID_SIZE]
    assert input_shapes["board_norm"] == ["batch_size", 1, GRID_SIZE, GRID_SIZE]
    assert "Expand" not in {node.op_type for node in onnx_model.graph.node}

    output_path.unlink(missing_ok=True)

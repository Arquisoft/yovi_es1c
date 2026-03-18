use std::sync::Arc;
use tract_onnx::prelude::*;
use crate::{GameY, Coordinates, PlayerId};

type OnnxModel = SimplePlan<TypedFact, Box<dyn TypedOp>, Graph<TypedFact, Box<dyn TypedOp>>>;


pub struct NeuralNet {
    model: OnnxModel,
    max_cells: usize,
}

impl NeuralNet {
    /// Carga el modelo ONNX desde disco.
    pub fn load(path: &str) -> anyhow::Result<Arc<Self>> {
        let model = tract_onnx::onnx()
            .model_for_path(path)?
            .into_optimized()?
            .into_runnable()?;

        Ok(Arc::new(Self {
            model,
            max_cells: 91,
        }))
    }

    /// Evalúa una posición del tablero.
    /// Devuelve (policy, value):
    ///   - policy: Vec<f32> de longitud total_cells(board_size) con probabilidades por movimiento
    ///   - value:  f32 en [-1.0, +1.0] (positivo = bueno para el jugador actual)
    pub fn evaluate(&self, board: &GameY) -> anyhow::Result<(Vec<f32>, f32)> {
        let input = self.encode_board(board);
        let input_len = input.len();

        let array = tract_ndarray::Array2::<f32>::from_shape_vec(
            (1, input_len),
            input,
        )?;

        let tensor: Tensor = array.into();
        let result = self.model.run(tvec![tensor.into()])?;

        // Policy: primer output, shape (1, MAX_CELLS)
        let policy_raw = result[0].to_array_view::<f32>()?;
        let n = board.total_cells() as usize;
        let policy: Vec<f32> = policy_raw.iter().take(n).copied().collect();

        // log_softmax → exp para obtener probabilidades
        let policy: Vec<f32> = policy.iter().map(|&x| x.exp()).collect();
        let sum: f32 = policy.iter().sum();
        let policy: Vec<f32> = if sum > 0.0 {
            policy.iter().map(|&x| x / sum).collect()
        } else {
            vec![1.0 / n as f32; n]
        };

        // Value: segundo output, shape (1, 1)
        let value = result[1]
            .to_array_view::<f32>()?
            .iter()
            .next()
            .copied()
            .unwrap_or(0.0);

        Ok((policy, value))
    }


    fn encode_board(&self, board: &GameY) -> Vec<f32> {
        let board_size = board.board_size() as usize;
        let n          = board.total_cells() as usize;
        let max_n      = self.max_cells;
        let current    = board.next_player().unwrap_or(PlayerId::new(0));
        let opponent   = if current.id() == 0 { PlayerId::new(1) } else { PlayerId::new(0) };

        let mut input = vec![0.0f32; 3 * max_n + 1];

        for idx in 0..n as u32 {
            let i = idx as usize;
            if i >= max_n {
                break;
            }
            let coords = Coordinates::from_index(idx, board.board_size());
            let cell   = board.cell_at(&coords);


            match cell {
                Some(p) if p == current  => input[i]           = 1.0,
                Some(p) if p == opponent => input[max_n + i]   = 1.0,
                _                        => input[2 * max_n + i] = 1.0,
            }
        }
        input[3 * max_n] = board_size as f32 / 13.0;
        input
    }
}

// ─────────────────────────────────────────────
//  Tests
// ─────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encode_board_length() {
        let board = GameY::new(5);
        let max_n: usize = 91;
        let expected_len = 3 * max_n + 1;

        // Creamos una red vacía solo para probar encode_board.
        let net = NeuralNet::load("models/yovi_model.onnx").expect("Modelo no encontrado");
        let encoded = net.encode_board(&board);
        assert_eq!(encoded.len(), expected_len);
    }

    #[test]
    fn test_evaluate_policy_length_matches_board() {
        let net = NeuralNet::load("models/yovi_model.onnx")
            .expect("Modelo no encontrado");
        let board = GameY::new(5);
        let (policy, value) = net.evaluate(&board).expect("evaluate falló");

        assert_eq!(policy.len(), board.total_cells() as usize);
        assert!((-1.0..=1.0).contains(&value), "value fuera de rango: {}", value);
    }

    #[test]
    fn test_evaluate_policy_sums_to_one() {
        let net = NeuralNet::load("models/yovi_model.onnx")
            .expect("Modelo no encontrado");
        let board = GameY::new(5);
        let (policy, _) = net.evaluate(&board).expect("evaluate falló");

        let sum: f32 = policy.iter().sum();
        assert!((sum - 1.0).abs() < 1e-4, "La policy no suma 1.0: {}", sum);
    }

    #[test]
    fn test_evaluate_does_not_panic_on_large_board() {
        let net = NeuralNet::load("models/yovi_model.onnx")
            .expect("Modelo no encontrado");
        let board = GameY::new(14);
        let result = net.evaluate(&board);
        assert!(result.is_ok(), "evaluate no debe fallar en tablero grande");
    }
}


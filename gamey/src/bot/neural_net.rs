use std::sync::Arc;
use tract_onnx::prelude::*;
use crate::{Coordinates, GameY, PlayerId};

type OnnxModel = SimplePlan<TypedFact, Box<dyn TypedOp>, Graph<TypedFact, Box<dyn TypedOp>>>;

pub struct NeuralNet {
    model: OnnxModel,
    max_cells: usize,
    grid_size: usize,
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
            // yovi_model.onnx actual: policy (batch, 528) => triángulo de lado 32.
            max_cells: 528,
            grid_size: 32,
        }))
    }

    /// Evalúa una posición del tablero.
    /// Devuelve (policy, value):
    ///   - policy: Vec<f32> de longitud total_cells(board_size) con probabilidades por movimiento
    ///   - value:  f32 en [-1.0, +1.0] (positivo = bueno para el jugador actual)
    pub fn evaluate(&self, board: &GameY) -> anyhow::Result<(Vec<f32>, f32)> {
        let (spatial_input, board_norm) = self.encode_board(board);

        let spatial = tract_ndarray::Array4::<f32>::from_shape_vec(
            (1, 6, self.grid_size, self.grid_size),
            spatial_input,
        )?;
        let board_norm = tract_ndarray::Array2::<f32>::from_shape_vec((1, 1), vec![board_norm])?;

        let result = self
            .model
            .run(tvec![spatial.into_tensor().into(), board_norm.into_tensor().into()])?;

        let policy_raw = result[0].to_array_view::<f32>()?;
        let policy_capacity = policy_raw.shape().get(1).copied().unwrap_or(self.max_cells);
        let n = board.total_cells() as usize;

        let available = board.available_cells();

        // Aplicamos el Softmax SOLO a las celdas legales
        let mut policy: Vec<f32> = vec![0.0; n];

        for &idx in available {
            let i = idx as usize;
            if i < policy_capacity {
                policy[i] = policy_raw[[0, i]].exp();
            }
        }

        let sum: f32 = policy.iter().sum();
        if sum > 0.0 {
            for p in &mut policy {
                *p /= sum;
            }
        } else if !available.is_empty() {
            // Fallback seguro por si la red colapsa
            let prob = 1.0 / available.len() as f32;
            for &idx in available {
                policy[idx as usize] = prob;
            }
        }

        let value = result[1]
            .to_array_view::<f32>()?
            .iter()
            .next()
            .copied()
            .unwrap_or(0.0)
            .clamp(-1.0, 1.0);

        Ok((policy, value))
    }

    fn encode_board(&self, board: &GameY) -> (Vec<f32>, f32) {
        let board_size = board.board_size() as usize;
        let n = board.total_cells() as usize;
        let current = board.next_player().unwrap_or(PlayerId::new(0));
        let opponent = if current.id() == 0 { PlayerId::new(1) } else { PlayerId::new(0) };

        let mut spatial = vec![0.0f32; 6 * self.grid_size * self.grid_size];
        let per_channel = self.grid_size * self.grid_size;

        for idx in 0..n as u32 {
            let i = idx as usize;
            if i >= self.max_cells {
                break;
            }

            let row = (((8 * idx + 1) as f64).sqrt() as u32 - 1) / 2;
            let col = idx - (row * (row + 1)) / 2;
            if row as usize >= self.grid_size || col as usize >= self.grid_size {
                continue;
            }

            let spatial_index = row as usize * self.grid_size + col as usize;
            let coords = Coordinates::from_index(idx, board.board_size());
            let cell = board.cell_at(&coords);

            match cell {
                Some(p) if p == current => spatial[spatial_index] = 1.0,
                Some(p) if p == opponent => spatial[per_channel + spatial_index] = 1.0,
                _ => spatial[2 * per_channel + spatial_index] = 1.0,
            }

            let x = (board_size as u32 - 1 - row) as f32;
            let y = col as f32;
            let z = (row - col) as f32;
            let divisor = if board_size > 1 { (board_size - 1) as f32 } else { 1.0 };

            spatial[3 * per_channel + spatial_index] = x / divisor;
            spatial[4 * per_channel + spatial_index] = y / divisor;
            spatial[5 * per_channel + spatial_index] = z / divisor;
        }

        let board_norm = board_size as f32 / 13.0;
        (spatial, board_norm)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encode_board_length() {
        let board = GameY::new(5);
        let net = NeuralNet::load("models/yovi_model.onnx").expect("Modelo no encontrado");
        let (spatial, board_norm) = net.encode_board(&board);

        assert_eq!(spatial.len(), 6 * 32 * 32);
        assert!(board_norm > 0.0);
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

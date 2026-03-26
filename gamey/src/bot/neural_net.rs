// gamey/src/bot/neural_net.rs
use std::sync::Arc;
use tract_onnx::prelude::*;
use crate::{Coordinates, GameY, PlayerId};

type OnnxModel = SimplePlan<TypedFact, Box<dyn TypedOp>, Graph<TypedFact, Box<dyn TypedOp>>>;

/// Debe coincidir con GRID_SIZE en Python (model.py)
const GRID_SIZE: usize = 32;
const NUM_CHANNELS: usize = 6;
/// Máximo de celdas del triángulo de lado GRID_SIZE
const MAX_CELLS: usize = GRID_SIZE * (GRID_SIZE + 1) / 2; // 528

pub struct NeuralNet {
    model: OnnxModel,
}

impl NeuralNet {
    pub fn load(path: &str) -> anyhow::Result<Arc<Self>> {
        let model = tract_onnx::onnx()
            .model_for_path(path)?
            .into_optimized()?
            .into_runnable()?;
        Ok(Arc::new(Self { model }))
    }

    /// Evalúa una posición.
    /// Devuelve (policy, value):
    ///   policy — Vec<f32> de longitud total_cells(board_size), probabilidades por movimiento
    ///   value  — f32 ∈ [-1, +1], positivo = bueno para el jugador actual
    pub fn evaluate(&self, board: &GameY) -> anyhow::Result<(Vec<f32>, f32)> {
        let (spatial_data, board_norm_val) = self.encode_board(board);

        // spatial: (1, 6, 32, 32)
        let spatial = tract_ndarray::Array4::<f32>::from_shape_vec(
            (1, NUM_CHANNELS, GRID_SIZE, GRID_SIZE),
            spatial_data,
        )?;

        // board_norm: (1, 1)
        let board_norm = tract_ndarray::Array2::<f32>::from_shape_vec(
            (1, 1),
            vec![board_norm_val],
        )?;

        let result = self.model.run(tvec![
            spatial.into_tensor().into(),
            board_norm.into_tensor().into(),
        ])?;

        // policy: (1, MAX_CELLS) — log_softmax → exponenciar
        let policy_raw = result[0].to_array_view::<f32>()?;
        let n          = board.total_cells() as usize;
        let available  = board.available_cells();

        let mut policy = vec![0.0f32; n];
        for &idx in available {
            let i = idx as usize;
            if i < MAX_CELLS {
                policy[i] = policy_raw[[0, i]].exp();
            }
        }

        let sum: f32 = policy.iter().sum();
        if sum > 0.0 {
            for p in &mut policy { *p /= sum; }
        } else if !available.is_empty() {
            let prob = 1.0 / available.len() as f32;
            for &idx in available { policy[idx as usize] = prob; }
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

    /// Construye (spatial, board_norm) igual que encode_board() en Python.
    /// spatial: Vec de longitud 6 * 32 * 32 con layout [canal][fila][col].
    /// board_norm: board_size / GRID_SIZE.
    fn encode_board(&self, board: &GameY) -> (Vec<f32>, f32) {
        let board_size = board.board_size() as usize;
        let n          = board.total_cells() as usize;
        let current    = board.next_player().unwrap_or(PlayerId::new(0));
        let opponent   = if current.id() == 0 { PlayerId::new(1) } else { PlayerId::new(0) };

        let per_channel = GRID_SIZE * GRID_SIZE;
        let mut spatial = vec![0.0f32; NUM_CHANNELS * per_channel];

        let divisor = if board_size > 1 { (board_size - 1) as f32 } else { 1.0 };

        for idx in 0..n as u32 {
            // Reconstruir (row, col) desde índice triangular
            let row = (((8 * idx + 1) as f64).sqrt() as u32 - 1) / 2;
            let col = idx - row * (row + 1) / 2;

            if row as usize >= GRID_SIZE || col as usize >= GRID_SIZE {
                continue;
            }

            let cell_pos = row as usize * GRID_SIZE + col as usize;
            let coords   = Coordinates::from_index(idx, board.board_size());
            let cell     = board.cell_at(&coords);

            match cell {
                Some(p) if p == current  => spatial[0 * per_channel + cell_pos] = 1.0,
                Some(p) if p == opponent => spatial[1 * per_channel + cell_pos] = 1.0,
                _                        => spatial[2 * per_channel + cell_pos] = 1.0,
            }

            let x = (board_size as u32 - 1 - row) as f32 / divisor;
            let y = col as f32 / divisor;
            let z = (row - col) as f32 / divisor;

            spatial[3 * per_channel + cell_pos] = x;
            spatial[4 * per_channel + cell_pos] = y;
            spatial[5 * per_channel + cell_pos] = z;
        }

        let board_norm = board_size as f32 / GRID_SIZE as f32;
        (spatial, board_norm)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Tests de encoding (sin necesitar el modelo .onnx) ────────────

    #[test]
    fn test_encode_board_spatial_length() {
        // No necesita cargar el modelo
        let board = GameY::new(5);
        let dummy_net = make_dummy_net();
        let (spatial, _) = dummy_net.encode_board(&board);
        assert_eq!(spatial.len(), NUM_CHANNELS * GRID_SIZE * GRID_SIZE);
    }

    #[test]
    fn test_encode_board_norm_correct() {
        let board = GameY::new(5);
        let dummy_net = make_dummy_net();
        let (_, board_norm) = dummy_net.encode_board(&board);
        let expected = 5.0 / GRID_SIZE as f32;
        assert!((board_norm - expected).abs() < 1e-6,
                "board_norm esperado {expected}, obtenido {board_norm}");
    }

    #[test]
    fn test_encode_board_empty_fills_channel2() {
        let board = GameY::new(5);
        let dummy_net = make_dummy_net();
        let (spatial, _) = dummy_net.encode_board(&board);
        let n = board.total_cells() as usize;
        let per_channel = GRID_SIZE * GRID_SIZE;
        // En tablero vacío, canal 0 (mío) y canal 1 (rival) deben ser 0
        for row in 0..5usize {
            for col in 0..=row {
                let pos = row * GRID_SIZE + col;
                assert_eq!(spatial[0 * per_channel + pos], 0.0, "canal mío debe ser 0");
                assert_eq!(spatial[1 * per_channel + pos], 0.0, "canal rival debe ser 0");
                assert_eq!(spatial[2 * per_channel + pos], 1.0, "canal vacío debe ser 1");
            }
        }
        // Celdas fuera del triángulo deben ser 0 en todos los canales de ocupación
        assert_eq!(spatial[0 * per_channel + 0 * GRID_SIZE + 1], 0.0,
                   "celda fuera del triángulo debe ser 0");
    }

    #[test]
    fn test_encode_board_grid_size_32_board_32() {
        let board = GameY::new(32);
        let dummy_net = make_dummy_net();
        let (spatial, board_norm) = dummy_net.encode_board(&board);
        assert_eq!(spatial.len(), NUM_CHANNELS * GRID_SIZE * GRID_SIZE);
        assert!((board_norm - 1.0).abs() < 1e-6);
    }

    // ── Tests con modelo ONNX real ────────────────────────────────────

    #[test]
    fn test_evaluate_policy_length_matches_board() {
        let net = NeuralNet::load("models/yovi_model.onnx").expect("Modelo no encontrado");
        let board = GameY::new(5);
        let (policy, value) = net.evaluate(&board).expect("evaluate falló");
        assert_eq!(policy.len(), board.total_cells() as usize);
        assert!((-1.0..=1.0).contains(&value), "value fuera de rango: {value}");
    }

    #[test]
    fn test_evaluate_policy_sums_to_one() {
        let net = NeuralNet::load("models/yovi_model.onnx").expect("Modelo no encontrado");
        let board = GameY::new(5);
        let (policy, _) = net.evaluate(&board).expect("evaluate falló");
        let sum: f32 = policy.iter().sum();
        assert!((sum - 1.0).abs() < 1e-4, "La policy no suma 1.0: {sum}");
    }

    #[test]
    fn test_evaluate_large_board() {
        let net = NeuralNet::load("models/yovi_model.onnx").expect("Modelo no encontrado");
        let board = GameY::new(32);
        let result = net.evaluate(&board);
        assert!(result.is_ok(), "evaluate no debe fallar en tablero de lado 32");
    }

    // ── Helper ────────────────────────────────────────────────────────

    /// Crea un NeuralNet sin modelo real para poder testear encode_board
    /// sin necesitar el fichero .onnx.
    fn make_dummy_net() -> Arc<NeuralNet> {
        // Usamos unsafe solo para construir la struct sin modelo.
        // En tests de encoding esto es suficiente; no llamamos a evaluate().
        NeuralNet::load("models/yovi_model.onnx")
            .expect("Para tests de encoding necesitas el modelo. Si no tienes .onnx, usa los tests de encoding directos.")
    }
}

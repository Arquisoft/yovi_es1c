use std::sync::Arc;
use std::sync::Mutex;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::num::NonZeroUsize;
use lru::LruCache;
use tract_onnx::prelude::*;
use crate::{Coordinates, GameY, PlayerId};

type OnnxModel = SimplePlan<TypedFact, Box<dyn TypedOp>, Graph<TypedFact, Box<dyn TypedOp>>>;
const GRID_SIZE: usize = 32;
const NUM_CHANNELS: usize = 6;
/// Máximo de celdas del triángulo de lado GRID_SIZE
const MAX_CELLS: usize = GRID_SIZE * (GRID_SIZE + 1) / 2; // 528

pub struct NeuralNet {
    model: OnnxModel,
    cache: Mutex<LruCache<u64, (Vec<f32>, f32)>>,
}

impl NeuralNet {
    pub fn load(path: &str) -> anyhow::Result<Arc<Self>> {
        let model = onnx()
            .model_for_path(path)?
            .into_optimized()?
            .into_runnable()?;
        Ok(Arc::new(Self {
            model,
            cache: Mutex::new(LruCache::new(NonZeroUsize::new(4096).unwrap())),
        }))
    }

    /// Evalúa una posición con caché integrada.
    pub fn evaluate(&self, board: &GameY) -> anyhow::Result<(Vec<f32>, f32)> {
        let key = Self::board_hash(board);

        // Intentar caché primero
        {
            let mut cache = self.cache.lock().map_err(|e| anyhow::anyhow!("Mutex error: {}", e))?;
            if let Some(cached) = cache.get(&key) {
                return Ok(cached.clone());
            }
        }

        let result = self.evaluate_uncached(board)?;

        // Guardar en caché
        self.cache.lock().map_err(|e| anyhow::anyhow!("Mutex error: {}", e))?.put(key, result.clone());

        Ok(result)
    }

    /// Función auxiliar para calcular probabilidades uniformes si falla la evaluación.
    pub fn fallback_evaluation(board: &GameY) -> (Vec<f32>, f32) {
        let n = board.available_cells().len().max(1);
        (vec![1.0 / n as f32; board.total_cells() as usize], 0.0)
    }

    /// Evalúa un batch de posiciones, aprovechando la caché por cada una.
    pub fn evaluate_batch(&self, boards: &[&GameY]) -> Vec<(Vec<f32>, f32)> {
        self.evaluate_batch_result(boards).unwrap_or_else(|_| {
            boards
                .iter()
                .map(|board| self.evaluate(board).unwrap_or_else(|_| Self::fallback_evaluation(board)))
                .collect()
        })
    }

    pub fn clear_cache(&self) -> anyhow::Result<()> {
        self.cache
            .lock()
            .map_err(|e| anyhow::anyhow!("Mutex error: {}", e))?
            .clear();
        Ok(())
    }

    /// Hash del estado del tablero para usar como clave de caché.
    pub fn board_hash(board: &GameY) -> u64 {
        let mut h = DefaultHasher::new();
        board.board_size().hash(&mut h);
        board.next_player().hash(&mut h);
        board.rules().hash(&mut h);
        board.available_cells().hash(&mut h);
        for idx in 0..board.total_cells() {
            let coords = Coordinates::from_index(idx, board.board_size());
            board.cell_at(&coords).hash(&mut h);
        }
        h.finish()
    }

    /// Evaluación real sin caché (uso interno).
    fn evaluate_uncached(&self, board: &GameY) -> anyhow::Result<(Vec<f32>, f32)> {
        let (spatial_data, board_norm_val) = self.encode_board(board);

        // spatial: (1, 6, 32, 32)
        let spatial = tract_ndarray::Array4::<f32>::from_shape_vec(
            (1, NUM_CHANNELS, GRID_SIZE, GRID_SIZE),
            spatial_data,
        )?;

        // board_norm: (1, 1, 32, 32). Exportamos ONNX con el canal ya expandido
        // porque tract no infiere de forma estable el Expand dinamico de PyTorch.
        let board_norm = tract_ndarray::Array4::<f32>::from_shape_vec(
            (1, 1, GRID_SIZE, GRID_SIZE),
            vec![board_norm_val; GRID_SIZE * GRID_SIZE],
        )?;

        let result = self.model.run(tvec![
            spatial.into_tensor().into(),
            board_norm.into_tensor().into(),
        ])?;

        let policy_raw = result[0].to_array_view::<f32>()?;
        let value_raw = result[1].to_array_view::<f32>()?;
        Ok(Self::decode_policy_value(
            board,
            |cell_idx| policy_raw[[0, cell_idx]],
            value_raw.iter().next().copied().unwrap_or(0.0),
        ))
    }

    fn evaluate_batch_result(&self, boards: &[&GameY]) -> anyhow::Result<Vec<(Vec<f32>, f32)>> {
        if boards.is_empty() {
            return Ok(Vec::new());
        }

        let mut results = vec![None; boards.len()];
        let mut misses = Vec::new();

        {
            let mut cache = self.cache.lock().map_err(|e| anyhow::anyhow!("Mutex error: {}", e))?;
            for (idx, board) in boards.iter().enumerate() {
                let key = Self::board_hash(board);
                if let Some(cached) = cache.get(&key) {
                    results[idx] = Some(cached.clone());
                } else {
                    misses.push((idx, *board, key));
                }
            }
        }

        if !misses.is_empty() {
            let mut spatial_data = Vec::with_capacity(misses.len() * NUM_CHANNELS * GRID_SIZE * GRID_SIZE);
            let mut board_norms = Vec::with_capacity(misses.len() * GRID_SIZE * GRID_SIZE);

            for (_, board, _) in &misses {
                let (spatial, board_norm) = self.encode_board(board);
                spatial_data.extend(spatial);
                board_norms.extend(std::iter::repeat_n(board_norm, GRID_SIZE * GRID_SIZE));
            }

            let spatial = tract_ndarray::Array4::<f32>::from_shape_vec(
                (misses.len(), NUM_CHANNELS, GRID_SIZE, GRID_SIZE),
                spatial_data,
            )?;
            let board_norm = tract_ndarray::Array4::<f32>::from_shape_vec(
                (misses.len(), 1, GRID_SIZE, GRID_SIZE),
                board_norms,
            )?;

            let model_outputs = self.model.run(tvec![
                spatial.into_tensor().into(),
                board_norm.into_tensor().into(),
            ])?;
            let policy_raw = model_outputs[0].to_array_view::<f32>()?;
            let value_raw = model_outputs[1].to_array_view::<f32>()?;

            let mut cache = self.cache.lock().map_err(|e| anyhow::anyhow!("Mutex error: {}", e))?;
            for (batch_idx, (result_idx, board, key)) in misses.into_iter().enumerate() {
                let decoded = Self::decode_policy_value(
                    board,
                    |cell_idx| policy_raw[[batch_idx, cell_idx]],
                    value_raw[[batch_idx, 0]],
                );
                cache.put(key, decoded.clone());
                results[result_idx] = Some(decoded);
            }
        }

        Ok(results
            .into_iter()
            .map(|entry| entry.expect("batch evaluation must fill all result slots"))
            .collect())
    }

    fn decode_policy_value<F>(board: &GameY, logit_at: F, value: f32) -> (Vec<f32>, f32)
    where
        F: Fn(usize) -> f32,
    {
        let total_cells = board.total_cells() as usize;
        let available = board.available_cells();
        let mut policy = vec![0.0f32; total_cells];

        for &idx in available {
            let cell_idx = idx as usize;
            if cell_idx < MAX_CELLS {
                policy[cell_idx] = logit_at(cell_idx).exp();
            }
        }

        let sum: f32 = policy.iter().sum();
        if sum > 0.0 {
            for probability in &mut policy {
                *probability /= sum;
            }
        } else if !available.is_empty() {
            let uniform = 1.0 / available.len() as f32;
            for &idx in available {
                policy[idx as usize] = uniform;
            }
        }

        (policy, value.clamp(-1.0, 1.0))
    }

    /// Construye (spatial, board_norm) igual que encode_board() en Python.
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
    use crate::{GameRules, HoneyRule, Movement, PieRule};
    use serde::Deserialize;
    use std::collections::HashMap;

    #[derive(Debug, Deserialize)]
    struct EncoderFixtureCase {
        name: String,
        board_state: Vec<u32>,
        board_size: u32,
        current_player: u32,
        board_norm: f32,
        non_zero: Vec<NonZeroEntry>,
    }

    #[derive(Debug, Deserialize)]
    struct NonZeroEntry {
        channel: usize,
        row: usize,
        col: usize,
        value: f32,
    }

    // ── Tests de encoding (sin necesitar el modelo .onnx) ────────────

    #[test]
    fn test_encode_board_spatial_length() {
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
        let per_channel = GRID_SIZE * GRID_SIZE;
        for row in 0..5usize {
            for col in 0..=row {
                let pos = row * GRID_SIZE + col;
                assert_eq!(spatial[0 * per_channel + pos], 0.0, "canal mío debe ser 0");
                assert_eq!(spatial[1 * per_channel + pos], 0.0, "canal rival debe ser 0");
                assert_eq!(spatial[2 * per_channel + pos], 1.0, "canal vacío debe ser 1");
            }
        }
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
    fn test_encode_board_matches_shared_python_contract_fixture() {
        let fixture = include_str!("../../../training/fixtures/encoder_contract_cases.json");
        let cases: Vec<EncoderFixtureCase> = serde_json::from_str(fixture).expect("valid encoder fixture");
        let dummy_net = make_dummy_net();

        for case in cases {
            assert_fixture_case_matches(&dummy_net, &case);
        }
    }

    #[test]
    fn test_board_hash_distinguishes_different_piece_ownership() {
        let board_a = board_from_cells(
            3,
            &[(0, PlayerId::new(0)), (1, PlayerId::new(1))],
            GameRules::classic(),
        );
        let board_b = board_from_cells(
            3,
            &[(0, PlayerId::new(1)), (1, PlayerId::new(0))],
            GameRules::classic(),
        );

        assert_eq!(board_a.available_cells(), board_b.available_cells());
        assert_ne!(NeuralNet::board_hash(&board_a), NeuralNet::board_hash(&board_b));
    }

    #[test]
    fn test_board_hash_distinguishes_rules_when_layout_is_same() {
        let classic = GameY::with_rules(5, GameRules::classic()).unwrap();
        let pie = GameY::with_rules(
            5,
            GameRules {
                pie_rule: PieRule { enabled: true },
                honey: HoneyRule::default(),
            },
        )
            .unwrap();

        assert_eq!(classic.available_cells(), pie.available_cells());
        assert_ne!(NeuralNet::board_hash(&classic), NeuralNet::board_hash(&pie));
    }

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

    #[test]
    fn test_cache_hit_returns_same_result() {
        let net = NeuralNet::load("models/yovi_model.onnx").expect("Modelo no encontrado");
        let board = GameY::new(5);
        let (p1, v1) = net.evaluate(&board).expect("Primera llamada falló");
        let (p2, v2) = net.evaluate(&board).expect("Segunda llamada (caché) falló");
        assert_eq!(p1, p2, "La policy cacheada debe ser idéntica");
        assert_eq!(v1, v2, "El value cacheado debe ser idéntico");
    }

    // ── Helper ────────────────────────────────────────────────────────

    #[test]
    fn test_clear_cache_removes_cached_entries() {
        let net = NeuralNet::load("models/yovi_model.onnx").expect("Modelo no encontrado");
        let board = GameY::new(5);
        let _ = net.evaluate(&board).expect("La evaluacion inicial debe poblar la cache");
        assert!(net.cache.lock().unwrap().len() > 0, "La cache debe contener entradas tras evaluar");

        net.clear_cache().expect("clear_cache debe vaciar la cache");

        assert_eq!(net.cache.lock().unwrap().len(), 0, "La cache debe quedar vacia");
    }

    #[test]
    fn test_evaluate_batch_matches_individual_evaluations() {
        let net = NeuralNet::load("models/yovi_model.onnx").expect("Modelo no encontrado");
        let mut board_a = GameY::new(5);
        board_a
            .add_move(Movement::Placement {
                player: PlayerId::new(0),
                coords: Coordinates::from_index(0, 5),
            })
            .unwrap();

        let mut board_b = GameY::new(7);
        for idx in [0_u32, 1, 3, 4] {
            let coords = Coordinates::from_index(idx, 7);
            let player = board_b.next_player().unwrap();
            board_b
                .add_move(Movement::Placement { player, coords })
                .unwrap();
        }

        let individual = vec![
            net.evaluate(&board_a).expect("evaluate board_a"),
            net.evaluate(&board_b).expect("evaluate board_b"),
        ];
        let batched = net.evaluate_batch(&[&board_a, &board_b]);

        assert_eq!(batched.len(), individual.len());
        for (batch_result, single_result) in batched.iter().zip(individual.iter()) {
            assert_eq!(batch_result.0.len(), single_result.0.len());
            for (batch_probability, single_probability) in batch_result.0.iter().zip(single_result.0.iter()) {
                assert!(
                    (batch_probability - single_probability).abs() < 1e-6,
                    "batch policy drifted: {} vs {}",
                    batch_probability,
                    single_probability
                );
            }
            assert!(
                (batch_result.1 - single_result.1).abs() < 1e-6,
                "batch value drifted: {} vs {}",
                batch_result.1,
                single_result.1
            );
        }
    }

    fn board_from_fixture(case: &EncoderFixtureCase) -> GameY {
        let occupied: Vec<(u32, PlayerId)> = case
            .board_state
            .iter()
            .enumerate()
            .filter_map(|(idx, cell)| match cell {
                1 => Some((idx as u32, PlayerId::new(0))),
                2 => Some((idx as u32, PlayerId::new(1))),
                _ => None,
            })
            .collect();
        board_from_cells(case.board_size, &occupied, GameRules::classic())
    }

    fn board_from_cells(board_size: u32, cells: &[(u32, PlayerId)], rules: GameRules) -> GameY {
        let mut board = GameY::with_rules(board_size, rules).unwrap();
        for (idx, player) in cells {
            let coords = Coordinates::from_index(*idx, board_size);
            board
                .add_move(Movement::Placement {
                    player: *player,
                    coords,
                })
                .unwrap();
        }
        board
    }

    fn make_dummy_net() -> Arc<NeuralNet> {
        NeuralNet::load("models/yovi_model.onnx")
            .expect("Para tests de encoding necesitas el modelo. Si no tienes .onnx, usa los tests de encoding directos.")
    }

    fn assert_fixture_case_matches(dummy_net: &Arc<NeuralNet>, case: &EncoderFixtureCase) {
        let board = board_from_fixture(case);
        assert_eq!(
            board.next_player().map(|player| player.id()),
            Some(case.current_player),
            "fixture current player drifted for {}",
            case.name
        );

        let (spatial, board_norm) = dummy_net.encode_board(&board);
        assert!(
            (board_norm - case.board_norm).abs() < 1e-6,
            "board_norm mismatch for {}",
            case.name
        );

        let expected = expected_non_zero_entries(case);
        let observed = observed_non_zero_entries(case, &spatial);
        assert_non_zero_entries_match(case, expected, observed);
    }

    fn expected_non_zero_entries(case: &EncoderFixtureCase) -> HashMap<(usize, usize, usize), f32> {
        case
            .non_zero
            .iter()
            .map(|entry| ((entry.channel, entry.row, entry.col), entry.value))
            .collect()
    }

    fn observed_non_zero_entries(
        case: &EncoderFixtureCase,
        spatial: &[f32],
    ) -> HashMap<(usize, usize, usize), f32> {
        let per_channel = GRID_SIZE * GRID_SIZE;
        let mut observed = HashMap::new();

        for channel in 0..NUM_CHANNELS {
            for row in 0..case.board_size as usize {
                for col in 0..=row {
                    let pos = row * GRID_SIZE + col;
                    let value = spatial[channel * per_channel + pos];
                    if value.abs() > 1e-9 {
                        observed.insert((channel, row, col), value);
                    }
                }
            }
        }

        observed
    }

    fn assert_non_zero_entries_match(
        case: &EncoderFixtureCase,
        expected: HashMap<(usize, usize, usize), f32>,
        observed: HashMap<(usize, usize, usize), f32>,
    ) {
        assert_eq!(observed.len(), expected.len(), "non-zero entry count mismatch for {}", case.name);
        for (key, expected_value) in expected {
            let actual = observed.get(&key).copied().unwrap_or_default();
            assert!(
                (actual - expected_value).abs() < 1e-6,
                "fixture mismatch for {} at {:?}: expected {}, got {}",
                case.name,
                key,
                expected_value,
                actual
            );
        }
    }
}

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct PieRule {
    #[serde(default)]
    pub enabled: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct BlockedCell {
    pub row: u32,
    pub col: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct HoneyRule {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default, rename = "blockedCells")]
    pub blocked_cells: Vec<BlockedCell>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct GameRules {
    #[serde(default, rename = "pieRule")]
    pub pie_rule: PieRule,
    #[serde(default)]
    pub honey: HoneyRule,
}

impl GameRules {
    pub fn classic() -> Self {
        Self::default()
    }
}
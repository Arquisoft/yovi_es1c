use std::collections::HashMap;

/// Resolves frontend bot aliases (easy, medium, hard)
/// to real engine bot IDs.
#[derive(Clone)]
pub struct BotAliasResolver {
    map: HashMap<String, String>,
}

impl BotAliasResolver {
    pub fn new(map: HashMap<String, String>) -> Self {
        Self { map }
    }

    /// Returns the real bot id if an alias exists.
    /// Otherwise returns the original id.
    pub fn resolve<'a>(&'a self, bot_id: &'a str) -> &'a str {
        self.map.get(bot_id).map(|s| s.as_str()).unwrap_or(bot_id)
    }
}
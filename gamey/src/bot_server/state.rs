use crate::YBotRegistry;
use std::sync::Arc;
use crate::bot_server::bot_alias_resolver::BotAliasResolver;

/// Shared application state for the bot server.
///
/// This struct holds the bot registry and is shared across all request handlers
/// via Axum's state extraction. It uses `Arc` internally to allow cheap cloning
/// for concurrent request handling.
#[derive(Clone)]
pub struct AppState {
    /// The registry of available bots, wrapped in Arc for thread-safe sharing.
    bots: Arc<YBotRegistry>,

    alias_resolver: BotAliasResolver,
}

impl AppState {
    /// Creates a new application state with the given bot registry and alias resolver.
    pub fn new(bots: YBotRegistry, alias_resolver: BotAliasResolver) -> Self {
        Self {
            bots: Arc::new(bots),
            alias_resolver,
        }
    }

    /// Returns a clone of the Arc-wrapped bot registry.
    pub fn bots(&self) -> Arc<YBotRegistry> {
        Arc::clone(&self.bots)
    }

    /// Resolves a bot id from frontend alias → real engine id.
    pub fn resolve_bot_id<'a>(&'a self, bot_id: &'a str) -> &'a str {
        self.alias_resolver.resolve(bot_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::RandomBot;
    use std::collections::HashMap;
    use std::sync::Arc;

    fn make_registry() -> YBotRegistry {
        YBotRegistry::new().with_bot(Arc::new(RandomBot))
    }

    fn make_alias_resolver() -> BotAliasResolver {
        let mut map = HashMap::new();
        map.insert("easy".to_string(), "random".to_string());
        map.insert("medium".to_string(), "minimax_set_based_d2".to_string());
        BotAliasResolver::new(map)
    }

    fn make_state() -> AppState {
        AppState::new(make_registry(), make_alias_resolver())
    }

    #[test]
    fn test_new_state() {
        let registry = YBotRegistry::new();
        let resolver = BotAliasResolver::new(HashMap::new());
        let state = AppState::new(registry, resolver);
        assert!(state.bots().names().is_empty());
    }

    #[test]
    fn test_state_with_bot() {
        let registry = make_registry();
        let resolver = make_alias_resolver();
        let state = AppState::new(registry, resolver);
        assert!(state.bots().names().contains(&"random".to_string()));
    }

    #[test]
    fn test_state_clone() {
        let state = make_state();
        let cloned = state.clone();
        assert_eq!(state.bots().names(), cloned.bots().names());
    }

    #[test]
    fn test_bots_arc_clone() {
        let state = make_state();
        let bots1 = state.bots();
        let bots2 = state.bots();
        assert_eq!(bots1.names(), bots2.names());
    }

    #[test]
    fn test_resolve_existing_alias() {
        let state = make_state();
        assert_eq!(state.resolve_bot_id("easy"), "random");
        assert_eq!(state.resolve_bot_id("medium"), "minimax_set_based_d2");
    }

    #[test]
    fn test_resolve_nonexistent_alias() {
        let state = make_state();
        // Si no hay alias definido, devuelve el mismo id
        assert_eq!(state.resolve_bot_id("hard"), "hard");
        assert_eq!(state.resolve_bot_id("random"), "random");
    }

    #[test]
    fn test_find_bot_through_alias() {
        let state = make_state();
        // "easy" → alias → "random"
        let bot = state.bots().find(state.resolve_bot_id("easy"));
        assert!(bot.is_some());
        assert_eq!(bot.unwrap().name(), "random");
    }
}
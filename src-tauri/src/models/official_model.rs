use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::RwLock;

/// 对应 Google `v1internal:fetchAvailableModels` 接口返回的单个模型权威数据结构。
/// 结构体中的每一个属性与官方 API 100% 严格对齐。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OfficialModelInfo {
    #[serde(default)]
    pub display_name: Option<String>,
    /// 官方模型代号 (如 MODEL_PLACEHOLDER_M35, MODEL_PLACEHOLDER_M318 等)
    #[serde(default)]
    pub model: String,
    /// 模型供应商 (如 MODEL_PROVIDER_ANTHROPIC, MODEL_PROVIDER_GOOGLE, MODEL_PROVIDER_OPENAI)
    #[serde(default)]
    pub model_provider: Option<String>,
    /// API 供应商 (如 API_PROVIDER_ANTHROPIC_VERTEX, API_PROVIDER_GOOGLE_GEMINI, API_PROVIDER_OPENAI_VERTEX)
    #[serde(default)]
    pub api_provider: Option<String>,
    #[serde(default)]
    pub max_output_tokens: Option<i64>,
    #[serde(default)]
    pub max_tokens: Option<i64>,
    #[serde(default)]
    pub supports_thinking: Option<bool>,
    #[serde(default)]
    pub thinking_budget: Option<i64>,
    #[serde(default)]
    pub min_thinking_budget: Option<i64>,
    #[serde(default)]
    pub supports_images: Option<bool>,
    #[serde(default)]
    pub supports_video: Option<bool>,
    #[serde(default)]
    pub recommended: Option<bool>,
    #[serde(default)]
    pub is_internal: Option<bool>,
    #[serde(default)]
    pub tag_title: Option<String>,
    #[serde(default)]
    pub tag_description: Option<String>,
    #[serde(default)]
    pub quota_info: Option<OfficialQuotaInfo>,
    #[serde(default)]
    pub supported_mime_types: Option<HashMap<String, bool>>,
    #[serde(default)]
    pub model_experiments: Option<serde_json::Value>,
    #[serde(default)]
    pub vertex_model_id: Option<String>,
    #[serde(default)]
    pub prompt_templater_type: Option<String>,
    #[serde(default)]
    pub tool_formatter_type: Option<String>,
    #[serde(default)]
    pub thinking_level: Option<String>,
    #[serde(default)]
    pub requires_lead_in_generation: Option<bool>,
    #[serde(default)]
    pub requires_no_xml_tool_examples: Option<bool>,
    #[serde(default)]
    pub requires_image_output_outside_function_responses: Option<bool>,
    #[serde(default)]
    pub supports_cumulative_context: Option<bool>,
    #[serde(default)]
    pub supports_estimate_token_counter: Option<bool>,
    #[serde(default)]
    pub add_cursor_to_find_replace_target: Option<bool>,
    #[serde(default)]
    pub tab_jump_print_line_range: Option<bool>,
}

impl OfficialModelInfo {
    /// 判定是否为 Claude 模型家族
    pub fn is_claude(&self) -> bool {
        self.model_provider.as_deref() == Some("MODEL_PROVIDER_ANTHROPIC")
            || self.api_provider.as_deref() == Some("API_PROVIDER_ANTHROPIC_VERTEX")
            || self.model == "MODEL_PLACEHOLDER_M35"
            || self.model == "MODEL_PLACEHOLDER_M26"
    }

    /// 判定是否为非 Gemini 外部模型 (如 Claude 或 GPT 等)
    pub fn is_non_gemini(&self) -> bool {
        if let Some(ref provider) = self.model_provider {
            provider != "MODEL_PROVIDER_GOOGLE"
        } else {
            self.is_claude()
        }
    }
}

/// 官方配额信息结构
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OfficialQuotaInfo {
    pub remaining_fraction: Option<f64>,
    pub reset_time: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OfficialModelsFile {
    pub models: HashMap<String, OfficialModelInfo>,
}

static DYNAMIC_CATALOG: Lazy<RwLock<HashMap<String, OfficialModelInfo>>> = Lazy::new(|| {
    let json_str = include_str!("../../resources/official_models.json");
    let file: OfficialModelsFile =
        serde_json::from_str(json_str).expect("Failed to parse official_models.json");
    RwLock::new(file.models)
});

/// 官方模型目录管理器（支持动态解析与运行时增量更新）
pub struct OfficialModelCatalog;

impl OfficialModelCatalog {
    /// 运行时动态更新官方模型目录 (由 fetchAvailableModels 接口返回数据触发)
    pub fn update(models: HashMap<String, OfficialModelInfo>) {
        if let Ok(mut lock) = DYNAMIC_CATALOG.write() {
            for (k, v) in models {
                lock.insert(k, v);
            }
        }
    }

    /// 根据用户传入的模型 ID（官方标准 ID、别名、路由结果，以及大小写不敏感的精确名）
    /// 获取对应的官方模型结构体。未命中时返回 None，由调用方使用 `default_model()`。
    pub fn get(model_id: &str) -> Option<OfficialModelInfo> {
        let lock = DYNAMIC_CATALOG.read().ok()?;

        // 1. 精确匹配原始 model_id
        if let Some(info) = lock.get(model_id) {
            return Some(info.clone());
        }

        // 2. 通过项目已有别名表解析归一化 ID 匹配
        let aliased = crate::proxy::model_specs::resolve_alias(model_id);
        if let Some(info) = lock.get(&aliased) {
            return Some(info.clone());
        }

        // 2.5 通过路由映射解析匹配
        let routed = crate::proxy::common::model_mapping::map_claude_model_to_gemini(model_id);
        if let Some(info) = lock.get(&routed) {
            return Some(info.clone());
        }

        // 3. 忽略大小写的精确匹配
        let lower = model_id.to_lowercase();
        for (k, v) in lock.iter() {
            if k.to_lowercase() == lower {
                return Some(v.clone());
            }
        }

        None
    }

    /// 获取默认官方模型结构体 (gemini-3.8-flash-high)
    pub fn default_model() -> OfficialModelInfo {
        Self::get("gemini-3.8-flash-high").unwrap_or_else(|| OfficialModelInfo {
            display_name: Some("Gemini 3.8 Flash (High)".to_string()),
            model: "MODEL_PLACEHOLDER_M318".to_string(),
            model_provider: Some("MODEL_PROVIDER_GOOGLE".to_string()),
            api_provider: Some("API_PROVIDER_GOOGLE_GEMINI".to_string()),
            max_output_tokens: Some(65536),
            max_tokens: Some(1048576),
            supports_thinking: Some(true),
            thinking_budget: Some(-1),
            min_thinking_budget: Some(32),
            supports_images: Some(true),
            supports_video: Some(true),
            recommended: Some(true),
            is_internal: None,
            tag_title: Some("Fast".to_string()),
            tag_description: Some("Default".to_string()),
            quota_info: None,
            supported_mime_types: None,
            model_experiments: None,
            vertex_model_id: None,
            prompt_templater_type: None,
            tool_formatter_type: None,
            thinking_level: None,
            requires_lead_in_generation: None,
            requires_no_xml_tool_examples: None,
            requires_image_output_outside_function_responses: None,
            supports_cumulative_context: None,
            supports_estimate_token_counter: None,
            add_cursor_to_find_replace_target: None,
            tab_jump_print_line_range: None,
        })
    }
}

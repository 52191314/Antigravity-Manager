// Minimal test verifying Claude and Gemini align_official_envelope behavior
#[cfg(test)]
mod tests {
    use crate::proxy::pipeline::InboundThinkingPipeline;
    use serde_json::json;

    #[test]
    fn test_official_claude_alignment() {
        let mut body = json!({
            "_session_thinking_id": "agent/a76e1573-c906-435a-89d2-18b6683313b1/1790530802878/0181971f-961c-4ba9-a320-2ae44361bc1d/1",
            "model": "claude-sonnet-4-6",
            "request": {
                "contents": [
                    { "role": "user", "parts": [{ "text": "hello" }] }
                ],
                "tools": [
                    {
                        "functionDeclarations": [
                            {
                                "name": "view_file",
                                "description": "This tool supports text files and following binary files: image, pdf, video, audio.",
                                "parameters": { "type": "object" }
                            }
                        ]
                    }
                ],
                "generationConfig": {
                    "thinkingConfig": {
                        "includeThoughts": true,
                        "thinkingBudget": 1024
                    }
                }
            }
        });

        InboundThinkingPipeline::align_official_envelope(&mut body);

        // 1. Envelope keys: project -> requestId -> request -> model -> userAgent -> requestType
        let keys: Vec<&str> = body
            .as_object()
            .unwrap()
            .keys()
            .map(|s| s.as_str())
            .collect();
        assert_eq!(
            keys,
            vec![
                "project",
                "requestId",
                "request",
                "model",
                "userAgent",
                "requestType"
            ]
        );

        let req = body.get("request").unwrap();

        // 2. Labels aligned for Claude
        let labels = req.get("labels").unwrap();
        assert_eq!(labels["model_enum"], "MODEL_PLACEHOLDER_M35");
        assert_eq!(labels["used_claude"], "true");
        assert_eq!(labels["used_claude_conservative"], "false"); // Explicitly turned OFF
        assert_eq!(labels["used_non_gemini_model"], "true");
        assert_eq!(
            labels["trajectory_id"],
            "0181971f-961c-4ba9-a320-2ae44361bc1d"
        );
        assert_eq!(
            labels["request_id"],
            "0181971f-961c-4ba9-a320-2ae44361bc1d-0"
        );

        // 3. GenerationConfig maxOutputTokens = 64000 for Claude, thinkingBudget kept untouched
        let gc = req.get("generationConfig").unwrap();
        assert_eq!(gc["maxOutputTokens"], 64000);
        assert_eq!(gc["thinkingConfig"]["thinkingBudget"], 1024);

        // 4. Tools description kept intact as provided by client (客户端传啥就是啥)
        let tools = req.get("tools").unwrap().as_array().unwrap();
        let view_file_desc = tools[0]["functionDeclarations"][0]["description"]
            .as_str()
            .unwrap();
        assert_eq!(
            view_file_desc,
            "This tool supports text files and following binary files: image, pdf, video, audio."
        );
    }

    #[test]
    fn test_official_gemini_alignment() {
        let mut body = json!({
            "requestId": "agent/43461060-f160-43b5-829a-935ed4f20115/1790527686221/fc1f7a63-4efd-47dc-b800-1edad55edb1d/1",
            "model": "gemini-3.8-flash-high",
            "request": {
                "contents": [
                    { "role": "user", "parts": [{ "text": "hello" }] }
                ],
                "tools": [
                    {
                        "functionDeclarations": [
                            {
                                "name": "view_file",
                                "description": "This tool supports text files and following binary files: image, video.",
                                "parameters": { "type": "object" }
                            }
                        ]
                    }
                ],
                "generationConfig": {
                    "thinkingConfig": {
                        "includeThoughts": true,
                        "thinkingBudget": -1
                    }
                }
            }
        });

        InboundThinkingPipeline::align_official_envelope(&mut body);

        let req = body.get("request").unwrap();

        // 1. Labels aligned for Gemini
        let labels = req.get("labels").unwrap();
        assert_eq!(labels["model_enum"], "MODEL_PLACEHOLDER_M318");
        assert_eq!(labels["used_claude"], "false");
        assert_eq!(labels["used_claude_conservative"], "false");
        assert_eq!(labels["used_non_gemini_model"], "false");
        assert_eq!(
            labels["trajectory_id"],
            "fc1f7a63-4efd-47dc-b800-1edad55edb1d"
        );
        assert_eq!(
            labels["request_id"],
            "fc1f7a63-4efd-47dc-b800-1edad55edb1d-0"
        );

        // 2. GenerationConfig maxOutputTokens = 65536 for Gemini, thinkingBudget kept untouched (-1)
        let gc = req.get("generationConfig").unwrap();
        assert_eq!(gc["maxOutputTokens"], 65536);
        assert_eq!(gc["thinkingConfig"]["thinkingBudget"], -1);

        // 3. Tools description kept intact as provided by client (客户端传啥就是啥)
        let tools = req.get("tools").unwrap().as_array().unwrap();
        let view_file_desc = tools[0]["functionDeclarations"][0]["description"]
            .as_str()
            .unwrap();
        assert_eq!(
            view_file_desc,
            "This tool supports text files and following binary files: image, video."
        );
    }

    #[test]
    fn test_dynamic_multi_step_index() {
        let mut body = json!({
            "requestId": "agent/43461060-f160-43b5-829a-935ed4f20115/1790527686221/fc1f7a63-4efd-47dc-b800-1edad55edb1d/3",
            "model": "claude-sonnet-4-6",
            "request": {
                "contents": [
                    { "role": "user", "parts": [{ "text": "turn 1" }] },
                    { "role": "model", "parts": [{ "text": "resp 1" }] },
                    { "role": "user", "parts": [{ "text": "turn 2" }] }
                ]
            }
        });

        InboundThinkingPipeline::align_official_envelope(&mut body);

        let req = body.get("request").unwrap();
        let labels = req.get("labels").unwrap();
        // requestId 结尾是 /3 -> 上一步已完成索引 last_step_index 动态计算为 "2"
        assert_eq!(labels["last_step_index"], "2");
        assert_eq!(
            labels["request_id"],
            "fc1f7a63-4efd-47dc-b800-1edad55edb1d-2"
        );
    }

    #[test]
    fn test_official_model_catalog_resolution() {
        use crate::models::OfficialModelCatalog;

        // 1. Claude Opus 4.6 (Thinking)
        let opus = OfficialModelCatalog::get("claude-opus-4-6-thinking").unwrap();
        assert_eq!(opus.model, "MODEL_PLACEHOLDER_M26");
        assert!(opus.is_claude());
        assert!(opus.is_non_gemini());
        assert_eq!(opus.max_output_tokens, Some(64000));
        assert_eq!(opus.thinking_budget, Some(1024));

        // 2. Claude Sonnet 4.6 (Thinking)
        let sonnet = OfficialModelCatalog::get("claude-sonnet-4-6").unwrap();
        assert_eq!(sonnet.model, "MODEL_PLACEHOLDER_M35");
        assert!(sonnet.is_claude());
        assert!(sonnet.is_non_gemini());
        assert_eq!(sonnet.max_output_tokens, Some(64000));

        // 3. Gemini 3.8 Flash High
        let g38 = OfficialModelCatalog::get("gemini-3.8-flash-high").unwrap();
        assert_eq!(g38.model, "MODEL_PLACEHOLDER_M318");
        assert!(!g38.is_claude());
        assert!(!g38.is_non_gemini());
        assert_eq!(g38.max_output_tokens, Some(65536));
        assert_eq!(g38.thinking_budget, Some(-1));

        // 4. Gemini 3.8 Flash Low
        let g38_low = OfficialModelCatalog::get("gemini-3.8-flash-low").unwrap();
        assert_eq!(g38_low.model, "MODEL_PLACEHOLDER_M320");
        assert_eq!(g38_low.thinking_budget, Some(1000));

        // 5. Gemini 3.1 Pro High
        let g31_pro = OfficialModelCatalog::get("gemini-3.1-pro-high").unwrap();
        assert_eq!(g31_pro.model, "MODEL_PLACEHOLDER_M37");
        assert_eq!(g31_pro.thinking_budget, Some(10001));

        // 6. GPT-OSS 120B Medium
        let gpt = OfficialModelCatalog::get("gpt-oss-120b-medium").unwrap();
        assert_eq!(gpt.model, "MODEL_OPENAI_GPT_OSS_120B_MEDIUM");
        assert!(!gpt.is_claude());
        assert!(gpt.is_non_gemini());
        assert_eq!(gpt.max_output_tokens, Some(32768));
    }

    #[test]
    fn test_gateway_mode_negative_one_budget_fallback_to_official_default() {
        use crate::proxy::pipeline::inbound::ClientThinkingSwitch;

        // 1. Gemini 3.8 Flash High -> official default thinking_budget is -1
        let mut gc_high = json!({});
        InboundThinkingPipeline::configure_inbound_thinking(
            "gemini-3.8-flash-high",
            &mut gc_high,
            ClientThinkingSwitch::Default,
            None,
            None,
            None,
        );
        let tc_high = gc_high.get("thinkingConfig").unwrap();
        assert_eq!(tc_high["includeThoughts"], true);
        assert_eq!(tc_high["thinkingBudget"], -1);

        // 2. Gemini 3.8 Flash Low -> official default thinking_budget is 1000
        let mut gc_low = json!({});
        InboundThinkingPipeline::configure_inbound_thinking(
            "gemini-3.8-flash-low",
            &mut gc_low,
            ClientThinkingSwitch::Default,
            None,
            None,
            None,
        );
        let tc_low = gc_low.get("thinkingConfig").unwrap();
        assert_eq!(tc_low["includeThoughts"], true);
        assert_eq!(tc_low["thinkingBudget"], 1000);

        // 3. Gemini 3.8 Flash Medium -> official default thinking_budget is 4000
        let mut gc_med = json!({});
        InboundThinkingPipeline::configure_inbound_thinking(
            "gemini-3.8-flash-medium",
            &mut gc_med,
            ClientThinkingSwitch::Default,
            None,
            None,
            None,
        );
        let tc_med = gc_med.get("thinkingConfig").unwrap();
        assert_eq!(tc_med["includeThoughts"], true);
        assert_eq!(tc_med["thinkingBudget"], 4000);

        // 4. Claude Sonnet 4.6 -> official default thinking_budget is 1024
        let mut gc_claude = json!({});
        InboundThinkingPipeline::configure_inbound_thinking(
            "claude-sonnet-4-6",
            &mut gc_claude,
            ClientThinkingSwitch::Default,
            None,
            None,
            None,
        );
        let tc_claude = gc_claude.get("thinkingConfig").unwrap();
        assert_eq!(tc_claude["includeThoughts"], true);
        assert_eq!(tc_claude["thinkingBudget"], 1024);

        // 5. Gemini 3.1 Pro High -> official default thinking_budget is 10001
        let mut gc_pro = json!({});
        InboundThinkingPipeline::configure_inbound_thinking(
            "gemini-3.1-pro-high",
            &mut gc_pro,
            ClientThinkingSwitch::Default,
            None,
            None,
            None,
        );
        let tc_pro = gc_pro.get("thinkingConfig").unwrap();
        assert_eq!(tc_pro["includeThoughts"], true);
        assert_eq!(tc_pro["thinkingBudget"], 10001);
    }
}

import { describe, it, expect } from "vitest";

import { FORMATS } from "../../open-sse/translator/formats.js";
import { translateRequest } from "../../open-sse/translator/index.js";
import { claudeToOpenAIRequest } from "../../open-sse/translator/request/claude-to-openai.js";
import { filterToOpenAIFormat } from "../../open-sse/translator/helpers/openaiHelper.js";
import { parseSSELine } from "../../open-sse/utils/streamHelpers.js";
import { openaiResponsesToOpenAIRequest } from "../../open-sse/translator/request/openai-responses.js";
import { openaiToOpenAIResponsesResponse } from "../../open-sse/translator/response/openai-responses.js";
import { getTargetFormat, buildProviderUrl } from "../../open-sse/services/provider.js";

describe("request normalization", () => {
  it("claudeToOpenAIRequest flattens text-only content arrays into string", () => {
    const body = {
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "hi" },
            { type: "text", text: "there" },
          ],
        },
      ],
    };

    const result = claudeToOpenAIRequest("gpt-oss:120b", body, true);
    expect(result.messages[0].content).toBe("hi\nthere");
  });

  it("claudeToOpenAIRequest preserves multimodal arrays", () => {
    const body = {
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "describe" },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: "ZmFrZQ==",
              },
            },
          ],
        },
      ],
    };

    const result = claudeToOpenAIRequest("gpt-4o", body, true);
    expect(Array.isArray(result.messages[0].content)).toBe(true);
  });

  it("filterToOpenAIFormat flattens text-only arrays to string", () => {
    const body = {
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "a" },
            { type: "text", text: "b" },
          ],
        },
      ],
    };

    const result = filterToOpenAIFormat(JSON.parse(JSON.stringify(body)));
    expect(result.messages[0].content).toBe("a\nb");
  });

  it("translateRequest keeps /v1/messages Claude->OpenAI text payloads string-safe", () => {
    const body = {
      model: "ollama/gpt-oss:120b",
      system: [{ type: "text", text: "You are helpful." }],
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "hello" },
            { type: "text", text: "world" },
          ],
        },
      ],
      stream: true,
    };

    const result = translateRequest(
      FORMATS.CLAUDE,
      FORMATS.OPENAI,
      "gpt-oss:120b",
      JSON.parse(JSON.stringify(body)),
      true,
      null,
      "ollama",
    );

    const userMessage = result.messages.find((m) => m.role === "user");
    expect(typeof userMessage.content).toBe("string");
    expect(userMessage.content).toBe("hello\nworld");
  });

  it("translateRequest strips unsupported Anthropic output_config for MiniMax Claude-compatible endpoints", () => {
    const body = {
      model: "MiniMax-M2.7",
      system: [{ type: "text", text: "You are helpful." }],
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "continue" }],
        },
      ],
      max_tokens: 1024,
      output_config: {
        effort: "medium",
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: { title: { type: "string" } },
            required: ["title"],
            additionalProperties: false,
          },
        },
      },
    };

    const result = translateRequest(
      FORMATS.CLAUDE,
      FORMATS.CLAUDE,
      "MiniMax-M2.7",
      JSON.parse(JSON.stringify(body)),
      true,
      null,
      "minimax",
    );

    expect(result.output_config).toBeUndefined();
    expect(result.messages[0].content[0].text).toBe("continue");
  });

  it("translateRequest preserves output_config for Anthropic Claude", () => {
    const body = {
      model: "claude-sonnet-4.5",
      system: [{ type: "text", text: "You are helpful." }],
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "continue" }],
        },
      ],
      max_tokens: 1024,
      output_config: {
        format: { type: "json_schema", schema: { type: "object" } },
      },
    };

    const result = translateRequest(
      FORMATS.CLAUDE,
      FORMATS.CLAUDE,
      "claude-sonnet-4.5",
      JSON.parse(JSON.stringify(body)),
      true,
      null,
      "claude",
    );

    expect(result.output_config).toEqual(body.output_config);
  });

  it("preserves Responses custom tool definitions without JSON schema parameters", () => {
    const body = {
      input: "edit file",
      tools: [{ type: "custom", name: "patch_tool", description: "accepts raw patch text" }],
    };

    const result = openaiResponsesToOpenAIRequest("gpt-5.3-codex", JSON.parse(JSON.stringify(body)), true);

    expect(result.tools).toEqual([{ type: "custom", name: "patch_tool", description: "accepts raw patch text" }]);
    expect(result.tools[0].function).toBeUndefined();
    expect(result.tools[0].parameters).toBeUndefined();
  });

  it("preserves Responses custom tool call input without JSON arguments wrapping", () => {
    const rawInput = "*** Begin Patch\n*** Update File: a.txt\n@@\n-old\n+new\n*** End Patch";
    const body = {
      input: [
        { type: "message", role: "user", content: [{ type: "input_text", text: "edit" }] },
        { type: "custom_tool_call", call_id: "call_custom_1", name: "patch_tool", input: rawInput },
      ],
    };

    const result = openaiResponsesToOpenAIRequest("gpt-5.3-codex", JSON.parse(JSON.stringify(body)), true);
    const customCall = result.messages.find((m) => m.role === "assistant")?.tool_calls?.[0];

    expect(customCall).toMatchObject({
      id: "call_custom_1",
      type: "custom",
      custom: { name: "patch_tool", input: rawInput },
    });
    expect(customCall.function).toBeUndefined();
    expect(JSON.stringify(customCall)).not.toContain('"arguments"');
  });

  it("keeps ordinary function tool arguments JSON-serializable", () => {
    const body = {
      messages: [{
        role: "assistant",
        content: null,
        tool_calls: [{
          id: "call_func_1",
          type: "function",
          function: { name: "shell", arguments: { command: "pwd" } },
        }],
      }],
    };

    const result = translateRequest(
      FORMATS.OPENAI,
      FORMATS.OPENAI,
      "gpt-5.3-codex",
      JSON.parse(JSON.stringify(body)),
      true,
    );

    const args = result.messages[0].tool_calls[0].function.arguments;
    expect(typeof args).toBe("string");
    expect(JSON.parse(args)).toEqual({ command: "pwd" });
  });

  it("emits custom tool call input events for custom chat tool calls", () => {
    const rawInput = "plain freeform payload";
    const state = {
      seq: 0,
      responseId: "resp_test",
      created: 123,
      started: false,
      msgTextBuf: {},
      msgItemAdded: {},
      msgContentAdded: {},
      msgItemDone: {},
      reasoningId: "",
      reasoningIndex: -1,
      reasoningBuf: "",
      reasoningPartAdded: false,
      reasoningDone: false,
      inThinking: false,
      funcArgsBuf: {},
      funcNames: {},
      funcCallIds: {},
      funcArgsDone: {},
      funcItemDone: {},
      completedSent: false,
    };

    const addedEvents = openaiToOpenAIResponsesResponse({
      id: "chatcmpl_test",
      choices: [{
        index: 0,
        delta: {
          tool_calls: [{
            index: 0,
            id: "call_custom_1",
            type: "custom",
            custom: { name: "patch_tool", input: rawInput },
          }],
        },
      }],
    }, state);
    const doneEvents = openaiToOpenAIResponsesResponse({
      id: "chatcmpl_test",
      choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
    }, state);
    const events = [...addedEvents, ...doneEvents];

    expect(events.some((e) => e.event === "response.custom_tool_call_input.delta" && e.data.delta === rawInput)).toBe(true);
    expect(events.some((e) => e.event === "response.function_call_arguments.delta")).toBe(false);
    const doneItem = events.find((e) => e.event === "response.output_item.done")?.data.item;
    expect(doneItem).toMatchObject({
      type: "custom_tool_call",
      call_id: "call_custom_1",
      name: "patch_tool",
      input: rawInput,
    });
    expect(doneItem.arguments).toBeUndefined();
  });

  it("uses providerSpecificData apiType for OpenAI-compatible Responses connections", () => {
    const provider = "openai-compatible-chat-test";
    const credentials = { providerSpecificData: { apiType: "responses", baseUrl: "https://example.test/v1" } };

    expect(getTargetFormat(provider, credentials)).toBe(FORMATS.OPENAI_RESPONSES);
    expect(buildProviderUrl(provider, "gpt-5.5", true, credentials.providerSpecificData)).toBe("https://example.test/v1/responses");
  });

  it("parseSSELine supports provider raw NDJSON stream lines", () => {
    const raw = JSON.stringify({
      model: "gpt-oss:120b",
      message: { role: "assistant", content: "hello" },
      done: false,
    });

    const parsed = parseSSELine(raw);
    expect(parsed).toEqual({
      model: "gpt-oss:120b",
      message: { role: "assistant", content: "hello" },
      done: false,
    });
  });

  it("parseSSELine still supports SSE data lines", () => {
    const parsed = parseSSELine('data: {"choices":[{"delta":{"content":"hi"}}]}');
    expect(parsed.choices[0].delta.content).toBe("hi");
  });
});

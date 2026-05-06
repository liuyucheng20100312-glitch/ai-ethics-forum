interface StudyModelOptions {
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  modelId?: string;
  apiUrl?: string;
  timeoutMs?: number;
  requestLabel?: string;
  jsonMode?: boolean;
}

interface CompatibleChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
}

const DEFAULT_STUDY_SYSTEM_PROMPT =
  "You are an experienced IB learning coach. Analyze exam evidence carefully, do not invent facts, and always return concise, structured output.";

export interface StudyChatImageUrlPart {
  type: "image_url";
  image_url: {
    url: string;
  };
}

export interface StudyChatTextPart {
  type: "text";
  text: string;
}

export type StudyChatContentPart = StudyChatImageUrlPart | StudyChatTextPart;

export interface StudyChatMessage {
  role: "system" | "user" | "assistant";
  content: string | StudyChatContentPart[];
}

function resolveStudyAssistantApiKey(): string {
  return process.env.STUDY_ASSISTANT_API_KEY || process.env.ALIBABA_BAILIAN_API_KEY || "";
}

function resolveStudyAssistantModelId(options: StudyModelOptions): string {
  return (
    options.modelId ||
    process.env.STUDY_ASSISTANT_MODEL_ID ||
    process.env.ALIBABA_BAILIAN_MODEL_ID ||
    "qwen-plus"
  );
}

function resolveStudyAssistantApiUrl(options: StudyModelOptions): string {
  return (
    options.apiUrl ||
    process.env.STUDY_ASSISTANT_API_URL ||
    "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
  );
}

export async function callStudyAssistantChat(
  messages: StudyChatMessage[],
  options: StudyModelOptions = {}
): Promise<string> {
  const apiKey = resolveStudyAssistantApiKey();
  const modelId = resolveStudyAssistantModelId(options);
  const apiUrl = resolveStudyAssistantApiUrl(options);
  const timeoutMs = options.timeoutMs ?? 120_000;
  const requestLabel = options.requestLabel || "study-assistant-chat";

  if (!apiKey) {
    return "";
  }

  try {
    const controller = new AbortController();
    const startedAt = Date.now();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
    const bodyPayload: Record<string, unknown> = {
      model: modelId,
      messages,
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens ?? 2200,
    };
    if (options.jsonMode) {
      bodyPayload.response_format = { type: "json_object" };
    }
    console.info(`[study-model] ${requestLabel} started`, {
      modelId,
      timeoutMs,
      messageCount: messages.length,
      jsonMode: Boolean(options.jsonMode),
    });

    let response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify(bodyPayload),
    });

    if (!response.ok && options.jsonMode) {
      const errorText = await response.text();
      const likelyUnsupported = response.status === 400 && /response_format|json_object|invalid_parameter/i.test(errorText);
      if (likelyUnsupported) {
        console.warn(`[study-model] ${requestLabel} jsonMode unsupported, retrying without response_format`);
        response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: modelId,
            messages,
            temperature: options.temperature ?? 0.3,
            max_tokens: options.maxTokens ?? 2200,
          }),
        });
      } else {
        clearTimeout(timeoutHandle);
        console.error(`[study-model] ${requestLabel} failed:`, response.status, errorText);
        return "";
      }
    }

    clearTimeout(timeoutHandle);
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[study-model] ${requestLabel} failed:`, response.status, errorText);
      return "";
    }

    const data = (await response.json()) as CompatibleChatCompletionResponse;
    const content = data.choices?.[0]?.message?.content;
    const normalizedContent =
      typeof content === "string"
        ? content.trim()
        : Array.isArray(content)
          ? content
              .map((item) => (typeof item?.text === "string" ? item.text : ""))
              .join("\n")
              .trim()
          : "";
    console.info(`[study-model] ${requestLabel} completed`, {
      durationMs: Date.now() - startedAt,
      contentType: Array.isArray(content) ? "array" : typeof content,
      contentLength: normalizedContent.length,
    });
    return normalizedContent;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.warn(`[study-model] ${requestLabel} timed out after ${timeoutMs}ms`);
      return "";
    }

    console.error(`[study-model] ${requestLabel} threw an error:`, error);
    return "";
  }
}

/**
 * Calls an OpenAI-compatible chat completion endpoint for study-assistant features.
 * This defaults to the existing Bailian-compatible endpoint but can be redirected
 * to other providers through environment variables.
 */
export async function callStudyAssistantModel(
  prompt: string,
  options: StudyModelOptions = {}
): Promise<string> {
  return callStudyAssistantChat(
    [
      {
        role: "system",
        content: options.systemPrompt || DEFAULT_STUDY_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    options
  );
}

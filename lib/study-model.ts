interface StudyModelOptions {
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  modelId?: string;
  apiUrl?: string;
}

interface CompatibleChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
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

  if (!apiKey) {
    return "";
  }

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        messages,
        temperature: options.temperature ?? 0.3,
        max_tokens: options.maxTokens ?? 2200,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Study assistant model request failed:", response.status, errorText);
      return "";
    }

    const data = (await response.json()) as CompatibleChatCompletionResponse;
    return data.choices?.[0]?.message?.content?.trim() || "";
  } catch (error) {
    console.error("Study assistant model request threw an error:", error);
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

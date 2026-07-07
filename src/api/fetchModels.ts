import { requestUrl } from "obsidian";
import { Provider, ModelInfo } from "../data/providers.ts";

/**
 * 프로바이더에서 모델 목록을 가져온다.
 * Obsidian의 requestUrl을 사용하여 CORS 제한을 우회한다.
 */
export async function fetchModels(
  provider: Provider,
  apiKey: string
): Promise<ModelInfo[]> {
  if (!provider.modelsEndpoint) {
    return [];
  }

  const url = buildModelsUrl(provider, apiKey);
  const headers = buildHeaders(provider, apiKey);

  const response = await requestUrl({ url, headers });

  if (response.status !== 200) {
    throw new Error(
      `모델 목록 조회 실패 (${response.status}): ${provider.name}`
    );
  }

  return parseModelsResponse(provider, response.json);
}

function buildModelsUrl(provider: Provider, apiKey: string): string {
  let url = provider.baseUrl + provider.modelsEndpoint;
  if (provider.authQueryParam) {
    url += `?${provider.authQueryParam}=${apiKey}`;
  }
  return url;
}

function buildHeaders(
  provider: Provider,
  apiKey: string
): Record<string, string> {
  const headers: Record<string, string> = {};

  if (provider.authHeader && !provider.authQueryParam) {
    const prefix = provider.authPrefix ?? "";
    headers[provider.authHeader] = prefix + apiKey;
  }

  if (provider.extraHeaders) {
    Object.assign(headers, provider.extraHeaders);
  }

  return headers;
}

function parseModelsResponse(
  provider: Provider,
  json: Record<string, unknown>
): ModelInfo[] {
  let models: Record<string, unknown>[];

  if (provider.modelsResponsePath) {
    models = json[provider.modelsResponsePath] as Record<string, unknown>[];
  } else if (Array.isArray(json)) {
    models = json;
  } else {
    models = [];
  }

  if (!Array.isArray(models)) {
    return [];
  }

  return models.map((m) => {
    // Gemini:     { name: "models/gemini-2.0-flash", displayName: "..." }
    // OpenAI/Anthropic: { id: "gpt-4o", ... }
    // ElevenLabs: { model_id: "eleven_multilingual_v2", name: "..." }
    const rawId = (m.id as string) ?? (m.model_id as string) ?? (m.name as string) ?? "";
    const id = rawId.replace(/^models\//, "");
    const name =
      (m.display_name as string) ??
      (m.displayName as string) ??
      (typeof m.name === "string" && m.id ? (m.name as string) : id);
    // 최대 입력 토큰 수: provider별 필드가 제각각.
    //   Gemini:     inputTokenLimit
    //   OpenRouter/일부 OpenAI 호환: context_length (top_provider.context_length에 있기도 함)
    //   Anthropic/OpenAI: 미제공 → undefined
    const topProvider = m.top_provider as Record<string, unknown> | undefined;
    const inputTokenLimit =
      (typeof m.inputTokenLimit === "number" ? m.inputTokenLimit : undefined) ??
      (typeof m.context_length === "number" ? m.context_length : undefined) ??
      (typeof m.max_context_length === "number" ? m.max_context_length : undefined) ??
      (topProvider && typeof topProvider.context_length === "number"
        ? topProvider.context_length
        : undefined);
    return { id, name, inputTokenLimit };
  });
}

/**
 * ElevenLabs /v1/voices 에서 보이스 목록을 받아온다.
 * 응답: { voices: [{ voice_id, name, labels?, category? }, ...] }
 */
export async function fetchElevenLabsVoices(
  apiKey: string,
  baseUrl = "https://api.elevenlabs.io/v1"
): Promise<Array<{ id: string; name: string; category?: string }>> {
  const res = await requestUrl({
    url: baseUrl.replace(/\/+$/, "") + "/voices",
    method: "GET",
    headers: { "xi-api-key": apiKey },
    throw: false,
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`ElevenLabs voices ${res.status}: ${res.text ?? ""}`);
  }
  const voices = (res.json?.voices ?? []) as Array<{
    voice_id: string;
    name: string;
    category?: string;
  }>;
  return voices.map((v) => ({ id: v.voice_id, name: v.name, category: v.category }));
}

// ─── 샘플링 파라미터 게이팅 ───
// 프로필.allowedParams 에 따라 topK/topP/minP를 프로필 params와 paramsOverride 양쪽에서 제거한다.
// temperature/maxTokens 등 비-게이트 키는 그대로 통과.

import {
  GATEABLE_PARAM_KEYS,
  type AllowedParams,
  type ChatProfile,
  type GGAIModelProfile,
  type TextProfile,
} from "../types/profile.ts";

function shouldDrop(allowed: AllowedParams | undefined, key: string): boolean {
  if (!allowed) return false; // legacy 프로필: 모두 허용
  if ((GATEABLE_PARAM_KEYS as readonly string[]).indexOf(key) === -1) return false;
  return !allowed[key as keyof AllowedParams];
}

function stripDisallowed<T extends Record<string, unknown>>(
  obj: T | undefined,
  allowed: AllowedParams | undefined
): T | undefined {
  if (!obj) return obj;
  let mutated = false;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (shouldDrop(allowed, k)) {
      mutated = true;
      continue;
    }
    out[k] = v;
  }
  return mutated ? (out as T) : obj;
}

/** 프로필이 chat/text면 params에서 미허용 키를 제거한 얕은 복제본을 반환. 그 외엔 원본 반환. */
export function gateProfile(profile: GGAIModelProfile): GGAIModelProfile {
  if (profile.kind !== "chat" && profile.kind !== "text") return profile;
  const allowed = (profile as ChatProfile | TextProfile).allowedParams;
  if (!allowed) return profile;
  const gatedParams = stripDisallowed(profile.params as Record<string, unknown>, allowed);
  if (gatedParams === profile.params) return profile;
  return { ...profile, params: gatedParams } as GGAIModelProfile;
}

/** 외부에서 들어온 paramsOverride에서 미허용 키 제거. */
export function gateParamsOverride(
  override: Record<string, unknown> | undefined,
  profile: GGAIModelProfile
): Record<string, unknown> | undefined {
  if (!override) return override;
  if (profile.kind !== "chat" && profile.kind !== "text") return override;
  const allowed = (profile as ChatProfile | TextProfile).allowedParams;
  return stripDisallowed(override, allowed);
}

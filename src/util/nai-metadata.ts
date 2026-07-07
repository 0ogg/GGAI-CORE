// ─── NovelAI 생성 이미지 메타데이터 파서 ───
// NAI가 생성한 PNG의 텍스트 청크(tEXt/zTXt/iTXt)에서 "Comment" JSON을 추출하고,
// ImageProfile.params 로 매핑 가능한 형태로 정규화한다.
//
// - 공홈(웹) 다운로드본과 API 응답본은 청크 배치가 다를 수 있으나
//   "Comment" 안의 파라미터 필드 스키마는 동일하다(v4/v4.5 기준).
// - "Comment" 는 보통 비압축 tEXt 로 기록되지만, 압축(zTXt/iTXt) 케이스도 처리한다.

/** ImageProfile.params + 프롬프트로 그대로 채울 수 있는 정규화 결과. */
export interface NaiImportedParams {
  prompt?: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  scale?: number;
  sampler?: string;
  steps?: number;
  nSamples?: number;
  seed?: number;
  noiseSchedule?: string;
  cfgRescale?: number;
  uncondScale?: number;
  skipCfgAboveSigma?: number | null;
  skipCfgBelowSigma?: number;
  dynamicThresholding?: boolean;
  dynamicThresholdingPercentile?: number;
  dynamicThresholdingMimicScale?: number;
  useOrder?: boolean;
  controlnetStrength?: number;
  preferBrownian?: boolean;
  cfgSchedEligibility?: string;
  deliberateEulerAncestralBug?: boolean;
  explikeFineDetail?: boolean;
  minimizeSigmaInf?: boolean;
  uncondPerVibe?: boolean;
  wonkyVibeCorrelation?: boolean;
}

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function isPng(b: Uint8Array): boolean {
  if (b.length < 8) return false;
  for (let i = 0; i < 8; i++) if (b[i] !== PNG_SIG[i]) return false;
  return true;
}

/**
 * PNG의 모든 텍스트 청크(tEXt/zTXt/iTXt)를 keyword→value 맵으로 반환.
 * 압축 청크는 inflate 후 UTF-8 로 디코드한다.
 */
async function readPngTextChunks(buf: Uint8Array): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (!isPng(buf)) return out;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let off = 8; // 시그니처 이후
  while (off + 8 <= buf.length) {
    const len = dv.getUint32(off, false);
    const type = latin1(buf.subarray(off + 4, off + 8));
    const dataStart = off + 8;
    const dataEnd = dataStart + len;
    if (dataEnd > buf.length) break;
    const data = buf.subarray(dataStart, dataEnd);

    if (type === "tEXt") {
      const nul = data.indexOf(0);
      if (nul >= 0) {
        const key = latin1(data.subarray(0, nul));
        out[key] = latin1(data.subarray(nul + 1));
      }
    } else if (type === "zTXt") {
      const nul = data.indexOf(0);
      if (nul >= 0) {
        const key = latin1(data.subarray(0, nul));
        // data[nul+1] = compression method (0 = zlib deflate)
        const comp = data.subarray(nul + 2);
        try {
          out[key] = utf8(await inflateZlib(comp));
        } catch {
          /* 손상 청크 무시 */
        }
      }
    } else if (type === "iTXt") {
      const parsed = parseITXt(data);
      if (parsed) {
        try {
          out[parsed.key] = parsed.compressed ? utf8(await inflateZlib(parsed.raw)) : utf8(parsed.raw);
        } catch {
          /* 무시 */
        }
      }
    } else if (type === "IEND") {
      break;
    }

    off = dataEnd + 4; // CRC 4바이트 스킵
  }
  return out;
}

function parseITXt(
  data: Uint8Array
): { key: string; compressed: boolean; raw: Uint8Array } | null {
  // keyword \0 compFlag(1) compMethod(1) langTag \0 translatedKeyword \0 text
  const nul1 = data.indexOf(0);
  if (nul1 < 0 || nul1 + 3 > data.length) return null;
  const key = latin1(data.subarray(0, nul1));
  const compFlag = data[nul1 + 1];
  let p = nul1 + 3; // compMethod 스킵
  const nul2 = data.indexOf(0, p); // langTag 종료
  if (nul2 < 0) return null;
  const nul3 = data.indexOf(0, nul2 + 1); // translatedKeyword 종료
  if (nul3 < 0) return null;
  return { key, compressed: compFlag === 1, raw: data.subarray(nul3 + 1) };
}

/**
 * 이미지 바이트에서 NAI 파라미터를 추출한다.
 * NAI 생성 이미지가 아니거나 파싱 실패 시 null.
 */
export async function parseNovelAiImage(bytes: Uint8Array): Promise<NaiImportedParams | null> {
  const chunks = await readPngTextChunks(bytes);
  // "Comment" 에 전체 파라미터 JSON이 들어있다.
  const commentRaw = chunks["Comment"];
  if (!commentRaw) return null;
  let comment: Record<string, unknown>;
  try {
    comment = JSON.parse(commentRaw) as Record<string, unknown>;
  } catch {
    return null;
  }
  return mapComment(comment);
}

function mapComment(c: Record<string, unknown>): NaiImportedParams {
  const out: NaiImportedParams = {};

  // ── 프롬프트 (v4 구조 우선, 없으면 루트 필드) ──
  const v4p = asObj(c["v4_prompt"]);
  const basePrompt = asStr(deepGet(v4p, ["caption", "base_caption"]));
  out.prompt = basePrompt ?? asStr(c["prompt"]);
  const useOrder = deepGet(v4p, ["use_order"]);
  if (typeof useOrder === "boolean") out.useOrder = useOrder;

  const v4n = asObj(c["v4_negative_prompt"]);
  const baseNeg = asStr(deepGet(v4n, ["caption", "base_caption"]));
  out.negativePrompt = baseNeg ?? asStr(c["uc"]) ?? asStr(c["negative_prompt"]);

  // ── 스칼라 파라미터 ──
  assignNum(out, "width", c["width"]);
  assignNum(out, "height", c["height"]);
  assignNum(out, "scale", c["scale"]);
  assignStr(out, "sampler", c["sampler"]);
  assignNum(out, "steps", c["steps"]);
  assignNum(out, "nSamples", c["n_samples"]);
  assignNum(out, "seed", c["seed"]);
  assignStr(out, "noiseSchedule", c["noise_schedule"]);
  assignNum(out, "cfgRescale", c["cfg_rescale"]);
  assignNum(out, "uncondScale", c["uncond_scale"]);
  assignNum(out, "dynamicThresholdingPercentile", c["dynamic_thresholding_percentile"]);
  assignNum(out, "dynamicThresholdingMimicScale", c["dynamic_thresholding_mimic_scale"]);
  assignNum(out, "controlnetStrength", c["controlnet_strength"]);
  assignStr(out, "cfgSchedEligibility", c["cfg_sched_eligibility"]);

  // skip_cfg_above_sigma 는 number | null
  const above = c["skip_cfg_above_sigma"];
  if (typeof above === "number") out.skipCfgAboveSigma = above;
  else if (above === null) out.skipCfgAboveSigma = null;
  assignNum(out, "skipCfgBelowSigma", c["skip_cfg_below_sigma"]);

  // ── 불리언 ──
  assignBool(out, "dynamicThresholding", c["dynamic_thresholding"]);
  assignBool(out, "preferBrownian", c["prefer_brownian"]);
  assignBool(out, "deliberateEulerAncestralBug", c["deliberate_euler_ancestral_bug"]);
  assignBool(out, "explikeFineDetail", c["explike_fine_detail"]);
  assignBool(out, "minimizeSigmaInf", c["minimize_sigma_inf"]);
  assignBool(out, "uncondPerVibe", c["uncond_per_vibe"]);
  assignBool(out, "wonkyVibeCorrelation", c["wonky_vibe_correlation"]);

  return out;
}

// ── 작은 헬퍼들 ──────────────────────────────────────────────

function assignNum<K extends keyof NaiImportedParams>(o: NaiImportedParams, k: K, v: unknown): void {
  if (typeof v === "number" && !Number.isNaN(v)) (o[k] as unknown) = v;
}
function assignStr<K extends keyof NaiImportedParams>(o: NaiImportedParams, k: K, v: unknown): void {
  if (typeof v === "string" && v.length > 0) (o[k] as unknown) = v;
}
function assignBool<K extends keyof NaiImportedParams>(o: NaiImportedParams, k: K, v: unknown): void {
  if (typeof v === "boolean") (o[k] as unknown) = v;
}

function asObj(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : undefined;
}
function asStr(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}
function deepGet(obj: Record<string, unknown> | undefined, path: string[]): unknown {
  let cur: unknown = obj;
  for (const k of path) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

function latin1(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
}
function utf8(b: Uint8Array): string {
  return new TextDecoder("utf-8").decode(b);
}

async function inflateZlib(chunk: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate" as CompressionFormat);
  const writer = ds.writable.getWriter();
  writer.write(chunk);
  writer.close();
  const reader = ds.readable.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const r = await reader.read();
    if (r.done) break;
    parts.push(r.value);
    total += r.value.length;
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

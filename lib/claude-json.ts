// One Claude request whose answer is JSON constrained by a schema (output_config.format).
// Server-side only (uses ANTHROPIC_API_KEY). Callers still validate the result: the schema
// fixes the shape, not whether the content makes sense.

import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-sonnet-5-5";
// Sonnet 5.5 prices in USD per million tokens, for the dev cost log. Thinking counts as output.
const USD_PER_MTOK_IN = 2;
const USD_PER_MTOK_OUT = 10;

/** Dev-only logging. Silent in production. */
export function makeDebug(tag: string) {
  return (...args: unknown[]) => {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[${tag}]`, ...args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))));
    }
  };
}

const debug = makeDebug("claude");

export async function askClaudeJson(
  label: string,
  content: Anthropic.ContentBlockParam[],
  schema: Record<string, unknown>,
  effort: "low" | "medium" | "high",
): Promise<unknown> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    output_config: { effort, format: { type: "json_schema", schema } },
    messages: [{ role: "user", content }],
  });

  const { input_tokens, output_tokens } = message.usage;
  const usd = (input_tokens * USD_PER_MTOK_IN + output_tokens * USD_PER_MTOK_OUT) / 1_000_000;
  debug(`usage ${label}: ${input_tokens} in / ${output_tokens} out ≈ $${usd.toFixed(4)}`);

  if (message.stop_reason !== "end_turn") {
    throw new Error(`Claude stopped early (${message.stop_reason})`);
  }
  const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  debug(`raw answer for ${label}:`, text);
  return JSON.parse(text);
}

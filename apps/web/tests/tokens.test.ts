import { describe, expect, it } from "vitest";
// @ts-expect-error —— 构建脚本是 .mjs，没有类型声明
import { checkTokens } from "../scripts/tokens/build.mjs";

describe("token 流水线", () => {
  it("tokens.css、tokens.flat.json 与 Tailwind 主题都和 tokens.json 同步", async () => {
    expect(await checkTokens()).toEqual([]);
  }, 30_000);
});

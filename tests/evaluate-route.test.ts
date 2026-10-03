import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EvaluateInput } from "@/lib/evaluate";
import type { EvaluateRequest } from "@/lib/evaluation-input";

const buildEvaluateInput = vi.fn<(req: EvaluateRequest) => Promise<EvaluateInput>>();

vi.mock("@/lib/evaluation-input", () => ({
  buildEvaluateInput: (req: EvaluateRequest) => buildEvaluateInput(req),
  realInputDeps: () => ({}),
}));

const { POST } = await import("@/app/api/evaluate/route");

function post(body: unknown): Request {
  return new Request("http://localhost/api/evaluate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  buildEvaluateInput.mockReset();
  buildEvaluateInput.mockImplementation(async (req) => ({
    ticker: req.ticker,
    amountUsd: req.amountUsd,
    quotes: "unavailable",
  }));
});

describe("POST /api/evaluate — tope de la frase", () => {
  it.each([
    ["0.5", 0.005],
    [0.5, 0.005],
    ["1", 0.01],
  ])("convierte el tope %s por ciento a la fracción %s", async (maxImpactPercent, ratio) => {
    const response = await POST(post({ ticker: "NVDA", amountUsd: 200, maxImpactPercent }));

    expect(response.status).toBe(200);
    expect(buildEvaluateInput).toHaveBeenCalledTimes(1);
    expect(buildEvaluateInput.mock.calls[0][0].maxImpactRatio).toBeCloseTo(ratio, 12);
  });

  it.each(["0", "150", "abc", true, null])(
    "un tope inválido (%s) se omite y la evaluación corre igual, sin 400",
    async (maxImpactPercent) => {
      const response = await POST(post({ ticker: "NVDA", amountUsd: 200, maxImpactPercent }));

      expect(response.status).toBe(200);
      const req = buildEvaluateInput.mock.calls[0][0];
      expect(req).not.toHaveProperty("maxImpactRatio");
      expect(await response.json()).toEqual({
        kind: "unavailable",
        question: 2,
        reason: "QUOTES_UNAVAILABLE",
      });
    },
  );

  it("sin tope en el cuerpo no inventa uno", async () => {
    await POST(post({ ticker: "NVDA", amountUsd: 200 }));

    expect(buildEvaluateInput.mock.calls[0][0]).not.toHaveProperty("maxImpactRatio");
  });
});

import { describe, expect, it } from "vitest";
import type { RwaSearchResult, UnderlyingProfile } from "@/lib/binance/rwa";
import { decideAuthenticity, type AuthenticityData } from "@/lib/questions/q1-authenticity";
import { isUnavailableReason, Q1_CUT_REASONS, Q1_UNAVAILABLE_REASONS } from "@/lib/questions/q1-reasons";

const BSTOCK = "0x1a2B3c4d00000000000000000000000000C0FFEE";
const ONDO = "0xa9ee28c80f960b889dfbd1902055218cba016f75";
/** Copia los primeros y los últimos caracteres de la dirección oficial. */
const LOOKALIKE = "0x1a2b3c4d99999999999999999999999999c0ffee";
const OTHER_CHAIN = "0x2222222222222222222222222222222222222222";

const SEARCH: RwaSearchResult[] = [
  {
    ticker: "QQQ",
    assets: [
      { platformId: "bstock", binanceChainId: "56", tokenContractAddress: BSTOCK, tokenSymbol: "QQQB" },
      { platformId: "ondo", binanceChainId: "56", tokenContractAddress: ONDO, tokenSymbol: "QQQon" },
      { platformId: "bstock", binanceChainId: "1", tokenContractAddress: OTHER_CHAIN, tokenSymbol: "QQQB" },
    ],
  },
];

const ATTESTED: UnderlyingProfile = {
  attestations: [
    { name: "dailyAttestationReport", supported: false, url: null },
    { name: "monthlyAttestationReport", supported: true, url: "https://example.test/m.pdf" },
  ],
};

const NOT_ATTESTED: UnderlyingProfile = {
  attestations: [{ name: "dailyAttestationReport", supported: false, url: null }],
};

function data(overrides: Partial<AuthenticityData> = {}): AuthenticityData {
  return {
    ticker: "QQQB",
    wrapper: "bstocks",
    address: BSTOCK,
    search: SEARCH,
    profile: ATTESTED,
    standard: true,
    ...overrides,
  };
}

describe("decideAuthenticity", () => {
  it("pasa con un bStock oficial, con attestation y BEP-8056", () => {
    expect(decideAuthenticity(data())).toEqual({ ok: true });
  });

  it("pasa con un Ondo oficial con attestation, sin BEP-8056", () => {
    expect(
      decideAuthenticity(data({ wrapper: "ondo", address: ONDO, standard: null })),
    ).toEqual({ ok: true });
    expect(
      decideAuthenticity(data({ wrapper: "ondo", address: ONDO, standard: false })),
    ).toEqual({ ok: true });
  });

  it("encuentra el ticker por el subyacente o por el símbolo, con espacios y en minúsculas", () => {
    expect(decideAuthenticity(data({ ticker: "QQQ" }))).toEqual({ ok: true });
    expect(decideAuthenticity(data({ ticker: "  qqqb " }))).toEqual({ ok: true });
  });

  it("compara la dirección completa sin distinguir mayúsculas", () => {
    expect(decideAuthenticity(data({ address: BSTOCK.toLowerCase() }))).toEqual({ ok: true });
  });

  it("corta con TICKER_NOT_FOUND si la búsqueda no trae nada", () => {
    expect(decideAuthenticity(data({ search: [] }))).toEqual({
      ok: false,
      reason: "TICKER_NOT_FOUND",
    });
  });

  it("corta con TICKER_NOT_FOUND si solo hay tickers parecidos o tokens en otra chain", () => {
    const parecido: RwaSearchResult[] = [
      {
        ticker: "QQQM",
        assets: [{ platformId: "bstock", binanceChainId: "56", tokenContractAddress: BSTOCK, tokenSymbol: "QQQMB" }],
      },
    ];
    const otraChain: RwaSearchResult[] = [
      {
        ticker: "QQQ",
        assets: [{ platformId: "bstock", binanceChainId: "1", tokenContractAddress: OTHER_CHAIN, tokenSymbol: "QQQB" }],
      },
    ];
    expect(decideAuthenticity(data({ search: parecido }))).toMatchObject({ reason: "TICKER_NOT_FOUND" });
    expect(decideAuthenticity(data({ search: otraChain }))).toMatchObject({ reason: "TICKER_NOT_FOUND" });
  });

  it("corta con CONTRACT_NOT_LISTED si la dirección copia el principio y el final de la oficial", () => {
    expect(decideAuthenticity(data({ address: LOOKALIKE }))).toEqual({
      ok: false,
      reason: "CONTRACT_NOT_LISTED",
    });
  });

  it("corta con CONTRACT_NOT_LISTED si la dirección es la oficial en otra chain", () => {
    expect(decideAuthenticity(data({ address: OTHER_CHAIN }))).toMatchObject({
      reason: "CONTRACT_NOT_LISTED",
    });
  });

  it("corta con CONTRACT_NOT_LISTED si la dirección es la oficial de otro wrapper", () => {
    expect(decideAuthenticity(data({ wrapper: "bstocks", address: ONDO }))).toMatchObject({
      reason: "CONTRACT_NOT_LISTED",
    });
    expect(decideAuthenticity(data({ wrapper: "ondo", address: BSTOCK }))).toMatchObject({
      reason: "CONTRACT_NOT_LISTED",
    });
  });

  it("corta con CONTRACT_NOT_LISTED si la dirección no tiene formato de dirección", () => {
    expect(decideAuthenticity(data({ address: "QQQB" }))).toMatchObject({
      reason: "CONTRACT_NOT_LISTED",
    });
    expect(decideAuthenticity(data({ address: "" }))).toMatchObject({
      reason: "CONTRACT_NOT_LISTED",
    });
  });

  it("corta con ATTESTATION_MISSING si ningún reporte está publicado", () => {
    expect(decideAuthenticity(data({ profile: NOT_ATTESTED }))).toEqual({
      ok: false,
      reason: "ATTESTATION_MISSING",
    });
    expect(decideAuthenticity(data({ profile: { attestations: [] } }))).toMatchObject({
      reason: "ATTESTATION_MISSING",
    });
  });

  it("corta con STANDARD_NOT_BEP8056 si el bStock no responde a supportsInterface", () => {
    expect(decideAuthenticity(data({ standard: false }))).toEqual({
      ok: false,
      reason: "STANDARD_NOT_BEP8056",
    });
  });

  it("si la lista corta, no mira attestation ni estándar", () => {
    const sinNadaDespues = { profile: "unavailable", standard: "unavailable" } as const;
    expect(decideAuthenticity(data({ address: LOOKALIKE, ...sinNadaDespues }))).toMatchObject({
      reason: "CONTRACT_NOT_LISTED",
    });
    expect(decideAuthenticity(data({ search: [], ...sinNadaDespues }))).toMatchObject({
      reason: "TICKER_NOT_FOUND",
    });
  });

  it("si la attestation corta, no mira el estándar", () => {
    expect(
      decideAuthenticity(data({ profile: NOT_ATTESTED, standard: "unavailable" })),
    ).toMatchObject({ reason: "ATTESTATION_MISSING" });
  });

  it("devuelve LIST_UNAVAILABLE, ATTESTATION_UNAVAILABLE o CHAIN_UNAVAILABLE si una fuente no respondió", () => {
    expect(decideAuthenticity(data({ search: "unavailable" }))).toEqual({
      ok: false,
      reason: "LIST_UNAVAILABLE",
    });
    expect(decideAuthenticity(data({ profile: "unavailable" }))).toEqual({
      ok: false,
      reason: "ATTESTATION_UNAVAILABLE",
    });
    expect(decideAuthenticity(data({ standard: "unavailable" }))).toEqual({
      ok: false,
      reason: "CHAIN_UNAVAILABLE",
    });
  });

  it("trata como no disponible un dato que no se consultó (null), nunca como pase", () => {
    expect(decideAuthenticity(data({ search: null }))).toMatchObject({ reason: "LIST_UNAVAILABLE" });
    expect(decideAuthenticity(data({ profile: null }))).toMatchObject({ reason: "ATTESTATION_UNAVAILABLE" });
    expect(decideAuthenticity(data({ standard: null }))).toMatchObject({ reason: "CHAIN_UNAVAILABLE" });
  });

  it("devuelve LIST_UNAVAILABLE para xStocks, aunque el resto esté bien", () => {
    expect(decideAuthenticity(data({ wrapper: "xstocks" }))).toEqual({
      ok: false,
      reason: "LIST_UNAVAILABLE",
    });
  });
});

describe("códigos de motivo", () => {
  it("separa los cortes de los «no se pudo evaluar»", () => {
    for (const reason of Q1_CUT_REASONS) expect(isUnavailableReason(reason)).toBe(false);
    for (const reason of Q1_UNAVAILABLE_REASONS) expect(isUnavailableReason(reason)).toBe(true);
  });
});

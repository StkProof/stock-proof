import { describe, expect, it, vi } from "vitest";
import type { PublicMarketStatus } from "@/lib/binance/rwa-public";
import { WRAPPERS } from "@/lib/evaluate";
import {
  BSTOCKS_REDEMPTION_VENUE,
  buildExitAvailability,
  type ExitAvailabilitySources,
} from "@/lib/questions/exit-availability";

const OPEN: PublicMarketStatus = {
  marketStatus: "open",
  nextOpenAt: "unavailable",
  nextCloseAt: "2026-10-01T20:00:00Z",
};

const CLOSED: PublicMarketStatus = {
  marketStatus: "closed",
  nextOpenAt: "2026-10-05T13:30:00Z",
  nextCloseAt: "unavailable",
};

const WITHOUT_STATUS: PublicMarketStatus = {
  marketStatus: "unavailable",
  nextOpenAt: "unavailable",
  nextCloseAt: "unavailable",
};

function sources(overrides: Partial<ExitAvailabilitySources> = {}): ExitAvailabilitySources {
  return { marketStatus: async () => OPEN, ...overrides };
}

describe("buildExitAvailability", () => {
  it("mercado cerrado con próxima apertura: se reflejan tal cual", async () => {
    const availability = await buildExitAvailability(
      "ondo",
      sources({ marketStatus: async () => CLOSED }),
    );
    expect(availability).not.toBe("unavailable");
    if (availability === "unavailable") return;

    expect(availability.marketStatus).toBe("closed");
    expect(availability.nextOpenAt).toBe("2026-10-05T13:30:00Z");
    expect(availability.source).toEqual({ name: "Binance RWA Data" });
  });

  it("mercado abierto sin próxima apertura publicada: ese campo queda unavailable", async () => {
    const availability = await buildExitAvailability("ondo", sources());
    if (availability === "unavailable") throw new Error("capa ausente con mercado abierto");

    expect(availability.marketStatus).toBe("open");
    expect(availability.nextOpenAt).toBe("unavailable");
  });

  it("fallo de la API: la capa entera queda unavailable", async () => {
    const dead = sources({ marketStatus: async () => "unavailable" });
    expect(await buildExitAvailability("bstocks", dead)).toBe("unavailable");

    // La respuesta llegó pero sin estado de mercado: tampoco hay capa (fail closed).
    const sinEstado = sources({ marketStatus: async () => WITHOUT_STATUS });
    expect(await buildExitAvailability("bstocks", sinEstado)).toBe("unavailable");
  });

  it("una fuente que rechaza no propaga la excepción: queda unavailable", async () => {
    const boom = vi.fn(async (): Promise<PublicMarketStatus> => {
      throw new Error("net down");
    });
    expect(await buildExitAvailability("xstocks", sources({ marketStatus: boom }))).toBe(
      "unavailable",
    );
  });

  it("bStocks: el canje 1:1 es en Binance, no en el pool (decisión del vault)", async () => {
    const availability = await buildExitAvailability("bstocks", sources());
    if (availability === "unavailable") throw new Error("capa ausente con mercado abierto");

    expect(availability.redemptionVenue).toBe(BSTOCKS_REDEMPTION_VENUE);
    expect(availability.redemptionVenue).toContain("Binance");
  });

  it("la decisión del vault manda: una regla publicada no pisa el venue de bStocks", async () => {
    const availability = await buildExitAvailability(
      "bstocks",
      sources({ issuerRules: async () => ({ redemptionVenue: "En el pool" }) }),
    );
    if (availability === "unavailable") throw new Error("capa ausente con mercado abierto");
    expect(availability.redemptionVenue).toBe(BSTOCKS_REDEMPTION_VENUE);
  });

  it("Ondo y xStocks sin reglas publicadas: mint/redeem y venue quedan unavailable", async () => {
    for (const wrapper of WRAPPERS.filter((w) => w !== "bstocks")) {
      const availability = await buildExitAvailability(wrapper, sources());
      if (availability === "unavailable") throw new Error("capa ausente con mercado abierto");

      expect(availability.mintRedeemHours).toBe("unavailable");
      expect(availability.redemptionVenue).toBe("unavailable");
    }
  });

  it("reglas publicadas por el emisor entran campo a campo; lo que falta queda unavailable", async () => {
    const issuerRules = vi.fn(async () => ({ mintRedeemHours: "24/7 en nombres seleccionados" }));
    const availability = await buildExitAvailability(
      "ondo",
      sources({ issuerRules }),
    );
    if (availability === "unavailable") throw new Error("capa ausente con mercado abierto");

    expect(issuerRules).toHaveBeenCalledWith("ondo");
    expect(availability.mintRedeemHours).toBe("24/7 en nombres seleccionados");
    expect(availability.redemptionVenue).toBe("unavailable");
  });

  it("issuerRules unavailable o que rechaza: campos sin dato y la capa sigue informando", async () => {
    const unavailable = await buildExitAvailability(
      "ondo",
      sources({ issuerRules: async () => "unavailable" }),
    );
    if (unavailable === "unavailable") throw new Error("capa ausente con mercado abierto");
    expect(unavailable.mintRedeemHours).toBe("unavailable");
    expect(unavailable.redemptionVenue).toBe("unavailable");

    const boom = await buildExitAvailability(
      "xstocks",
      sources({
        issuerRules: async () => {
          throw new Error("net down");
        },
      }),
    );
    if (boom === "unavailable") throw new Error("capa ausente con mercado abierto");
    expect(boom.mintRedeemHours).toBe("unavailable");
    expect(boom.redemptionVenue).toBe("unavailable");
  });

  it("informa y no corta: para cada wrapper el resultado es la capa o «sin dato»", async () => {
    for (const wrapper of WRAPPERS) {
      const availability = await buildExitAvailability(
        wrapper,
        sources({ marketStatus: async () => CLOSED }),
      );
      if (availability === "unavailable") continue;
      expect(availability.marketStatus).toBe("closed");
      expect(availability).not.toHaveProperty("reason");
      expect(availability).not.toHaveProperty("kind");
    }
  });
});

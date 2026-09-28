import { createHmac, generateKeyPairSync, verify as cryptoVerify } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  binanceCredentials,
  binanceWeb3Signer,
  compactJson,
  signWeb3Request,
} from "@/lib/binance/sign";

const API_KEY = "k-de-prueba";
const SECRET = "secreto-de-prueba";

const hmac = { kind: "hmac", apiKey: API_KEY, secret: SECRET } as const;
const REQUEST_PATH = "/build/api/v1/dex/aggregator/quote?binanceChainId=56&amount=200";

describe("signWeb3Request", () => {
  it("manda los tres headers X-OC y firma timestamp+método+path+cuerpo", async () => {
    const headers = signWeb3Request(hmac, "get", REQUEST_PATH);

    expect(headers["X-OC-APIKEY"]).toBe(API_KEY);
    // El timestamp es ISO 8601 y reciente (la misma llamada lo generó).
    const timestamp = headers["X-OC-TIMESTAMP"];
    expect(Number.isNaN(Date.parse(timestamp))).toBe(false);
    expect(Math.abs(Date.now() - Date.parse(timestamp))).toBeLessThan(5_000);

    // La firma reproduce el payload documentado: timestamp + GET + path (query incluida).
    const expected = createHmac("sha256", SECRET)
      .update(`${timestamp}GET${REQUEST_PATH}`, "utf8")
      .digest("base64");
    expect(headers["X-OC-SIGN"]).toBe(expected);
  });

  it("incluye el cuerpo compacto en el payload y sin campos null", () => {
    const body = { orderId: "abc", note: null, nested: { skip: undefined, keep: 1 } };
    const headers = signWeb3Request(hmac, "POST", "/build/api/v1/x", body);
    const compact = compactJson(body);
    expect(compact).toBe('{"orderId":"abc","nested":{"keep":1}}');

    const expected = createHmac("sha256", SECRET)
      .update(`${headers["X-OC-TIMESTAMP"]}POST/build/api/v1/x${compact}`, "utf8")
      .digest("base64");
    expect(headers["X-OC-SIGN"]).toBe(expected);
  });

  it("firma con Ed25519 y la firma se verifica con la clave pública", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const credentials = {
      kind: "private-key",
      apiKey: API_KEY,
      privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    } as const;

    const headers = signWeb3Request(credentials, "GET", REQUEST_PATH);
    const payload = `${headers["X-OC-TIMESTAMP"]}GET${REQUEST_PATH}`;
    expect(
      cryptoVerify(null, Buffer.from(payload), publicKey, Buffer.from(headers["X-OC-SIGN"], "base64")),
    ).toBe(true);
  });

  it("firma con RSA y la firma se verifica con la clave pública", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const credentials = {
      kind: "private-key",
      apiKey: API_KEY,
      privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    } as const;

    const headers = signWeb3Request(credentials, "GET", REQUEST_PATH);
    const payload = `${headers["X-OC-TIMESTAMP"]}GET${REQUEST_PATH}`;
    expect(
      cryptoVerify(
        "sha256",
        Buffer.from(payload),
        publicKey,
        Buffer.from(headers["X-OC-SIGN"], "base64"),
      ),
    ).toBe(true);
  });
});

describe("binanceCredentials", () => {
  it("devuelve null sin BINANCE_API_KEY o sin forma de firma", () => {
    expect(binanceCredentials({})).toBeNull();
    expect(binanceCredentials({ BINANCE_API_KEY: API_KEY })).toBeNull();
  });

  it("prefiere HMAC si hay secreto, y toma la clave privada si no", () => {
    expect(binanceCredentials({ BINANCE_API_KEY: API_KEY, BINANCE_API_SECRET: SECRET })).toEqual({
      kind: "hmac",
      apiKey: API_KEY,
      secret: SECRET,
    });
    expect(binanceCredentials({ BINANCE_API_KEY: API_KEY, BINANCE_PRIVATE_KEY: "pem" })).toEqual({
      kind: "private-key",
      apiKey: API_KEY,
      privateKey: "pem",
      passphrase: undefined,
    });
  });

  it("acepta los alias del portal: API_KEY con SECRET_KEY o API_SECRET", () => {
    expect(binanceCredentials({ API_KEY: API_KEY, SECRET_KEY: SECRET })).toEqual({
      kind: "hmac",
      apiKey: API_KEY,
      secret: SECRET,
    });
    expect(binanceCredentials({ API_KEY: API_KEY, API_SECRET: SECRET })).toEqual({
      kind: "hmac",
      apiKey: API_KEY,
      secret: SECRET,
    });
  });

  it("BINANCE_API_KEY tiene prioridad sobre el alias API_KEY", () => {
    expect(
      binanceCredentials({
        BINANCE_API_KEY: "key-canonica",
        API_KEY: API_KEY,
        BINANCE_API_SECRET: SECRET,
      }),
    ).toEqual({ kind: "hmac", apiKey: "key-canonica", secret: SECRET });
  });

  it("BINANCE_API_SECRET tiene prioridad sobre SECRET_KEY y API_SECRET", () => {
    expect(
      binanceCredentials({
        BINANCE_API_KEY: API_KEY,
        BINANCE_API_SECRET: SECRET,
        SECRET_KEY: "secreto-alias",
        API_SECRET: "otro-secreto-alias",
      }),
    ).toEqual({ kind: "hmac", apiKey: API_KEY, secret: SECRET });
  });

  it("devuelve null si solo hay alias de key y ninguna forma de firma", () => {
    expect(binanceCredentials({ API_KEY: API_KEY })).toBeNull();
  });

  it("un canónico vacío o de solo espacios no pisa al alias válido", () => {
    expect(
      binanceCredentials({ BINANCE_API_KEY: "   ", API_KEY: API_KEY, SECRET_KEY: SECRET }),
    ).toEqual({ kind: "hmac", apiKey: API_KEY, secret: SECRET });
    expect(
      binanceCredentials({ BINANCE_API_KEY: API_KEY, BINANCE_API_SECRET: "", API_SECRET: SECRET }),
    ).toEqual({ kind: "hmac", apiKey: API_KEY, secret: SECRET });
  });
});

describe("binanceWeb3Signer", () => {
  it("devuelve null sin credenciales y un SignRequest con ellas", async () => {
    expect(binanceWeb3Signer({})).toBeNull();

    const signer = binanceWeb3Signer({ BINANCE_API_KEY: API_KEY, BINANCE_API_SECRET: SECRET });
    expect(signer).not.toBeNull();
    const headers = new Headers(await signer!("GET", REQUEST_PATH, ""));
    expect(headers.get("X-OC-APIKEY")).toBe(API_KEY);
    expect(headers.get("X-OC-SIGN")).toBeTruthy();
  });
});

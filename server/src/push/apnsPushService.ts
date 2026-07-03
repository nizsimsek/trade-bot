import fs from "node:fs";
import http2 from "node:http2";
import crypto from "node:crypto";
import type { PushConfig } from "../config/env.js";
import type { BotEvent } from "../domain/trading.js";
import type { TradingDatabase } from "../database/tradingDatabase.js";

const APNS_PRODUCTION_HOST = "https://api.push.apple.com";
const APNS_SANDBOX_HOST = "https://api.sandbox.push.apple.com";
const TOKEN_TTL_MS = 50 * 60 * 1000;

export class ApnsPushService {
  private authKey: string | null = null;
  private cachedJwt: { value: string; createdAt: number } | null = null;

  constructor(
    private readonly config: PushConfig,
    private readonly database: TradingDatabase
  ) {}

  async registerDevice(token: string): Promise<void> {
    await this.database.savePushDevice(normalizeToken(token), "ios");
  }

  async notifyTradingEvent(event: BotEvent): Promise<void> {
    if (!this.isConfigured()) return;
    if (event.kind !== "entry" && event.kind !== "exit") return;

    const tokens = await this.database.loadPushDeviceTokens("ios");
    if (!tokens.length) return;

    await Promise.allSettled(tokens.map((token) => this.send(token, {
      aps: {
        alert: {
          title: `NizTradeBot - ${event.title}`,
          body: event.message
        },
        sound: "default"
      },
      eventId: event.id,
      eventKind: event.kind
    })));
  }

  private async send(token: string, payload: Record<string, unknown>): Promise<void> {
    const client = http2.connect(this.config.apnsProduction ? APNS_PRODUCTION_HOST : APNS_SANDBOX_HOST);

    await new Promise<void>((resolve, reject) => {
      client.once("error", reject);

      const request = client.request({
        ":method": "POST",
        ":path": `/3/device/${normalizeToken(token)}`,
        authorization: `bearer ${this.getJwt()}`,
        "apns-topic": this.config.apnsBundleId,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "content-type": "application/json"
      });

      let responseBody = "";
      let statusCode = 0;
      request.setEncoding("utf8");
      request.on("response", (headers) => {
        statusCode = Number(headers[":status"] ?? 0);
      });
      request.on("data", (chunk) => {
        responseBody += chunk;
      });
      request.on("end", () => {
        client.close();
        if (statusCode >= 200 && statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`APNs HTTP ${statusCode}: ${responseBody}`));
        }
      });
      request.on("error", (error) => {
        client.close();
        reject(error);
      });
      request.end(JSON.stringify(payload));
    }).catch((error) => {
      console.warn(error instanceof Error ? error.message : "APNs push gonderilemedi.");
    });
  }

  private isConfigured(): boolean {
    return Boolean(
      this.config.enabled &&
      this.config.apnsKeyId &&
      this.config.apnsTeamId &&
      this.config.apnsBundleId &&
      this.config.apnsAuthKeyPath
    );
  }

  private getJwt(): string {
    const now = Date.now();
    if (this.cachedJwt && now - this.cachedJwt.createdAt < TOKEN_TTL_MS) {
      return this.cachedJwt.value;
    }

    const header = base64Url(JSON.stringify({
      alg: "ES256",
      kid: this.config.apnsKeyId
    }));
    const claims = base64Url(JSON.stringify({
      iss: this.config.apnsTeamId,
      iat: Math.floor(now / 1000)
    }));
    const unsigned = `${header}.${claims}`;
    const signature = crypto
      .createSign("SHA256")
      .update(unsigned)
      .sign(this.getAuthKey());

    this.cachedJwt = {
      value: `${unsigned}.${base64Url(signature)}`,
      createdAt: now
    };

    return this.cachedJwt.value;
  }

  private getAuthKey(): string {
    if (this.authKey) return this.authKey;
    if (!this.config.apnsAuthKeyPath) throw new Error("APNS_AUTH_KEY_PATH eksik.");

    this.authKey = fs.readFileSync(this.config.apnsAuthKeyPath, "utf8");
    return this.authKey;
  }
}

function normalizeToken(token: string): string {
  return token.replace(/[^a-fA-F0-9]/g, "").toLowerCase();
}

function base64Url(value: string | Buffer): string {
  const buffer = typeof value === "string" ? Buffer.from(value) : value;
  return buffer
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

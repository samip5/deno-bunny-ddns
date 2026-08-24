import * as BunnySDK from "https://esm.sh/@bunny.net/edgescript-sdk@0.12.0";
import { BunnyDnsClient } from "./bunny-dns.ts";
import { loadConfigFromEnv } from "./ddns.ts";
import { handleRequest } from "./server.ts";

console.log("Starting DDNS update service...");
BunnySDK.net.http.serve(async (req) => {
  console.log(`[INFO]: ${req.method} - ${req.url}`);
  try {
    const config = loadConfigFromEnv(Deno.env);
    if (!config) {
      console.error(
        "DDNS service is missing required configuration (BUNNY_API_KEY, BUNNY_DNS_ZONE_ID, DDNS_USERNAME, DDNS_PASSWORD)",
      );
      return new Response("911\n", { status: 500 });
    }
    return await handleRequest(
      req,
      config,
      new BunnyDnsClient(config.bunnyApiKey),
    );
  } catch (err) {
    console.error("Unhandled error while handling request", err);
    return new Response("911\n", { status: 500 });
  }
});
